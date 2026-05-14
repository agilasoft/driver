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

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { login, logout, getStoredAuth } from "../frappe-api";

beforeEach(() => {
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  mockFetch.mockReset();
});

// Helper: mock a successful JSON response
function mockOk(data: any) {
  return { ok: true, json: () => Promise.resolve(data) };
}
// Helper: mock a failed response
function mockFail(status = 404) {
  return { ok: false, status, text: () => Promise.resolve("Not Found") };
}

describe("Frappe API - Authentication", () => {
  it("logs in and resolves driver via Employee → Driver chain (Strategy 1)", async () => {
    // 1. get_logged_user
    mockFetch.mockResolvedValueOnce(mockOk({ message: "driver@test.com" }));
    // 2. User full_name
    mockFetch.mockResolvedValueOnce(mockOk({ data: { full_name: "John Driver" } }));
    // 3. Strategy 1a: Employee lookup by user_id → found
    mockFetch.mockResolvedValueOnce(mockOk({ data: [{ name: "HR-EMP-00001" }] }));
    // 4. Strategy 1b: Driver lookup by employee → found
    mockFetch.mockResolvedValueOnce(
      mockOk({ data: [{ name: "HR-DRI-00001", full_name: "John Driver" }] })
    );

    const auth = await login("https://erp.test.com", "key123", "secret456");

    expect(auth.isLoggedIn).toBe(true);
    expect(auth.userName).toBe("driver@test.com");
    expect(auth.fullName).toBe("John Driver");
    expect(auth.driverId).toBe("HR-DRI-00001");
    expect(auth.driverName).toBe("John Driver");

    // Verify Employee lookup was called
    const empCall = mockFetch.mock.calls[2][0];
    expect(empCall).toContain("/api/resource/Employee");
    expect(empCall).toContain("user_id");

    // Verify Driver-by-employee lookup was called
    const drvCall = mockFetch.mock.calls[3][0];
    expect(drvCall).toContain("/api/resource/Driver");
    expect(drvCall).toContain("employee");
  });

  it("falls back to Strategy 2 (user_id on Driver) when Employee not found", async () => {
    // 1. get_logged_user
    mockFetch.mockResolvedValueOnce(mockOk({ message: "driver@test.com" }));
    // 2. User full_name
    mockFetch.mockResolvedValueOnce(mockOk({ data: { full_name: "Jane Driver" } }));
    // 3. Strategy 1a: Employee lookup → empty
    mockFetch.mockResolvedValueOnce(mockOk({ data: [] }));
    // 4. Strategy 2: Driver by user_id → found
    mockFetch.mockResolvedValueOnce(
      mockOk({ data: [{ name: "DRV-002", full_name: "Jane Driver" }] })
    );

    const auth = await login("https://erp.test.com", "key123", "secret456");

    expect(auth.driverId).toBe("DRV-002");
    expect(auth.driverName).toBe("Jane Driver");

    // Strategy 2 call should filter by user_id
    const s2Call = mockFetch.mock.calls[3][0];
    expect(s2Call).toContain("/api/resource/Driver");
    expect(s2Call).toContain("user_id");
  });

  it("falls back to Strategy 3 (full_name match) when Strategies 1 & 2 fail", async () => {
    // 1. get_logged_user
    mockFetch.mockResolvedValueOnce(mockOk({ message: "driver@test.com" }));
    // 2. User full_name
    mockFetch.mockResolvedValueOnce(mockOk({ data: { full_name: "Bob Smith" } }));
    // 3. Strategy 1a: Employee lookup → empty
    mockFetch.mockResolvedValueOnce(mockOk({ data: [] }));
    // 4. Strategy 2: Driver by user_id → empty
    mockFetch.mockResolvedValueOnce(mockOk({ data: [] }));
    // 5. Strategy 3: Driver by full_name → found
    mockFetch.mockResolvedValueOnce(
      mockOk({ data: [{ name: "DRV-003", full_name: "Bob Smith" }] })
    );

    const auth = await login("https://erp.test.com", "key123", "secret456");

    expect(auth.driverId).toBe("DRV-003");
    expect(auth.driverName).toBe("Bob Smith");

    // Strategy 3 call should filter by full_name
    const s3Call = mockFetch.mock.calls[4][0];
    expect(s3Call).toContain("/api/resource/Driver");
    expect(s3Call).toContain("full_name");
  });

  it("logs in without driver when all strategies fail", async () => {
    // 1. get_logged_user
    mockFetch.mockResolvedValueOnce(mockOk({ message: "admin@test.com" }));
    // 2. User full_name
    mockFetch.mockResolvedValueOnce(mockOk({ data: { full_name: "Admin User" } }));
    // 3. Strategy 1a: Employee lookup → empty
    mockFetch.mockResolvedValueOnce(mockOk({ data: [] }));
    // 4. Strategy 2: Driver by user_id → empty
    mockFetch.mockResolvedValueOnce(mockOk({ data: [] }));
    // 5. Strategy 3: Driver by full_name → empty
    mockFetch.mockResolvedValueOnce(mockOk({ data: [] }));

    const auth = await login("https://erp.test.com", "key123", "secret456");

    expect(auth.isLoggedIn).toBe(true);
    expect(auth.driverId).toBeUndefined();
    expect(auth.driverName).toBeUndefined();
  });

  it("throws on invalid credentials", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    await expect(
      login("https://erp.test.com", "bad_key", "bad_secret")
    ).rejects.toThrow("Authentication failed");
  });

  it("logs out and clears stored auth", async () => {
    // Login first (with all strategy calls)
    mockFetch.mockResolvedValueOnce(mockOk({ message: "admin@test.com" }));
    mockFetch.mockResolvedValueOnce(mockOk({ data: { full_name: "Admin" } }));
    mockFetch.mockResolvedValueOnce(mockOk({ data: [] })); // Strategy 1
    mockFetch.mockResolvedValueOnce(mockOk({ data: [] })); // Strategy 2
    mockFetch.mockResolvedValueOnce(mockOk({ data: [] })); // Strategy 3

    await login("https://erp.test.com", "key123", "secret456");
    await logout();

    const stored = await getStoredAuth();
    expect(stored).toBeNull();
  });

  it("returns null when no stored auth", async () => {
    const stored = await getStoredAuth();
    expect(stored).toBeNull();
  });

  it("strips trailing slashes from site URL", async () => {
    mockFetch.mockResolvedValueOnce(mockOk({ message: "admin@test.com" }));
    mockFetch.mockResolvedValueOnce(mockOk({ data: { full_name: "Admin" } }));
    mockFetch.mockResolvedValueOnce(mockOk({ data: [] })); // Strategy 1
    mockFetch.mockResolvedValueOnce(mockOk({ data: [] })); // Strategy 2
    mockFetch.mockResolvedValueOnce(mockOk({ data: [] })); // Strategy 3

    const auth = await login("https://erp.test.com///", "key123", "secret456");
    expect(auth.siteUrl).toBe("https://erp.test.com");
  });

  it("handles network errors in driver strategies gracefully", async () => {
    // 1. get_logged_user
    mockFetch.mockResolvedValueOnce(mockOk({ message: "driver@test.com" }));
    // 2. User full_name
    mockFetch.mockResolvedValueOnce(mockOk({ data: { full_name: "Test" } }));
    // 3. Strategy 1a: Employee lookup → network error
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    // 4. Strategy 2: Driver by user_id → network error
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    // 5. Strategy 3: Driver by full_name → network error
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    // Should still login successfully, just without driver
    const auth = await login("https://erp.test.com", "key123", "secret456");
    expect(auth.isLoggedIn).toBe(true);
    expect(auth.driverId).toBeUndefined();
  });
});
