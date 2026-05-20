import React, { createContext, useContext, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ENABLED_KEY = "geofence_enabled";
const RADIUS_KEY = "geofence_radius";
export const RADIUS_OPTIONS = [100, 200, 500, 1000];

export interface GeofenceTarget {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

interface GeofenceContextValue {
  isEnabled: boolean;
  isMonitoring: boolean;
  radiusM: number;
  recentAlerts: string[];
  targets: GeofenceTarget[];
  setEnabled: (v: boolean) => Promise<void>;
  setRadiusM: (m: number) => Promise<void>;
  setTargets: (t: GeofenceTarget[]) => void;
}

const GeofenceContext = createContext<GeofenceContextValue | null>(null);

export function GeofenceProvider({ children }: { children: React.ReactNode }) {
  const [isEnabled, setIsEnabledState] = useState(false);
  const [radiusM, setRadiusMState] = useState(200);
  const [targets, setTargets] = useState<GeofenceTarget[]>([]);
  const [recentAlerts] = useState<string[]>([]);

  const setEnabled = useCallback(async (v: boolean) => {
    setIsEnabledState(v);
    await AsyncStorage.setItem(ENABLED_KEY, String(v));
  }, []);

  const setRadiusM = useCallback(async (m: number) => {
    setRadiusMState(m);
    await AsyncStorage.setItem(RADIUS_KEY, String(m));
  }, []);

  return (
    <GeofenceContext.Provider value={{ isEnabled, isMonitoring: isEnabled && targets.length > 0, radiusM, recentAlerts, targets, setEnabled, setRadiusM, setTargets }}>
      {children}
    </GeofenceContext.Provider>
  );
}

export function useGeofence() {
  const ctx = useContext(GeofenceContext);
  return ctx;
}

export function buildGeofenceTargets(legs: any[]): GeofenceTarget[] {
  const targets: GeofenceTarget[] = [];
  for (const leg of legs) {
    if (leg.pick_latitude && leg.pick_longitude) targets.push({ id: leg.name + "_pick", label: leg.facility_from || "Pick-up", latitude: leg.pick_latitude, longitude: leg.pick_longitude });
    if (leg.drop_latitude && leg.drop_longitude) targets.push({ id: leg.name + "_drop", label: leg.facility_to || "Drop-off", latitude: leg.drop_latitude, longitude: leg.drop_longitude });
  }
  return targets;
}
