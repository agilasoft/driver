/**
 * Frappe API client for the Driver app.
 */
import type { RunSheet, RunSheetBundle, TransportLeg } from "./types";

let _siteUrl = "";
let _apiKey = "";
let _apiSecret = "";

export function configureFrappeApi(siteUrl: string, apiKey: string, apiSecret: string) {
  _siteUrl = siteUrl.replace(/\/+$/, "");
  _apiKey = apiKey;
  _apiSecret = apiSecret;
}

export function getFrappeConfig() {
  return { siteUrl: _siteUrl, apiKey: _apiKey, apiSecret: _apiSecret };
}

function headers(): Record<string, string> {
  return { Authorization: `token ${_apiKey}:${_apiSecret}`, "Content-Type": "application/json" };
}

async function frappeGet<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${_siteUrl}${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: headers() });
  if (!res.ok) throw new Error(`Frappe API error: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return json.data ?? json.message ?? json;
}

async function frappePut<T>(endpoint: string, body: any): Promise<T> {
  const res = await fetch(`${_siteUrl}${endpoint}`, { method: "PUT", headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Frappe API error: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return json.data ?? json;
}

async function frappePost<T>(endpoint: string, body: any): Promise<T> {
  const res = await fetch(`${_siteUrl}${endpoint}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Frappe API error: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return json.data ?? json;
}

export async function testConnection(): Promise<{ userName: string; fullName: string }> {
  const data = await frappeGet<any>("/api/method/frappe.auth.get_logged_user");
  const userName = typeof data === "string" ? data : data.name || data.message || "";
  let fullName = userName;
  try {
    const userDoc = await frappeGet<any>(`/api/resource/User/${userName}`);
    fullName = userDoc?.full_name || userName;
  } catch { fullName = userName; }
  return { userName, fullName };
}

export async function getLinkedDriver(userName: string): Promise<{ driverName: string; driverId: string }> {
  try {
    const result = await frappeGet<any[]>("/api/resource/Driver", {
      filters: JSON.stringify([["user_id", "=", userName]]),
      fields: JSON.stringify(["name", "driver_name"]),
      limit_page_length: "1",
    });
    const drivers = Array.isArray(result) ? result : [];
    if (drivers.length > 0) return { driverId: drivers[0].name, driverName: drivers[0].driver_name || drivers[0].name };
  } catch { /* ignore */ }
  return { driverId: "", driverName: "" };
}

const runSheetFields = ["name", "status", "driver", "driver_name", "posting_date", "route", "vehicle", "modified"];

export async function fetchRunSheets(driverId?: string): Promise<RunSheet[]> {
  const filters: any[] = [];
  if (driverId) filters.push(["driver", "=", driverId]);
  const data = await frappeGet<any[]>("/api/resource/Transport Run Sheet", {
    filters: JSON.stringify(filters),
    fields: JSON.stringify(runSheetFields),
    order_by: "posting_date desc, modified desc",
    limit_page_length: "100",
  });
  return (Array.isArray(data) ? data : []).map((d: any) => ({
    name: d.name, status: d.status || "Draft", driver: d.driver || "",
    driver_name: d.driver_name || "", posting_date: d.posting_date || "",
    route: d.route || "", vehicle: d.vehicle || "", modified: d.modified || "",
  }));
}

const legsFields = [
  "name", "parent", "idx", "status", "transport_job",
  "facility_from", "facility_to", "pick_address", "drop_address",
  "pick_latitude", "pick_longitude", "drop_latitude", "drop_longitude",
  "start_date", "end_date", "date_signed",
  "pick_signature", "drop_signature", "pick_signed_by", "drop_signed_by",
  "pick_notes", "drop_notes", "pick_photo", "drop_photo",
  "cargo_description", "weight", "volume", "reference_number",
];

export async function fetchRunSheetBundle(name: string): Promise<RunSheetBundle> {
  const doc = await frappeGet<any>(`/api/resource/Transport Run Sheet/${name}`);
  const runSheet: RunSheet = {
    name: doc.name, status: doc.status || "Draft", driver: doc.driver || "",
    driver_name: doc.driver_name || "", posting_date: doc.posting_date || "",
    route: doc.route || "", vehicle: doc.vehicle || "", modified: doc.modified || "",
  };
  const legsRaw = await frappeGet<any[]>("/api/resource/Transport Leg", {
    filters: JSON.stringify([["parent", "=", name]]),
    fields: JSON.stringify(legsFields),
    order_by: "idx asc",
    limit_page_length: "200",
  });
  const legs: TransportLeg[] = (Array.isArray(legsRaw) ? legsRaw : []).map((l: any) => ({
    name: l.name, parent: l.parent, idx: l.idx || 0, status: l.status || "",
    transport_job: l.transport_job || "", facility_from: l.facility_from || "",
    facility_to: l.facility_to || "", pick_address: l.pick_address || "",
    drop_address: l.drop_address || "",
    pick_latitude: l.pick_latitude || undefined, pick_longitude: l.pick_longitude || undefined,
    drop_latitude: l.drop_latitude || undefined, drop_longitude: l.drop_longitude || undefined,
    start_date: l.start_date || "", end_date: l.end_date || "",
    date_signed: l.date_signed || "",
    pick_signature: l.pick_signature || "", drop_signature: l.drop_signature || "",
    pick_signed_by: l.pick_signed_by || "", drop_signed_by: l.drop_signed_by || "",
    pick_notes: l.pick_notes || "", drop_notes: l.drop_notes || "",
    pick_photo: l.pick_photo || "", drop_photo: l.drop_photo || "",
    cargo_description: l.cargo_description || "", weight: l.weight || undefined,
    volume: l.volume || undefined, reference_number: l.reference_number || "",
  }));
  return { doc: runSheet, legs };
}

export async function updateLegFields(legName: string, changes: Partial<TransportLeg>): Promise<void> {
  await frappePut(`/api/resource/Transport Leg/${legName}`, changes);
}

export async function updateRunSheetStatus(name: string, status: string): Promise<void> {
  await frappePut(`/api/resource/Transport Run Sheet/${name}`, { status });
}

export async function uploadFile(fileUri: string, doctype: string, docname: string, fieldname: string): Promise<string> {
  const formData = new FormData();
  const filename = fileUri.split("/").pop() || "file.jpg";
  formData.append("file", { uri: fileUri, name: filename, type: "image/jpeg" } as any);
  formData.append("doctype", doctype);
  formData.append("docname", docname);
  formData.append("fieldname", fieldname);
  formData.append("is_private", "1");
  const res = await fetch(`${_siteUrl}/api/method/upload_file`, {
    method: "POST",
    headers: { Authorization: `token ${_apiKey}:${_apiSecret}` },
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const json = await res.json();
  return json.message?.file_url || "";
}

export async function pushLiveLocation(driverId: string, lat: number, lng: number, accuracy: number | null): Promise<void> {
  try {
    await frappePost("/api/method/frappe.client.set_value", {
      doctype: "Driver", name: driverId, fieldname: "last_known_location",
      value: JSON.stringify({ latitude: lat, longitude: lng, accuracy, timestamp: new Date().toISOString() }),
    });
  } catch { /* best effort */ }
}

export async function syncShiftEntry(driverId: string, clockIn: string, clockOut: string, totalMs: number): Promise<void> {
  try {
    await frappePost("/api/resource/Driver Shift Log", {
      driver: driverId, clock_in: clockIn, clock_out: clockOut, total_hours: (totalMs / 3600000).toFixed(2),
    });
  } catch { /* best effort */ }
}
