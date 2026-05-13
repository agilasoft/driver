import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import * as Network from "expo-network";
import {
  getPendingChanges,
  syncPendingChanges,
  getLastSyncTime,
} from "./offline-store";

interface SyncContextType {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSync: string | null;
  syncNow: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType>({
  isOnline: true,
  pendingCount: 0,
  isSyncing: false,
  lastSync: null,
  syncNow: async () => {},
  refreshPendingCount: async () => {},
});

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const syncingRef = useRef(false);

  // Monitor network state
  useEffect(() => {
    let sub: ReturnType<typeof Network.addNetworkStateListener> | null = null;

    (async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        setIsOnline(state.isInternetReachable ?? state.isConnected ?? true);
      } catch {
        setIsOnline(true);
      }
    })();

    sub = Network.addNetworkStateListener((state) => {
      setIsOnline(state.isInternetReachable ?? state.isConnected ?? true);
    });

    return () => {
      sub?.remove();
    };
  }, []);

  // Load initial pending count and last sync time
  useEffect(() => {
    refreshPendingCount();
    getLastSyncTime().then(setLastSync);
  }, []);

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !syncingRef.current) {
      syncNow();
    }
  }, [isOnline, pendingCount]);

  const refreshPendingCount = useCallback(async () => {
    const changes = await getPendingChanges();
    const unsynced = changes.filter((c) => !c.synced);
    setPendingCount(unsynced.length);
  }, []);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);

    try {
      const result = await syncPendingChanges();
      const syncTime = await getLastSyncTime();
      setLastSync(syncTime);
      await refreshPendingCount();
    } catch (error) {
      console.warn("Sync failed:", error);
    } finally {
      setIsSyncing(false);
      syncingRef.current = false;
    }
  }, [refreshPendingCount]);

  return (
    <SyncContext.Provider
      value={{
        isOnline,
        pendingCount,
        isSyncing,
        lastSync,
        syncNow,
        refreshPendingCount,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
