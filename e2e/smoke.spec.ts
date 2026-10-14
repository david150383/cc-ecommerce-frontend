import { expect, type Page, request, test } from "@playwright/test";

const AUTH = "http://localhost:4001";
const INVENTORY = "http://localhost:4003";
const ADMIN_EMAIL = "admin@shop.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "shop owner passphrase 2026";
const SKU = "TEE-CLASSIC-BLK-S";

/** Fails the test on any Content-Security-Policy violation or uncaught page error. */
function watchForProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(e.message));
  return problems;
}

test.beforeAll(async () => {
  // Make sure the SKU we buy is in stock (through the real admin API).
  const api = await request.newContext();
  const login = await api.post(`${AUTH}/api/v1/auth/login`, { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  expect(login.ok(), "admin login (set E2E_ADMIN_PASSWORD)").toBeTruthy();
  const { accessToken } = (await login.json()) as { accessToken: string };
  const restock = await api.patch(`${INVENTORY}/api/v1/inventory/${SKU}`, {
    headers: { authorization: `Bearer ${accessToken}`, "idempotency-key": crypto.randomUUID() },
    data: { delta: 5, reason: "RESTOCK", note: "e2e smoke test" },
  });
  expect(restock.ok()).toBeTruthy();
  await api.dispose();
});

test("a customer registers, buys a T-shirt through the hosted payment page, and an admin fulfils it", async ({ page }) => {
  const problems = watchForProblems(page);
  const email = `e2e-${Date.now()}@example.com`;
  const password = "a long e2e passphrase";

  // ---- register (lands signed in) ------------------------------------------------------------
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Eve Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();

  // ---- the session survives a reload (memory token gone; HttpOnly refresh cookie + CSRF) -------
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toMatch(/eyJ/); // no JWT in web storage

  // ---- browse and add to cart ----------------------------------------------------------------
  await page.goto("/products?q=cotton");
  await page.getByRole("link", { name: /Classic Cotton Tee/ }).first().click();
  await expect(page.getByRole("heading", { name: "Classic Cotton Tee" })).toBeVisible();
  await page.getByRole("radio", { name: "BLK" }).check({ force: true });
  await page.getByRole("radio", { name: "S", exact: true }).check({ force: true });
  await expect(page.getByText(/In stock|left/)).toBeVisible();
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "View cart" }).click();
  await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
  await page.getByRole("button", { name: "Check out" }).click();

  // ---- checkout → saga → hosted payment page (another origin) -> back ----------------------
  await page.getByLabel("Address line 1").fill("1 Playwright Lane");
  await page.getByLabel("City").fill("Pune");
  await page.getByLabel("Postal code").fill("411001");
  await page.getByLabel("Phone").fill("+919800000005");
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.waitForURL(/localhost:4005\/mock-provider\/checkout\//, { timeout: 60_000 });
  await page.getByRole("button", { name: "Pay" }).click();
  await page.waitForURL(/\/checkout\/result\?saga=/);
  await expect(page.getByRole("heading", { name: /Your order is confirmed/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: "Cart" })).not.toContainText(/\d/); // cart emptied

  // ---- the order, from the customer's side ---------------------------------------------------
  await page.getByRole("link", { name: "View your order" }).click();
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  const orderHeading = await page.getByRole("heading", { level: 1 }).textContent();
  const shortId = orderHeading!.match(/#([0-9A-F]{8})/)![1]!;

  // ---- sign out; an admin marks it as being prepared --------------------------------------------
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.goto("/login?next=/admin/orders");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await page.getByRole("link", { name: `#${shortId}` }).click();
  await page.getByLabel(/Note for "PROCESSING"/).fill("Picked by e2e");
  await page.getByRole("button", { name: "Mark as processing" }).click();
  await expect(page.getByRole("button", { name: "Mark as shipped" })).toBeVisible();

  expect(problems, "CSP violations or page errors").toEqual([]);
});
