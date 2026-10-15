import { env } from "../config/env";
import type { Money } from "../lib/money";
import { request } from "./http";

export interface Image {
  url: string;
  alt: string | null;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: { id: string; name: string; slug: string } | null;
  lowestPrice: Money | null;
  onSale: boolean;
  featured: boolean;
  primaryImage: Image | null;
  status: string;
}

export interface Variant {
  id: string;
  sku: string;
  /** Optional in the catalog: fall back to the SKU when showing it. */
  name: string | null;
  attributes: Record<string, string>;
  price: Money;
  salePrice: Money | null;
  effectivePrice: Money;
  onSale: boolean;
  isActive: boolean;
}

export interface Product extends Omit<ProductSummary, "lowestPrice" | "primaryImage" | "onSale"> {
  description: string | null;
  variants: Variant[];
  images: Image[];
  specifications: { name: string; value: string }[];
  version: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  children: Category[];
}

export interface ProductQuery {
  q?: string;
  category?: string;
  sort?: "relevance" | "newest" | "price_asc" | "price_desc" | "name";
  featured?: boolean;
  page?: number;
  pageSize?: number;
}

export interface Availability {
  sku: string;
  available: number;
  inStock: boolean;
}

const P = env.VITE_PRODUCT_API_URL;
const I = env.VITE_INVENTORY_API_URL;

export const catalogApi = {
  products: (q: ProductQuery, signal?: AbortSignal) =>
    request<{ data: ProductSummary[]; page: { page: number; pageSize: number; total: number } }>(P, "/api/v1/products", {
      query: { ...q },
      auth: false,
      signal,
    }),
  product: (slug: string, signal?: AbortSignal) => request<Product>(P, `/api/v1/products/by-slug/${encodeURIComponent(slug)}`, { auth: false, signal }),
  categories: () => request<Category[]>(P, "/api/v1/categories", { auth: false }),
  availability: (sku: string, signal?: AbortSignal) =>
    request<Availability>(I, `/api/v1/inventory/${encodeURIComponent(sku)}`, { auth: false, signal }),
};
