import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getActiveProfileId } from "@/lib/profile-manager";

interface CurrentJobContextType {
  currentJobId: string | null;
  setCurrentJob: (runSheetId: string) => Promise<void>;
  clearCurrentJob: () => Promise<void>;
  isLoading: boolean;
}

const CurrentJobContext = createContext<CurrentJobContextType>({
  currentJobId: null,
  setCurrentJob: async () => {},
  clearCurrentJob: async () => {},
  isLoading: true,
});

export function useCurrentJob() {
  return useContext(CurrentJobContext);
}

function getStorageKey(profileId: string) {
  return `current_job_${profileId}`;
}

export function CurrentJobProvider({ children }: { children: React.ReactNode }) {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load current job on mount
  useEffect(() => {
    (async () => {
      try {
        const profileId = await getActiveProfileId();
        if (profileId) {
          const stored = await AsyncStorage.getItem(getStorageKey(profileId));
          if (stored) {
            setCurrentJobId(stored);
          }
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const setCurrentJob = useCallback(async (runSheetId: string) => {
    try {
      const profileId = await getActiveProfileId();
      if (profileId) {
        await AsyncStorage.setItem(getStorageKey(profileId), runSheetId);
      }
      setCurrentJobId(runSheetId);
    } catch {
      // ignore
    }
  }, []);

  const clearCurrentJob = useCallback(async () => {
    try {
      const profileId = await getActiveProfileId();
      if (profileId) {
        await AsyncStorage.removeItem(getStorageKey(profileId));
      }
      setCurrentJobId(null);
    } catch {
      // ignore
    }
  }, []);

  return (
    <CurrentJobContext.Provider value={{ currentJobId, setCurrentJob, clearCurrentJob, isLoading }}>
      {children}
    </CurrentJobContext.Provider>
  );
}
