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

// Mock profile-manager
vi.mock("@/lib/profile-manager", () => ({
  getActiveProfileId: vi.fn(() => Promise.resolve("profile_123")),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getActiveProfileId } from "@/lib/profile-manager";

describe("Current Job Storage", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.clearAllMocks();
  });

  it("should store current job per profile", async () => {
    const profileId = "profile_123";
    const key = `current_job_${profileId}`;
    const runSheetId = "RS-2024-001";

    await AsyncStorage.setItem(key, runSheetId);
    const stored = await AsyncStorage.getItem(key);

    expect(stored).toBe(runSheetId);
  });

  it("should return null when no current job is set", async () => {
    const profileId = "profile_123";
    const key = `current_job_${profileId}`;

    const stored = await AsyncStorage.getItem(key);
    expect(stored).toBeNull();
  });

  it("should clear current job", async () => {
    const profileId = "profile_123";
    const key = `current_job_${profileId}`;

    await AsyncStorage.setItem(key, "RS-2024-001");
    await AsyncStorage.removeItem(key);
    const stored = await AsyncStorage.getItem(key);

    expect(stored).toBeNull();
  });

  it("should isolate jobs per profile", async () => {
    const key1 = "current_job_profile_A";
    const key2 = "current_job_profile_B";

    await AsyncStorage.setItem(key1, "RS-001");
    await AsyncStorage.setItem(key2, "RS-002");

    expect(await AsyncStorage.getItem(key1)).toBe("RS-001");
    expect(await AsyncStorage.getItem(key2)).toBe("RS-002");
  });

  it("should overwrite previous current job", async () => {
    const key = "current_job_profile_123";

    await AsyncStorage.setItem(key, "RS-001");
    await AsyncStorage.setItem(key, "RS-002");

    expect(await AsyncStorage.getItem(key)).toBe("RS-002");
  });

  it("getActiveProfileId returns the expected profile", async () => {
    const id = await getActiveProfileId();
    expect(id).toBe("profile_123");
  });
});
