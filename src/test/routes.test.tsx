import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderApp } from "./harness";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("routing", () => {
  it("renders the home page with navigation and featured products", async () => {
    mockFetch({ "GET /api/v1/products": () => ({ data: [], page: { page: 1, pageSize: 8, total: 0 } }) });
    renderApp("/");
    expect(screen.getByRole("heading", { level: 1, name: "Welcome" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Featured" })).toBeInTheDocument();
  });

  it("renders a not-found page for unknown routes", () => {
    renderApp("/does-not-exist");
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});

describe("status page", () => {
  it("shows ready, not-ready and unreachable services", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (input.startsWith("http://localhost:4001")) return new Response("{}", { status: 200 });
        if (input.startsWith("http://localhost:4002")) return new Response("{}", { status: 503 });
        throw new TypeError("Failed to fetch");
      }),
    );
    renderApp("/status");
    expect(await screen.findByText("Ready")).toBeInTheDocument();
    expect(await screen.findByText("Not ready")).toBeInTheDocument();
    expect(await screen.findAllByText("Unreachable")).toHaveLength(5);
  });
});
