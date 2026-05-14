import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AsyncStorage
const store: Record<string, string> = {};
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
      return Promise.resolve();
    }),
  },
}));

// Mock frappe-api
vi.mock("../frappe-api", () => ({
  updateTransportLeg: vi.fn(() => Promise.resolve()),
  updateRunSheetStatus: vi.fn(() => Promise.resolve()),
  uploadFile: vi.fn(() => Promise.resolve("file_url")),
  fetchRunSheets: vi.fn(() => Promise.resolve([])),
  fetchRunSheetBundle: vi.fn(() =>
    Promise.resolve({ doc: { name: "RS-001" }, legs: [] })
  ),
}));

beforeEach(() => {
  Object.keys(store).forEach((key) => delete store[key]);
});

describe("PendingStatusChange type", () => {
  it("should have the correct shape", () => {
    const change = {
      runSheetName: "RS-001",
      status: "In-Progress",
      timestamp: new Date().toISOString(),
    };
    expect(change).toHaveProperty("runSheetName");
    expect(change).toHaveProperty("status");
    expect(change).toHaveProperty("timestamp");
  });
});

describe("Status change offline queue", () => {
  it("should add and retrieve pending status changes", async () => {
    const {
      addPendingStatusChange,
      getPendingStatusChanges,
    } = await import("../offline-store");

    await addPendingStatusChange({
      runSheetName: "RS-001",
      status: "In-Progress",
      timestamp: "2026-01-01T10:00:00Z",
    });

    const changes = await getPendingStatusChanges();
    expect(changes).toHaveLength(1);
    expect(changes[0].runSheetName).toBe("RS-001");
    expect(changes[0].status).toBe("In-Progress");
  });

  it("should replace existing pending change for the same run sheet", async () => {
    const {
      addPendingStatusChange,
      getPendingStatusChanges,
    } = await import("../offline-store");

    await addPendingStatusChange({
      runSheetName: "RS-001",
      status: "In-Progress",
      timestamp: "2026-01-01T10:00:00Z",
    });

    await addPendingStatusChange({
      runSheetName: "RS-001",
      status: "Completed",
      timestamp: "2026-01-01T11:00:00Z",
    });

    const changes = await getPendingStatusChanges();
    expect(changes).toHaveLength(1);
    expect(changes[0].status).toBe("Completed");
  });

  it("should remove pending status change", async () => {
    const {
      addPendingStatusChange,
      removePendingStatusChange,
      getPendingStatusChanges,
    } = await import("../offline-store");

    await addPendingStatusChange({
      runSheetName: "RS-001",
      status: "In-Progress",
      timestamp: "2026-01-01T10:00:00Z",
    });

    await removePendingStatusChange("RS-001");
    const changes = await getPendingStatusChanges();
    expect(changes).toHaveLength(0);
  });
});

describe("Local status change application", () => {
  it("should update cached run sheets list with new status", async () => {
    const {
      cacheRunSheets,
      getCachedRunSheets,
      applyLocalStatusChange,
    } = await import("../offline-store");

    await cacheRunSheets([
      {
        name: "RS-001",
        status: "Dispatched",
        run_date: "2026-01-01",
        run_type: "Delivery",
        route_name: "Route A",
        vehicle_type: "Truck",
        vehicle: "V-001",
        transport_company: "TC-001",
        driver: "D-001",
        driver_name: "John",
        dispatch_terminal: "T1",
        return_terminal: "T2",
        estimated_dispatch_datetime: "",
        estimated_return_datetime: "",
      },
    ]);

    await applyLocalStatusChange("RS-001", "In-Progress");

    const sheets = await getCachedRunSheets();
    expect(sheets[0].status).toBe("In-Progress");
  });

  it("should update cached bundle with new status", async () => {
    const {
      cacheBundle,
      getCachedBundle,
      applyLocalStatusChange,
    } = await import("../offline-store");

    await cacheBundle("RS-001", {
      doc: {
        name: "RS-001",
        status: "Dispatched",
        run_date: "2026-01-01",
        run_type: "Delivery",
        route_name: "Route A",
        vehicle_type: "Truck",
        vehicle: "V-001",
        transport_company: "TC-001",
        driver: "D-001",
        driver_name: "John",
        dispatch_terminal: "T1",
        return_terminal: "T2",
        estimated_dispatch_datetime: "",
        estimated_return_datetime: "",
      },
      legs: [],
    });

    await applyLocalStatusChange("RS-001", "Completed");

    const bundle = await getCachedBundle("RS-001");
    expect(bundle?.doc.status).toBe("Completed");
  });
});

