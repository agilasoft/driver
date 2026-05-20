export interface ResolveOptions {
  gpsLat?: number;
  gpsLng?: number;
  addressName?: string;
  facilityName?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}

export async function resolveCoordinates(opts: ResolveOptions): Promise<{ latitude: number; longitude: number } | null> {
  if (opts.gpsLat && opts.gpsLng) return { latitude: opts.gpsLat, longitude: opts.gpsLng };
  const address = opts.addressName || opts.facilityName;
  if (!address) return null;
  try {
    const url = "https://nominatim.openstreetmap.org/search?format=json&q=" + encodeURIComponent(address);
    const res = await fetch(url, { headers: { "User-Agent": "DriverApp/1.0" } });
    const data = await res.json();
    if (data && data.length > 0) return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
  } catch { /* ignore */ }
  return null;
}

export async function resolveAllLegCoordinates(legs: any[], baseUrl?: string, headers?: Record<string, string>): Promise<void> {
  for (const leg of legs) {
    if (leg.pick_address || leg.facility_from) {
      const coords = await resolveCoordinates({ addressName: leg.pick_address || leg.facility_from, baseUrl, headers });
      if (coords) { leg.pick_latitude = coords.latitude; leg.pick_longitude = coords.longitude; }
    }
    if (leg.drop_address || leg.facility_to) {
      const coords = await resolveCoordinates({ addressName: leg.drop_address || leg.facility_to, baseUrl, headers });
      if (coords) { leg.drop_latitude = coords.latitude; leg.drop_longitude = coords.longitude; }
    }
  }
}
