import { create } from "zustand";
import { env } from "../config/env";
import { request, setAuthHooks } from "../api/http";

export type Role = "customer" | "admin";

export interface User {
  id: string;
  email: string;
  fullName: string;
  roles: Role[];
  emailVerified: boolean;
  status: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  csrfToken: string;
  user: User;
}

interface SessionState {
  status: "loading" | "anonymous" | "authenticated";
  user: User | null;
  /** In memory only: never localStorage/sessionStorage (XSS would read it). */
  accessToken: string | null;
  setSession(r: LoginResponse): void;
  setUser(u: User): void;
  clear(): void;
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined;

export const useSession = create<SessionState>((set) => ({
  status: "loading",
  user: null,
  accessToken: null,
  setSession(r) {
    set({ status: "authenticated", user: r.user, accessToken: r.accessToken });
    // Refresh a minute before expiry, so normal use never sees a 401.
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void refreshSession(), Math.max(10, r.expiresIn - 60) * 1000);
  },
  setUser(u) {
    set({ user: u });
  },
  clear() {
    clearTimeout(refreshTimer);
    set({ status: "anonymous", user: null, accessToken: null });
  },
}));

export const isAdmin = (u: User | null) => !!u?.roles.includes("admin");

/** The double-submit CSRF cookie (readable by design; the refresh cookie itself is HttpOnly). */
export function readCsrfCookie(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

let inFlight: Promise<string | null> | null = null;

/**
 * Rotates the refresh token. Auth treats a reused refresh token as theft and revokes the session,
 * so refreshes must never overlap: single-flight within this tab, and serialized across tabs with
 * the Web Locks API (each tab then uses the cookie the previous one rotated).
 */
export function refreshSession(): Promise<string | null> {
  inFlight ??= (async () => {
    const run = async () => {
      const csrf = readCsrfCookie();
      if (!csrf) {
        useSession.getState().clear();
        return null;
      }
      try {
        const r = await request<LoginResponse>(env.VITE_AUTH_API_URL, "/api/v1/auth/refresh", {
          method: "POST",
          auth: false,
          withCredentials: true,
          headers: { "x-csrf-token": csrf },
        });
        useSession.getState().setSession(r);
        return r.accessToken;
      } catch {
        useSession.getState().clear();
        return null;
      }
    };
    try {
      return typeof navigator !== "undefined" && navigator.locks
        ? await navigator.locks.request("ecommerce-auth-refresh", run)
        : await run();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** On app start: a csrf cookie means there may be a session to resume. */
export async function bootstrapSession(): Promise<void> {
  if (readCsrfCookie()) await refreshSession();
  else useSession.getState().clear();
}

setAuthHooks({ token: () => useSession.getState().accessToken, refresh: refreshSession });
