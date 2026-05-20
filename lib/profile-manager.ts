import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { DriverProfile } from "./types";

const PROFILES_KEY = "driver_profiles";
const AVATAR_COLORS = ["#3478C6", "#F27A2E", "#34C759", "#FF3B30", "#AF52DE", "#FF9500", "#5856D6", "#FF2D55"];

export async function getProfiles(): Promise<DriverProfile[]> {
  const raw = await AsyncStorage.getItem(PROFILES_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveProfiles(profiles: DriverProfile[]): Promise<void> {
  await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export async function addProfile(profile: Omit<DriverProfile, "id" | "avatarColor" | "createdAt">): Promise<DriverProfile> {
  const profiles = await getProfiles();
  const newProfile: DriverProfile = {
    ...profile,
    id: `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    avatarColor: AVATAR_COLORS[profiles.length % AVATAR_COLORS.length],
    createdAt: new Date().toISOString(),
  };
  profiles.push(newProfile);
  await saveProfiles(profiles);
  return newProfile;
}

export async function updateProfile(id: string, updates: Partial<DriverProfile>): Promise<void> {
  const profiles = await getProfiles();
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx >= 0) {
    profiles[idx] = { ...profiles[idx], ...updates };
    await saveProfiles(profiles);
  }
}

export async function removeProfile(id: string): Promise<void> {
  const profiles = await getProfiles();
  await saveProfiles(profiles.filter((p) => p.id !== id));
}

export async function checkBiometricAvailability(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const LocalAuth = await import("expo-local-authentication");
    const hasHardware = await LocalAuth.hasHardwareAsync();
    const isEnrolled = await LocalAuth.isEnrolledAsync();
    return hasHardware && isEnrolled;
  } catch { return false; }
}

export async function authenticateWithBiometric(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const LocalAuth = await import("expo-local-authentication");
    const result = await LocalAuth.authenticateAsync({ promptMessage: "Unlock Driver Profile", cancelLabel: "Use PIN" });
    return result.success;
  } catch { return false; }
}
