import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Types ──────────────────────────────────────────────────────────────────

interface SessionTimeoutContextType {
  /** Timeout in minutes (0 = disabled) */
  timeoutMinutes: number;
  /** Update the timeout setting */
  setTimeoutMinutes: (minutes: number) => Promise<void>;
  /** Whether the session has timed out and should be locked */
  isTimedOut: boolean;
  /** Reset the timeout (call after successful unlock) */
  resetTimeout: () => void;
  /** Record user activity to reset the idle timer */
  recordActivity: () => void;
}

const SessionTimeoutContext = createContext<SessionTimeoutContextType>({
  timeoutMinutes: 0,
  setTimeoutMinutes: async () => {},
  isTimedOut: false,
  resetTimeout: () => {},
  recordActivity: () => {},
});

// ── Storage ────────────────────────────────────────────────────────────────

const TIMEOUT_KEY = "driver_session_timeout_minutes";
const LAST_ACTIVE_KEY = "driver_last_active_ts";

// ── Provider ───────────────────────────────────────────────────────────────

export function SessionTimeoutProvider({ children }: { children: React.ReactNode }) {
  const [timeoutMinutes, setTimeoutMinutesState] = useState(0);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const lastActiveRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load saved timeout setting
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(TIMEOUT_KEY);
        if (saved) {
          const mins = parseInt(saved, 10);
          if (!isNaN(mins) && mins >= 0) {
            setTimeoutMinutesState(mins);
          }
        }
      } catch {
        // Ignore
      }
    })();
  }, []);

  // Save timeout setting
  const setTimeoutMinutes = useCallback(async (minutes: number) => {
    setTimeoutMinutesState(minutes);
    await AsyncStorage.setItem(TIMEOUT_KEY, String(minutes));
    // Reset the timer when changing settings
    lastActiveRef.current = Date.now();
    setIsTimedOut(false);
  }, []);

  // Record user activity
  const recordActivity = useCallback(() => {
    lastActiveRef.current = Date.now();
    // Also persist to storage for app background checks
    AsyncStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())).catch(() => {});
  }, []);

  // Reset timeout (after unlock)
  const resetTimeout = useCallback(() => {
    lastActiveRef.current = Date.now();
    setIsTimedOut(false);
    AsyncStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())).catch(() => {});
  }, []);

  // Check for timeout periodically
  useEffect(() => {
    if (timeoutMinutes <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const checkTimeout = () => {
      const elapsed = Date.now() - lastActiveRef.current;
      const timeoutMs = timeoutMinutes * 60 * 1000;
      if (elapsed >= timeoutMs) {
        setIsTimedOut(true);
      }
    };

    // Check every 30 seconds
    timerRef.current = setInterval(checkTimeout, 30_000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [timeoutMinutes]);

  // Handle app state changes (background → foreground)
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === "active" && timeoutMinutes > 0) {
        // Check if we timed out while in background
        try {
          const savedTs = await AsyncStorage.getItem(LAST_ACTIVE_KEY);
          const lastActive = savedTs ? parseInt(savedTs, 10) : lastActiveRef.current;
          const elapsed = Date.now() - lastActive;
          const timeoutMs = timeoutMinutes * 60 * 1000;
          if (elapsed >= timeoutMs) {
            setIsTimedOut(true);
          }
        } catch {
          // Ignore
        }
      } else if (nextState === "background" || nextState === "inactive") {
        // Save last active timestamp when going to background
        AsyncStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())).catch(() => {});
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [timeoutMinutes]);

  return (
    <SessionTimeoutContext.Provider
      value={{
        timeoutMinutes,
        setTimeoutMinutes,
        isTimedOut,
        resetTimeout,
        recordActivity,
      }}
    >
      {children}
    </SessionTimeoutContext.Provider>
  );
}

export function useSessionTimeout() {
  return useContext(SessionTimeoutContext);
}

// Available timeout options for settings UI
export const TIMEOUT_OPTIONS = [
  { label: "Disabled", value: 0 },
  { label: "1 minute", value: 1 },
  { label: "5 minutes", value: 5 },
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
];
