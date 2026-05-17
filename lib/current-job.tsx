import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";

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

// Fallback key when no profile is active (e.g. single-profile mode)
const FALLBACK_KEY = "current_job_default";

export function CurrentJobProvider({ children }: { children: React.ReactNode }) {
  const { activeProfile } = useAuth();
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const profileIdRef = useRef<string | null>(null);

  // Derive the storage key from the active profile
  const storageKey = activeProfile?.id
    ? getStorageKey(activeProfile.id)
    : FALLBACK_KEY;

  // Reload current job whenever the active profile changes
  useEffect(() => {
    const newProfileId = activeProfile?.id ?? null;

    // If profile changed, reload from storage
    if (newProfileId !== profileIdRef.current) {
      profileIdRef.current = newProfileId;
      setIsLoading(true);
      setCurrentJobId(null); // Clear while loading

      const key = newProfileId ? getStorageKey(newProfileId) : FALLBACK_KEY;
      AsyncStorage.getItem(key)
        .then((stored) => {
          if (stored) {
            setCurrentJobId(stored);
          }
        })
        .catch(() => {
          // ignore
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else if (isLoading && profileIdRef.current === null && !activeProfile) {
      // No profile yet — still loading auth, keep waiting
      // But set a timeout to avoid infinite loading
      const timer = setTimeout(() => setIsLoading(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [activeProfile]);

  const setCurrentJob = useCallback(async (runSheetId: string) => {
    const key = activeProfile?.id
      ? getStorageKey(activeProfile.id)
      : FALLBACK_KEY;

    try {
      await AsyncStorage.setItem(key, runSheetId);
    } catch {
      // ignore storage error
    }
    setCurrentJobId(runSheetId);
  }, [activeProfile?.id]);

  const clearCurrentJob = useCallback(async () => {
    const key = activeProfile?.id
      ? getStorageKey(activeProfile.id)
      : FALLBACK_KEY;

    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // ignore storage error
    }
    setCurrentJobId(null);
  }, [activeProfile?.id]);

  return (
    <CurrentJobContext.Provider value={{ currentJobId, setCurrentJob, clearCurrentJob, isLoading }}>
      {children}
    </CurrentJobContext.Provider>
  );
}
