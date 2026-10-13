import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routes } from "../routes";

function renderAt(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("routing", () => {
  it("renders the home page with navigation", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1, name: "Welcome" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("renders a not-found page for unknown routes", () => {
    renderAt("/does-not-exist");
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
    renderAt("/status");
    expect(await screen.findByText("Ready")).toBeInTheDocument();
    expect(await screen.findByText("Not ready")).toBeInTheDocument();
    expect(await screen.findAllByText("Unreachable")).toHaveLength(5);
  });
});
