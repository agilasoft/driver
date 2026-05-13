import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { AuthState } from "./types";
import { login as apiLogin, logout as apiLogout, getStoredAuth } from "./frappe-api";

interface AuthContextType {
  auth: AuthState | null;
  isLoading: boolean;
  login: (siteUrl: string, apiKey: string, apiSecret: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  auth: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
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
    await apiLogout();
    setAuth(null);
  }, []);

  return (
    <AuthContext.Provider value={{ auth, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
