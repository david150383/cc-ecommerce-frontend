import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useSession } from "../auth/session";
import { parseMajor, toMajorString } from "../lib/money";
import { type Call, json, mockFetch, money, problem, product, renderApp } from "./harness";

const admin = { id: "admin-1", email: "admin@shop.local", fullName: "Admin", roles: ["admin" as const], emailVerified: true, status: "ACTIVE" };
const customer = { ...admin, id: "c-1", roles: ["customer" as const] };
const signIn = (u: typeof admin | typeof customer) => useSession.getState().setSession({ accessToken: "t", expiresIn: 900, csrfToken: "c", user: u });

// Admin pages load lazily; transform the module once up front so test timing is about behaviour.
beforeAll(async () => {
  await import("../pages/admin");
});
beforeEach(() => signIn(admin));
afterEach(() => {
  vi.unstubAllGlobals();
  useSession.getState().clear();
});

describe("money input", () => {
  it("parses major units exactly and rejects anything ambiguous", () => {
    expect(parseMajor("1,177.64", "INR")).toBe(117_764);
    expect(parseMajor("599", "INR")).toBe(59_900);
    expect(parseMajor("0.1", "INR")).toBe(10);
    expect(parseMajor("1000", "JPY")).toBe(1_000);
    for (const bad of ["", "-5", "1.234", "1e3", "abc", "1.5", "12.3.4"]) expect(parseMajor(bad, bad === "1.5" ? "JPY" : "INR")).toBeNull();
    expect(toMajorString(money(117_764))).toBe("1177.64");
    expect(toMajorString(money(5))).toBe("0.05");
  });
});

describe("admin access", () => {
  it("customers are sent away from /admin (the APIs enforce it anyway)", async () => {
    signIn(customer);
    mockFetch({ "GET /api/v1/products": () => ({ data: [], page: { page: 1, pageSize: 8, total: 0 } }) });
    const { router } = renderApp("/admin");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("admins get the overview with what needs attention", async () => {
    mockFetch({
      "GET /api/v1/admin/sagas": () => ({ data: [{ id: "s1" }, { id: "s2" }], page: { limit: 20, nextCursor: null } }),
      "GET /api/v1/inventory/low-stock": () => ({ data: [] }),
      "GET /api/v1/admin/notifications/dead-letters": () => ({ depths: { a: 1, b: 2 }, data: [] }),
      "GET /api/v1/admin/notifications": () => ({ data: [], page: { limit: 20, nextCursor: null } }),
    });
    renderApp("/admin");
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Checkouts needing review\s*2/ })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Dead-lettered messages\s*3/ })).toBeInTheDocument();
  });
});

describe("refunds", () => {
  const payment = { id: "pay-1", orderId: "o1", customerId: "c1", status: "SUCCEEDED", provider: "mock", amount: money(100_000), refunded: money(20_000), failureCode: null, createdAt: "2026-10-14T10:00:00Z", updatedAt: "2026-10-14T10:00:00Z" };

  it("validates against what is left, sends minor units, and keeps one idempotency key per refund", async () => {
    let posts = 0;
    const { calls } = mockFetch({
      "GET /api/v1/admin/payments": () => ({ data: [payment], page: { limit: 20, nextCursor: null } }),
      "GET /api/v1/payments/pay-1": () => ({ payment, refunds: [{ id: "r0", status: "PENDING", amount: money(30_000), reason: "ADMIN", failureCode: null, createdAt: "2026-10-14T10:00:00Z" }] }),
      "POST /api/v1/payments/pay-1/refund": () => (++posts === 1 ? problem(503, "PROVIDER_UNAVAILABLE") : json({ refund: { id: "r1", status: "PENDING" } }, 202)),
    });
    const u = userEvent.setup();
    renderApp("/admin/payments?payment=pay-1");
    // 1000.00 paid − 200.00 refunded − 300.00 pending = 500.00 refundable
    const amount = await screen.findByLabelText("Refund amount (up to 500.00)");
    await u.type(amount, "600");
    await u.click(screen.getByRole("button", { name: "Refund" }));
    expect(await screen.findByText("Enter an amount up to ₹500.00")).toBeInTheDocument();
    expect(calls.filter((c: Call) => c.method === "POST")).toHaveLength(0);

    await u.clear(amount);
    await u.type(amount, "123.45");
    await u.click(screen.getByRole("button", { name: "Refund" })); // provider down
    await screen.findByText(/Something went wrong on our side/);
    await u.click(screen.getByRole("button", { name: "Refund" })); // retry
    expect(await screen.findByText(/completes when the payment provider confirms/)).toBeInTheDocument();
    const posted = calls.filter((c: Call) => c.method === "POST");
    expect(posted.map((c) => c.body)).toEqual([{ amount: money(12_345), reason: "ADMIN" }, { amount: money(12_345), reason: "ADMIN" }]);
    expect(posted[1]!.headers["idempotency-key"]).toBe(posted[0]!.headers["idempotency-key"]); // the retry is the SAME refund
  });
});

