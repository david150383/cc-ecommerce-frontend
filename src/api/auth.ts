import { env } from "../config/env";
import { type LoginResponse, readCsrfCookie, type User } from "../auth/session";
import { request } from "./http";

const A = env.VITE_AUTH_API_URL;

export const authApi = {
  // Auth endpoints need cookies: the refresh token (HttpOnly) and the CSRF cookie.
  login: (email: string, password: string) =>
    request<LoginResponse>(A, "/api/v1/auth/login", { method: "POST", auth: false, withCredentials: true, body: { email, password } }),
  register: (body: { email: string; password: string; fullName: string }) =>
    request<{ user: User }>(A, "/api/v1/auth/register", { method: "POST", auth: false, body }),
  logout: (everywhere = false) =>
    everywhere
      ? request<void>(A, "/api/v1/auth/logout-all", { method: "POST", withCredentials: true, headers: csrf() })
      : request<void>(A, "/api/v1/auth/logout", { method: "POST", auth: false, withCredentials: true, headers: csrf() }),
  me: () => request<{ user: User }>(A, "/api/v1/auth/me"),
  verifyEmail: (token: string) => request<unknown>(A, "/api/v1/auth/verify-email", { method: "POST", auth: false, body: { token } }),
  resendVerification: () => request<void>(A, "/api/v1/auth/verify-email/resend", { method: "POST" }),
  forgotPassword: (email: string) => request<void>(A, "/api/v1/auth/forgot-password", { method: "POST", auth: false, body: { email } }),
  resetPassword: (token: string, newPassword: string) =>
    request<void>(A, "/api/v1/auth/reset-password", { method: "POST", auth: false, body: { token, newPassword } }),
};

function csrf(): Record<string, string> {
  const t = readCsrfCookie();
  return t ? { "x-csrf-token": t } : {};
}
