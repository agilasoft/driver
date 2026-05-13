import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  RunSheet,
  RunSheetBundle,
  TransportLeg,
  PendingChange,
} from "./types";
import {
  updateTransportLeg,
  uploadFile,
  fetchRunSheets,
  fetchRunSheetBundle,
} from "./frappe-api";

const KEYS = {
  RUN_SHEETS: "offline_run_sheets",
  BUNDLES_PREFIX: "offline_bundle_",
  PENDING_CHANGES: "offline_pending_changes",
  LAST_SYNC: "offline_last_sync",
};

// ─── Cached Run Sheets ───────────────────────────────────────

export async function getCachedRunSheets(): Promise<RunSheet[]> {
  const raw = await AsyncStorage.getItem(KEYS.RUN_SHEETS);
  return raw ? JSON.parse(raw) : [];
}

export async function cacheRunSheets(sheets: RunSheet[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.RUN_SHEETS, JSON.stringify(sheets));
}

// ─── Cached Bundles ──────────────────────────────────────────

export async function getCachedBundle(
  name: string
): Promise<RunSheetBundle | null> {
  const raw = await AsyncStorage.getItem(KEYS.BUNDLES_PREFIX + name);
  return raw ? JSON.parse(raw) : null;
}

export async function cacheBundle(
  name: string,
  bundle: RunSheetBundle
): Promise<void> {
  await AsyncStorage.setItem(
    KEYS.BUNDLES_PREFIX + name,
    JSON.stringify(bundle)
  );
}

// ─── Pending Changes Queue ───────────────────────────────────

export async function getPendingChanges(): Promise<PendingChange[]> {
  const raw = await AsyncStorage.getItem(KEYS.PENDING_CHANGES);
  return raw ? JSON.parse(raw) : [];
}

export async function addPendingChange(
  change: PendingChange
): Promise<void> {
  const changes = await getPendingChanges();
  changes.push(change);
  await AsyncStorage.setItem(KEYS.PENDING_CHANGES, JSON.stringify(changes));
}

export async function removePendingChange(id: string): Promise<void> {
  const changes = await getPendingChanges();
  const filtered = changes.filter((c) => c.id !== id);
  await AsyncStorage.setItem(KEYS.PENDING_CHANGES, JSON.stringify(filtered));
}

export async function clearSyncedChanges(): Promise<void> {
  const changes = await getPendingChanges();
  const pending = changes.filter((c) => !c.synced);
  await AsyncStorage.setItem(KEYS.PENDING_CHANGES, JSON.stringify(pending));
}

// ─── Apply local changes to cached bundle ────────────────────

export async function applyLocalChange(
  runSheetName: string,
  legName: string,
  updates: Partial<TransportLeg>
): Promise<void> {
  const bundle = await getCachedBundle(runSheetName);
  if (!bundle) return;

  const legIndex = bundle.legs.findIndex((l) => l.name === legName);
  if (legIndex >= 0) {
    bundle.legs[legIndex] = { ...bundle.legs[legIndex], ...updates };
    await cacheBundle(runSheetName, bundle);
  }
}

// ─── Sync Engine ─────────────────────────────────────────────

export async function syncPendingChanges(): Promise<{
  synced: number;
  failed: number;
  total: number;
}> {
  const changes = await getPendingChanges();
  const unsynced = changes.filter((c) => !c.synced);
  let synced = 0;
  let failed = 0;

  for (const change of unsynced) {
    try {
      // Upload photo first if present
      if (change.photoUri && change.photoType) {
        const fieldname =
          change.photoType === "pick" ? "pick_photo" : "drop_photo";
        await uploadFile(
          change.photoUri,
          "Transport Leg",
          change.legName,
          fieldname,
          `${change.photoType}_photo_${Date.now()}.jpg`
        );
      }

      // Update the leg fields (signature, timestamp, etc.)
      if (change.changes && Object.keys(change.changes).length > 0) {
        await updateTransportLeg(change.legName, change.changes);
      }

      // Mark as synced
      change.synced = true;
      synced++;
    } catch (error) {
      console.warn(`Sync failed for change ${change.id}:`, error);
      failed++;
    }
  }

  // Save updated changes list
  await AsyncStorage.setItem(KEYS.PENDING_CHANGES, JSON.stringify(changes));
  await AsyncStorage.setItem(KEYS.LAST_SYNC, new Date().toISOString());

  // Clean up synced items
  if (synced > 0) {
    await clearSyncedChanges();
  }

  return { synced, failed, total: unsynced.length };
}

export async function getLastSyncTime(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.LAST_SYNC);
}

// ─── Full refresh (fetch from server and cache) ──────────────

export async function refreshRunSheets(): Promise<RunSheet[]> {
  const sheets = await fetchRunSheets();
  await cacheRunSheets(sheets);
  return sheets;
}

export async function refreshBundle(
  name: string
): Promise<RunSheetBundle> {
  const bundle = await fetchRunSheetBundle(name);
  await cacheBundle(name, bundle);
  return bundle;
}
