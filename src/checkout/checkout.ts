import { env } from "../config/env";
import { newIdempotencyKey } from "../api/http";
import type { CheckoutRequest } from "../api/orders";

const ATTEMPT_KEY = "checkout.attempt.v1";

/** Stable JSON (sorted keys) so equal requests compare equal. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

/**
 * One idempotency key per checkout ATTEMPT: a double click, a network retry or a reload after
 * submitting re-sends the same key and gets the same saga back (no second order, no second charge).
 * Changing the cart or the address is a new attempt with a new key. Kept in sessionStorage (this tab).
 */
export function idempotencyKeyFor(req: CheckoutRequest): string {
  const fingerprint = canonical(req);
  try {
    const saved = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) ?? "null") as { fingerprint: string; key: string } | null;
    if (saved?.fingerprint === fingerprint) return saved.key;
  } catch {
    // corrupted entry: start a new attempt
  }
  const key = newIdempotencyKey();
  sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ fingerprint, key }));
  return key;
}

export function forgetAttempt(): void {
  sessionStorage.removeItem(ATTEMPT_KEY);
}

/**
 * The only places this app ever sends the browser to pay: the Payment Service's hosted mock page, or
 * Stripe Checkout. A checkoutUrl anywhere else (or a javascript: URL) is refused.
 */
export function safePaymentUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const allowed = [new URL(env.VITE_PAYMENT_API_URL).origin, "https://checkout.stripe.com"];
    return allowed.includes(url.origin) ? url.toString() : null;
  } catch {
    return null;
  }
}

const REASONS: Record<string, string> = {
  INSUFFICIENT_STOCK: "Some items sold out before we could reserve them. Your cart is still here: adjust it and try again.",
  PAYMENT_FAILED: "The payment did not go through, so the order was cancelled. You were not charged.",
  PAYMENT_TIMEOUT: "The payment was not completed in time, so the order was cancelled. If money was taken, it is refunded automatically.",
  PRODUCT_UNAVAILABLE: "An item in your cart is no longer sold. Remove it and try again.",
  INVALID_COUPON: "That coupon code is not valid. Remove it or try another.",
  CURRENCY_MISMATCH: "Prices changed currency since you added items. Remove them and add them again.",
  UNSUPPORTED_CURRENCY: "We cannot sell in that currency yet.",
};

export function describeFailure(reason: string | null): string {
  return (reason && REASONS[reason]) ?? "The order could not be completed. You were not charged; if money was taken, it is refunded automatically.";
}
