import { useState, useCallback } from "react";
import { Platform, Alert } from "react-native";
import * as Location from "expo-location";

export interface GpsCoords {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export function useLocationCapture() {
  const [isCapturing, setIsCapturing] = useState(false);

  const captureLocation = useCallback(async (): Promise<GpsCoords | null> => {
    if (Platform.OS === "web") {
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
    }
    setIsCapturing(true);
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission Denied", "Location permission is needed."); return null; }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return { latitude: location.coords.latitude, longitude: location.coords.longitude, accuracy: location.coords.accuracy };
    } catch (error) { console.warn("Failed to capture location:", error); return null; }
    finally { setIsCapturing(false); }
  }, []);

  return { captureLocation, isCapturing };
}