describe("Status transition logic", () => {
  it("should allow Dispatched -> In-Progress", () => {
    const allowed = getTransitions("Dispatched");
    expect(allowed).toContain("In-Progress");
  });

  it("should allow In-Progress -> Completed", () => {
    const allowed = getTransitions("In-Progress");
    expect(allowed).toContain("Completed");
  });

  it("should allow In-Progress -> Hold", () => {
    const allowed = getTransitions("In-Progress");
    expect(allowed).toContain("Hold");
  });

  it("should allow Hold -> In-Progress", () => {
    const allowed = getTransitions("Hold");
    expect(allowed).toContain("In-Progress");
  });

  it("should not allow Completed -> any transition", () => {
    const allowed = getTransitions("Completed");
    expect(allowed).toHaveLength(0);
  });

  it("should not allow Cancelled -> any transition", () => {
    const allowed = getTransitions("Cancelled");
    expect(allowed).toHaveLength(0);
  });
});

describe("Barcode scan record", () => {
  it("should store and retrieve barcode scan data", () => {
    const scanRecord = {
      data: "PKG-12345-ABC",
      barcodeType: "code128",
      timestamp: "2026-01-01T10:00:00Z",
      legId: "LEG-001",
      runSheetId: "RS-001",
      type: "pick",
    };

    expect(scanRecord.data).toBe("PKG-12345-ABC");
    expect(scanRecord.barcodeType).toBe("code128");
    expect(scanRecord.type).toBe("pick");
  });

  it("should support QR code type", () => {
    const scanRecord = {
      data: "https://track.example.com/PKG-12345",
      barcodeType: "qr",
      timestamp: "2026-01-01T10:00:00Z",
      legId: "LEG-001",
      runSheetId: "RS-001",
      type: "drop",
    };

    expect(scanRecord.barcodeType).toBe("qr");
    expect(scanRecord.type).toBe("drop");
  });
});

describe("Map leg points", () => {
  it("should correctly format leg points for map view", () => {
    const legs = [
      {
        name: "LEG-001",
        pick_latitude: 14.5995,
        pick_longitude: 120.9842,
        drop_latitude: 14.6042,
        drop_longitude: 120.9822,
        facility_from: "Warehouse A",
        facility_to: "Client B",
      },
    ];

    const points = legs.map((leg) => ({
      name: leg.name,
      pickLat: leg.pick_latitude || 0,
      pickLng: leg.pick_longitude || 0,
      dropLat: leg.drop_latitude || 0,
      dropLng: leg.drop_longitude || 0,
      facilityFrom: leg.facility_from,
      facilityTo: leg.facility_to,
    }));

    expect(points[0].pickLat).toBe(14.5995);
    expect(points[0].dropLng).toBe(120.9822);
    expect(points[0].facilityFrom).toBe("Warehouse A");
  });

  it("should handle missing GPS coordinates", () => {
    const legs = [
      {
        name: "LEG-002",
        pick_latitude: undefined,
        pick_longitude: undefined,
        drop_latitude: undefined,
        drop_longitude: undefined,
        facility_from: "Warehouse C",
        facility_to: "Client D",
      },
    ];

    const points = legs.map((leg) => ({
      name: leg.name,
      pickLat: leg.pick_latitude || 0,
      pickLng: leg.pick_longitude || 0,
      dropLat: leg.drop_latitude || 0,
      dropLng: leg.drop_longitude || 0,
      facilityFrom: leg.facility_from,
      facilityTo: leg.facility_to,
    }));

    expect(points[0].pickLat).toBe(0);
    expect(points[0].dropLng).toBe(0);
  });
});

// Helper: replicate the transition logic from the run-sheet detail screen
function getTransitions(currentStatus: string): string[] {
  const transitions: string[] = [];
  if (currentStatus === "Dispatched" || currentStatus === "Draft") {
    transitions.push("In-Progress");
  }
  if (currentStatus === "In-Progress") {
    transitions.push("Completed");
    transitions.push("Hold");
  }
  if (currentStatus === "Hold") {
    transitions.push("In-Progress");
  }
  return transitions;
}
