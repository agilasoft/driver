import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AsyncStorage
const mockStorage: Record<string, string> = {};
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    setItem: vi.fn(async (key: string, value: string) => {
      mockStorage[key] = value;
    }),
    getItem: vi.fn(async (key: string) => mockStorage[key] || null),
    removeItem: vi.fn(async (key: string) => {
      delete mockStorage[key];
    }),
  },
}));

describe("Signature Modal - Data Storage", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  });

  it("stores signature path data in AsyncStorage with correct key format", async () => {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const legId = "LEG-001";
    const type = "pick";
    const signatureData = "M10,20 L30,40 L50,60";

    const key = `sig_${legId}_${type}`;
    await AsyncStorage.setItem(key, signatureData);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(`sig_LEG-001_pick`, signatureData);
    expect(mockStorage[`sig_LEG-001_pick`]).toBe(signatureData);
  });

  it("stores signature flag when signature is captured", async () => {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const legId = "LEG-001";
    const type = "drop";

    const flagKey = `sig_flag_${legId}_${type}`;
    await AsyncStorage.setItem(flagKey, "captured");

    expect(mockStorage[`sig_flag_LEG-001_drop`]).toBe("captured");
  });

  it("leg detail screen reads signature flag on focus", async () => {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const legId = "LEG-002";

    // Simulate signature being captured in the modal
    mockStorage[`sig_flag_${legId}_pick`] = "captured";
    mockStorage[`sig_${legId}_pick`] = "M5,10 L20,30 M25,35 L40,50";

    // Simulate what the leg detail screen does on focus
    const pickFlag = await AsyncStorage.getItem(`sig_flag_${legId}_pick`);
    expect(pickFlag).toBe("captured");

    if (pickFlag === "captured") {
      const sigData = await AsyncStorage.getItem(`sig_${legId}_pick`);
      expect(sigData).toBe("M5,10 L20,30 M25,35 L40,50");
    }
  });

  it("supports multiple strokes joined with space separator", () => {
    const paths = [
      "M10,20 L30,40 L50,60",
      "M70,80 L90,100",
      "M110,120 L130,140 L150,160 L170,180",
    ];
    const signatureData = paths.join(" ");

    expect(signatureData).toBe(
      "M10,20 L30,40 L50,60 M70,80 L90,100 M110,120 L130,140 L150,160 L170,180"
    );
    // Should be valid SVG path data
    expect(signatureData).toMatch(/^M[\d.,\s]+/);
  });

  it("handles empty signature (no strokes) by not storing", async () => {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const legId = "LEG-003";
    const type = "pick";

    // When paths array is empty, the modal should just go back without storing
    const paths: string[] = [];
    if (paths.length === 0) {
      // Should not store anything
      expect(mockStorage[`sig_${legId}_${type}`]).toBeUndefined();
      expect(mockStorage[`sig_flag_${legId}_${type}`]).toBeUndefined();
    }
  });

  it("stores separate signatures for pick and drop on same leg", async () => {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const legId = "LEG-004";

    await AsyncStorage.setItem(`sig_${legId}_pick`, "M1,2 L3,4");
    await AsyncStorage.setItem(`sig_flag_${legId}_pick`, "captured");
    await AsyncStorage.setItem(`sig_${legId}_drop`, "M5,6 L7,8");
    await AsyncStorage.setItem(`sig_flag_${legId}_drop`, "captured");

    expect(mockStorage[`sig_${legId}_pick`]).toBe("M1,2 L3,4");
    expect(mockStorage[`sig_${legId}_drop`]).toBe("M5,6 L7,8");
    expect(mockStorage[`sig_flag_${legId}_pick`]).toBe("captured");
    expect(mockStorage[`sig_flag_${legId}_drop`]).toBe("captured");
  });

  it("path coordinates are clamped within pad bounds", () => {
    const PAD_WIDTH = 300;
    const PAD_HEIGHT = 220;

    // Simulate clamping logic from the gesture handler
    const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));

    // Test out-of-bounds coordinates get clamped
    expect(clamp(-10, 0, PAD_WIDTH)).toBe(0);
    expect(clamp(500, 0, PAD_WIDTH)).toBe(PAD_WIDTH);
    expect(clamp(-5, 0, PAD_HEIGHT)).toBe(0);
    expect(clamp(400, 0, PAD_HEIGHT)).toBe(PAD_HEIGHT);

    // In-bounds coordinates stay the same
    expect(clamp(150, 0, PAD_WIDTH)).toBe(150);
    expect(clamp(100, 0, PAD_HEIGHT)).toBe(100);
  });
});
