import { defineConfig } from "@playwright/test";

/**
 * End-to-end smoke test against the WHOLE running platform (ecommerce-infrastructure compose,
 * frontend on :5173). Not part of `npm test`: run `npm run e2e` with the stack up.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1, // one browser: kind to small machines, and the flow is sequential anyway
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
