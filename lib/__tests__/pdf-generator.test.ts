import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RunSheetBundle, TransportLeg, RunSheet } from "../types";

// Mock all native modules
vi.mock("expo-print", () => ({
  printToFileAsync: vi.fn().mockResolvedValue({ uri: "file:///tmp/test.pdf" }),
  printAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("expo-sharing", () => ({
  isAvailableAsync: vi.fn().mockResolvedValue(true),
  shareAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  moveAsync: vi.fn().mockResolvedValue(undefined),
  getInfoAsync: vi.fn().mockResolvedValue({ exists: false }),
  readAsStringAsync: vi.fn().mockResolvedValue("base64data"),
  EncodingType: { Base64: "base64" },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Alert: { alert: vi.fn() },
}));

const mockLeg: TransportLeg = {
  name: "TL-001",
  date: "2026-05-10",
  transport_job: "TJ-001",
  vehicle_type: "Truck",
  facility_type_from: "Warehouse",
  facility_from: "Warehouse A",
  pick_address: "123 Main St",
  facility_type_to: "Customer",
  facility_to: "Customer B",
  drop_address: "456 Oak Ave",
  start_date: "2026-05-10 08:00:00",
  end_date: "2026-05-10 10:30:00",
  distance_km: 45.2,
  duration_min: 90,
  pick_signature: "sig_data",
  pick_signed_by: "John Doe",
  drop_signature: "sig_data",
  drop_signed_by: "Jane Smith",
  date_signed: "2026-05-10",
  status: "Completed",
  actual_distance_km: 46.1,
  actual_duration_min: 95,
  pick_latitude: 14.5995,
  pick_longitude: 120.9842,
  drop_latitude: 14.6091,
  drop_longitude: 121.0223,
};

const mockRunSheet: RunSheet = {
  name: "RS-001",
  run_date: "2026-05-10",
  run_type: "Delivery",
  route_name: "Metro Route 1",
  status: "Completed",
  vehicle_type: "Truck",
  vehicle: "ABC-1234",
  transport_company: "FastLogistics",
  driver: "DRV-001",
  driver_name: "Test Driver",
  dispatch_terminal: "Terminal A",
  return_terminal: "Terminal A",
  estimated_dispatch_datetime: "2026-05-10 07:00:00",
  estimated_return_datetime: "2026-05-10 18:00:00",
};

const mockBundle: RunSheetBundle = {
  doc: mockRunSheet,
  legs: [mockLeg],
};

describe("PDF Generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a PDF file from a run sheet bundle", async () => {
    const Print = await import("expo-print");
    const FileSystem = await import("expo-file-system/legacy");
    const { generateRunSheetPdf } = await import("../pdf-generator");

    const uri = await generateRunSheetPdf(mockBundle);

    // Should have called printToFileAsync with HTML
    expect(Print.printToFileAsync).toHaveBeenCalledTimes(1);
    const callArgs = (Print.printToFileAsync as any).mock.calls[0][0];
    expect(callArgs.html).toContain("Run Sheet Summary");
    expect(callArgs.html).toContain("RS-001");
    expect(callArgs.html).toContain("TL-001");
    expect(callArgs.html).toContain("Warehouse A");
    expect(callArgs.html).toContain("Customer B");
    expect(callArgs.html).toContain("45.2 km");
    expect(callArgs.html).toContain("John Doe");
    expect(callArgs.html).toContain("Jane Smith");
    expect(callArgs.html).toContain("14.599500, 120.984200");
    expect(callArgs.html).toContain("14.609100, 121.022300");

    // Should have moved the file to a permanent location
    expect(FileSystem.moveAsync).toHaveBeenCalledTimes(1);
    expect(uri).toContain("file:///docs/RunSheet_RS-001_");
  });

  it("includes proper HTML structure with DOCTYPE and styles", async () => {
    const Print = await import("expo-print");
    const { generateRunSheetPdf } = await import("../pdf-generator");

    await generateRunSheetPdf(mockBundle);

    const html = (Print.printToFileAsync as any).mock.calls[0][0].html;
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html>");
    expect(html).toContain("</html>");
    expect(html).toContain("@page");
    expect(html).toContain("CargoNext Logistics");
    expect(html).toContain("Agilasoft Cloud Technologies Inc.");
  });

  it("handles legs without GPS data gracefully", async () => {
    const Print = await import("expo-print");
    const { generateRunSheetPdf } = await import("../pdf-generator");

    const bundleNoGps: RunSheetBundle = {
      doc: mockRunSheet,
      legs: [
        {
          ...mockLeg,
          pick_latitude: undefined,
          pick_longitude: undefined,
          drop_latitude: undefined,
          drop_longitude: undefined,
        },
      ],
    };

    await generateRunSheetPdf(bundleNoGps);

    const html = (Print.printToFileAsync as any).mock.calls[0][0].html;
    expect(html).toContain("Not recorded");
  });

  it("handles empty legs array", async () => {
    const Print = await import("expo-print");
    const { generateRunSheetPdf } = await import("../pdf-generator");

    const emptyBundle: RunSheetBundle = {
      doc: mockRunSheet,
      legs: [],
    };

    await generateRunSheetPdf(emptyBundle);

    const html = (Print.printToFileAsync as any).mock.calls[0][0].html;
    expect(html).toContain("Transport Legs (0)");
  });

  it("generates and shares a PDF", async () => {
    const Sharing = await import("expo-sharing");
    const { generateAndSharePdf } = await import("../pdf-generator");

    await generateAndSharePdf(mockBundle);

    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    const shareArgs = (Sharing.shareAsync as any).mock.calls[0];
    expect(shareArgs[0]).toContain("RunSheet_RS-001_");
    expect(shareArgs[1].mimeType).toBe("application/pdf");
    expect(shareArgs[1].UTI).toBe("com.adobe.pdf");
  });

  it("calls printAsync for direct printing", async () => {
    const Print = await import("expo-print");
    const { printRunSheetPdf } = await import("../pdf-generator");

    await printRunSheetPdf(mockBundle);

    expect(Print.printAsync).toHaveBeenCalledTimes(1);
    const html = (Print.printAsync as any).mock.calls[0][0].html;
    expect(html).toContain("RS-001");
  });

  it("includes run sheet summary fields in the HTML", async () => {
    const Print = await import("expo-print");
    const { generateRunSheetPdf } = await import("../pdf-generator");

    await generateRunSheetPdf(mockBundle);

    const html = (Print.printToFileAsync as any).mock.calls[0][0].html;
    expect(html).toContain("Delivery");
    expect(html).toContain("Metro Route 1");
    expect(html).toContain("ABC-1234");
    expect(html).toContain("Test Driver");
    expect(html).toContain("FastLogistics");
    expect(html).toContain("Terminal A");
  });
});
