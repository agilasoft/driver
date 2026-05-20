import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthState, DriverProfile } from "./types";
import { configureFrappeApi } from "./frappe-api";
import { getProfiles, saveProfiles, removeProfile as removeProfileFromStorage } from "./profile-manager";

const ACTIVE_PROFILE_KEY = "active_profile_id";

interface AuthContextValue {
  auth: AuthState | null;
  activeProfile: DriverProfile | null;
  profiles: DriverProfile[];
  isUnlocked: boolean;
  unlockProfile: (profile: DriverProfile) => void;
  lockProfile: () => void;
  logout: () => void;
  reloadProfiles: () => Promise<void>;
  updateCredentials: (siteUrl: string, apiKey: string, apiSecret: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfilePin: (id: string, pin: string) => Promise<void>;
  updateProfileBiometric: (id: string, useBiometric: boolean) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<DriverProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<DriverProfile | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  const reloadProfiles = useCallback(async () => {
    const loaded = await getProfiles();
    setProfiles(loaded);
  }, []);

  useEffect(() => { reloadProfiles(); }, [reloadProfiles]);

  const auth: AuthState | null = activeProfile ? {
    siteUrl: activeProfile.siteUrl,
    apiKey: activeProfile.apiKey,
    apiSecret: activeProfile.apiSecret,
    userName: activeProfile.userName,
    fullName: activeProfile.fullName,
    driverName: activeProfile.driverName,
    driverId: activeProfile.driverId,
  } : null;

  const unlockProfile = useCallback((profile: DriverProfile) => {
    setActiveProfile(profile);
    setIsUnlocked(true);
    configureFrappeApi(profile.siteUrl, profile.apiKey, profile.apiSecret);
    AsyncStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
  }, []);

  const lockProfile = useCallback(() => {
    setIsUnlocked(false);
    setActiveProfile(null);
    AsyncStorage.removeItem(ACTIVE_PROFILE_KEY);
  }, []);

  const logout = useCallback(() => {
    lockProfile();
  }, [lockProfile]);

  const signOut = useCallback(async () => {
    if (activeProfile) {
      await removeProfileFromStorage(activeProfile.id);
      await reloadProfiles();
    }
    lockProfile();
  }, [activeProfile, lockProfile, reloadProfiles]);

  const updateCredentials = useCallback(async (siteUrl: string, apiKey: string, apiSecret: string) => {
    if (!activeProfile) return;
    const updated = { ...activeProfile, siteUrl, apiKey, apiSecret };
    const all = await getProfiles();
    const idx = all.findIndex((p) => p.id === activeProfile.id);
    if (idx >= 0) { all[idx] = updated; await saveProfiles(all); }
    setActiveProfile(updated);
    configureFrappeApi(siteUrl, apiKey, apiSecret);
    await reloadProfiles();
  }, [activeProfile, reloadProfiles]);

  const updateProfilePin = useCallback(async (id: string, pin: string) => {
    const all = await getProfiles();
    const idx = all.findIndex((p) => p.id === id);
    if (idx >= 0) { all[idx].pin = pin; await saveProfiles(all); }
    if (activeProfile?.id === id) setActiveProfile((prev) => prev ? { ...prev, pin } : prev);
    await reloadProfiles();
  }, [activeProfile, reloadProfiles]);

  const updateProfileBiometric = useCallback(async (id: string, useBiometric: boolean) => {
    const all = await getProfiles();
    const idx = all.findIndex((p) => p.id === id);
    if (idx >= 0) { all[idx].useBiometric = useBiometric; await saveProfiles(all); }
    if (activeProfile?.id === id) setActiveProfile((prev) => prev ? { ...prev, useBiometric } : prev);
    await reloadProfiles();
  }, [activeProfile, reloadProfiles]);

  const removeProfileFn = useCallback(async (id: string) => {
    await removeProfileFromStorage(id);
    if (activeProfile?.id === id) lockProfile();
    await reloadProfiles();
  }, [activeProfile, lockProfile, reloadProfiles]);

  return (
    <AuthContext.Provider value={{
      auth, activeProfile, profiles, isUnlocked,
      unlockProfile, lockProfile, logout, reloadProfiles,
      updateCredentials, signOut, updateProfilePin, updateProfileBiometric,
      removeProfile: removeProfileFn,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
