import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSession } from "../auth/session";
import { useCart } from "../cart/cart";
import { browser } from "../lib/browser";
import { type Call, json, mockFetch, money, problem, renderApp } from "./harness";

const user = { id: "u1", email: "a@example.com", fullName: "Asha Rao", roles: ["customer" as const], emailVerified: true, status: "ACTIVE" };
const status = (s: string, extra: Record<string, unknown> = {}) => ({ sagaId: "saga-1", orderId: "order-1", status: s, checkoutUrl: null, failureReason: null, statusUrl: "/x", ...extra });

beforeEach(() => {
  sessionStorage.clear();
  useSession.getState().setSession({ accessToken: "t", expiresIn: 900, csrfToken: "c", user });
  useCart.getState().clear();
  useCart.getState().add({ sku: "TEE-BLK-S", productSlug: "tee", name: "Tee", variantName: "Black, S", image: null, unitPrice: money(59_900) }, 2);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useSession.getState().clear();
});

async function fillAddress(u: ReturnType<typeof userEvent.setup>, line1 = "1 MG Road") {
  await u.type(screen.getByLabelText("Address line 1"), line1);
  await u.type(screen.getByLabelText("City"), "Pune");
  await u.type(screen.getByLabelText("Postal code"), "411001");
  await u.type(screen.getByLabelText("Phone"), "+919800000001");
}

