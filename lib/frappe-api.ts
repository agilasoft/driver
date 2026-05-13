import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RunSheet, RunSheetBundle, TransportLeg, AuthState } from "./types";

const AUTH_KEY = "frappe_auth";

async function getAuth(): Promise<AuthState | null> {
  const raw = await AsyncStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as AuthState;
}

async function getHeaders(): Promise<Record<string, string>> {
  const auth = await getAuth();
  if (!auth) throw new Error("Not authenticated");
  return {
    Authorization: `token ${auth.apiKey}:${auth.apiSecret}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function getBaseUrl(): Promise<string> {
  const auth = await getAuth();
  if (!auth) throw new Error("Not authenticated");
  // Remove trailing slash
  return auth.siteUrl.replace(/\/+$/, "");
}

export async function login(
  siteUrl: string,
  apiKey: string,
  apiSecret: string
): Promise<AuthState> {
  const baseUrl = siteUrl.replace(/\/+$/, "");
  const headers = {
    Authorization: `token ${apiKey}:${apiSecret}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // Verify credentials by fetching current user
  const res = await fetch(`${baseUrl}/api/method/frappe.auth.get_logged_user`, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Authentication failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const userName = data.message || "Unknown";

  // Try to get full name
  let fullName = userName;
  try {
    const userRes = await fetch(
      `${baseUrl}/api/resource/User/${encodeURIComponent(userName)}?fields=["full_name"]`,
      { headers }
    );
    if (userRes.ok) {
      const userData = await userRes.json();
      fullName = userData.data?.full_name || userName;
    }
  } catch {
    // Ignore, use userName
  }

  const authState: AuthState = {
    siteUrl: baseUrl,
    apiKey,
    apiSecret,
    userName,
    fullName,
    isLoggedIn: true,
  };

  await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(authState));
  return authState;
}

export async function logout(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_KEY);
}

export async function getStoredAuth(): Promise<AuthState | null> {
  return getAuth();
}

export async function fetchRunSheets(): Promise<RunSheet[]> {
  const baseUrl = await getBaseUrl();
  const headers = await getHeaders();
  const auth = await getAuth();

  // Fetch run sheets assigned to the current driver (or all if no driver filter)
  const filters = JSON.stringify([["docstatus", "<", 2]]);
  const fields = JSON.stringify([
    "name",
    "run_date",
    "run_type",
    "route_name",
    "status",
    "vehicle_type",
    "vehicle",
    "transport_company",
    "driver",
    "driver_name",
    "dispatch_terminal",
    "return_terminal",
    "estimated_dispatch_datetime",
    "estimated_return_datetime",
  ]);

  const url = `${baseUrl}/api/resource/Run Sheet?filters=${encodeURIComponent(
    filters
  )}&fields=${encodeURIComponent(fields)}&order_by=run_date desc&limit_page_length=100`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch run sheets: ${res.status}`);
  }

  const data = await res.json();
  return data.data || [];
}

export async function fetchRunSheetBundle(
  name: string
): Promise<RunSheetBundle> {
  const baseUrl = await getBaseUrl();
  const headers = await getHeaders();

  const url = `${baseUrl}/api/method/logistics.transport.api.get_run_sheet_bundle?name=${encodeURIComponent(
    name
  )}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch run sheet bundle: ${res.status}`);
  }

  const data = await res.json();
  return data.message as RunSheetBundle;
}

export async function updateTransportLeg(
  legName: string,
  updates: Partial<TransportLeg>
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const headers = await getHeaders();

  const url = `${baseUrl}/api/resource/Transport Leg/${encodeURIComponent(
    legName
  )}`;

  const res = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update leg: ${res.status} ${text}`);
  }
}

export async function uploadFile(
  fileUri: string,
  doctype: string,
  docname: string,
  fieldname: string,
  filename: string
): Promise<string> {
  const baseUrl = await getBaseUrl();
  const auth = await getAuth();
  if (!auth) throw new Error("Not authenticated");

  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    name: filename,
    type: "image/jpeg",
  } as any);
  formData.append("doctype", doctype);
  formData.append("docname", docname);
  formData.append("fieldname", fieldname);
  formData.append("is_private", "1");

  const res = await fetch(`${baseUrl}/api/method/upload_file`, {
    method: "POST",
    headers: {
      Authorization: `token ${auth.apiKey}:${auth.apiSecret}`,
      Accept: "application/json",
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to upload file: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.message?.file_url || "";
}
