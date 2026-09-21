"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { API_URL } from "@/lib/room/api";
import { errorMessage } from "@/lib/http";

export type UserRole = "user" | "superadmin";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => void;
}

const STORAGE_KEY = "livepresentation:auth";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, loading: true });

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        if (!cancelled) setState({ user: null, token: null, loading: false });
        return;
      }
      try {
        const { token } = JSON.parse(raw) as { token: string };
        const res = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error("invalid session");
        const user = (await res.json()) as AuthUser;
        if (!cancelled) setState({ user, token, loading: false });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        if (!cancelled) setState({ user: null, token: null, loading: false });
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(await errorMessage(res, "Invalid email or password"));
    const { token, user } = (await res.json()) as { token: string; user: AuthUser };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token }));
    setState({ user, token, loading: false });
  }, []);

  const register = useCallback(async (input: { name: string; email: string; password: string }) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await errorMessage(res, "Could not create your account"));
    const { token, user } = (await res.json()) as { token: string; user: AuthUser };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token }));
    setState({ user, token, loading: false });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({ user: null, token: null, loading: false });
  }, []);

  return <AuthContext.Provider value={{ ...state, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
