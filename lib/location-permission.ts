import { Platform } from "react-native";
import * as Location from "expo-location";

/**
 * Centralized location permission management.
 * 
 * This module ensures that:
 * 1. Permission is only requested once (cached result)
 * 2. Multiple callers (live-location, geofence, use-location hook) 
 *    don't trigger repeated permission dialogs
 * 3. Services-enabled check is done once per session
 */

let cachedPermissionStatus: Location.PermissionStatus | null = null;
let permissionPromise: Promise<Location.PermissionStatus> | null = null;
let servicesEnabledCache: boolean | null = null;
let servicesCheckPromise: Promise<boolean> | null = null;

/**
 * Check if location services are enabled (cached per session).
 * Returns true if services are available.
 */
export async function checkLocationServices(): Promise<boolean> {
  if (Platform.OS === "web") return true; // Web handles this via browser API

  if (servicesEnabledCache !== null) return servicesEnabledCache;

  // Prevent concurrent checks
  if (servicesCheckPromise) return servicesCheckPromise;

  servicesCheckPromise = (async () => {
    try {
      const enabled = await Location.hasServicesEnabledAsync();
      servicesEnabledCache = enabled;
      return enabled;
    } catch {
      servicesEnabledCache = false;
      return false;
    } finally {
      // Allow re-check after 30 seconds (services could be toggled)
      setTimeout(() => {
        servicesEnabledCache = null;
        servicesCheckPromise = null;
      }, 30000);
    }
  })();

  return servicesCheckPromise;
}

/**
 * Request foreground location permission (cached).
 * Multiple simultaneous callers will share the same promise.
 * Returns the permission status.
 */
export async function requestLocationPermission(): Promise<Location.PermissionStatus> {
  if (Platform.OS === "web") return Location.PermissionStatus.GRANTED;

  // Return cached result if already granted or denied
  if (cachedPermissionStatus === Location.PermissionStatus.GRANTED) {
    return cachedPermissionStatus;
  }

  // If a request is already in flight, wait for it
  if (permissionPromise) {
    return permissionPromise;
  }

  permissionPromise = (async () => {
    try {
      // First check current status without prompting
      const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
      if (existingStatus === Location.PermissionStatus.GRANTED) {
        cachedPermissionStatus = existingStatus;
        return existingStatus;
      }

      // Only request if not already determined
      if (existingStatus === Location.PermissionStatus.UNDETERMINED) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        cachedPermissionStatus = status;
        return status;
      }

      // Denied — cache it but allow retry after 60s
      cachedPermissionStatus = existingStatus;
      return existingStatus;
    } catch {
      return Location.PermissionStatus.DENIED;
    } finally {
      permissionPromise = null;
    }
  })();

  return permissionPromise;
}

/**
 * Check if location is ready (services enabled + permission granted).
 * This is the single entry point all location features should use.
 */
export async function ensureLocationReady(): Promise<boolean> {
  if (Platform.OS === "web") return true;

  const servicesOk = await checkLocationServices();
  if (!servicesOk) return false;

  const status = await requestLocationPermission();
  return status === Location.PermissionStatus.GRANTED;
}

/**
 * Reset cached permission state (e.g., when user changes settings).
 */
export function resetPermissionCache(): void {
  cachedPermissionStatus = null;
  servicesEnabledCache = null;
  permissionPromise = null;
  servicesCheckPromise = null;
}
