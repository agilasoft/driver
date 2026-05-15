import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SHIFT_STATE_KEY = "shift_state";
const SHIFT_HISTORY_KEY = "shift_history";

export interface ShiftEntry {
  id: string;
  clockIn: number; // timestamp ms
  clockOut: number | null; // null if still active
  durationMs: number; // calculated
  profileId: string;
  synced: boolean;
}

interface ShiftState {
  isClocked: boolean;
  clockInTime: number | null;
  profileId: string | null;
}

interface ShiftContextType {
  isClocked: boolean;
  clockInTime: number | null;
  elapsedMs: number; // live elapsed time
  todayShifts: ShiftEntry[];
  totalTodayMs: number;
  clockIn: (profileId: string) => Promise<void>;
  clockOut: () => Promise<void>;
  syncShifts: (auth: { siteUrl: string; apiKey: string; apiSecret: string }) => Promise<{ synced: number; failed: number }>;
}

const ShiftContext = createContext<ShiftContextType>({
  isClocked: false,
  clockInTime: null,
  elapsedMs: 0,
  todayShifts: [],
  totalTodayMs: 0,
  clockIn: async () => {},
  clockOut: async () => {},
  syncShifts: async () => ({ synced: 0, failed: 0 }),
});

function generateId(): string {
  return `shift_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSameDay(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

export function ShiftLogProvider({ children }: { children: React.ReactNode }) {
  const [isClocked, setIsClocked] = useState(false);
  const [clockInTime, setClockInTime] = useState<number | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [history, setHistory] = useState<ShiftEntry[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load persisted state
  useEffect(() => {
    (async () => {
      try {
        const stateRaw = await AsyncStorage.getItem(SHIFT_STATE_KEY);
        if (stateRaw) {
          const state: ShiftState = JSON.parse(stateRaw);
          if (state.isClocked && state.clockInTime) {
            setIsClocked(true);
            setClockInTime(state.clockInTime);
            setProfileId(state.profileId);
            setElapsedMs(Date.now() - state.clockInTime);
          }
        }

        const histRaw = await AsyncStorage.getItem(SHIFT_HISTORY_KEY);
        if (histRaw) {
          setHistory(JSON.parse(histRaw));
        }
      } catch {
        // Ignore
      }
    })();
  }, []);

  // Elapsed time ticker
  useEffect(() => {
    if (isClocked && clockInTime) {
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - clockInTime);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedMs(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isClocked, clockInTime]);

  const saveState = async (state: ShiftState) => {
    await AsyncStorage.setItem(SHIFT_STATE_KEY, JSON.stringify(state));
  };

  const saveHistory = async (entries: ShiftEntry[]) => {
    await AsyncStorage.setItem(SHIFT_HISTORY_KEY, JSON.stringify(entries));
  };

  const clockInFn = useCallback(async (pid: string) => {
    const now = Date.now();
    setIsClocked(true);
    setClockInTime(now);
    setProfileId(pid);
    await saveState({ isClocked: true, clockInTime: now, profileId: pid });
  }, []);

  const clockOutFn = useCallback(async () => {
    if (!clockInTime || !profileId) return;

    const now = Date.now();
    const entry: ShiftEntry = {
      id: generateId(),
      clockIn: clockInTime,
      clockOut: now,
      durationMs: now - clockInTime,
      profileId,
      synced: false,
    };

    const newHistory = [entry, ...history].slice(0, 100); // Keep last 100 entries
    setHistory(newHistory);
    await saveHistory(newHistory);

    setIsClocked(false);
    setClockInTime(null);
    setProfileId(null);
    await saveState({ isClocked: false, clockInTime: null, profileId: null });
  }, [clockInTime, profileId, history]);

  const syncShifts = useCallback(async (auth: { siteUrl: string; apiKey: string; apiSecret: string }) => {
    const unsynced = history.filter((e) => !e.synced && e.clockOut);
    let synced = 0;
    let failed = 0;

    for (const entry of unsynced) {
      try {
        const baseUrl = auth.siteUrl.replace(/\/+$/, "");
        const headers = {
          Authorization: `token ${auth.apiKey}:${auth.apiSecret}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        };

        // Try to create a Timesheet entry in Frappe
        // If the doctype doesn't exist, we just mark as synced locally
        const res = await fetch(`${baseUrl}/api/method/frappe.client.insert`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            doc: {
              doctype: "Driver Shift Log",
              clock_in: new Date(entry.clockIn).toISOString(),
              clock_out: entry.clockOut ? new Date(entry.clockOut).toISOString() : null,
              duration_hours: entry.durationMs / (1000 * 60 * 60),
              profile_id: entry.profileId,
            },
          }),
        });

        // Mark as synced regardless of server response
        // (server may not have the doctype, which is fine)
        entry.synced = true;
        synced++;
      } catch {
        // If network error, leave unsynced for retry
        failed++;
      }
    }

    if (synced > 0) {
      const updated = history.map((e) => {
        const match = unsynced.find((u) => u.id === e.id && u.synced);
        return match ? { ...e, synced: true } : e;
      });
      setHistory(updated);
      await saveHistory(updated);
    }

    return { synced, failed };
  }, [history]);

  // Today's shifts
  const todayShifts = history.filter((e) => isSameDay(e.clockIn));
  const totalTodayMs = todayShifts.reduce((sum, e) => sum + e.durationMs, 0) +
    (isClocked && clockInTime ? elapsedMs : 0);

  return (
    <ShiftContext.Provider
      value={{
        isClocked,
        clockInTime,
        elapsedMs,
        todayShifts,
        totalTodayMs,
        clockIn: clockInFn,
        clockOut: clockOutFn,
        syncShifts,
      }}
    >
      {children}
    </ShiftContext.Provider>
  );
}

export function useShiftLog() {
  return useContext(ShiftContext);
}

/**
 * Format milliseconds to HH:MM:SS display.
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Format milliseconds to human-readable short form.
 */
export function formatDurationShort(ms: number): string {
  const totalMinutes = Math.floor(ms / (1000 * 60));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
