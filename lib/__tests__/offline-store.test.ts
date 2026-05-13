import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AsyncStorage
const mockStorage: Record<string, string> = {};
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mockStorage[key] || null)),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
  },
}));

// Mock frappe-api
vi.mock("../frappe-api", () => ({
  updateTransportLeg: vi.fn(() => Promise.resolve()),
  uploadFile: vi.fn(() => Promise.resolve("/files/test.jpg")),
  fetchRunSheets: vi.fn(() => Promise.resolve([])),
  fetchRunSheetBundle: vi.fn(() =>
    Promise.resolve({ doc: {}, legs: [] })
  ),
}));

import {
  getCachedRunSheets,
  cacheRunSheets,
  getCachedBundle,
  cacheBundle,
  getPendingChanges,
  addPendingChange,
  removePendingChange,
  clearSyncedChanges,
  applyLocalChange,
} from "../offline-store";
import type { RunSheet, RunSheetBundle, PendingChange } from "../types";

beforeEach(() => {
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
});

describe("Offline Store - Run Sheets Cache", () => {
  it("returns empty array when no cached run sheets", async () => {
    const sheets = await getCachedRunSheets();
    expect(sheets).toEqual([]);
  });

  it("caches and retrieves run sheets", async () => {
    const testSheets: RunSheet[] = [
      {
        name: "RS-001",
        run_date: "2024-01-15",
        run_type: "Delivery",
        route_name: "Route A",
        status: "Dispatched",
        vehicle_type: "Truck",
        vehicle: "VH-001",
        transport_company: "Test Co",
        driver: "DRV-001",
        driver_name: "John Doe",
        dispatch_terminal: "Terminal A",
        return_terminal: "Terminal B",
        estimated_dispatch_datetime: "2024-01-15 08:00:00",
        estimated_return_datetime: "2024-01-15 18:00:00",
      },
    ];

    await cacheRunSheets(testSheets);
    const retrieved = await getCachedRunSheets();
    expect(retrieved).toEqual(testSheets);
    expect(retrieved[0].name).toBe("RS-001");
  });
});

describe("Offline Store - Bundle Cache", () => {
  it("returns null for uncached bundle", async () => {
    const bundle = await getCachedBundle("RS-999");
    expect(bundle).toBeNull();
  });

  it("caches and retrieves a bundle", async () => {
    const testBundle: RunSheetBundle = {
      doc: {
        name: "RS-001",
        run_date: "2024-01-15",
        run_type: "Delivery",
        route_name: "Route A",
        status: "Dispatched",
        vehicle_type: "Truck",
        vehicle: "VH-001",
        transport_company: "Test Co",
        driver: "DRV-001",
        driver_name: "John Doe",
        dispatch_terminal: "Terminal A",
        return_terminal: "Terminal B",
        estimated_dispatch_datetime: "2024-01-15 08:00:00",
        estimated_return_datetime: "2024-01-15 18:00:00",
      },
      legs: [
        {
          name: "LEG-001",
          date: "2024-01-15",
          transport_job: "JOB-001",
          vehicle_type: "Truck",
          facility_type_from: "Warehouse",
          facility_from: "Warehouse A",
          pick_address: "123 Main St",
          facility_type_to: "Store",
          facility_to: "Store B",
          drop_address: "456 Oak Ave",
          start_date: "",
          end_date: "",
          distance_km: 50,
          duration_min: 60,
          pick_signature: "",
          pick_signed_by: "",
          drop_signature: "",
          drop_signed_by: "",
          date_signed: "",
          status: "Assigned",
          actual_distance_km: 0,
          actual_duration_min: 0,
        },
      ],
    };

    await cacheBundle("RS-001", testBundle);
    const retrieved = await getCachedBundle("RS-001");
    expect(retrieved).toEqual(testBundle);
    expect(retrieved?.legs[0].name).toBe("LEG-001");
  });
});

