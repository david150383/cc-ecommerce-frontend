import type { User } from "../auth/session";
import { env } from "../config/env";
import type { Money } from "../lib/money";
import type { Product, ProductSummary } from "./catalog";
import { request } from "./http";
import type { CursorPage, Order, OrderStatus } from "./orders";

// --------------------------------------------------------------------------------------- types
export interface StockItem {
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  lowStock: boolean;
  updatedAt: string;
}

export interface Movement {
  id: string;
  deltaOnHand: number;
  deltaReserved: number;
  reason: string;
  referenceId: string | null;
  actor: string;
  note: string | null;
  createdAt: string;
}

export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "EXPIRED" | "PARTIALLY_REFUNDED" | "REFUNDED";

export interface Payment {
  id: string;
  orderId: string;
  customerId: string;
  status: PaymentStatus;
  provider: string;
  amount: Money;
  refunded: Money;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Refund {
  id: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  amount: Money;
  reason: string;
  failureCode: string | null;
  createdAt: string;
}

export const SAGA_STATES = [
  "STARTED", "RESERVING_INVENTORY", "INVENTORY_RESERVED", "AWAITING_PAYMENT", "CONFIRMING_INVENTORY", "CONFIRMING_ORDER",
  "COMPLETED", "CANCELLING", "REFUNDING", "CANCELLED", "FAILED", "MANUAL_REVIEW", "RESOLVED",
] as const;

export interface Saga {
  id: string;
  customerId: string;
  state: string;
  orderId: string | null;
  reservationId: string | null;
  paymentId: string | null;
  total: Money | null;
  failureReason: string | null;
  compensation: Record<string, unknown>;
  stepAttempts: number;
  deadlineAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface SagaStep {
  from: string | null;
  to: string;
  trigger: string;
  messageId: string | null;
  detail: string | null;
  at: string;
}

export interface AdminNotification {
  id: string;
  channel: "email" | "sms";
  templateKey: string;
  status: "QUEUED" | "SENDING" | "SENT" | "FAILED" | "SKIPPED";
  skipReason: string | null;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  sourceType: string | null;
  recipientUserId: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface DeadLetter {
  queue: string;
  sqsMessageId: string;
  receiveCount: number;
  sentAt: string | null;
  messageId: string | null;
  messageType: string | null;
  correlationId: string | null;
}

export interface ProductInput {
  name: string;
  categoryId: string;
  description?: string;
  brand?: string | null;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  featured?: boolean;
  variants: { sku: string; name?: string; attributes?: Record<string, string>; price: Money }[];
  images?: { url: string; alt?: string }[];
}

// ----------------------------------------------------------------------------------------- calls
const A = env.VITE_AUTH_API_URL;
const P = env.VITE_PRODUCT_API_URL;
const I = env.VITE_INVENTORY_API_URL;
const O = env.VITE_ORDER_API_URL;
const PAY = env.VITE_PAYMENT_API_URL;
const S = env.VITE_SAGA_API_URL;
const N = env.VITE_NOTIFICATION_API_URL;
const id = encodeURIComponent;

export const adminApi = {
  // Catalog (admin sees drafts and archived products too).
  products: (q: { q?: string; status?: string; page?: number }) =>
    request<{ data: ProductSummary[]; page: { page: number; pageSize: number; total: number } }>(P, "/api/v1/products", { query: { ...q, pageSize: 20, sort: "newest" } }),
  product: (productId: string) => request<Product>(P, `/api/v1/products/${id(productId)}`),
  createProduct: (body: ProductInput) => request<Product>(P, "/api/v1/products", { method: "POST", body }),
  /** Optimistic concurrency: If-Match with the version the admin edited, 412 if someone else saved first. */
  updateProduct: (productId: string, version: number, body: Partial<Omit<ProductInput, "variants">>) =>
    request<Product>(P, `/api/v1/products/${id(productId)}`, { method: "PATCH", body, headers: { "if-match": `"${version}"` } }),
  addVariant: (productId: string, body: ProductInput["variants"][number]) => request<Product>(P, `/api/v1/products/${id(productId)}/variants`, { method: "POST", body }),
  updateVariant: (productId: string, variantId: string, body: { price?: Money; salePrice?: Money | null; isActive?: boolean }) =>
    request<unknown>(P, `/api/v1/products/${id(productId)}/variants/${id(variantId)}`, { method: "PATCH", body }),

  // Inventory.
  stock: (cursor?: string) => request<CursorPage<StockItem>>(I, "/api/v1/inventory", { query: { limit: 50, cursor } }),
  lowStock: () => request<{ data: StockItem[] }>(I, "/api/v1/inventory/low-stock"),
  stockItem: (sku: string) => request<StockItem>(I, `/api/v1/inventory/${id(sku)}`),
  adjustStock: (sku: string, body: { delta?: number; reason?: string; note?: string; lowStockThreshold?: number }, idempotencyKey: string) =>
    request<StockItem>(I, `/api/v1/inventory/${id(sku)}`, { method: "PATCH", body, idempotencyKey }),
  movements: (sku: string) => request<{ data: Movement[] }>(I, `/api/v1/inventory/${id(sku)}/movements`, { query: { limit: 50 } }),

  // Orders.
  orders: (q: { status?: string; cursor?: string }) => request<CursorPage<Order>>(O, "/api/v1/admin/orders", { query: { ...q, limit: 20 } }),
  fulfil: (orderId: string, toStatus: Extract<OrderStatus, "PROCESSING" | "SHIPPED" | "DELIVERED">, reason: string) =>
    request<{ order: Order }>(O, `/api/v1/admin/orders/${id(orderId)}/status`, { method: "PATCH", body: { toStatus, reason } }),

  // Payments.
  payments: (q: { status?: string; customerId?: string; cursor?: string }) => request<CursorPage<Payment>>(PAY, "/api/v1/admin/payments", { query: { ...q, limit: 20 } }),
  payment: (paymentId: string) => request<{ payment: Payment; refunds: Refund[] }>(PAY, `/api/v1/payments/${id(paymentId)}`),
  refund: (paymentId: string, body: { amount?: Money; reason: "ADMIN" | "CUSTOMER_REQUESTED" }, idempotencyKey: string) =>
    request<{ refund: Refund }>(PAY, `/api/v1/payments/${id(paymentId)}/refund`, { method: "POST", body, idempotencyKey }),

  // Sagas.
  sagas: (q: { state?: string; cursor?: string }) => request<CursorPage<Saga>>(S, "/api/v1/admin/sagas", { query: { ...q, limit: 20 } }),
  saga: (sagaId: string) => request<{ saga: Saga; steps: SagaStep[] }>(S, `/api/v1/admin/sagas/${id(sagaId)}`),
  retrySaga: (sagaId: string) => request<unknown>(S, `/api/v1/admin/sagas/${id(sagaId)}/retry`, { method: "POST" }),
  resolveSaga: (sagaId: string, resolution: string) => request<unknown>(S, `/api/v1/admin/sagas/${id(sagaId)}/resolve`, { method: "POST", body: { resolution } }),

  // Users.
  users: (q: { q?: string; status?: string; cursor?: string }) => request<CursorPage<User & { createdAt: string }>>(A, "/api/v1/admin/users", { query: { ...q, limit: 20 } }),
  setUserStatus: (userId: string, status: "ACTIVE" | "SUSPENDED", reason: string) =>
    request<unknown>(A, `/api/v1/admin/users/${id(userId)}/status`, { method: "PATCH", body: { status, reason } }),

  // Notifications.
  notifications: (q: { status?: string; channel?: string; cursor?: string }) =>
    request<CursorPage<AdminNotification>>(N, "/api/v1/admin/notifications", { query: { ...q, limit: 20 } }),
  retryNotification: (notificationId: string) => request<unknown>(N, `/api/v1/admin/notifications/${id(notificationId)}/retry`, { method: "POST" }),
  deadLetters: () => request<{ depths: Record<string, number>; data: DeadLetter[] }>(N, "/api/v1/admin/notifications/dead-letters"),
};
