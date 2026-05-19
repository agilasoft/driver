import { useState, useCallback } from "react";
import { Platform, Alert } from "react-native";
import * as Location from "expo-location";
import { ensureLocationReady, checkLocationServices } from "@/lib/location-permission";

export interface GpsCoords {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

/**
 * Hook that provides a function to capture the current GPS location.
 * Uses centralized permission management to avoid repeated permission prompts.
 */
export function useLocationCapture() {
  const [isCapturing, setIsCapturing] = useState(false);

  const captureLocation = useCallback(async (): Promise<GpsCoords | null> => {
    if (Platform.OS === "web") {
      // Web geolocation fallback
      return new Promise((resolve) => {
        if (!navigator.geolocation) {
          resolve(null);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            });
          },
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
    }

    setIsCapturing(true);
    try {
      // Check if location services are enabled
      const servicesEnabled = await checkLocationServices();
      if (!servicesEnabled) {
        Alert.alert(
          "Location Services Disabled",
          "Please enable location services in your device settings to capture GPS coordinates."
        );
        return null;
      }

      // Use centralized permission request (won't re-prompt if already granted)
      const ready = await ensureLocationReady();
      if (!ready) {
        Alert.alert(
          "Location Permission Denied",
          "Location permission is needed to record GPS coordinates for proof of delivery."
        );
        return null;
      }

      // Get current position
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      };
    } catch (error) {
      console.warn("Failed to capture location:", error);
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, []);

  return { captureLocation, isCapturing };
}
