import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

const TIMEOUT_KEY = "session_timeout_minutes";
export const TIMEOUT_OPTIONS = [5, 10, 15, 30, 60, 0];

interface SessionTimeoutContextValue {
  timeoutMinutes: number;
  setTimeoutMinutes: (m: number) => Promise<void>;
  isTimedOut: boolean;
  resetTimer: () => void;
  markTimedOut: () => void;
}

const SessionTimeoutContext = createContext<SessionTimeoutContextValue | null>(null);

export function SessionTimeoutProvider({ children }: { children: React.ReactNode }) {
  const [timeoutMinutes, setTimeoutMinutesState] = useState(15);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActiveRef = useRef(Date.now());

  useEffect(() => {
    AsyncStorage.getItem(TIMEOUT_KEY).then((v) => { if (v) setTimeoutMinutesState(parseInt(v, 10)); });
  }, []);

  const setTimeoutMinutes = useCallback(async (m: number) => {
    setTimeoutMinutesState(m);
    await AsyncStorage.setItem(TIMEOUT_KEY, String(m));
  }, []);

  const resetTimer = useCallback(() => {
    lastActiveRef.current = Date.now();
    setIsTimedOut(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (timeoutMinutes > 0) {
      timerRef.current = setTimeout(() => setIsTimedOut(true), timeoutMinutes * 60 * 1000);
    }
  }, [timeoutMinutes]);

  const markTimedOut = useCallback(() => setIsTimedOut(true), []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && timeoutMinutes > 0) {
        const elapsed = Date.now() - lastActiveRef.current;
        if (elapsed > timeoutMinutes * 60 * 1000) setIsTimedOut(true);
        else resetTimer();
      }
    });
    return () => sub.remove();
  }, [timeoutMinutes, resetTimer]);

  return (
    <SessionTimeoutContext.Provider value={{ timeoutMinutes, setTimeoutMinutes, isTimedOut, resetTimer, markTimedOut }}>
      {children}
    </SessionTimeoutContext.Provider>
  );
}

export function useSessionTimeout() {
  const ctx = useContext(SessionTimeoutContext);
  if (!ctx) throw new Error("useSessionTimeout must be used within SessionTimeoutProvider");
  return ctx;
}
