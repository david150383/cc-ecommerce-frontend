import { env } from "../config/env";
import type { Money } from "../lib/money";
import { request } from "./http";

export type OrderStatus =
  | "PENDING" | "INVENTORY_RESERVING" | "INVENTORY_RESERVED" | "PAYMENT_PENDING" | "PAYMENT_PROCESSING" | "PAYMENT_SUCCEEDED"
  | "CONFIRMED" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLATION_PENDING" | "CANCELLED" | "FAILED" | "REFUND_PENDING" | "REFUNDED";

export interface Address {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  phone: string;
}

export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  currency: string;
  items: { sku: string; name: string; quantity: number; unitPrice: Money; lineTotal: Money; discount: Money; tax: Money }[];
  totals: { subtotal: Money; discount: Money; tax: Money; shipping: Money; grandTotal: Money };
  couponCode: string | null;
  shippingAddress: Address;
  cancellationReason: string | null;
  statusHistory: { from: string | null; to: string; reason: string; actor: string; at: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface CursorPage<T> {
  data: T[];
  page: { limit: number; nextCursor: string | null };
}

export interface CheckoutStatus {
  sagaId: string;
  orderId: string | null;
  status: "PROCESSING" | "AWAITING_PAYMENT" | "COMPLETED" | "CANCELLED" | "FAILED" | "UNDER_REVIEW";
  checkoutUrl: string | null;
  failureReason: string | null;
  statusUrl: string;
}

export interface CheckoutRequest {
  items: { sku: string; quantity: number }[];
  currency: string;
  shippingAddress: Address;
  couponCode?: string;
}

const O = env.VITE_ORDER_API_URL;
const S = env.VITE_SAGA_API_URL;

export const ordersApi = {
  mine: (cursor?: string) => request<CursorPage<Order>>(O, "/api/v1/orders/my-orders", { query: { limit: 10, cursor } }),
  get: (id: string, signal?: AbortSignal) => request<{ order: Order }>(O, `/api/v1/orders/${encodeURIComponent(id)}`, { signal }),
  /** Idempotent: an order that is already cancelled (or cancellation-pending) is returned as is. */
  cancel: (id: string) => request<{ order: Order }>(O, `/api/v1/orders/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
};

/** Mirrors the Order Service's state machine: no money taken yet, so cancelling is immediate. */
export const CANCELLABLE_BEFORE_PAYMENT: readonly OrderStatus[] = ["PENDING", "INVENTORY_RESERVING", "INVENTORY_RESERVED", "PAYMENT_PENDING"];
/** Paid but not shipped: cancelling means a refund, so it is only requested. */
export const CANCELLABLE_AFTER_PAYMENT: readonly OrderStatus[] = ["CONFIRMED", "PROCESSING"];

export const checkoutApi = {
  /** Only SKUs and quantities: prices, totals and discounts are computed by the services. */
  start: (body: CheckoutRequest, idempotencyKey: string) => request<CheckoutStatus>(S, "/api/v1/checkout", { method: "POST", body, idempotencyKey }),
  status: (sagaId: string, signal?: AbortSignal) => request<CheckoutStatus>(S, `/api/v1/checkout/${encodeURIComponent(sagaId)}`, { signal }),
};

/** Statuses at which the checkout is over (no more polling). */
export const FINAL_CHECKOUT = new Set<CheckoutStatus["status"]>(["COMPLETED", "CANCELLED", "FAILED", "UNDER_REVIEW"]);
