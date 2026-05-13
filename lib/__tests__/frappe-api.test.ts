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

describe("Frappe API - Authentication", () => {
  it("logs in successfully with valid credentials", async () => {
    // Mock get_logged_user
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: "admin@test.com" }),
    });
    // Mock User resource for full name
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ data: { full_name: "Admin User" } }),
    });

    const auth = await login("https://erp.test.com", "key123", "secret456");

    expect(auth.isLoggedIn).toBe(true);
    expect(auth.userName).toBe("admin@test.com");
    expect(auth.fullName).toBe("Admin User");
    expect(auth.siteUrl).toBe("https://erp.test.com");
    expect(auth.apiKey).toBe("key123");
    expect(auth.apiSecret).toBe("secret456");

    // Verify auth was stored
    const stored = await getStoredAuth();
    expect(stored?.isLoggedIn).toBe(true);
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
    // First login
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: "admin@test.com" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ data: { full_name: "Admin User" } }),
    });

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
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: "admin@test.com" }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ data: { full_name: "Admin User" } }),
    });

    const auth = await login("https://erp.test.com///", "key123", "secret456");
    expect(auth.siteUrl).toBe("https://erp.test.com");
  });
});
