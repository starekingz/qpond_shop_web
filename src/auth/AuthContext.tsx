import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { checkListingRole } from "../listings";

export interface DiscordUser {
  discordId: string;
  username: string;
  avatar: string | null;
}

interface AuthState {
  user: DiscordUser | null;
  loading: boolean;
  hasListingRole: boolean;
}

interface AuthContextValue extends AuthState {
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, hasListingRole: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/discord/me", { credentials: "include" });
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { user: DiscordUser };
          let hasRole = false;
          try {
            hasRole = await checkListingRole();
          } catch { /* ignore */ }
          if (!cancelled) setState({ user: data.user, loading: false, hasListingRole: hasRole });
        } else if (!cancelled) {
          setState({ user: null, loading: false, hasListingRole: false });
        }
      } catch {
        if (!cancelled) setState({ user: null, loading: false, hasListingRole: false });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(() => {
    window.location.href = "/api/discord/login";
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/discord/logout", { method: "POST", credentials: "include" });
    } finally {
      setState({ user: null, loading: false, hasListingRole: false });
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
