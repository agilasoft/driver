import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RunSheet, RunSheetBundle, TransportLeg, PendingChange, PendingStatusChange } from "./types";
import { fetchRunSheets, fetchRunSheetBundle } from "./frappe-api";

const KEYS = {
  runSheets: "offline_run_sheets",
  pending: "offline_pending_changes",
  statusChanges: "pending_status_changes",
  lastSync: "last_sync_time",
  bundlePrefix: "offline_bundle_",
};

export async function getCachedRunSheets(): Promise<RunSheet[]> {
  const raw = await AsyncStorage.getItem(KEYS.runSheets);
  return raw ? JSON.parse(raw) : [];
}

export async function cacheRunSheets(sheets: RunSheet[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.runSheets, JSON.stringify(sheets));
}

export async function refreshRunSheets(driverId?: string): Promise<RunSheet[]> {
  const sheets = await fetchRunSheets(driverId);
  await cacheRunSheets(sheets);
  return sheets;
}

export async function getCachedBundle(name: string): Promise<RunSheetBundle | null> {
  const raw = await AsyncStorage.getItem(KEYS.bundlePrefix + name);
  return raw ? JSON.parse(raw) : null;
}

export async function cacheBundle(name: string, bundle: RunSheetBundle): Promise<void> {
  await AsyncStorage.setItem(KEYS.bundlePrefix + name, JSON.stringify(bundle));
}

export async function refreshBundle(name: string): Promise<RunSheetBundle> {
  const bundle = await fetchRunSheetBundle(name);
  await cacheBundle(name, bundle);
  return bundle;
}

export async function getPendingChanges(): Promise<PendingChange[]> {
  const raw = await AsyncStorage.getItem(KEYS.pending);
  return raw ? JSON.parse(raw) : [];
}

export async function addPendingChange(change: PendingChange): Promise<void> {
  const existing = await getPendingChanges();
  existing.push(change);
  await AsyncStorage.setItem(KEYS.pending, JSON.stringify(existing));
}

export async function removePendingChange(id: string): Promise<void> {
  const existing = await getPendingChanges();
  await AsyncStorage.setItem(KEYS.pending, JSON.stringify(existing.filter((c) => c.id !== id)));
}

export async function clearSyncedChanges(): Promise<void> {
  const existing = await getPendingChanges();
  await AsyncStorage.setItem(KEYS.pending, JSON.stringify(existing.filter((c) => !c.synced)));
}

export async function applyLocalChange(runSheetName: string, legName: string, changes: Partial<TransportLeg>): Promise<void> {
  const bundle = await getCachedBundle(runSheetName);
  if (!bundle) return;
  const legIdx = bundle.legs.findIndex((l) => l.name === legName);
  if (legIdx >= 0) {
    bundle.legs[legIdx] = { ...bundle.legs[legIdx], ...changes };
    await cacheBundle(runSheetName, bundle);
  }
}

export async function getPendingStatusChanges(): Promise<PendingStatusChange[]> {
  const raw = await AsyncStorage.getItem(KEYS.statusChanges);
  return raw ? JSON.parse(raw) : [];
}

export async function addPendingStatusChange(change: PendingStatusChange): Promise<void> {
  const existing = await getPendingStatusChanges();
  const idx = existing.findIndex((c) => c.runSheetName === change.runSheetName);
  if (idx >= 0) existing[idx] = change;
  else existing.push(change);
  await AsyncStorage.setItem(KEYS.statusChanges, JSON.stringify(existing));
}

export async function removePendingStatusChange(runSheetName: string): Promise<void> {
  const existing = await getPendingStatusChanges();
  await AsyncStorage.setItem(KEYS.statusChanges, JSON.stringify(existing.filter((c) => c.runSheetName !== runSheetName)));
}

export async function applyLocalStatusChange(runSheetName: string, newStatus: string): Promise<void> {
  const sheets = await getCachedRunSheets();
  const sheetIdx = sheets.findIndex((s) => s.name === runSheetName);
  if (sheetIdx >= 0) { sheets[sheetIdx].status = newStatus; await cacheRunSheets(sheets); }
  const bundle = await getCachedBundle(runSheetName);
  if (bundle) { bundle.doc.status = newStatus; await cacheBundle(runSheetName, bundle); }
}

export async function syncPendingChanges(): Promise<number> {
  const { updateLegFields, uploadFile } = await import("./frappe-api");
  const changes = await getPendingChanges();
  let synced = 0;
  for (const change of changes) {
    if (change.synced) continue;
    try {
      if (change.photoUri && change.photoType) {
        const fieldname = change.photoType === "pick" ? "pick_photo" : "drop_photo";
        await uploadFile(change.photoUri, "Transport Leg", change.legName, fieldname);
      }
      if (Object.keys(change.changes).length > 0) await updateLegFields(change.legName, change.changes);
      change.synced = true;
      synced++;
    } catch { /* retry next time */ }
  }
  await AsyncStorage.setItem(KEYS.pending, JSON.stringify(changes));
  await clearSyncedChanges();
  return synced;
}

export async function syncPendingStatusChanges(): Promise<number> {
  const { updateRunSheetStatus } = await import("./frappe-api");
  const changes = await getPendingStatusChanges();
  let synced = 0;
  for (const change of changes) {
    try {
      await updateRunSheetStatus(change.runSheetName, change.status);
      await removePendingStatusChange(change.runSheetName);
      synced++;
    } catch { /* retry */ }
  }
  return synced;
}

export async function getLastSyncTime(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.lastSync);
}

export async function setLastSyncTime(): Promise<void> {
  await AsyncStorage.setItem(KEYS.lastSync, new Date().toISOString());
}