describe("Offline Store - Pending Changes", () => {
  it("returns empty array when no pending changes", async () => {
    const changes = await getPendingChanges();
    expect(changes).toEqual([]);
  });

  it("adds and retrieves pending changes", async () => {
    const change: PendingChange = {
      id: "change-1",
      legName: "LEG-001",
      runSheetName: "RS-001",
      timestamp: "2024-01-15T10:00:00.000Z",
      changes: { start_date: "2024-01-15 10:00:00" },
      synced: false,
    };

    await addPendingChange(change);
    const changes = await getPendingChanges();
    expect(changes).toHaveLength(1);
    expect(changes[0].id).toBe("change-1");
    expect(changes[0].synced).toBe(false);
  });

  it("removes a specific pending change", async () => {
    const change1: PendingChange = {
      id: "change-1",
      legName: "LEG-001",
      runSheetName: "RS-001",
      timestamp: "2024-01-15T10:00:00.000Z",
      changes: { start_date: "2024-01-15 10:00:00" },
      synced: false,
    };
    const change2: PendingChange = {
      id: "change-2",
      legName: "LEG-002",
      runSheetName: "RS-001",
      timestamp: "2024-01-15T11:00:00.000Z",
      changes: { end_date: "2024-01-15 11:00:00" },
      synced: false,
    };

    await addPendingChange(change1);
    await addPendingChange(change2);
    await removePendingChange("change-1");

    const changes = await getPendingChanges();
    expect(changes).toHaveLength(1);
    expect(changes[0].id).toBe("change-2");
  });

  it("clears only synced changes", async () => {
    const change1: PendingChange = {
      id: "change-1",
      legName: "LEG-001",
      runSheetName: "RS-001",
      timestamp: "2024-01-15T10:00:00.000Z",
      changes: {},
      synced: true,
    };
    const change2: PendingChange = {
      id: "change-2",
      legName: "LEG-002",
      runSheetName: "RS-001",
      timestamp: "2024-01-15T11:00:00.000Z",
      changes: {},
      synced: false,
    };

    await addPendingChange(change1);
    await addPendingChange(change2);
    await clearSyncedChanges();

    const changes = await getPendingChanges();
    expect(changes).toHaveLength(1);
    expect(changes[0].id).toBe("change-2");
    expect(changes[0].synced).toBe(false);
  });
});

describe("Offline Store - Apply Local Changes", () => {
  it("applies changes to a cached leg", async () => {
    const testBundle: RunSheetBundle = {
      doc: {
        name: "RS-001",
        run_date: "2024-01-15",
        run_type: "Delivery",
        route_name: "Route A",
        status: "Dispatched",
        vehicle_type: "Truck",
        vehicle: "VH-001",
        transport_company: "Test Co",
        driver: "DRV-001",
        driver_name: "John Doe",
        dispatch_terminal: "Terminal A",
        return_terminal: "Terminal B",
        estimated_dispatch_datetime: "2024-01-15 08:00:00",
        estimated_return_datetime: "2024-01-15 18:00:00",
      },
      legs: [
        {
          name: "LEG-001",
          date: "2024-01-15",
          transport_job: "JOB-001",
          vehicle_type: "Truck",
          facility_type_from: "Warehouse",
          facility_from: "Warehouse A",
          pick_address: "123 Main St",
          facility_type_to: "Store",
          facility_to: "Store B",
          drop_address: "456 Oak Ave",
          start_date: "",
          end_date: "",
          distance_km: 50,
          duration_min: 60,
          pick_signature: "",
          pick_signed_by: "",
          drop_signature: "",
          drop_signed_by: "",
          date_signed: "",
          status: "Assigned",
          actual_distance_km: 0,
          actual_duration_min: 0,
        },
      ],
    };

    await cacheBundle("RS-001", testBundle);
    await applyLocalChange("RS-001", "LEG-001", {
      start_date: "2024-01-15 10:30:00",
      pick_signed_by: "Jane Smith",
    });

    const updated = await getCachedBundle("RS-001");
    expect(updated?.legs[0].start_date).toBe("2024-01-15 10:30:00");
    expect(updated?.legs[0].pick_signed_by).toBe("Jane Smith");
  });
});
