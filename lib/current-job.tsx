import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CURRENT_JOB_KEY = "current_job_id";

interface CurrentJobContextValue {
  currentJobId: string | null;
  setCurrentJob: (id: string | null) => Promise<void>;
}

const CurrentJobContext = createContext<CurrentJobContextValue | null>(null);

export function CurrentJobProvider({ children }: { children: React.ReactNode }) {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(CURRENT_JOB_KEY).then((id) => { if (id) setCurrentJobId(id); });
  }, []);

  const setCurrentJob = useCallback(async (id: string | null) => {
    setCurrentJobId(id);
    if (id) await AsyncStorage.setItem(CURRENT_JOB_KEY, id);
    else await AsyncStorage.removeItem(CURRENT_JOB_KEY);
  }, []);

  return (
    <CurrentJobContext.Provider value={{ currentJobId, setCurrentJob }}>
      {children}
    </CurrentJobContext.Provider>
  );
}

export function useCurrentJob() {
  const ctx = useContext(CurrentJobContext);
  if (!ctx) throw new Error("useCurrentJob must be used within CurrentJobProvider");
  return ctx;
}
