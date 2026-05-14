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
  return { ok: true, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) };
}
// Helper: mock a failed response
function mockFail(status = 404) {
  return { ok: false, status, text: () => Promise.resolve("Not Found"), json: () => Promise.resolve({}) };
}

/**
 * The new login flow uses frappeGetList which tries RPC POST first, then REST GET.
 * Strategy order:
 *   1. Driver.user == userName  (RPC then REST)
 *   2. Driver.user_id == userName  (RPC then REST)
 *   3. Employee.user_id → Driver.employee  (RPC then REST for each)
 *   4. Driver.full_name == fullName  (RPC then REST)
 *   5. List all drivers and scan  (RPC then REST)
 *
 * For tests, we use mockFetch to handle all calls in order.
 * Each frappeGetList call does: 1 RPC POST, then if empty 1 REST GET.
 */

// Helper to set up initial auth calls (get_logged_user + User full_name)
function setupAuthCalls(email: string, fullName: string) {
  // 1. get_logged_user
  mockFetch.mockResolvedValueOnce(mockOk({ message: email }));
  // 2. User full_name
  mockFetch.mockResolvedValueOnce(mockOk({ data: { full_name: fullName } }));
}

// Helper: mock a frappeGetList that returns results on RPC call
function mockRpcFound(results: any[]) {
  mockFetch.mockResolvedValueOnce(mockOk({ message: results }));
}

// Helper: mock a frappeGetList that returns empty on RPC, then results on REST
function mockRpcEmptyRestFound(results: any[]) {
  mockFetch.mockResolvedValueOnce(mockOk({ message: [] })); // RPC empty
  mockFetch.mockResolvedValueOnce(mockOk({ data: results })); // REST found
}

// Helper: mock a frappeGetList that returns empty on both RPC and REST
function mockBothEmpty() {
  mockFetch.mockResolvedValueOnce(mockOk({ message: [] })); // RPC empty
  mockFetch.mockResolvedValueOnce(mockOk({ data: [] })); // REST empty
}

// Helper: mock a frappeGetList that fails on both RPC and REST
function mockBothFail() {
  mockFetch.mockRejectedValueOnce(new Error("Network error")); // RPC fail
  mockFetch.mockResolvedValueOnce(mockFail(403)); // REST fail
}