describe("product editing", () => {
  it("saves with If-Match and explains a concurrent edit (412)", async () => {
    const { calls } = mockFetch({
      "GET /api/v1/products/p1": () => ({ ...product, version: 7 }),
      "PATCH /api/v1/products/p1": () => problem(412, "PRECONDITION_FAILED"),
    });
    const u = userEvent.setup();
    renderApp("/admin/products/p1");
    await u.click(await screen.findByRole("button", { name: "Save product" }));
    expect(await screen.findByText(/Someone else changed this product/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")!.headers["if-match"]).toBe('"7"');
  });

  it("variant prices are entered in rupees and sent as integer paise; sale must be below price", async () => {
    const { calls } = mockFetch({
      "GET /api/v1/products/p1": () => product,
      "PATCH /api/v1/products/p1/variants/v1": () => ({}),
    });
    const u = userEvent.setup();
    renderApp("/admin/products/p1");
    const price = await screen.findByLabelText("Price of TEE-BLK-S");
    const sale = screen.getByLabelText("Sale price of TEE-BLK-S");
    await u.type(sale, "700");
    await u.click(screen.getAllByRole("button", { name: "Save" })[0]!);
    expect(await screen.findByText("The sale price must be below the price")).toBeInTheDocument();
    await u.clear(sale);
    await u.type(sale, "499.50");
    await u.clear(price);
    await u.type(price, "649");
    await u.click(screen.getAllByRole("button", { name: "Save" })[0]!);
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ price: money(64_900), salePrice: money(49_950), isActive: true }));
  });
});

describe("stock adjustments", () => {
  it("needs a note for stock changes; a threshold-only change needs none; both carry an idempotency key", async () => {
    const item = { sku: "TEE-BLK-S", onHand: 4, reserved: 1, available: 3, lowStockThreshold: 5, lowStock: true, updatedAt: "2026-10-14T10:00:00Z" };
    const { calls } = mockFetch({
      "GET /api/v1/inventory/TEE-BLK-S/movements": () => ({ data: [] }),
      "GET /api/v1/inventory/TEE-BLK-S": () => item,
      "GET /api/v1/inventory": () => ({ data: [item], page: { limit: 50, nextCursor: null } }),
      "PATCH /api/v1/inventory/TEE-BLK-S": () => item,
    });
    const u = userEvent.setup();
    renderApp("/admin/inventory?sku=TEE-BLK-S");
    const delta = await screen.findByLabelText("Change on hand");
    await u.clear(delta);
    await u.type(delta, "10");
    await u.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText(/Say why/)).toBeInTheDocument();
    await u.type(screen.getByLabelText("Note"), "Supplier delivery #42");
    await u.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText("Updated.");

    await u.clear(delta);
    await u.type(delta, "0");
    await u.clear(screen.getByLabelText("Note"));
    await u.type(screen.getByLabelText("Low-stock threshold"), "2");
    await u.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(2));
    const [restock, threshold] = calls.filter((c) => c.method === "PATCH");
    expect(restock!.body).toEqual({ delta: 10, reason: "RESTOCK", note: "Supplier delivery #42" });
    expect(threshold!.body).toEqual({ lowStockThreshold: 2 });
    expect(restock!.headers["idempotency-key"]).toBeTruthy();
    expect(threshold!.headers["idempotency-key"]).not.toBe(restock!.headers["idempotency-key"]); // a new action, a new key
  });
});
