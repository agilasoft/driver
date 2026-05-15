import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { Platform, Alert, Vibration } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";

const GEOFENCE_ENABLED_KEY = "geofence_enabled";
const GEOFENCE_RADIUS_KEY = "geofence_radius";
const GEOFENCE_TRIGGERED_KEY = "geofence_triggered"; // tracks which legs already triggered
const DEFAULT_RADIUS_M = 200; // 200 meters

export const RADIUS_OPTIONS = [
  { label: "100 meters", value: 100 },
  { label: "200 meters", value: 200 },
  { label: "500 meters", value: 500 },
  { label: "1 kilometer", value: 1000 },
] as const;

interface GeofenceTarget {
  legName: string;
  type: "pick" | "drop";
  latitude: number;
  longitude: number;
  label: string; // e.g. "Pick-up at Warehouse A"
}

interface GeofenceAlert {
  legName: string;
  type: "pick" | "drop";
  label: string;
  timestamp: number;
  distance: number;
}

interface GeofenceContextType {
  isEnabled: boolean;
  isMonitoring: boolean;
  radiusM: number;
  targets: GeofenceTarget[];
  recentAlerts: GeofenceAlert[];
  setEnabled: (enabled: boolean) => Promise<void>;
  setRadiusM: (radius: number) => Promise<void>;
  setTargets: (targets: GeofenceTarget[]) => void;
  clearAlerts: () => void;
}

const GeofenceContext = createContext<GeofenceContextType>({
  isEnabled: false,
  isMonitoring: false,
  radiusM: DEFAULT_RADIUS_M,
  targets: [],
  recentAlerts: [],
  setEnabled: async () => {},
  setRadiusM: async () => {},
  setTargets: () => {},
  clearAlerts: () => {},
});

/**
 * Calculate distance between two GPS coordinates using the Haversine formula.
 * Returns distance in meters.
 */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Load the set of already-triggered geofence keys to avoid duplicate alerts.
 */
