import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { AuthState } from "./types";
import { login as apiLogin, logout as apiLogout } from "./frappe-api";
import { clearNotificationCache } from "./notifications";
import {
  type DriverProfile,
  getAllProfiles,
  addProfile,
  updateProfile,
  deleteProfile,
  getActiveProfileId,
  setActiveProfileId,
  touchProfileLastUsed,
  migrateOldAuth,
  hashPin,
} from "./profile-manager";

interface AuthContextType {
  // Current active session
  auth: AuthState | null;
  isLoading: boolean;

  // Profile management
  profiles: DriverProfile[];
  activeProfile: DriverProfile | null;

  // Actions
  login: (siteUrl: string, apiKey: string, apiSecret: string) => Promise<void>;
  logout: () => Promise<void>;
  updateCredentials: (siteUrl: string, apiKey: string, apiSecret: string) => Promise<void>;

  // Profile actions
  loadProfiles: () => Promise<void>;
  switchToProfile: (profile: DriverProfile) => Promise<void>;
  createProfile: (siteUrl: string, apiKey: string, apiSecret: string) => Promise<DriverProfile>;
  removeProfile: (id: string) => Promise<void>;
  updateProfilePin: (id: string, pin: string | null) => Promise<void>;
  updateProfileBiometric: (id: string, enabled: boolean) => Promise<void>;
  signOut: () => Promise<void>; // sign out of active profile (go to profile picker)
}

const AuthContext = createContext<AuthContextType>({
  auth: null,
  isLoading: true,
  profiles: [],
  activeProfile: null,
  login: async () => {},
  logout: async () => {},
  updateCredentials: async () => {},
  loadProfiles: async () => {},
  switchToProfile: async () => {},
  createProfile: async () => ({} as DriverProfile),
  removeProfile: async () => {},
  updateProfilePin: async () => {},
  updateProfileBiometric: async () => {},
  signOut: async () => {},
});

