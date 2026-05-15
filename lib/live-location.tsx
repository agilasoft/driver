import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { Platform, AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Network from "expo-network";

const LIVE_LOCATION_ENABLED_KEY = "live_location_enabled";
const LIVE_LOCATION_INTERVAL_KEY = "live_location_interval";
const LOCATION_QUEUE_KEY = "live_location_queue";
const DEFAULT_INTERVAL_MS = 30000; // 30 seconds
const MAX_QUEUE_SIZE = 500; // Cap queue to prevent unbounded storage growth

export const INTERVAL_OPTIONS = [
  { label: "10 seconds", value: 10000 },
  { label: "30 seconds", value: 30000 },
  { label: "1 minute", value: 60000 },
  { label: "5 minutes", value: 300000 },
] as const;

interface LocationUpdate {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

interface LiveLocationContextType {
  isEnabled: boolean;
  isTracking: boolean;
  lastUpdate: LocationUpdate | null;
  intervalMs: number;
  pendingQueueCount: number;
  isSyncingQueue: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  setIntervalMs: (ms: number) => Promise<void>;
  flushQueue: () => Promise<void>;
}

const LiveLocationContext = createContext<LiveLocationContextType>({
  isEnabled: false,
  isTracking: false,
  lastUpdate: null,
  intervalMs: DEFAULT_INTERVAL_MS,
  pendingQueueCount: 0,
  isSyncingQueue: false,
  setEnabled: async () => {},
  setIntervalMs: async () => {},
  flushQueue: async () => {},
});

// ─── Offline Queue Helpers ───────────────────────────────────────────────────

async function loadQueue(): Promise<LocationUpdate[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: LocationUpdate[]): Promise<void> {
  try {
    // Trim to max size, keeping the most recent entries
    const trimmed = queue.length > MAX_QUEUE_SIZE ? queue.slice(-MAX_QUEUE_SIZE) : queue;
    await AsyncStorage.setItem(LOCATION_QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore storage errors
  }
}

async function enqueueUpdate(update: LocationUpdate): Promise<number> {
  const queue = await loadQueue();
  queue.push(update);
  await saveQueue(queue);
  return queue.length;
}

async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(LOCATION_QUEUE_KEY);
}

// ─── Network Check ───────────────────────────────────────────────────────────

async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return !!(state.isConnected && state.isInternetReachable);
  } catch {
    // Fallback: try a simple fetch
    try {
      const authRaw = await AsyncStorage.getItem("frappe_auth");
      if (!authRaw) return false;
      const auth = JSON.parse(authRaw);
      const baseUrl = auth.siteUrl?.replace(/\/+$/, "");
      if (!baseUrl) return false;
      const res = await fetch(`${baseUrl}/api/method/frappe.auth.get_logged_user`, {
        method: "HEAD",
        headers: { Authorization: `token ${auth.apiKey}:${auth.apiSecret}` },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ─── Server Push ─────────────────────────────────────────────────────────────

/**
 * Push a single location update to the Frappe server.
 * Returns true if any strategy succeeded.
 */
async function pushLocationToServer(update: LocationUpdate): Promise<boolean> {
  try {
    const authRaw = await AsyncStorage.getItem("frappe_auth");
    if (!authRaw) return false;
    const auth = JSON.parse(authRaw);
    if (!auth.siteUrl || !auth.apiKey || !auth.apiSecret) return false;

    const baseUrl = auth.siteUrl.replace(/\/+$/, "");
    const headers = {
      Authorization: `token ${auth.apiKey}:${auth.apiSecret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const ts = new Date(update.timestamp).toISOString().replace("T", " ").slice(0, 19);

    // Strategy 1: Custom whitelisted API method
    try {
      const res = await fetch(`${baseUrl}/api/method/logistics.transport.api.update_driver_location`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          driver: auth.driverId,
          latitude: update.latitude,
          longitude: update.longitude,
          accuracy: update.accuracy,
          speed: update.speed,
          heading: update.heading,
          timestamp: ts,
        }),
      });
      if (res.ok) return true;
    } catch {
      // Fall through
    }

    // Strategy 2: Update Driver doctype directly
    if (auth.driverId) {
      try {
        const res = await fetch(
          `${baseUrl}/api/resource/Driver/${encodeURIComponent(auth.driverId)}`,
          {
            method: "PUT",
            headers,
            body: JSON.stringify({
              last_known_latitude: update.latitude,
              last_known_longitude: update.longitude,
              last_location_time: ts,
            }),
          }
        );
        if (res.ok) return true;
      } catch {
        // Fall through
      }
    }

    // Strategy 3: Create a GPS Log entry
    try {
      const res = await fetch(`${baseUrl}/api/resource/GPS Log`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          driver: auth.driverId,
          latitude: update.latitude,
          longitude: update.longitude,
          accuracy: update.accuracy,
          speed: update.speed,
          heading: update.heading,
          log_time: ts,
        }),
      });
      if (res.ok) return true;
    } catch {
      // All strategies failed
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Push a batch of queued location updates to the server.
 * Processes in chronological order, stops on first failure.
 * Returns the number of successfully pushed updates.
 */
async function pushBatch(queue: LocationUpdate[]): Promise<number> {
  let pushed = 0;
  for (const update of queue) {
    const ok = await pushLocationToServer(update);
    if (!ok) break; // Stop on first failure — server may be down
    pushed++;
  }
  return pushed;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function LiveLocationProvider({ children }: { children: React.ReactNode }) {
  const [isEnabled, setIsEnabledState] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<LocationUpdate | null>(null);
  const [intervalMs, setIntervalMsState] = useState(DEFAULT_INTERVAL_MS);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const subscriberRef = useRef<Location.LocationSubscription | null>(null);
  const webIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isSyncingRef = useRef(false);

  // Load persisted settings and queue count
  useEffect(() => {
    (async () => {
      try {
        const enabledRaw = await AsyncStorage.getItem(LIVE_LOCATION_ENABLED_KEY);
        if (enabledRaw === "true") setIsEnabledState(true);
        const intervalRaw = await AsyncStorage.getItem(LIVE_LOCATION_INTERVAL_KEY);
        if (intervalRaw) setIntervalMsState(parseInt(intervalRaw, 10));
        const queue = await loadQueue();
        setPendingQueueCount(queue.length);
      } catch {
        // Ignore
      }
    })();
  }, []);

  // Handle a new location update: try to push, queue if offline
  const handleLocationUpdate = useCallback(async (update: LocationUpdate) => {
    setLastUpdate(update);
    setIsTracking(true);

    const online = await isOnline();
    if (online) {
      // Try to push directly
      const ok = await pushLocationToServer(update);
      if (!ok) {
        // Push failed — queue it
        const count = await enqueueUpdate(update);
        setPendingQueueCount(count);
      } else {
        // Success — also try to flush any pending queue
        const queue = await loadQueue();
        if (queue.length > 0 && !isSyncingRef.current) {
          flushQueueInternal();
        }
      }
    } else {
      // Offline — queue the update
      const count = await enqueueUpdate(update);
      setPendingQueueCount(count);
    }
  }, []);

  // Flush the offline queue
  const flushQueueInternal = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncingQueue(true);

    try {
      const queue = await loadQueue();
      if (queue.length === 0) {
        setPendingQueueCount(0);
        return;
      }

      const pushed = await pushBatch(queue);
      if (pushed > 0) {
        // Remove pushed items from queue
        const remaining = queue.slice(pushed);
        if (remaining.length === 0) {
          await clearQueue();
        } else {
          await saveQueue(remaining);
        }
        setPendingQueueCount(remaining.length);
      }
    } catch {
      // Ignore flush errors
    } finally {
      isSyncingRef.current = false;
      setIsSyncingQueue(false);
    }
  }, []);

  // Public flush method
  const flushQueue = useCallback(async () => {
    await flushQueueInternal();
  }, [flushQueueInternal]);

  // Start/stop tracking based on isEnabled
  useEffect(() => {
    if (!isEnabled) {
      stopTracking();
      return;
    }

    startTracking();

    return () => {
      stopTracking();
    };
  }, [isEnabled, intervalMs]);

  // Pause/resume on app state changes + flush queue when coming back online
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        // App came to foreground — resume tracking and try to flush queue
        if (isEnabled) startTracking();
        // Try to flush any queued updates
        const queue = await loadQueue();
        if (queue.length > 0) {
          const online = await isOnline();
          if (online) flushQueueInternal();
        }
      } else if (nextState.match(/inactive|background/)) {
        // App went to background — stop web interval (native subscriber continues)
        if (Platform.OS === "web" && webIntervalRef.current) {
          clearInterval(webIntervalRef.current);
          webIntervalRef.current = null;
        }
      }
      appStateRef.current = nextState;
    });

    return () => sub.remove();
  }, [isEnabled, flushQueueInternal]);

  // Periodic queue flush attempt (every 60s when enabled)
  useEffect(() => {
    if (!isEnabled) return;

    const flushInterval = setInterval(async () => {
      const queue = await loadQueue();
      if (queue.length > 0) {
        const online = await isOnline();
        if (online) flushQueueInternal();
      }
    }, 60000);

    return () => clearInterval(flushInterval);
  }, [isEnabled, flushQueueInternal]);

  const startTracking = async () => {
    // Stop any existing tracking first
    stopTracking();

    if (Platform.OS === "web") {
      if (!navigator.geolocation) return;

      const tick = () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const update: LocationUpdate = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              speed: pos.coords.speed,
              heading: pos.coords.heading,
              timestamp: pos.timestamp,
            };
            handleLocationUpdate(update);
          },
          () => { /* ignore errors */ },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      };

      tick();
      webIntervalRef.current = setInterval(tick, intervalMs);
      return;
    }

    // Native: use watchPositionAsync
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) return;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const subscriber = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: intervalMs,
          distanceInterval: 10,
        },
        (location) => {
          const update: LocationUpdate = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            speed: location.coords.speed,
            heading: location.coords.heading,
            timestamp: location.timestamp,
          };
          handleLocationUpdate(update);
        }
      );

      subscriberRef.current = subscriber;
    } catch (error) {
      console.warn("Failed to start location tracking:", error);
    }
  };

  const stopTracking = () => {
    if (subscriberRef.current) {
      subscriberRef.current.remove();
      subscriberRef.current = null;
    }
    if (webIntervalRef.current) {
      clearInterval(webIntervalRef.current);
      webIntervalRef.current = null;
    }
    setIsTracking(false);
  };

  const setEnabled = useCallback(async (enabled: boolean) => {
    setIsEnabledState(enabled);
    await AsyncStorage.setItem(LIVE_LOCATION_ENABLED_KEY, enabled ? "true" : "false");
  }, []);

  const setIntervalMs = useCallback(async (ms: number) => {
    setIntervalMsState(ms);
    await AsyncStorage.setItem(LIVE_LOCATION_INTERVAL_KEY, ms.toString());
  }, []);

  return (
    <LiveLocationContext.Provider
      value={{
        isEnabled,
        isTracking,
        lastUpdate,
        intervalMs,
        pendingQueueCount,
        isSyncingQueue,
        setEnabled,
        setIntervalMs,
        flushQueue,
      }}
    >
      {children}
    </LiveLocationContext.Provider>
  );
}

export function useLiveLocation() {
  return useContext(LiveLocationContext);
}
