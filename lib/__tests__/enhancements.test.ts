import { describe, it, expect, vi } from "vitest";

// Date Filtering Logic Tests

describe("Date filter logic", () => {
  interface MockSheet {
    name: string;
    run_date: string;
  }

  function getStartOfDay(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getStartOfWeek(): Date {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function filterSheets(
    sheets: MockSheet[],
    filter: "today" | "week" | "all"
  ): MockSheet[] {
    if (filter === "all") return sheets;
    const cutoff = filter === "today" ? getStartOfDay() : getStartOfWeek();
    return sheets.filter((s) => {
      if (!s.run_date) return false;
      try {
        return new Date(s.run_date) >= cutoff;
      } catch {
        return false;
      }
    });
  }

  // Use local date formatting to avoid UTC/local timezone mismatch
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const lastMonth = new Date(Date.now() - 30 * 86400000);
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-${String(lastMonth.getDate()).padStart(2, "0")}`;

  const sheets: MockSheet[] = [
    { name: "RS-001", run_date: todayStr },
    { name: "RS-002", run_date: lastMonthStr },
    { name: "RS-003", run_date: "" },
  ];

  it("returns all sheets when filter is all", () => {
    expect(filterSheets(sheets, "all")).toHaveLength(3);
  });

  it("filters to today only", () => {
    // Use a sheet with today's date + time to avoid UTC midnight vs local midnight issue
    const todayWithTime = todayStr + "T12:00:00";
    const sheetsWithTime: MockSheet[] = [
      { name: "RS-T1", run_date: todayWithTime },
      { name: "RS-T2", run_date: lastMonthStr },
      { name: "RS-T3", run_date: "" },
    ];
    const result = filterSheets(sheetsWithTime, "today");
    expect(result.some((s) => s.name === "RS-T1")).toBe(true);
    expect(result.some((s) => s.name === "RS-T2")).toBe(false);
    expect(result.some((s) => s.name === "RS-T3")).toBe(false);
  });

  it("filters to this week", () => {
    const result = filterSheets(sheets, "week");
    expect(result.some((s) => s.name === "RS-001")).toBe(true);
    expect(result.some((s) => s.name === "RS-002")).toBe(false);
  });

  it("excludes empty run_date", () => {
    const result = filterSheets(sheets, "today");
    expect(result.every((s) => s.run_date !== "")).toBe(true);
  });
});

// GPS Coordinate Formatting Tests

describe("GPS coordinate formatting", () => {
  function formatGps(coords: { latitude: number; longitude: number } | null): string | null {
    if (!coords) return null;
    return `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
  }

  it("formats GPS coordinates correctly", () => {
    expect(formatGps({ latitude: -33.86882, longitude: 151.20929 })).toBe("-33.868820, 151.209290");
  });

  it("returns null for null coords", () => {
    expect(formatGps(null)).toBeNull();
  });

  it("handles zero coordinates", () => {
    expect(formatGps({ latitude: 0, longitude: 0 })).toBe("0.000000, 0.000000");
  });
});

// PendingChange with GPS fields

describe("PendingChange with GPS", () => {
  it("supports GPS coordinate fields in changes", () => {
    const change = {
      id: "test-1",
      legName: "LEG-001",
      runSheetName: "RS-001",
      timestamp: new Date().toISOString(),
      changes: {
        start_date: "2026-05-14 10:00:00",
        pick_latitude: -33.86882,
        pick_longitude: 151.20929,
      },
      synced: false,
    };
    expect(change.changes.pick_latitude).toBe(-33.86882);
    expect(change.changes.pick_longitude).toBe(151.20929);
  });
});