function profileToAuth(profile: DriverProfile): AuthState {
  return {
    siteUrl: profile.siteUrl,
    apiKey: profile.apiKey,
    apiSecret: profile.apiSecret,
    userName: profile.userName,
    fullName: profile.fullName,
    isLoggedIn: true,
    driverId: profile.driverId,
    driverName: profile.driverName,
    driverLinkError: profile.driverLinkError,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profiles, setProfiles] = useState<DriverProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<DriverProfile | null>(null);

  // Initial load: migrate old auth if needed, then load profiles
  useEffect(() => {
    (async () => {
      try {
        // Migrate old single-auth to profile system
        await migrateOldAuth();

        // Load all profiles
        const allProfiles = await getAllProfiles();
        setProfiles(allProfiles);

        // Check for active profile
        const activeId = await getActiveProfileId();
        if (activeId) {
          const profile = allProfiles.find((p) => p.id === activeId);
          if (profile) {
            setActiveProfile(profile);
            // Don't auto-login — require PIN/biometric unlock
            // But set auth so the app knows there's a session
            setAuth(profileToAuth(profile));
          }
        }
      } catch {
        // Ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const loadProfiles = useCallback(async () => {
    const allProfiles = await getAllProfiles();
    setProfiles(allProfiles);
  }, []);

  const login = useCallback(
    async (siteUrl: string, apiKey: string, apiSecret: string) => {
      const result = await apiLogin(siteUrl, apiKey, apiSecret);

      // Check if a profile already exists for this server+key combo
      const allProfiles = await getAllProfiles();
      let existing = allProfiles.find(
        (p) => p.siteUrl === result.siteUrl && p.apiKey === apiKey
      );

      if (existing) {
        // Update existing profile with fresh data
        existing = (await updateProfile(existing.id, {
          userName: result.userName,
          fullName: result.fullName,
          driverId: result.driverId,
          driverName: result.driverName,
          driverLinkError: result.driverLinkError,
          label: `${result.fullName || result.userName} — ${new URL(result.siteUrl).hostname}`,
          lastUsedAt: new Date().toISOString(),
        }))!;
        await setActiveProfileId(existing.id);
        setActiveProfile(existing);
      } else {
        // Create new profile
        const newProfile = await addProfile({
          label: `${result.fullName || result.userName} — ${new URL(result.siteUrl).hostname}`,
          siteUrl: result.siteUrl,
          apiKey,
          apiSecret,
          userName: result.userName,
          fullName: result.fullName,
          driverId: result.driverId,
          driverName: result.driverName,
          driverLinkError: result.driverLinkError,
          pin: undefined,
          useBiometric: false,
        });
        await setActiveProfileId(newProfile.id);
        setActiveProfile(newProfile);
      }

      // Refresh profiles list
      const updatedProfiles = await getAllProfiles();
      setProfiles(updatedProfiles);
      setAuth(result);
    },
    []
  );

  const logout = useCallback(async () => {
    await clearNotificationCache();
    await apiLogout();
    await setActiveProfileId(null);
    setAuth(null);
    setActiveProfile(null);
  }, []);

  const signOut = useCallback(async () => {
    // Sign out of active profile but keep profiles list
    await clearNotificationCache();
    await setActiveProfileId(null);
    setAuth(null);
    setActiveProfile(null);
  }, []);

  const updateCredentials = useCallback(
    async (siteUrl: string, apiKey: string, apiSecret: string) => {
      const result = await apiLogin(siteUrl, apiKey, apiSecret);
      await clearNotificationCache();

      if (activeProfile) {
        const updated = await updateProfile(activeProfile.id, {
          siteUrl: result.siteUrl,
          apiKey,
          apiSecret,
          userName: result.userName,
          fullName: result.fullName,
          driverId: result.driverId,
          driverName: result.driverName,
          driverLinkError: result.driverLinkError,
          label: `${result.fullName || result.userName} — ${new URL(result.siteUrl).hostname}`,
        });
        if (updated) setActiveProfile(updated);
      }

      setAuth(result);
      const updatedProfiles = await getAllProfiles();
      setProfiles(updatedProfiles);
    },
    [activeProfile]
  );

  const switchToProfile = useCallback(async (profile: DriverProfile) => {
    await touchProfileLastUsed(profile.id);
    await setActiveProfileId(profile.id);

    // Write the auth state for the Frappe API to use
    const authState = profileToAuth(profile);
    // Store in AsyncStorage so frappe-api.ts can read it
    const AsyncStorageMod = (await import("@react-native-async-storage/async-storage")).default;
    await AsyncStorageMod.setItem("frappe_auth", JSON.stringify(authState));

    setActiveProfile(profile);
    setAuth(authState);
  }, []);

  const createProfile = useCallback(
    async (siteUrl: string, apiKey: string, apiSecret: string) => {
      const result = await apiLogin(siteUrl, apiKey, apiSecret);
      const newProfile = await addProfile({
        label: `${result.fullName || result.userName} — ${new URL(result.siteUrl).hostname}`,
        siteUrl: result.siteUrl,
        apiKey,
        apiSecret,
        userName: result.userName,
        fullName: result.fullName,
        driverId: result.driverId,
        driverName: result.driverName,
        driverLinkError: result.driverLinkError,
        pin: undefined,
        useBiometric: false,
      });
      const updatedProfiles = await getAllProfiles();
      setProfiles(updatedProfiles);
      return newProfile;
    },
    []
  );

  const removeProfile = useCallback(
    async (id: string) => {
      await deleteProfile(id);
      if (activeProfile?.id === id) {
        await setActiveProfileId(null);
        setAuth(null);
        setActiveProfile(null);
      }
      const updatedProfiles = await getAllProfiles();
      setProfiles(updatedProfiles);
    },
    [activeProfile]
  );

  const updateProfilePin = useCallback(
    async (id: string, pin: string | null) => {
      const pinHash = pin ? hashPin(pin) : undefined;
      await updateProfile(id, { pin: pinHash });
      const updatedProfiles = await getAllProfiles();
      setProfiles(updatedProfiles);
      if (activeProfile?.id === id) {
        const updated = updatedProfiles.find((p) => p.id === id);
        if (updated) setActiveProfile(updated);
      }
    },
    [activeProfile]
  );

  const updateProfileBiometric = useCallback(
    async (id: string, enabled: boolean) => {
      await updateProfile(id, { useBiometric: enabled });
      const updatedProfiles = await getAllProfiles();
      setProfiles(updatedProfiles);
      if (activeProfile?.id === id) {
        const updated = updatedProfiles.find((p) => p.id === id);
        if (updated) setActiveProfile(updated);
      }
    },
    [activeProfile]
  );

  return (
    <AuthContext.Provider
      value={{
        auth,
        isLoading,
        profiles,
        activeProfile,
        login,
        logout,
        updateCredentials,
        loadProfiles,
        switchToProfile,
        createProfile,
        removeProfile,
        updateProfilePin,
        updateProfileBiometric,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
