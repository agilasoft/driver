import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const ENABLED_KEY = "live_location_enabled";
const INTERVAL_KEY = "live_location_interval";
export const INTERVAL_OPTIONS = [10000, 30000, 60000, 120000, 300000];

interface LiveLocationContextValue {
  isEnabled: boolean;
  isTracking: boolean;
  lastUpdate: string | null;
  intervalMs: number;
  setEnabled: (v: boolean) => Promise<void>;
  setIntervalMs: (ms: number) => Promise<void>;
}

const LiveLocationContext = createContext<LiveLocationContextValue | null>(null);

export function LiveLocationProvider({ children }: { children: React.ReactNode }) {
  const [isEnabled, setIsEnabledState] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [intervalMs, setIntervalMsState] = useState(30000);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ENABLED_KEY).then((v) => { if (v === "true") setIsEnabledState(true); });
    AsyncStorage.getItem(INTERVAL_KEY).then((v) => { if (v) setIntervalMsState(parseInt(v, 10)); });
  }, []);

  const setEnabled = useCallback(async (v: boolean) => {
    setIsEnabledState(v);
    await AsyncStorage.setItem(ENABLED_KEY, String(v));
  }, []);

  const setIntervalMs = useCallback(async (ms: number) => {
    setIntervalMsState(ms);
    await AsyncStorage.setItem(INTERVAL_KEY, String(ms));
  }, []);

  useEffect(() => {
    setIsTracking(true);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isEnabled, intervalMs]);

  return (
    <LiveLocationContext.Provider value={{ isEnabled, isTracking, lastUpdate, intervalMs, setEnabled, setIntervalMs }}>
      {children}
    </LiveLocationContext.Provider>
  );
}

export function useLiveLocation() {
  const ctx = useContext(LiveLocationContext);
  return ctx;
}
