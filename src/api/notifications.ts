import { env } from "../config/env";
import { request } from "./http";
import type { CursorPage } from "./orders";

export interface Preferences {
  email: { orderUpdates: boolean; marketing: boolean };
  sms: { orderUpdates: boolean; phone: string | null };
}

export interface NotificationItem {
  id: string;
  channel: "email" | "sms";
  templateKey: string;
  status: "QUEUED" | "SENDING" | "SENT" | "FAILED" | "SKIPPED";
  skipReason: string | null;
  attempts: number;
  createdAt: string;
  sentAt: string | null;
}

const N = env.VITE_NOTIFICATION_API_URL;

export const notificationsApi = {
  preferences: () => request<{ preferences: Preferences }>(N, "/api/v1/notifications/preferences"),
  savePreferences: (p: Preferences) => request<{ preferences: Preferences }>(N, "/api/v1/notifications/preferences", { method: "PUT", body: p }),
  history: (cursor?: string) => request<CursorPage<NotificationItem>>(N, "/api/v1/notifications/history", { query: { limit: 20, cursor } }),
};
