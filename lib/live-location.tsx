import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { Platform, AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";

const LIVE_LOCATION_ENABLED_KEY = "live_location_enabled";
const LIVE_LOCATION_INTERVAL_KEY = "live_location_interval";
const DEFAULT_INTERVAL_MS = 30000; // 30 seconds

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
  setEnabled: (enabled: boolean) => Promise<void>;
  setIntervalMs: (ms: number) => Promise<void>;
}

const LiveLocationContext = createContext<LiveLocationContextType>({
  isEnabled: false,
  isTracking: false,
  lastUpdate: null,
  intervalMs: DEFAULT_INTERVAL_MS,
  setEnabled: async () => {},
  setIntervalMs: async () => {},
});

/**
 * Push a location update to the Frappe server.
 * Uses the Driver doctype's custom fields or a whitelisted API method.
 * Falls back gracefully if the server doesn't support it.
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

    // Strategy 1: Try custom whitelisted API method
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
          timestamp: new Date(update.timestamp).toISOString().replace("T", " ").slice(0, 19),
        }),
      });
      if (res.ok) return true;
    } catch {
      // Fall through
    }

    // Strategy 2: Update Driver doctype directly with last_known_location fields
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
              last_location_time: new Date(update.timestamp).toISOString().replace("T", " ").slice(0, 19),
            }),
          }
        );
        if (res.ok) return true;
      } catch {
        // Fall through
      }
    }

    // Strategy 3: Create a GPS Log entry if the doctype exists
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
          log_time: new Date(update.timestamp).toISOString().replace("T", " ").slice(0, 19),
        }),
      });
      if (res.ok) return true;
    } catch {
      // All strategies failed — silently continue
    }

    return false;
  } catch {
    return false;
  }
}

export function LiveLocationProvider({ children }: { children: React.ReactNode }) {
  const [isEnabled, setIsEnabledState] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<LocationUpdate | null>(null);
  const [intervalMs, setIntervalMsState] = useState(DEFAULT_INTERVAL_MS);
  const subscriberRef = useRef<Location.LocationSubscription | null>(null);
  const webIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Load persisted settings
  useEffect(() => {
    (async () => {
      try {
        const enabledRaw = await AsyncStorage.getItem(LIVE_LOCATION_ENABLED_KEY);
        if (enabledRaw === "true") setIsEnabledState(true);
        const intervalRaw = await AsyncStorage.getItem(LIVE_LOCATION_INTERVAL_KEY);
        if (intervalRaw) setIntervalMsState(parseInt(intervalRaw, 10));
      } catch {
        // Ignore
      }
    })();
  }, []);

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

  // Pause tracking when app goes to background, resume when foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        // App came to foreground
        if (isEnabled) startTracking();
      } else if (nextState.match(/inactive|background/)) {
        // App went to background — keep native subscriber but stop web interval
        if (Platform.OS === "web" && webIntervalRef.current) {
          clearInterval(webIntervalRef.current);
          webIntervalRef.current = null;
        }
      }
      appStateRef.current = nextState;
    });

    return () => sub.remove();
  }, [isEnabled]);

  const startTracking = async () => {
    // Stop any existing tracking first
    stopTracking();

    if (Platform.OS === "web") {
      // Web: use setInterval with getCurrentPosition
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
            setLastUpdate(update);
            setIsTracking(true);
            pushLocationToServer(update);
          },
          () => { /* ignore errors */ },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      };

      tick(); // Immediate first update
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
          distanceInterval: 10, // minimum 10 meters between updates
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
          setLastUpdate(update);
          setIsTracking(true);
          pushLocationToServer(update);
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
      value={{ isEnabled, isTracking, lastUpdate, intervalMs, setEnabled, setIntervalMs }}
    >
      {children}
    </LiveLocationContext.Provider>
  );
}

export function useLiveLocation() {
  return useContext(LiveLocationContext);
}
