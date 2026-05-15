import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// ── Types ──────────────────────────────────────────────────────────────────

export interface DriverProfile {
  id: string; // unique ID (uuid-like)
  label: string; // display name e.g. "John — acme.erpnext.com"
  siteUrl: string;
  apiKey: string;
  apiSecret: string;
  userName: string; // email resolved at login
  fullName: string;
  driverId?: string;
  driverName?: string;
  driverLinkError?: string;
  pin?: string; // 4-6 digit PIN hash (simple SHA-like)
  useBiometric: boolean;
  avatarColor: string; // for the profile avatar circle
  createdAt: string;
  lastUsedAt: string;
}

export interface ProfileStore {
  profiles: DriverProfile[];
  activeProfileId: string | null;
}

// ── Storage Keys ───────────────────────────────────────────────────────────

const PROFILES_KEY = "driver_profiles";
const ACTIVE_PROFILE_KEY = "driver_active_profile";

// ── Avatar Colors ──────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "#1B4F72", "#0E6655", "#7D3C98", "#C0392B",
  "#D4AC0D", "#2874A6", "#148F77", "#6C3483",
  "#A93226", "#B7950B", "#1A5276", "#117A65",
];

function pickAvatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

// ── Simple PIN hash (not crypto-grade, but prevents casual reading) ────────

export function hashPin(pin: string): string {
  // Simple hash for PIN storage — not meant to be cryptographically secure
  // since the PIN is just a convenience lock, not protecting secrets at rest
  let hash = 0;
  const salt = "driver_pin_salt_2026";
  const str = salt + pin;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `ph_${Math.abs(hash).toString(36)}`;
}

export function verifyPin(input: string, storedHash: string): boolean {
  return hashPin(input) === storedHash;
}

// ── Profile CRUD ───────────────────────────────────────────────────────────

export async function getProfileStore(): Promise<ProfileStore> {
  try {
    const raw = await AsyncStorage.getItem(PROFILES_KEY);
    if (raw) {
      return JSON.parse(raw) as ProfileStore;
    }
  } catch {
    // Ignore
  }
  return { profiles: [], activeProfileId: null };
}

async function saveProfileStore(store: ProfileStore): Promise<void> {
  await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(store));
}

export async function getActiveProfileId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_PROFILE_KEY);
  } catch {
    return null;
  }
}

export async function setActiveProfileId(id: string | null): Promise<void> {
  if (id) {
    await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, id);
  } else {
    await AsyncStorage.removeItem(ACTIVE_PROFILE_KEY);
  }
}

export async function getAllProfiles(): Promise<DriverProfile[]> {
  const store = await getProfileStore();
  return store.profiles;
}

export async function getProfileById(id: string): Promise<DriverProfile | null> {
  const store = await getProfileStore();
  return store.profiles.find((p) => p.id === id) || null;
}

export async function addProfile(
  profile: Omit<DriverProfile, "id" | "avatarColor" | "createdAt" | "lastUsedAt">
): Promise<DriverProfile> {
  const store = await getProfileStore();
  const newProfile: DriverProfile = {
    ...profile,
    id: generateId(),
    avatarColor: pickAvatarColor(store.profiles.length),
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };
  store.profiles.push(newProfile);
  await saveProfileStore(store);
  return newProfile;
}

export async function updateProfile(
  id: string,
  updates: Partial<DriverProfile>
): Promise<DriverProfile | null> {
  const store = await getProfileStore();
  const idx = store.profiles.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  store.profiles[idx] = { ...store.profiles[idx], ...updates };
  await saveProfileStore(store);
  return store.profiles[idx];
}

export async function deleteProfile(id: string): Promise<void> {
  const store = await getProfileStore();
  store.profiles = store.profiles.filter((p) => p.id !== id);
  if (store.activeProfileId === id) {
    store.activeProfileId = null;
  }
  await saveProfileStore(store);
  // Also clear active if it matches
  const activeId = await getActiveProfileId();
  if (activeId === id) {
    await setActiveProfileId(null);
  }
}

export async function touchProfileLastUsed(id: string): Promise<void> {
  const store = await getProfileStore();
  const profile = store.profiles.find((p) => p.id === id);
  if (profile) {
    profile.lastUsedAt = new Date().toISOString();
    await saveProfileStore(store);
  }
}

// ── Biometric helpers ──────────────────────────────────────────────────────

export async function checkBiometricAvailability(): Promise<{
  available: boolean;
  type: "face" | "fingerprint" | "none";
}> {
  if (Platform.OS === "web") {
    return { available: false, type: "none" };
  }
  try {
    const LocalAuth = await import("expo-local-authentication");
    const hasHardware = await LocalAuth.hasHardwareAsync();
    if (!hasHardware) return { available: false, type: "none" };
    const isEnrolled = await LocalAuth.isEnrolledAsync();
    if (!isEnrolled) return { available: false, type: "none" };
    const types = await LocalAuth.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuth.AuthenticationType.FACIAL_RECOGNITION)) {
      return { available: true, type: "face" };
    }
    if (types.includes(LocalAuth.AuthenticationType.FINGERPRINT)) {
      return { available: true, type: "fingerprint" };
    }
    return { available: true, type: "fingerprint" };
  } catch {
    return { available: false, type: "none" };
  }
}

export async function authenticateWithBiometric(
  promptMessage: string = "Authenticate to unlock profile"
): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const LocalAuth = await import("expo-local-authentication");
    const result = await LocalAuth.authenticateAsync({
      promptMessage,
      disableDeviceFallback: true,
      cancelLabel: "Use PIN",
    });
    return result.success;
  } catch {
    return false;
  }
}

// ── Migration: convert old single-auth to a profile ────────────────────────

const OLD_AUTH_KEY = "frappe_auth";

export async function migrateOldAuth(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(OLD_AUTH_KEY);
    if (!raw) return false;
    const old = JSON.parse(raw);
    if (!old?.isLoggedIn || !old?.siteUrl) return false;

    // Check if we already have profiles
    const store = await getProfileStore();
    // Check if a profile with same siteUrl+apiKey already exists
    const exists = store.profiles.some(
      (p) => p.siteUrl === old.siteUrl && p.apiKey === old.apiKey
    );
    if (exists) {
      // Already migrated, clean up old key
      await AsyncStorage.removeItem(OLD_AUTH_KEY);
      return false;
    }

    // Create a profile from old auth
    const profile = await addProfile({
      label: `${old.fullName || old.userName} — ${new URL(old.siteUrl).hostname}`,
      siteUrl: old.siteUrl,
      apiKey: old.apiKey,
      apiSecret: old.apiSecret,
      userName: old.userName || "",
      fullName: old.fullName || "",
      driverId: old.driverId,
      driverName: old.driverName,
      driverLinkError: old.driverLinkError,
      pin: undefined,
      useBiometric: false,
    });

    // Set as active
    await setActiveProfileId(profile.id);

    // Remove old auth key
    await AsyncStorage.removeItem(OLD_AUTH_KEY);

    return true;
  } catch {
    return false;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return `prof_${id}`;
}
