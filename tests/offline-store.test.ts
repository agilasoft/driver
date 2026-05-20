import { describe, it, expect, beforeEach, vi } from "vitest";

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

// Mock expo-location
vi.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: vi.fn(() => Promise.resolve({ status: "granted" })),
  getCurrentPositionAsync: vi.fn(() =>
    Promise.resolve({ coords: { latitude: -33.8, longitude: 151.2, accuracy: 10 } })
  ),
  hasServicesEnabledAsync: vi.fn(() => Promise.resolve(true)),
  Accuracy: { High: 4 },
}));

// Mock expo-camera
vi.mock("expo-camera", () => ({
  useCameraPermissions: vi.fn(() => [{ granted: false }, vi.fn()]),
  CameraView: "CameraView",
}));

// Mock expo-local-authentication
vi.mock("expo-local-authentication", () => ({
  hasHardwareAsync: vi.fn(() => Promise.resolve(false)),
  isEnrolledAsync: vi.fn(() => Promise.resolve(false)),
  authenticateAsync: vi.fn(() => Promise.resolve({ success: false })),
}));

// Mock react-native
vi.mock("react-native", () => ({
  Platform: { OS: "web" },
  Alert: { alert: vi.fn() },
}));

describe("Offline Store", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.resetModules();
  });

  it("should import offline store without errors", async () => {
    const store = await import("../lib/offline-store");
    expect(store).toBeDefined();
    expect(typeof store.getPendingChanges).toBe("function");
    expect(typeof store.addPendingChange).toBe("function");
    expect(typeof store.syncPendingChanges).toBe("function");
  });

  it("should return empty pending changes initially", async () => {
    const { getPendingChanges } = await import("../lib/offline-store");
    const changes = await getPendingChanges();
    expect(changes).toEqual([]);
  });

  it("should add and retrieve pending changes", async () => {
    const { addPendingChange, getPendingChanges } = await import("../lib/offline-store");
    await addPendingChange({
      id: "change-1",
      legName: "TL-00001",
      runSheetName: "RS-00001",
      changes: { start_date: "2024-01-15 10:30:00" },
      timestamp: String(Date.now()),
      synced: false,
    });
    const changes = await getPendingChanges();
    expect(changes.length).toBe(1);
    expect(changes[0].legName).toBe("TL-00001");
  });
});

describe("Profile Manager", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.resetModules();
  });

  it("should import profile manager without errors", async () => {
    const pm = await import("../lib/profile-manager");
    expect(pm).toBeDefined();
    expect(typeof pm.getProfiles).toBe("function");
    expect(typeof pm.addProfile).toBe("function");
    expect(typeof pm.removeProfile).toBe("function");
  });

  it("should return empty profiles initially", async () => {
    const { getProfiles } = await import("../lib/profile-manager");
    const profiles = await getProfiles();
    expect(profiles).toEqual([]);
  });

  it("should add a profile", async () => {
    const { addProfile, getProfiles } = await import("../lib/profile-manager");
    await addProfile({
      siteUrl: "https://erp.example.com",
      apiKey: "key123",
      apiSecret: "secret123",
      userName: "test@example.com",
      fullName: "Test Driver",
      driverName: "Test Driver",
      driverId: "DRV-001",
      pin: "1234",
    });
    const profiles = await getProfiles();
    expect(profiles.length).toBe(1);
    expect(profiles[0].fullName).toBe("Test Driver");
    expect(profiles[0].id).toBeDefined();
  });
});

describe("Frappe API", () => {
  it("should import frappe-api without errors", async () => {
    const api = await import("../lib/frappe-api");
    expect(api).toBeDefined();
    expect(typeof api.fetchRunSheets).toBe("function");
    expect(typeof api.updateLegFields).toBe("function");
    expect(typeof api.updateRunSheetStatus).toBe("function");
    expect(typeof api.configureFrappeApi).toBe("function");
  });
});

describe("Types", () => {
  it("should export types module", async () => {
    const types = await import("../lib/types");
    expect(types).toBeDefined();
  });
});