describe("checkout", () => {
  it("sends only SKUs and quantities, waits for the saga, then goes to the payment page", async () => {
    const assign = vi.spyOn(browser, "assign").mockImplementation(() => undefined);
    let polls = 0;
    const { calls } = mockFetch({
      "POST /api/v1/checkout": () => json(status("PROCESSING"), 202),
      "GET /api/v1/checkout/saga-1": () => (++polls < 2 ? status("PROCESSING") : status("AWAITING_PAYMENT", { checkoutUrl: "http://localhost:4005/mock-provider/checkout/cs_1" })),
    });
    const u = userEvent.setup();
    renderApp("/checkout");
    await fillAddress(u);
    await u.click(screen.getByRole("button", { name: "Continue to payment" }));
    // Real 1 s polling intervals: allow for a slow machine.
    await waitFor(() => expect(assign).toHaveBeenCalledWith("http://localhost:4005/mock-provider/checkout/cs_1"), { timeout: 10_000 });

    const start = calls.find((c) => c.method === "POST")!;
    expect(start.body).toEqual({
      items: [{ sku: "TEE-BLK-S", quantity: 2 }], // no prices, no totals
      currency: "INR",
      shippingAddress: { name: "Asha Rao", line1: "1 MG Road", city: "Pune", postalCode: "411001", country: "IN", phone: "+919800000001" },
    });
    expect(start.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(start.headers.authorization).toBe("Bearer t");
  });

  it("a retry of the same checkout reuses its idempotency key; a changed address is a new attempt", async () => {
    vi.spyOn(browser, "assign").mockImplementation(() => undefined);
    let n = 0;
    const { calls } = mockFetch({
      "POST /api/v1/checkout": () => (++n === 1 ? problem(503, "DEPENDENCY_UNAVAILABLE") : json(status("AWAITING_PAYMENT", { checkoutUrl: "http://localhost:4005/mock-provider/checkout/cs_1" }), 202)),
    });
    const u = userEvent.setup();
    renderApp("/checkout");
    await fillAddress(u);
    await u.click(screen.getByRole("button", { name: "Continue to payment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong on our side");
    await u.click(screen.getByRole("button", { name: "Continue to payment" }));
    await waitFor(() => expect(calls.filter((c: Call) => c.method === "POST")).toHaveLength(2));
    const [first, second] = calls.filter((c: Call) => c.method === "POST");
    expect(second!.headers["idempotency-key"]).toBe(first!.headers["idempotency-key"]);

    const { idempotencyKeyFor } = await import("../checkout/checkout");
    const changed = { ...(second!.body as { shippingAddress: object }), shippingAddress: { ...(second!.body as { shippingAddress: object }).shippingAddress, line1: "2 MG Road" } };
    expect(idempotencyKeyFor(changed as never)).not.toBe(first!.headers["idempotency-key"]);
  });

  it("refuses to send the browser to a payment URL on an unexpected origin", async () => {
    const assign = vi.spyOn(browser, "assign").mockImplementation(() => undefined);
    mockFetch({
      "POST /api/v1/checkout": () => json(status("AWAITING_PAYMENT", { checkoutUrl: "https://evil.example/pay" }), 202),
      "GET /api/v1/checkout/saga-1": () => status("AWAITING_PAYMENT", { checkoutUrl: "https://evil.example/pay" }),
    });
    const u = userEvent.setup();
    const { router } = renderApp("/checkout");
    await fillAddress(u);
    await u.click(screen.getByRole("button", { name: "Continue to payment" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/checkout/result"));
    expect(assign).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Return to payment" })).not.toBeInTheDocument();
  });
});

describe("checkout limits", () => {
  it("explains the open-checkouts limit instead of a generic 'too many attempts'", async () => {
    mockFetch({ "POST /api/v1/checkout": () => problem(429, "TOO_MANY_ACTIVE_CHECKOUTS") });
    const u = userEvent.setup();
    renderApp("/checkout");
    await fillAddress(u);
    await u.click(screen.getByRole("button", { name: "Continue to payment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You already have checkouts waiting for payment");
  });
});

describe("payment result page", () => {
  it("?result=success proves nothing: until the saga says COMPLETED it keeps waiting, then confirms and empties the cart", async () => {
    let completed = false;
    mockFetch({ "GET /api/v1/checkout/saga-1": () => (completed ? status("COMPLETED") : status("AWAITING_PAYMENT", { checkoutUrl: "http://localhost:4005/mock-provider/checkout/cs_1" })) });
    renderApp("/checkout/result?saga=saga-1&result=success");
    expect(await screen.findByRole("heading", { name: "Confirming your payment…" })).toBeInTheDocument();
    expect(useCart.getState().lines).toHaveLength(1);
    completed = true;
    expect(await screen.findByRole("heading", { name: /Your order is confirmed/ }, { timeout: 5_000 })).toBeInTheDocument();
    expect(useCart.getState().lines).toHaveLength(0);
    expect(screen.getByRole("link", { name: "View your order" })).toHaveAttribute("href", "/account/orders/order-1");
  });

  it("came back without paying: offers to return to the payment page", async () => {
    mockFetch({ "GET /api/v1/checkout/saga-1": () => status("AWAITING_PAYMENT", { checkoutUrl: "http://localhost:4005/mock-provider/checkout/cs_1" }) });
    renderApp("/checkout/result?saga=saga-1&result=cancelled");
    expect(await screen.findByRole("heading", { name: "Payment not completed" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to payment" })).toHaveAttribute("href", "http://localhost:4005/mock-provider/checkout/cs_1");
  });

  it("a cancelled checkout explains why and keeps the cart", async () => {
    mockFetch({ "GET /api/v1/checkout/saga-1": () => status("CANCELLED", { failureReason: "INSUFFICIENT_STOCK" }) });
    renderApp("/checkout/result?saga=saga-1");
    expect(await screen.findByText(/sold out before we could reserve/)).toBeInTheDocument();
    expect(useCart.getState().lines).toHaveLength(1);
  });
});

describe("notification preferences", () => {
  it("SMS needs a phone number; saving sends the full preference document", async () => {
    const { calls } = mockFetch({
      "GET /api/v1/notifications/preferences": () => ({ preferences: { email: { orderUpdates: true, marketing: false }, sms: { orderUpdates: false, phone: null } } }),
      "GET /api/v1/notifications/history": () => ({ data: [], page: { limit: 20, nextCursor: null } }),
      "PUT /api/v1/notifications/preferences": (c: Call) => ({ preferences: c.body }),
    });
    const u = userEvent.setup();
    renderApp("/account/notifications");
    await u.click(await screen.findByLabelText("Order updates by SMS"));
    await u.click(screen.getByRole("button", { name: "Save preferences" }));
    expect(await screen.findByText("Add a phone number to get SMS updates")).toBeInTheDocument();
    await u.type(screen.getByLabelText("Mobile number"), "+919800000001");
    await u.click(screen.getByRole("button", { name: "Save preferences" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({ email: { orderUpdates: true, marketing: false }, sms: { orderUpdates: true, phone: "+919800000001" } });
  });
});
