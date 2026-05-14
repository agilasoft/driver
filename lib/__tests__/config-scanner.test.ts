import { describe, it, expect } from "vitest";

// We need to test the parseConfigQR function from config-scanner.
// Since it's inside a component file, we'll replicate the logic here for testing.
// In a real app, we'd extract this to a utility module.

function parseConfigQR(data: string): {
  siteUrl: string;
  apiKey: string;
  apiSecret: string;
} | null {
  // Try JSON format first
  try {
    const parsed = JSON.parse(data);
    if (parsed.siteUrl && parsed.apiKey && parsed.apiSecret) {
      return {
        siteUrl: String(parsed.siteUrl).trim(),
        apiKey: String(parsed.apiKey).trim(),
        apiSecret: String(parsed.apiSecret).trim(),
      };
    }
    if (parsed.site_url && parsed.api_key && parsed.api_secret) {
      return {
        siteUrl: String(parsed.site_url).trim(),
        apiKey: String(parsed.api_key).trim(),
        apiSecret: String(parsed.api_secret).trim(),
      };
    }
    if (parsed.url && parsed.key && parsed.secret) {
      return {
        siteUrl: String(parsed.url).trim(),
        apiKey: String(parsed.key).trim(),
        apiSecret: String(parsed.secret).trim(),
      };
    }
  } catch {
    // Not JSON
  }

  // Try URL format
  try {
    const url = new URL(data);
    const siteUrl = url.searchParams.get("siteUrl") || url.searchParams.get("site_url") || url.searchParams.get("url");
    const apiKey = url.searchParams.get("apiKey") || url.searchParams.get("api_key") || url.searchParams.get("key");
    const apiSecret = url.searchParams.get("apiSecret") || url.searchParams.get("api_secret") || url.searchParams.get("secret");
    if (siteUrl && apiKey && apiSecret) {
      return {
        siteUrl: siteUrl.trim(),
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
      };
    }
  } catch {
    // Not a valid URL
  }

  // Try pipe-separated
  const parts = data.split("|");
  if (parts.length === 3 && parts[0].includes("://")) {
    return {
      siteUrl: parts[0].trim(),
      apiKey: parts[1].trim(),
      apiSecret: parts[2].trim(),
    };
  }

  return null;
}

describe("parseConfigQR", () => {
  it("parses standard JSON format with camelCase keys", () => {
    const json = JSON.stringify({
      siteUrl: "https://erp.example.com",
      apiKey: "abc123",
      apiSecret: "xyz789",
    });
    const result = parseConfigQR(json);
    expect(result).toEqual({
      siteUrl: "https://erp.example.com",
      apiKey: "abc123",
      apiSecret: "xyz789",
    });
  });

  it("parses JSON format with snake_case keys", () => {
    const json = JSON.stringify({
      site_url: "https://erp.example.com",
      api_key: "abc123",
      api_secret: "xyz789",
    });
    const result = parseConfigQR(json);
    expect(result).toEqual({
      siteUrl: "https://erp.example.com",
      apiKey: "abc123",
      apiSecret: "xyz789",
    });
  });

  it("parses JSON format with short keys (url/key/secret)", () => {
    const json = JSON.stringify({
      url: "https://erp.example.com",
      key: "abc123",
      secret: "xyz789",
    });
    const result = parseConfigQR(json);
    expect(result).toEqual({
      siteUrl: "https://erp.example.com",
      apiKey: "abc123",
      apiSecret: "xyz789",
    });
  });

  it("parses URL format with query params", () => {
    const url =
      "frappe://config?siteUrl=https://erp.example.com&apiKey=abc123&apiSecret=xyz789";
    const result = parseConfigQR(url);
    expect(result).toEqual({
      siteUrl: "https://erp.example.com",
      apiKey: "abc123",
      apiSecret: "xyz789",
    });
  });

  it("parses pipe-separated format", () => {
    const data = "https://erp.example.com|abc123|xyz789";
    const result = parseConfigQR(data);
    expect(result).toEqual({
      siteUrl: "https://erp.example.com",
      apiKey: "abc123",
      apiSecret: "xyz789",
    });
  });

  it("trims whitespace from values", () => {
    const json = JSON.stringify({
      siteUrl: "  https://erp.example.com  ",
      apiKey: "  abc123  ",
      apiSecret: "  xyz789  ",
    });
    const result = parseConfigQR(json);
    expect(result).toEqual({
      siteUrl: "https://erp.example.com",
      apiKey: "abc123",
      apiSecret: "xyz789",
    });
  });

  it("returns null for invalid JSON without required fields", () => {
    const json = JSON.stringify({ foo: "bar" });
    expect(parseConfigQR(json)).toBeNull();
  });

  it("returns null for random text", () => {
    expect(parseConfigQR("hello world")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseConfigQR("")).toBeNull();
  });

  it("returns null for pipe-separated without URL scheme", () => {
    expect(parseConfigQR("abc|def|ghi")).toBeNull();
  });
});
