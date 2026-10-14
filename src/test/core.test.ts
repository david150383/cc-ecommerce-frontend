import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, request } from "../api/http";
import { safeNext } from "../auth/redirect";
import { bootstrapSession, refreshSession, useSession } from "../auth/session";
import { cartSubtotal, useCart } from "../cart/cart";
import { formatMoney } from "../lib/money";
import { json, mockFetch, problem } from "./harness";

const user = { id: "u1", email: "a@example.com", fullName: "Asha", roles: ["customer" as const], emailVerified: true, status: "ACTIVE" };
const login = (token: string) => ({ accessToken: token, expiresIn: 900, csrfToken: "csrf", user });

beforeEach(() => {
  useSession.getState().clear();
  document.cookie = "csrf_token=csrf-cookie-value; path=/";
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("money", () => {
  it("formats integer minor units exactly", () => {
    expect(formatMoney({ amountMinor: 117_764, currency: "INR" })).toBe("₹1,177.64");
    expect(formatMoney({ amountMinor: 5, currency: "INR" })).toBe("₹0.05");
    expect(formatMoney({ amountMinor: 1_000, currency: "JPY" })).toBe("JP¥1,000");
  });
});

describe("http client", () => {
  it("turns problem+json into ApiError with code, detail, field errors and correlation id", async () => {
    mockFetch({ "GET /x": () => json({ title: "Request validation failed", status: 400, code: "VALIDATION_FAILED", detail: "One or more fields are invalid.", errors: [{ path: "email", message: "bad" }], correlationId: "c-9" }, 400) });
    const err = (await request("http://api", "/x").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect([err.status, err.code, err.detail, err.fields, err.correlationId]).toEqual([400, "VALIDATION_FAILED", "One or more fields are invalid.", [{ path: "email", message: "bad" }], "c-9"]);
  });

  it("an expired token: refreshes ONCE for concurrent 401s, then retries each request with the new token", async () => {
    useSession.getState().setSession(login("old"));
    const { calls } = mockFetch({
      "GET /data": (c) => (c.headers.authorization === "Bearer new" ? { ok: true } : problem(401, "UNAUTHENTICATED")),
      "POST /api/v1/auth/refresh": () => json(login("new")),
    });
    const results = await Promise.all([request("http://api", "/data"), request("http://api", "/data"), request("http://api", "/data")]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    const refreshes = calls.filter((c) => c.url.endsWith("/refresh"));
    expect(refreshes).toHaveLength(1); // a second refresh would reuse the rotated token → Auth revokes the session
    expect(refreshes[0]).toMatchObject({ credentials: "include", headers: { "x-csrf-token": "csrf-cookie-value" } });
  });

  it("a failed refresh signs the user out and surfaces the 401", async () => {
    useSession.getState().setSession(login("old"));
    mockFetch({ "GET /data": () => problem(401, "UNAUTHENTICATED"), "POST /api/v1/auth/refresh": () => problem(401, "REFRESH_TOKEN_REUSED") });
    await expect(request("http://api", "/data")).rejects.toMatchObject({ status: 401 });
    expect(useSession.getState().status).toBe("anonymous");
  });

  it("never sends cookies to APIs other than Auth", async () => {
    const { calls } = mockFetch({ "GET /x": () => ({}) });
    await request("http://api", "/x");
    expect(calls[0]!.credentials).toBe("omit");
  });
});

describe("session bootstrap", () => {
  it("resumes from the refresh cookie when a CSRF cookie exists; stays anonymous otherwise", async () => {
    mockFetch({ "POST /api/v1/auth/refresh": () => json(login("t")) });
    await bootstrapSession();
    expect(useSession.getState()).toMatchObject({ status: "authenticated", accessToken: "t" });

    useSession.getState().clear();
    document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    const { calls } = mockFetch({});
    await bootstrapSession();
    expect([useSession.getState().status, calls.length]).toEqual(["anonymous", 0]);
  });

  it("keeps the access token out of web storage", async () => {
    mockFetch({ "POST /api/v1/auth/refresh": () => json(login("secret-access-token")) });
    await refreshSession();
    expect(JSON.stringify({ ...localStorage })).not.toContain("secret-access-token");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("secret-access-token");
  });
});

describe("cart", () => {
  const line = { sku: "TEE-BLK-S", productSlug: "tee", name: "Tee", variantName: "Black, S", image: null, unitPrice: { amountMinor: 59_900, currency: "INR" } };
  beforeEach(() => useCart.getState().clear());

  it("merges lines, clamps quantities to 1..10, and estimates the subtotal", () => {
    useCart.getState().add(line, 3);
    useCart.getState().add(line, 9);
    useCart.getState().add({ ...line, sku: "TEE-BLK-M" });
    expect(useCart.getState().lines.map((l) => [l.sku, l.quantity])).toEqual([["TEE-BLK-S", 10], ["TEE-BLK-M", 1]]);
    useCart.getState().setQuantity("TEE-BLK-M", 0);
    expect(useCart.getState().lines[1]!.quantity).toBe(1);
    expect(cartSubtotal(useCart.getState().lines)).toEqual({ amountMinor: 59_900 * 11, currency: "INR" });
  });

  it("drops malformed lines stored in localStorage", async () => {
    localStorage.setItem("cart.v1", JSON.stringify({ state: { lines: [{ ...line, quantity: 1 }, { sku: 1 }, { ...line, sku: "X", quantity: -5 }, { ...line, sku: "Y", quantity: 99 }] }, version: 0 }));
    await useCart.persist.rehydrate();
    expect(useCart.getState().lines.map((l) => [l.sku, l.quantity])).toEqual([["TEE-BLK-S", 1], ["Y", 10]]);
  });
});

describe("redirects after sign-in", () => {
  it("allows only same-site paths (no open redirect)", () => {
    expect(safeNext("/cart")).toBe("/cart");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", null, "javascript:alert(1)"]) expect(safeNext(bad)).toBe("/");
  });
});