describe("Frappe API - Authentication", () => {
  it("logs in and resolves driver via Strategy 1 (Driver.user) using RPC", async () => {
    setupAuthCalls("driver@test.com", "John Driver");
    // Strategy 1: Driver.user == email → RPC found
    mockRpcFound([{ name: "HR-DRI-00001", full_name: "John Driver" }]);

    const auth = await login("https://erp.test.com", "key123", "secret456");

    expect(auth.isLoggedIn).toBe(true);
    expect(auth.userName).toBe("driver@test.com");
    expect(auth.fullName).toBe("John Driver");
    expect(auth.driverId).toBe("HR-DRI-00001");
    expect(auth.driverName).toBe("John Driver");
    expect(auth.driverLinkError).toBeUndefined();
  });

  it("resolves driver via Strategy 1 REST fallback when RPC returns empty", async () => {
    setupAuthCalls("driver@test.com", "Jane Driver");
    // Strategy 1: RPC empty, REST found
    mockRpcEmptyRestFound([{ name: "DRV-001", full_name: "Jane Driver" }]);

    const auth = await login("https://erp.test.com", "key123", "secret456");

    expect(auth.driverId).toBe("DRV-001");
    expect(auth.driverName).toBe("Jane Driver");
  });

  it("falls back to Strategy 2 (Driver.user_id) when Strategy 1 empty", async () => {
    setupAuthCalls("driver@test.com", "Jane Driver");
    // Strategy 1: both empty
    mockBothEmpty();
    // Strategy 2: Driver.user_id → RPC found
    mockRpcFound([{ name: "DRV-002", full_name: "Jane Driver" }]);

    const auth = await login("https://erp.test.com", "key123", "secret456");

    expect(auth.driverId).toBe("DRV-002");
    expect(auth.driverName).toBe("Jane Driver");
  });

  it("falls back to Strategy 3 (Employee→Driver chain) when 1 & 2 empty", async () => {
    setupAuthCalls("driver@test.com", "Bob Smith");
    // Strategy 1: both empty
    mockBothEmpty();
    // Strategy 2: both empty
    mockBothEmpty();
    // Strategy 3a: Employee.user_id → RPC found
    mockRpcFound([{ name: "HR-EMP-00001" }]);
    // Strategy 3b: Driver.employee → RPC found
    mockRpcFound([{ name: "DRV-003", full_name: "Bob Smith" }]);

    const auth = await login("https://erp.test.com", "key123", "secret456");

    expect(auth.driverId).toBe("DRV-003");
    expect(auth.driverName).toBe("Bob Smith");
  });

  it("falls back to Strategy 4 (full_name match) when 1-3 fail", async () => {
    setupAuthCalls("driver@test.com", "Charlie Brown");
    // Strategy 1: both empty
    mockBothEmpty();
    // Strategy 2: both empty
    mockBothEmpty();
    // Strategy 3a: Employee → both empty
    mockBothEmpty();
    // Strategy 4: Driver.full_name → RPC found
    mockRpcFound([{ name: "DRV-004", full_name: "Charlie Brown" }]);

    const auth = await login("https://erp.test.com", "key123", "secret456");

    expect(auth.driverId).toBe("DRV-004");
    expect(auth.driverName).toBe("Charlie Brown");
  });

  it("falls back to Strategy 5 (scan all drivers) when 1-4 fail", async () => {
    setupAuthCalls("driver@test.com", "Dave Wilson");
    // Strategy 1: both empty
    mockBothEmpty();
    // Strategy 2: both empty
    mockBothEmpty();
    // Strategy 3a: Employee → both empty
    mockBothEmpty();
    // Strategy 4: full_name → both empty
    mockBothEmpty();
    // Strategy 5: list all drivers → RPC returns list with a match
    mockRpcFound([
      { name: "DRV-010", full_name: "Other Person", user: "other@test.com", employee: "" },
      { name: "DRV-011", full_name: "Dave Wilson", user: "driver@test.com", employee: "" },
    ]);

    const auth = await login("https://erp.test.com", "key123", "secret456");

    expect(auth.driverId).toBe("DRV-011");
    expect(auth.driverName).toBe("Dave Wilson");
  });

  it("logs in without driver when all 5 strategies fail", async () => {
    setupAuthCalls("admin@test.com", "Admin User");
    // Strategy 1: both empty
    mockBothEmpty();
    // Strategy 2: both empty
    mockBothEmpty();
    // Strategy 3a: Employee → both empty
    mockBothEmpty();
    // Strategy 4: full_name → both empty
    mockBothEmpty();
    // Strategy 5: list all → RPC returns drivers but no match
    mockRpcFound([
      { name: "DRV-010", full_name: "Other Person", user: "other@test.com", employee: "" },
    ]);

    const auth = await login("https://erp.test.com", "key123", "secret456");

    expect(auth.isLoggedIn).toBe(true);
    expect(auth.driverId).toBeUndefined();
    expect(auth.driverName).toBeUndefined();
    expect(auth.driverLinkError).toBeDefined();
    expect(auth.driverLinkError).toContain("Strategy 1");
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
    setupAuthCalls("admin@test.com", "Admin");
    // All strategies empty
    mockBothEmpty(); // S1
    mockBothEmpty(); // S2
    mockBothEmpty(); // S3 Employee
    mockBothEmpty(); // S4 full_name
    mockRpcFound([]); // S5 list all → empty

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
    setupAuthCalls("admin@test.com", "Admin");
    mockBothEmpty(); // S1
    mockBothEmpty(); // S2
    mockBothEmpty(); // S3
    mockBothEmpty(); // S4
    mockRpcFound([]); // S5

    const auth = await login("https://erp.test.com///", "key123", "secret456");
    expect(auth.siteUrl).toBe("https://erp.test.com");
  });

  it("handles network errors in driver strategies gracefully", async () => {
    setupAuthCalls("driver@test.com", "Test");
    // All strategies fail with network errors
    mockBothFail(); // S1
    mockBothFail(); // S2
    mockBothFail(); // S3 Employee
    mockBothFail(); // S4 full_name
    mockBothFail(); // S5 list all

    // Should still login successfully, just without driver
    const auth = await login("https://erp.test.com", "key123", "secret456");
    expect(auth.isLoggedIn).toBe(true);
    expect(auth.driverId).toBeUndefined();
    expect(auth.driverLinkError).toBeDefined();
  });
});
