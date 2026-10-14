import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { ApiError } from "./api/http";
import { bootstrapSession } from "./auth/session";
import "./index.css";
import { routes } from "./routes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry only what might succeed: network errors and 5xx, not 4xx.
      retry: (count, err) => count < 2 && !(err instanceof ApiError && err.status < 500),
    },
  },
});

const router = createBrowserRouter(routes);

void bootstrapSession(); // resume a session from the refresh cookie, if any

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
