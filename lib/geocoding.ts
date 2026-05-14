import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Location from "expo-location";

const GEOCODE_CACHE_KEY = "geocode_cache";

interface GeocodedResult {
  latitude: number;
  longitude: number;
  source: "geocoded" | "gps";
}

interface GeocodeCache {
  [addressKey: string]: {
    latitude: number;
    longitude: number;
    timestamp: number;
  };
}

// Cache expiry: 30 days
const CACHE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Load the geocode cache from AsyncStorage.
 */
async function loadCache(): Promise<GeocodeCache> {
  try {
    const raw = await AsyncStorage.getItem(GEOCODE_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as GeocodeCache;
  } catch {
    return {};
  }
}

/**
 * Save the geocode cache to AsyncStorage.
 */
async function saveCache(cache: GeocodeCache): Promise<void> {
  try {
    await AsyncStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Silently fail
  }
}

/**
 * Fetch the full address text from Frappe's Address doctype.
 * The address_name is the Link field value (e.g., "ADDR-0001").
 */
export async function fetchAddressText(
  baseUrl: string,
  headers: Record<string, string>,
  addressName: string
): Promise<string | null> {
  if (!addressName) return null;

  try {
    // Try to get the display format of the address
    const url = `${baseUrl}/api/resource/Address/${encodeURIComponent(
      addressName
    )}?fields=["address_line1","address_line2","city","state","pincode","country"]`;

    const res = await fetch(url, { headers });
    if (!res.ok) return addressName; // Fallback to the address name itself

    const data = await res.json();
    const addr = data.data;
    if (!addr) return addressName;

    // Build a full address string from the parts
    const parts: string[] = [];
    if (addr.address_line1) parts.push(addr.address_line1);
    if (addr.address_line2) parts.push(addr.address_line2);
    if (addr.city) parts.push(addr.city);
    if (addr.state) parts.push(addr.state);
    if (addr.pincode) parts.push(addr.pincode);
    if (addr.country) parts.push(addr.country);

    return parts.length > 0 ? parts.join(", ") : addressName;
  } catch {
    return addressName; // Fallback to the address name itself
  }
}

/**
 * Geocode an address string to coordinates using Expo Location.
 * Results are cached to avoid repeated API calls.
 */
export async function geocodeAddress(
  addressText: string
): Promise<GeocodedResult | null> {
  if (!addressText || addressText.trim().length === 0) return null;

  const cacheKey = addressText.toLowerCase().trim();

  // Check cache first
  const cache = await loadCache();
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY_MS) {
    return {
      latitude: cached.latitude,
      longitude: cached.longitude,
      source: "geocoded",
    };
  }

  // Need location permission on Android for geocoding
  if (Platform.OS !== "web") {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return null;
    } catch {
      return null;
    }
  }

  try {
    const results = await Location.geocodeAsync(addressText);
    if (results && results.length > 0) {
      const { latitude, longitude } = results[0];

      // Cache the result
      cache[cacheKey] = { latitude, longitude, timestamp: Date.now() };
      await saveCache(cache);

      return { latitude, longitude, source: "geocoded" };
    }
    return null;
  } catch (error) {
    console.warn("[Geocoding] Failed to geocode:", addressText, error);
    return null;
  }
}

/**
 * Resolve coordinates for a leg's pick or drop location.
 * Priority: GPS-captured coordinates > geocoded address coordinates.
 */
export async function resolveCoordinates(params: {
  gpsLat?: number;
  gpsLng?: number;
  addressName?: string;
  facilityName?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}): Promise<GeocodedResult | null> {
  const { gpsLat, gpsLng, addressName, facilityName, baseUrl, headers } =
    params;

  // If we have GPS coordinates from the driver's capture, use those
  if (gpsLat && gpsLng && gpsLat !== 0 && gpsLng !== 0) {
    return { latitude: gpsLat, longitude: gpsLng, source: "gps" };
  }

  // Try to geocode from the address doctype
  if (addressName && baseUrl && headers) {
    const addressText = await fetchAddressText(baseUrl, headers, addressName);
    if (addressText) {
      const result = await geocodeAddress(addressText);
      if (result) return result;
    }
  }

  // Fallback: try to geocode using the facility name
  if (facilityName) {
    const result = await geocodeAddress(facilityName);
    if (result) return result;
  }

  return null;
}

/**
 * Resolve all leg coordinates for a bundle.
 * Returns an array of resolved coordinates for each leg.
 */
export interface ResolvedLegCoords {
  legName: string;
  facilityFrom: string;
  facilityTo: string;
  pickCoords: GeocodedResult | null;
  dropCoords: GeocodedResult | null;
}

export async function resolveAllLegCoordinates(params: {
  legs: Array<{
    name: string;
    facility_from?: string;
    facility_to?: string;
    pick_address?: string;
    drop_address?: string;
    pick_latitude?: number;
    pick_longitude?: number;
    drop_latitude?: number;
    drop_longitude?: number;
  }>;
  baseUrl: string;
  headers: Record<string, string>;
}): Promise<ResolvedLegCoords[]> {
  const { legs, baseUrl, headers } = params;

  const results: ResolvedLegCoords[] = [];

  for (const leg of legs) {
    const pickCoords = await resolveCoordinates({
      gpsLat: leg.pick_latitude,
      gpsLng: leg.pick_longitude,
      addressName: leg.pick_address,
      facilityName: leg.facility_from,
      baseUrl,
      headers,
    });

    const dropCoords = await resolveCoordinates({
      gpsLat: leg.drop_latitude,
      gpsLng: leg.drop_longitude,
      addressName: leg.drop_address,
      facilityName: leg.facility_to,
      baseUrl,
      headers,
    });

    results.push({
      legName: leg.name,
      facilityFrom: leg.facility_from || "Pick-up",
      facilityTo: leg.facility_to || "Drop-off",
      pickCoords,
      dropCoords,
    });
  }

  return results;
}

/**
 * Clear the geocode cache (useful for debugging or when addresses change).
 */
export async function clearGeocodeCache(): Promise<void> {
  await AsyncStorage.removeItem(GEOCODE_CACHE_KEY);
}
