import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { AuthState } from "./types";
import { login as apiLogin, logout as apiLogout, getStoredAuth } from "./frappe-api";
import { clearNotificationCache } from "./notifications";

interface AuthContextType {
  auth: AuthState | null;
  isLoading: boolean;
  login: (siteUrl: string, apiKey: string, apiSecret: string) => Promise<void>;
  logout: () => Promise<void>;
  updateCredentials: (siteUrl: string, apiKey: string, apiSecret: string) => Promise<void>;
  setDriverOverride: (driverId: string, driverName?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  auth: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  updateCredentials: async () => {},
  setDriverOverride: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await getStoredAuth();
        if (stored?.isLoggedIn) {
          setAuth(stored);
        }
      } catch {
        // Ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(
    async (siteUrl: string, apiKey: string, apiSecret: string) => {
      const result = await apiLogin(siteUrl, apiKey, apiSecret);
      setAuth(result);
    },
    []
  );

  const logout = useCallback(async () => {
    await clearNotificationCache();
    await apiLogout();
    setAuth(null);
  }, []);

  const updateCredentials = useCallback(
    async (siteUrl: string, apiKey: string, apiSecret: string) => {
      // Re-login with new credentials (validates them and resolves driver)
      const result = await apiLogin(siteUrl, apiKey, apiSecret);
      // Clear notification cache so polling picks up new server
      await clearNotificationCache();
      setAuth(result);
    },
    []
  );

  const setDriverOverride = useCallback(
    async (driverId: string, driverName?: string) => {
      if (!auth) return;
      const updated: AuthState = {
        ...auth,
        driverId: driverId || undefined,
        driverName: driverName || driverId || undefined,
      };
      // Persist the override
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      await AsyncStorage.setItem("frappe_auth", JSON.stringify(updated));
      setAuth(updated);
    },
    [auth]
  );

  return (
    <AuthContext.Provider value={{ auth, isLoading, login, logout, updateCredentials, setDriverOverride }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
