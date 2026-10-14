import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import { routes } from "../routes";

export interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  credentials: RequestCredentials | undefined;
}

type Handler = (call: Call) => Response | Promise<Response> | unknown;

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export const problem = (status: number, code: string, detail?: string) =>
  json({ type: "about:blank", title: code, status, code, detail, correlationId: "corr-1" }, status, { "content-type": "application/problem+json" });

/**
 * Replaces fetch. Routes are "METHOD path" (path matched as a prefix, query ignored unless given);
 * a handler returning a plain object is sent as 200 JSON. Unmatched requests fail the test loudly.
 */
export function mockFetch(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const call: Call = {
      method: init.method ?? "GET",
      url: url.toString(),
      headers: Object.fromEntries(Object.entries((init.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      credentials: init.credentials,
    };
    calls.push(call);
    const key = Object.keys(routes)
      .filter((k) => {
        const [method, path] = k.split(" ");
        const target = path!.includes("?") ? url.pathname + url.search : url.pathname;
        return method === call.method && (target === path || target.startsWith(path!.endsWith("/") ? path! : `${path}`));
      })
      .sort((a, b) => b.length - a.length)[0];
    if (!key) throw new Error(`unexpected request: ${call.method} ${call.url}`);
    const out = await routes[key]!(call);
    return out instanceof Response ? out : json(out);
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

export function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router, queryClient };
}

export const money = (amountMinor: number) => ({ amountMinor, currency: "INR" });

export const product = {
  id: "p1",
  slug: "classic-cotton-tee",
  name: "Classic Cotton Tee",
  brand: "Acme",
  category: { id: "c1", name: "T-Shirts", slug: "t-shirts" },
  status: "PUBLISHED",
  featured: true,
  description: "Soft.",
  specifications: { Material: "Cotton" },
  images: [{ url: "https://img.example/tee.jpg", alt: "Tee" }],
  variants: [
    { id: "v1", sku: "TEE-BLK-S", name: "Black, S", attributes: { color: "blk", size: "S" }, price: money(59_900), salePrice: null, effectivePrice: money(59_900), onSale: false, isActive: true },
    { id: "v2", sku: "TEE-BLK-M", name: "Black, M", attributes: { color: "blk", size: "M" }, price: money(59_900), salePrice: null, effectivePrice: money(59_900), onSale: false, isActive: true },
    { id: "v3", sku: "TEE-WHT-S", name: "White, S", attributes: { color: "wht", size: "S" }, price: money(64_900), salePrice: money(49_900), effectivePrice: money(49_900), onSale: true, isActive: true },
  ],
};
