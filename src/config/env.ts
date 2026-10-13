import { z } from "zod";

// Backend URLs come from VITE_* variables, which Vite inlines at BUILD time.
// They are public: never put secrets in VITE_* variables.
const EnvSchema = z.object({
  VITE_AUTH_API_URL: z.url().default("http://localhost:4001"),
  VITE_PRODUCT_API_URL: z.url().default("http://localhost:4002"),
  VITE_INVENTORY_API_URL: z.url().default("http://localhost:4003"),
  VITE_ORDER_API_URL: z.url().default("http://localhost:4004"),
  VITE_PAYMENT_API_URL: z.url().default("http://localhost:4005"),
  VITE_NOTIFICATION_API_URL: z.url().default("http://localhost:4006"),
  VITE_SAGA_API_URL: z.url().default("http://localhost:4007"),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid frontend configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const env = parseEnv(import.meta.env);

export const services = [
  { name: "Auth", url: env.VITE_AUTH_API_URL },
  { name: "Product", url: env.VITE_PRODUCT_API_URL },
  { name: "Inventory", url: env.VITE_INVENTORY_API_URL },
  { name: "Order", url: env.VITE_ORDER_API_URL },
  { name: "Payment", url: env.VITE_PAYMENT_API_URL },
  { name: "Notification", url: env.VITE_NOTIFICATION_API_URL },
  { name: "Saga", url: env.VITE_SAGA_API_URL },
] as const;
