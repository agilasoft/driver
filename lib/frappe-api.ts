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
  return auth.siteUrl.replace(/\/+$/, "");
}

/**
 * Helper: query a Frappe doctype using the frappe.client.get_list RPC method.
 * This sometimes has different permission behaviour than the REST resource endpoint.
 */
async function frappeGetList(
  baseUrl: string,
  headers: Record<string, string>,
  doctype: string,
  filters: any[][],
  fields: string[],
  limit = 1
): Promise<{ data: any[] | null; error: string | null }> {
  try {
    // Try RPC method first (often more permissive)
    const rpcUrl = `${baseUrl}/api/method/frappe.client.get_list`;
    const rpcRes = await fetch(rpcUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        doctype,
        filters,
        fields,
        limit_page_length: limit,
      }),
    });
    if (rpcRes.ok) {
      const rpcData = await rpcRes.json();
      const results = rpcData.message || [];
      if (results.length > 0) {
        return { data: results, error: null };
      }
      // RPC succeeded but returned empty — try REST as well
    } else {
      const rpcText = await rpcRes.text();
      // Fall through to REST
      console.log(`[Driver] RPC get_list for ${doctype} returned ${rpcRes.status}: ${rpcText.substring(0, 200)}`);
    }
  } catch (e: any) {
    console.log(`[Driver] RPC get_list for ${doctype} threw: ${e.message}`);
  }

  // Fallback: REST resource endpoint
  try {
    const restUrl = `${baseUrl}/api/resource/${encodeURIComponent(doctype)}?filters=${encodeURIComponent(
      JSON.stringify(filters)
    )}&fields=${encodeURIComponent(
      JSON.stringify(fields)
    )}&limit_page_length=${limit}`;

    const restRes = await fetch(restUrl, { method: "GET", headers });
    if (restRes.ok) {
      const restData = await restRes.json();
      return { data: restData.data || [], error: null };
    }
    const restText = await restRes.text();
    return { data: null, error: `REST ${restRes.status}: ${restText.substring(0, 200)}` };
  } catch (e: any) {
    return { data: null, error: `REST error: ${e.message}` };
  }
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

  // Resolve the Driver record linked to this user
  let driverId: string | undefined;
  let driverName: string | undefined;
  const diagnostics: string[] = [];

  // Strategy 1: Driver.user == logged-in user email (standard ERPNext field)
  {
    const result = await frappeGetList(
      baseUrl,
      headers,
      "Driver",
      [["user", "=", userName]],
      ["name", "full_name"],
      1
    );
    if (result.data && result.data.length > 0) {
      driverId = result.data[0].name;
      driverName = result.data[0].full_name || result.data[0].name;
    } else {
      diagnostics.push(
        `Strategy 1 (Driver.user=${userName}): ${result.error || "no results"}`
      );
    }
  }

  // Strategy 2: Try user_id field in case it's a custom field
  if (!driverId) {
    const result = await frappeGetList(
      baseUrl,
      headers,
      "Driver",
      [["user_id", "=", userName]],
      ["name", "full_name"],
      1
    );
    if (result.data && result.data.length > 0) {
      driverId = result.data[0].name;
      driverName = result.data[0].full_name || result.data[0].name;
    } else {
      diagnostics.push(
        `Strategy 2 (Driver.user_id=${userName}): ${result.error || "no results"}`
      );
    }
  }

  // Strategy 3: Employee → Driver chain
  if (!driverId) {
    const empResult = await frappeGetList(
      baseUrl,
      headers,
      "Employee",
      [["user_id", "=", userName]],
      ["name"],
      1
    );
    if (empResult.data && empResult.data.length > 0) {
      const employeeId = empResult.data[0].name;
      const drvResult = await frappeGetList(
        baseUrl,
        headers,
        "Driver",
        [["employee", "=", employeeId]],
        ["name", "full_name"],
        1
      );
      if (drvResult.data && drvResult.data.length > 0) {
        driverId = drvResult.data[0].name;
        driverName = drvResult.data[0].full_name || drvResult.data[0].name;
      } else {
        diagnostics.push(
          `Strategy 3 (Employee ${employeeId} → Driver): ${drvResult.error || "no results"}`
        );
      }
    } else {
      diagnostics.push(
        `Strategy 3 (Employee.user_id=${userName}): ${empResult.error || "no results"}`
      );
    }
  }

  // Strategy 4: Match by full_name as a last resort
  if (!driverId && fullName && fullName !== userName) {
    const result = await frappeGetList(
      baseUrl,
      headers,
      "Driver",
      [["full_name", "=", fullName]],
      ["name", "full_name"],
      1
    );
    if (result.data && result.data.length > 0) {
      driverId = result.data[0].name;
      driverName = result.data[0].full_name || result.data[0].name;
    } else {
      diagnostics.push(
        `Strategy 4 (Driver.full_name=${fullName}): ${result.error || "no results"}`
      );
    }
  }

  // Strategy 5: Try getting ALL drivers and match (handles case where field name is different)
  if (!driverId) {
    const result = await frappeGetList(
      baseUrl,
      headers,
      "Driver",
      [],
      ["name", "full_name", "user", "employee"],
      20
    );
    if (result.data && result.data.length > 0) {
      // Try to match any driver whose user field matches
      const match = result.data.find(
        (d: any) =>
          d.user === userName ||
          d.user_id === userName ||
          (d.full_name && d.full_name.toLowerCase() === fullName.toLowerCase())
      );
      if (match) {
        driverId = match.name;
        driverName = match.full_name || match.name;
        diagnostics.push(
          `Strategy 5 (scan all drivers): matched ${match.name}`
        );
      } else {
        const driverUsers = result.data
          .map((d: any) => `${d.name}:user=${d.user || "null"}`)
          .join(", ");
        diagnostics.push(
          `Strategy 5 (scan ${result.data.length} drivers): no match. Drivers: ${driverUsers}`
        );
      }
    } else {
      diagnostics.push(
        `Strategy 5 (list all drivers): ${result.error || "no results / no access"}`
      );
    }
  }

  const driverLinkError = driverId
    ? undefined
    : diagnostics.join(" | ");

  const authState: AuthState = {
    siteUrl: baseUrl,
    apiKey,
    apiSecret,
    userName,
    fullName,
    isLoggedIn: true,
    driverId,
    driverName,
    driverLinkError,
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

  // Build filters — include driver filter when the logged-in user has a linked Driver record
  const filterArray: any[][] = [["docstatus", "<", 2]];
  if (auth?.driverId) {
    filterArray.push(["driver", "=", auth.driverId]);
  }
  const filters = JSON.stringify(filterArray);
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

  // Strategy 1: Try the custom bundle API endpoint
  try {
    const url = `${baseUrl}/api/method/logistics.transport.api.get_run_sheet_bundle?name=${encodeURIComponent(
      name
    )}`;
    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data.message) {
        return data.message as RunSheetBundle;
      }
    }
  } catch {
    // Fall through to REST fallback
  }

  // Strategy 2: Fetch run sheet + legs separately via REST
  const docRes = await fetch(
    `${baseUrl}/api/resource/Run Sheet/${encodeURIComponent(name)}`,
    { headers }
  );
  if (!docRes.ok) {
    throw new Error(`Failed to fetch run sheet: ${docRes.status}`);
  }
  const docData = await docRes.json();
  const doc = docData.data as RunSheet;

  // Fetch legs linked to this run sheet
  const legsFields = JSON.stringify([
    "name", "date", "transport_job", "vehicle_type",
    "facility_type_from", "facility_from", "pick_address",
    "facility_type_to", "facility_to", "drop_address",
    "start_date", "end_date", "distance_km", "duration_min",
    "pick_signature", "pick_signed_by", "drop_signature", "drop_signed_by",
    "date_signed", "status", "actual_distance_km", "actual_duration_min",
    "pick_latitude", "pick_longitude", "drop_latitude", "drop_longitude",
    "pick_notes", "drop_notes",
    "pick_signed_at", "drop_signed_at", "pick_photo", "drop_photo"
  ]);

  // Try fetching legs from Run Sheet Leg child table
  let legs: TransportLeg[] = [];
  try {
    const legsUrl = `${baseUrl}/api/resource/Run Sheet Leg?filters=${encodeURIComponent(
      JSON.stringify([["parent", "=", name]])
    )}&fields=${encodeURIComponent('["transport_leg"]')}&limit_page_length=100`;
    const legsRes = await fetch(legsUrl, { headers });
    if (legsRes.ok) {
      const legsData = await legsRes.json();
      const legNames = (legsData.data || []).map((l: any) => l.transport_leg);
      // Fetch each transport leg
      for (const legName of legNames) {
        if (!legName) continue;
        try {
          const legRes = await fetch(
            `${baseUrl}/api/resource/Transport Leg/${encodeURIComponent(legName)}?fields=${encodeURIComponent(legsFields)}`,
            { headers }
          );
          if (legRes.ok) {
            const legData = await legRes.json();
            if (legData.data) legs.push(legData.data);
          }
        } catch {
          // Skip this leg
        }
      }
    }
  } catch {
    // If Run Sheet Leg doesn't work, try Transport Leg directly
    try {
      const legUrl = `${baseUrl}/api/resource/Transport Leg?filters=${encodeURIComponent(
        JSON.stringify([["run_sheet", "=", name]])
      )}&fields=${encodeURIComponent(legsFields)}&limit_page_length=100`;
      const legRes = await fetch(legUrl, { headers });
      if (legRes.ok) {
        const legData = await legRes.json();
        legs = legData.data || [];
      }
    } catch {
      // No legs found
    }
  }

  return { doc, legs };
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

export async function updateRunSheetStatus(
  runSheetName: string,
  status: string
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const headers = await getHeaders();

  const url = `${baseUrl}/api/resource/Run Sheet/${encodeURIComponent(
    runSheetName
  )}`;

  const res = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update run sheet status: ${res.status} ${text}`);
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
