import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CLOCKED_KEY = "shift_clocked_in";
const START_KEY = "shift_start_time";

interface ShiftLogContextValue {
  isClocked: boolean;
  elapsedMs: number;
  todayShifts: any[];
  totalTodayMs: number;
  clockIn: () => Promise<void>;
  clockOut: () => Promise<void>;
  syncShifts: () => Promise<void>;
}

const ShiftLogContext = createContext<ShiftLogContextValue | null>(null);

export function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return h > 0 ? h + "h " + m + "m" : m + "m " + s + "s";
}

export function formatDurationShort(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? h + ":" + String(m).padStart(2, "0") : "0:" + String(m).padStart(2, "0");
}

export function ShiftLogProvider({ children }: { children: React.ReactNode }) {
  const [isClocked, setIsClocked] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(CLOCKED_KEY).then((v) => {
      if (v === "true") {
        setIsClocked(true);
        AsyncStorage.getItem(START_KEY).then((start) => {
          if (start) setElapsedMs(Date.now() - parseInt(start, 10));
        });
      }
    });
  }, []);

  useEffect(() => {
    if (isClocked) {
      intervalRef.current = setInterval(() => {
        AsyncStorage.getItem(START_KEY).then((start) => {
          if (start) setElapsedMs(Date.now() - parseInt(start, 10));
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isClocked]);

  const clockIn = useCallback(async () => {
    const now = Date.now();
    await AsyncStorage.setItem(CLOCKED_KEY, "true");
    await AsyncStorage.setItem(START_KEY, String(now));
    setIsClocked(true);
    setElapsedMs(0);
  }, []);

  const clockOut = useCallback(async () => {
    await AsyncStorage.setItem(CLOCKED_KEY, "false");
    setIsClocked(false);
    setElapsedMs(0);
  }, []);

  const syncShifts = useCallback(async () => { /* no-op for now */ }, []);

  return (
    <ShiftLogContext.Provider value={{ isClocked, elapsedMs, todayShifts: [], totalTodayMs: elapsedMs, clockIn, clockOut, syncShifts }}>
      {children}
    </ShiftLogContext.Provider>
  );
}

export function useShiftLog() {
  const ctx = useContext(ShiftLogContext);
  return ctx;
}
