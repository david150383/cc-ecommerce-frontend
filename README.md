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
| 5c–5d | ⏳ Admin pages, compose + end-to-end smoke test |

## Run locally

```bash
cp .env.example .env
npm install
npm run dev          # http://localhost:5173, then open /status
npm test
npm run build && npm run preview
```

## Rules this app follows

- **The browser is never authoritative.** Prices, totals, stock, payment status and
  permissions shown here are *display copies*. The services re-derive or verify all of them.
  The cart sends only `{ sku, quantity }`.
- Payment success is shown only after the Saga Orchestrator reports `COMPLETED`, never because
  the payment provider redirected back with `?status=success`.
- Access tokens are kept in memory. The refresh token is an `HttpOnly` cookie that JavaScript
  cannot read (see Auth Service docs).
- `VITE_*` variables are public and baked in at build time. Never put secrets in them.
- Generated API clients replace hand-written calls in Phase 6, when `ecommerce-contracts` exists.
