# ecommerce-frontend

React storefront and admin UI for the e-commerce platform.

| | |
|---|---|
| Stack | React 19, Vite 8, TypeScript 5.9, Tailwind CSS 4, React Router 8, TanStack Query 5, Zustand 5, React Hook Form + Zod. HTTP is a small `fetch` wrapper (`src/api/http.ts`): no Axios |
| Port | 5173 (dev server; container serves on 8080, mapped to 5173 in compose) |
| Backends | Configured via `VITE_*_API_URL` (see [.env.example](.env.example)) |

## Status

| Phase | Done |
|---|---|
| 1: skeleton | ✅ App shell (layout, skip link, nav), routing with 404, validated env config, Tailwind, `/status` page that health-checks every backend (verifies CORS end to end), tests, Dockerfile (nginx-unprivileged), CI |
| 5a | ✅ API client (problem+json errors, single-flight token refresh, cross-tab lock), session (memory-only access token), sign-in/register/forgot/reset/verify, catalog (search, category, sort, paging in the URL), product page (variant picker, live stock), cart (persisted, live stock checks), account |
| 5b | ✅ Checkout (one idempotency key per attempt, waits for the saga, payment redirect only to the Payment Service or Stripe), payment result driven by the saga's status (never by `?result=success`), order history and detail, notification preferences and history |
| 5c | ✅ Admin area (lazy-loaded chunk): overview of what needs attention, products (create, edit with If-Match, variant prices in exact minor units), inventory (adjust with audit note, thresholds, movement history), orders (fulfilment steps), payments (refunds bounded by what is left, one idempotency key per refund), checkouts (step history, retry, resolve manual review), users (suspend/reactivate), notifications (log, retry, dead letters) |
| 5d | ✅ Strict Content-Security-Policy generated at image build (connect-src = exactly the baked-in API origins), served by the compose stack on :5173; Playwright smoke test of the whole platform in a real browser |

## Run locally

```bash
cp .env.example .env
npm install
npm run dev          # http://localhost:5173, then open /status
npm test
npm run build && npm run preview
npm run e2e          # Playwright, against the WHOLE running stack (see below)
```

## End-to-end smoke test

`e2e/smoke.spec.ts` drives headless Chromium through the real platform: register → reload (session
survives via the HttpOnly refresh cookie; no token in web storage) → search → product → cart → checkout →
the Payment Service's hosted page (another origin) → Pay → result page confirmed by the saga → order page →
sign out → admin signs in and moves the order to PROCESSING. It fails on any CSP violation or page error.

```bash
# in ecommerce-infrastructure: docker compose --profile apps up -d   (frontend on :5173)
npx playwright install --only-shell chromium     # once
E2E_ADMIN_PASSWORD='…' npm run e2e
```

It needs every service, so it is not part of CI here (CI runs lint, typecheck, unit tests, build).

## Rules this app follows

- **The browser is never authoritative.** Prices, totals, stock, payment status and
  permissions shown here are *display copies*. The services re-derive or verify all of them.
  The cart sends only `{ sku, quantity }`.
- Payment success is shown only after the Saga Orchestrator reports `COMPLETED`, never because
  the payment provider redirected back with `?status=success`.
- Access tokens are kept in memory. The refresh token is an `HttpOnly` cookie that JavaScript
  cannot read (see Auth Service docs).
- `VITE_*` variables are public and baked in at build time. Never put secrets in them.
- The cart stores `{ sku, quantity }` plus display copies; checkout sends SKUs, quantities and the address only.
- One idempotency key per checkout attempt and per admin action: retries never duplicate an order or a refund.
- The browser is only ever sent to pay at the Payment Service's origin or `checkout.stripe.com`.
- Admin code is a separate chunk, requested only after the role check passes.
- Content-Security-Policy: scripts and styles from this origin only, API calls only to the configured services.
- Generated API clients replace hand-written calls in Phase 6, when `ecommerce-contracts` exists.
