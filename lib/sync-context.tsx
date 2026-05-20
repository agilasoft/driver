import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { Platform } from "react-native";
import { getPendingChanges, getPendingStatusChanges, syncPendingChanges, syncPendingStatusChanges, setLastSyncTime, getLastSyncTime } from "./offline-store";

interface SyncContextValue {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSync: string | null;
  syncNow: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const syncingRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    const changes = await getPendingChanges();
    const statusChanges = await getPendingStatusChanges();
    setPendingCount(changes.filter((c) => !c.synced).length + statusChanges.length);
  }, []);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      await syncPendingChanges();
      await syncPendingStatusChanges();
      await setLastSyncTime();
      const time = await getLastSyncTime();
      setLastSync(time);
      await refreshPendingCount();
    } catch { /* ignore */ } finally {
      setIsSyncing(false);
      syncingRef.current = false;
    }
  }, [refreshPendingCount]);

  // Check connectivity
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const check = async () => {
      try {
        if (Platform.OS === "web") { setIsOnline(navigator.onLine); return; }
        // Simple connectivity check without netinfo
        try {
          const resp = await fetch("https://clients3.google.com/generate_204", { method: "HEAD" });
          setIsOnline(resp.ok || resp.status === 204);
        } catch { setIsOnline(false); }
      } catch { setIsOnline(true); }
    };
    check();
    interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  // Auto-sync when online and pending
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !syncingRef.current) syncNow();
  }, [isOnline, pendingCount, syncNow]);

  // Load initial state
  useEffect(() => {
    refreshPendingCount();
    getLastSyncTime().then(setLastSync);
  }, [refreshPendingCount]);

  return (
    <SyncContext.Provider value={{ isOnline, pendingCount, isSyncing, lastSync, syncNow, refreshPendingCount }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}
