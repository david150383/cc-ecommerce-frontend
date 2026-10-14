import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSession } from "../auth/session";
import { useCart } from "../cart/cart";
import { json, mockFetch, money, problem, product, renderApp } from "./harness";

beforeEach(() => {
  useSession.getState().clear();
  useCart.getState().clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("product page", () => {
  it("picks variants by attribute, shows stock, and adds the chosen SKU to the cart", async () => {
    mockFetch({
      "GET /api/v1/products/by-slug/classic-cotton-tee": () => product,
      "GET /api/v1/inventory/TEE-BLK-S": () => ({ sku: "TEE-BLK-S", available: 3, inStock: true }),
      "GET /api/v1/inventory/TEE-WHT-S": () => ({ sku: "TEE-WHT-S", available: 0, inStock: false }),
    });
    const user = userEvent.setup();
    renderApp("/products/classic-cotton-tee");
    expect(await screen.findByRole("heading", { name: "Classic Cotton Tee" })).toBeInTheDocument();
    expect(await screen.findByText("Only 3 left")).toBeInTheDocument();

    // White exists only in S: picking white must keep a valid size; M is disabled for white.
    await user.click(screen.getByRole("radio", { name: "WHT" }));
    expect(screen.getByRole("radio", { name: "M" })).toBeDisabled();
    expect(await screen.findByText("Out of stock")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to cart" })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "BLK" }));
    await screen.findByText("Only 3 left");
    await user.selectOptions(screen.getByLabelText("Quantity"), "2");
    await user.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(useCart.getState().lines).toEqual([expect.objectContaining({ sku: "TEE-BLK-S", quantity: 2, unitPrice: money(59_900) })]);
    expect(screen.getByText(/Added to your cart/)).toBeInTheDocument();
  });
});

describe("cart page", () => {
  it("warns about lines that can no longer be fulfilled and blocks checkout", async () => {
    useCart.getState().add({ sku: "TEE-BLK-S", productSlug: "tee", name: "Tee", variantName: "Black, S", image: null, unitPrice: money(59_900) }, 4);
    mockFetch({ "GET /api/v1/inventory/TEE-BLK-S": () => ({ sku: "TEE-BLK-S", available: 2, inStock: true }) });
    renderApp("/cart");
    expect(await screen.findByText(/Only 2 left/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check out" })).toBeDisabled();
    expect(screen.getByText("₹2,396.00", { selector: "p > span" })).toBeInTheDocument();
  });
});

describe("catalog", () => {
  it("filters by category: readable slug in the URL, id sent to the Product Service", async () => {
    const { calls } = mockFetch({
      "GET /api/v1/categories": () => [{ id: "c-uuid", name: "T-Shirts", slug: "t-shirts", parentId: null, children: [] }],
      "GET /api/v1/products": () => ({ data: [], page: { page: 1, pageSize: 12, total: 0 } }),
    });
    renderApp("/products?category=t-shirts");
    expect(await screen.findByText("No products match.")).toBeInTheDocument();
    const listCall = calls.find((c) => c.url.includes("/api/v1/products?"))!;
    expect(new URL(listCall.url).searchParams.get("category")).toBe("c-uuid");
  });
});

describe("sign in", () => {
  it("one message for any credential failure (no account enumeration)", async () => {
    mockFetch({ "POST /api/v1/auth/login": () => problem(401, "INVALID_CREDENTIALS", "Invalid email or password") });
    const user = userEvent.setup();
    renderApp("/login");
    await user.type(screen.getByLabelText("Email"), "nobody@example.com");
    await user.type(screen.getByLabelText("Password"), "whatever-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
  });

  it("protected pages send visitors to sign in and back afterwards", async () => {
    const user = { id: "u1", email: "a@example.com", fullName: "Asha", roles: ["customer"], emailVerified: true, status: "ACTIVE" };
    const { calls } = mockFetch({ "POST /api/v1/auth/login": () => json({ accessToken: "t", expiresIn: 900, csrfToken: "c", user }) });
    const u = userEvent.setup();
    const { router } = renderApp("/account");
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    await u.type(screen.getByLabelText("Email"), "a@example.com");
    await u.type(screen.getByLabelText("Password"), "a long passphrase");
    await u.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Your account" })).toBeInTheDocument();
    expect(calls[0]).toMatchObject({ credentials: "include", body: { email: "a@example.com" } });
  });
});

describe("reset password link", () => {
  it("removes the secret token from the address bar as soon as it is read, and uses it", async () => {
    window.history.replaceState(null, "", "/reset-password?token=one-time-secret");
    const { calls } = mockFetch({ "POST /api/v1/auth/reset-password": () => new Response(null, { status: 204 }) });
    const user = userEvent.setup();
    renderApp("/reset-password?token=one-time-secret");
    await waitFor(() => expect(window.location.search).toBe(""));
    await user.type(screen.getByLabelText("New password"), "a brand new passphrase");
    await user.type(screen.getByLabelText("Confirm new password"), "a brand new passphrase");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText(/signed out everywhere/)).toBeInTheDocument();
    expect(calls[0]!.body).toEqual({ token: "one-time-secret", newPassword: "a brand new passphrase" });
  });

  it("explains an expired link", async () => {
    mockFetch({ "POST /api/v1/auth/reset-password": () => problem(400, "INVALID_OR_EXPIRED_TOKEN") });
    const user = userEvent.setup();
    renderApp("/reset-password?token=old");
    await user.type(screen.getByLabelText("New password"), "a brand new passphrase");
    await user.type(screen.getByLabelText("Confirm new password"), "a brand new passphrase");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(within(await screen.findByRole("alert")).getByRole("link", { name: "Request a new one" })).toBeInTheDocument();
  });
});