async function loadTriggered(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(GEOFENCE_TRIGGERED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

async function saveTriggered(triggered: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(GEOFENCE_TRIGGERED_KEY, JSON.stringify([...triggered]));
  } catch {
    // Ignore
  }
}

function makeKey(legName: string, type: "pick" | "drop"): string {
  return `${legName}:${type}`;
}

export function GeofenceProvider({ children }: { children: React.ReactNode }) {
  const [isEnabled, setIsEnabledState] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [radiusM, setRadiusMState] = useState(DEFAULT_RADIUS_M);
  const [targets, setTargetsState] = useState<GeofenceTarget[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<GeofenceAlert[]>([]);
  const subscriberRef = useRef<Location.LocationSubscription | null>(null);
  const webIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const triggeredRef = useRef<Set<string>>(new Set());
  const targetsRef = useRef<GeofenceTarget[]>([]);

  // Keep targetsRef in sync
  useEffect(() => {
    targetsRef.current = targets;
  }, [targets]);

  // Load persisted settings
  useEffect(() => {
    (async () => {
      try {
        const enabledRaw = await AsyncStorage.getItem(GEOFENCE_ENABLED_KEY);
        if (enabledRaw === "true") setIsEnabledState(true);
        const radiusRaw = await AsyncStorage.getItem(GEOFENCE_RADIUS_KEY);
        if (radiusRaw) setRadiusMState(parseInt(radiusRaw, 10));
        triggeredRef.current = await loadTriggered();
      } catch {
        // Ignore
      }
    })();
  }, []);

  // Check position against all targets
  const checkPosition = useCallback((latitude: number, longitude: number) => {
    const currentTargets = targetsRef.current;
    if (currentTargets.length === 0) return;

    for (const target of currentTargets) {
      const key = makeKey(target.legName, target.type);
      if (triggeredRef.current.has(key)) continue; // Already triggered

      const distance = haversineDistance(latitude, longitude, target.latitude, target.longitude);

      if (distance <= radiusM) {
        // Trigger geofence alert!
        triggeredRef.current.add(key);
        saveTriggered(triggeredRef.current);

        const alert: GeofenceAlert = {
          legName: target.legName,
          type: target.type,
          label: target.label,
          timestamp: Date.now(),
          distance: Math.round(distance),
        };

        setRecentAlerts((prev) => [alert, ...prev].slice(0, 20)); // Keep last 20

        // Haptic feedback
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          try { Vibration.vibrate(200); } catch { /* ignore */ }
        }

        // Show alert
        const typeLabel = target.type === "pick" ? "Pick-up" : "Drop-off";
        Alert.alert(
          `📍 ${typeLabel} Zone Reached`,
          `You are within ${Math.round(distance)}m of ${target.label}.\n\nWould you like to record the ${typeLabel.toLowerCase()} timestamp now?`,
          [
            { text: "Later", style: "cancel" },
            {
              text: `Record ${typeLabel}`,
              style: "default",
              onPress: () => {
                // The user will navigate to the leg detail to complete the action.
                // The alert serves as a prompt — the actual timestamp recording
                // happens in the leg detail screen.
              },
            },
          ]
        );
      }
    }
  }, [radiusM]);

  // Start/stop monitoring
  useEffect(() => {
    if (!isEnabled || targets.length === 0) {
      stopMonitoring();
      return;
    }

    startMonitoring();
    return () => stopMonitoring();
  }, [isEnabled, targets.length, radiusM]);

  const startMonitoring = async () => {
    stopMonitoring();

    if (Platform.OS === "web") {
      if (!navigator.geolocation) return;

      const tick = () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setIsMonitoring(true);
            checkPosition(pos.coords.latitude, pos.coords.longitude);
          },
          () => { /* ignore */ },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      };

      tick();
      webIntervalRef.current = setInterval(tick, 15000); // Check every 15s
      return;
    }

    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) return;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const subscriber = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000, // Every 10 seconds
          distanceInterval: 20, // Or every 20 meters
        },
        (location) => {
          setIsMonitoring(true);
          checkPosition(location.coords.latitude, location.coords.longitude);
        }
      );

      subscriberRef.current = subscriber;
    } catch (error) {
      console.warn("Failed to start geofence monitoring:", error);
    }
  };

  const stopMonitoring = () => {
    if (subscriberRef.current) {
      subscriberRef.current.remove();
      subscriberRef.current = null;
    }
    if (webIntervalRef.current) {
      clearInterval(webIntervalRef.current);
      webIntervalRef.current = null;
    }
    setIsMonitoring(false);
  };

  const setEnabled = useCallback(async (enabled: boolean) => {
    setIsEnabledState(enabled);
    await AsyncStorage.setItem(GEOFENCE_ENABLED_KEY, enabled ? "true" : "false");
  }, []);

  const setRadiusM = useCallback(async (radius: number) => {
    setRadiusMState(radius);
    await AsyncStorage.setItem(GEOFENCE_RADIUS_KEY, radius.toString());
    // Reset triggered set when radius changes so alerts can re-fire
    triggeredRef.current = new Set();
    await saveTriggered(triggeredRef.current);
  }, []);

  const setTargets = useCallback((newTargets: GeofenceTarget[]) => {
    setTargetsState(newTargets);
  }, []);

  const clearAlerts = useCallback(() => {
    setRecentAlerts([]);
  }, []);

  return (
    <GeofenceContext.Provider
      value={{
        isEnabled,
        isMonitoring,
        radiusM,
        targets,
        recentAlerts,
        setEnabled,
        setRadiusM,
        setTargets,
        clearAlerts,
      }}
    >
      {children}
    </GeofenceContext.Provider>
  );
}

export function useGeofence() {
  return useContext(GeofenceContext);
}

/**
 * Helper: Build geofence targets from resolved leg coordinates.
 */
export function buildGeofenceTargets(
  resolvedLegs: Array<{
    legName: string;
    facilityFrom: string;
    facilityTo: string;
    pickCoords: { latitude: number; longitude: number } | null;
    dropCoords: { latitude: number; longitude: number } | null;
  }>
): GeofenceTarget[] {
  const targets: GeofenceTarget[] = [];

  for (const leg of resolvedLegs) {
    if (leg.pickCoords) {
      targets.push({
        legName: leg.legName,
        type: "pick",
        latitude: leg.pickCoords.latitude,
        longitude: leg.pickCoords.longitude,
        label: leg.facilityFrom || "Pick-up",
      });
    }
    if (leg.dropCoords) {
      targets.push({
        legName: leg.legName,
        type: "drop",
        latitude: leg.dropCoords.latitude,
        longitude: leg.dropCoords.longitude,
        label: leg.facilityTo || "Drop-off",
      });
    }
  }

  return targets;
}

/**
 * Reset triggered geofences (e.g. when switching to a new run sheet).
 */
export async function resetTriggeredGeofences(): Promise<void> {
  await AsyncStorage.removeItem(GEOFENCE_TRIGGERED_KEY);
}
