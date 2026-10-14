import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Money } from "../lib/money";

/**
 * The cart lives in the browser (localStorage). What matters is { sku, quantity }: that is all the
 * checkout sends. Name, image and price are DISPLAY copies taken when the item was added; the Order
 * Service prices the order from the catalog, so a stale copy can never change what is charged.
 */
export interface CartLine {
  sku: string;
  quantity: number;
  productSlug: string;
  name: string;
  variantName: string;
  image: string | null;
  unitPrice: Money;
}

export const MAX_QUANTITY = 10;
export const MAX_LINES = 50;

interface CartState {
  lines: CartLine[];
  add(line: Omit<CartLine, "quantity">, quantity?: number): void;
  setQuantity(sku: string, quantity: number): void;
  remove(sku: string): void;
  clear(): void;
}

const clamp = (n: number) => Math.max(1, Math.min(MAX_QUANTITY, Math.floor(n)));

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (line, quantity = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.sku === line.sku);
          if (existing) return { lines: s.lines.map((l) => (l.sku === line.sku ? { ...l, ...line, quantity: clamp(l.quantity + quantity) } : l)) };
          if (s.lines.length >= MAX_LINES) return s;
          return { lines: [...s.lines, { ...line, quantity: clamp(quantity) }] };
        }),
      setQuantity: (sku, quantity) => set((s) => ({ lines: s.lines.map((l) => (l.sku === sku ? { ...l, quantity: clamp(quantity) } : l)) })),
      remove: (sku) => set((s) => ({ lines: s.lines.filter((l) => l.sku !== sku) })),
      clear: () => set({ lines: [] }),
    }),
    {
      name: "cart.v1",
      storage: createJSONStorage(() => localStorage),
      // Never trust what was stored: drop anything malformed (old versions, manual edits).
      merge: (persisted, current) => {
        const lines = (persisted as { lines?: unknown })?.lines;
        const valid = Array.isArray(lines)
          ? (lines as CartLine[]).filter((l) => typeof l?.sku === "string" && Number.isInteger(l.quantity) && l.quantity >= 1 && typeof l.unitPrice?.amountMinor === "number")
          : [];
        return { ...current, lines: valid.slice(0, MAX_LINES).map((l) => ({ ...l, quantity: clamp(l.quantity) })) };
      },
    },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0);

/** Display-only estimate; the order's totals (with tax, discounts) come from the Order Service. */
export function cartSubtotal(lines: CartLine[]): Money | null {
  if (lines.length === 0) return null;
  const currency = lines[0]!.unitPrice.currency;
  return { amountMinor: lines.reduce((n, l) => n + l.unitPrice.amountMinor * l.quantity, 0), currency };
}
