import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { adminApi } from "../../api/admin";
import { type Category, catalogApi, type Product, type Variant } from "../../api/catalog";
import { ApiError } from "../../api/http";
import { Alert, Button, ErrorAlert, Field, PageTitle, Spinner } from "../../components/ui";
import { formatMoney, parseMajor, toMajorString } from "../../lib/money";
import { FilterSelect, Td, Th } from "./AdminLayout";

const STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

function flatten(categories: Category[], depth = 0): { id: string; label: string }[] {
  return categories.flatMap((c) => [{ id: c.id, label: `${"— ".repeat(depth)}${c.name}` }, ...flatten(c.children, depth + 1)]);
}

export function AdminProductsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const list = useQuery({ queryKey: ["admin", "products", { q, status, page }], queryFn: () => adminApi.products({ q: q || undefined, status: status || undefined, page }) });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.page.total / list.data.page.pageSize)) : 1;
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== "page") next.delete("page");
    setParams(next);
  };
  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>Products</PageTitle>
        <Link to="/admin/products/new" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          New product
        </Link>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <form role="search" onSubmit={(e) => (e.preventDefault(), set("q", String(new FormData(e.currentTarget).get("q") ?? "").trim()))}>
          <label className="flex flex-col text-sm">
            <span className="font-medium">Search</span>
            <input name="q" type="search" defaultValue={q} className="rounded-md border border-slate-300 px-3 py-2" />
          </label>
        </form>
        <FilterSelect label="Status" value={status} options={STATUSES} onChange={(v) => set("status", v)} />
      </div>
      {list.isPending && <Spinner />}
      <ErrorAlert error={list.error} />
      {list.data && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200"><Th>Name</Th><Th>Category</Th><Th>Status</Th><Th right>From</Th></tr>
          </thead>
          <tbody>
            {list.data.data.map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <Td><Link to={`/admin/products/${p.id}`} className="underline">{p.name}</Link>{p.featured && <span className="ml-2 text-xs text-slate-500">featured</span>}</Td>
                <Td>{p.category?.name ?? "—"}</Td>
                <Td>{p.status}</Td>
                <Td right>{formatMoney(p.lowestPrice)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-3 text-sm">
          <Button variant="secondary" disabled={page <= 1} onClick={() => set("page", String(page - 1))}>Previous</Button>
          Page {page} of {pages}
          <Button variant="secondary" disabled={page >= pages} onClick={() => set("page", String(page + 1))}>Next</Button>
        </nav>
      )}
    </section>
  );
}

// ------------------------------------------------------------------------------------- create
export function AdminNewProductPage() {
  const navigate = useNavigate();
  const categories = useQuery({ queryKey: ["categories"], queryFn: catalogApi.categories });
  const [formError, setFormError] = useState<string | null>(null);
  const create = useMutation({ mutationFn: adminApi.createProduct, onSuccess: (p) => navigate(`/admin/products/${p.id}`, { replace: true }) });
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const price = parseMajor(get("price"), "INR");
    if (!get("name") || !get("categoryId") || !get("sku")) return setFormError("Name, category and SKU are required.");
    if (price === null || price <= 0) return setFormError("Enter a price like 599 or 599.00.");
    setFormError(null);
    create.mutate({
      name: get("name"),
      categoryId: get("categoryId"),
      brand: get("brand") || null,
      description: get("description") || undefined,
      status: get("status") as "DRAFT" | "PUBLISHED",
      featured: f.get("featured") === "on",
      variants: [{ sku: get("sku").toUpperCase(), name: get("variantName") || undefined, price: { amountMinor: price, currency: "INR" } }],
      images: get("imageUrl") ? [{ url: get("imageUrl"), alt: get("name") }] : [],
    });
  };
  return (
    <section aria-labelledby="page-title" className="max-w-2xl space-y-4">
      <PageTitle>New product</PageTitle>
      {formError && <Alert>{formError}</Alert>}
      <ErrorAlert error={create.error} />
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Name" name="name" required className="sm:col-span-2" />
        <div className="space-y-1">
          <label htmlFor="categoryId" className="block text-sm font-medium">Category</label>
          <select id="categoryId" name="categoryId" className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Choose…</option>
            {flatten(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <Field label="Brand" name="brand" />
        <Field label="First SKU" name="sku" hint="Upper-case letters, digits and dashes, e.g. TEE-NEW-BLK-M" />
        <Field label="Variant name" name="variantName" placeholder="Black, M" />
        <Field label="Price (INR)" name="price" inputMode="decimal" placeholder="599.00" />
        <div className="space-y-1">
          <label htmlFor="status" className="block text-sm font-medium">Status</label>
          <select id="status" name="status" className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="DRAFT">Draft (hidden)</option>
            <option value="PUBLISHED">Published</option>
          </select>
        </div>
        <Field label="Image URL" name="imageUrl" type="url" className="sm:col-span-2" />
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="featured" /> Featured on the home page</label>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="description" className="block text-sm font-medium">Description</label>
          <textarea id="description" name="description" rows={4} className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <p className="text-sm text-slate-600 sm:col-span-2">New SKUs start with zero stock: restock them on the Inventory page.</p>
        <Button type="submit" disabled={create.isPending}>Create product</Button>
      </form>
    </section>
  );
}

// --------------------------------------------------------------------------------------- edit
export function AdminProductPage() {
  const { productId = "" } = useParams();
  const product = useQuery({ queryKey: ["admin", "product", productId], queryFn: () => adminApi.product(productId) });
  if (product.isPending) return <Spinner />;
  if (product.error) return <ErrorAlert error={product.error} />;
  return <ProductEditor product={product.data} key={`${product.data.id}:${product.data.version}`} />;
}

function ProductEditor({ product }: { product: Product }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "product", product.id] });
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: (body: Parameters<typeof adminApi.updateProduct>[2]) => adminApi.updateProduct(product.id, product.version, body),
    onSuccess: (p) => {
      setSaved(true);
      queryClient.setQueryData(["admin", "product", product.id], p);
      void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });
  const conflict = save.error instanceof ApiError && save.error.status === 412;
  return (
    <section aria-labelledby="page-title" className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <PageTitle>{product.name}</PageTitle>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{product.status}</span>
        {product.status === "PUBLISHED" && <Link to={`/products/${product.slug}`} className="text-sm underline">View in shop</Link>}
      </div>
      {conflict ? (
        <Alert>
          Someone else changed this product while you were editing. <Button variant="link" onClick={() => void refresh()}>Reload the latest version</Button> and apply your changes again.
        </Alert>
      ) : (
        <ErrorAlert error={save.error} />
      )}
      {saved && !save.error && <Alert kind="success">Saved.</Alert>}
      <form
        className="grid max-w-2xl gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setSaved(false);
          save.mutate({
            name: String(f.get("name")).trim(),
            brand: String(f.get("brand")).trim() || null,
            description: String(f.get("description")),
            status: f.get("status") as (typeof STATUSES)[number],
            featured: f.get("featured") === "on",
          });
        }}
      >
        <Field label="Name" name="name" defaultValue={product.name} className="sm:col-span-2" />
        <Field label="Brand" name="brand" defaultValue={product.brand ?? ""} />
        <div className="space-y-1">
          <label htmlFor="status" className="block text-sm font-medium">Status</label>
          <select id="status" name="status" defaultValue={product.status} className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="featured" defaultChecked={product.featured} /> Featured</label>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="description" className="block text-sm font-medium">Description</label>
          <textarea id="description" name="description" rows={4} defaultValue={product.description ?? ""} className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <Button type="submit" disabled={save.isPending}>Save product</Button>
      </form>

      <section aria-labelledby="variants-title" className="space-y-3">
        <h2 id="variants-title" className="text-lg font-semibold">Variants</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200"><Th>SKU</Th><Th>Name</Th><Th>Price (INR)</Th><Th>Sale price</Th><Th>Active</Th><Th>{""}</Th></tr>
          </thead>
          <tbody>{product.variants.map((v) => <VariantRow key={`${v.id}:${v.price.amountMinor}:${v.salePrice?.amountMinor}:${v.isActive}`} productId={product.id} variant={v} onSaved={refresh} />)}</tbody>
        </table>
        <AddVariant productId={product.id} onSaved={refresh} />
      </section>
    </section>
  );
}

function VariantRow({ productId, variant: v, onSaved }: { productId: string; variant: Variant; onSaved: () => unknown }) {
  const [price, setPrice] = useState(toMajorString(v.price));
  const [sale, setSale] = useState(v.salePrice ? toMajorString(v.salePrice) : "");
  const [active, setActive] = useState(v.isActive);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({ mutationFn: (body: Parameters<typeof adminApi.updateVariant>[2]) => adminApi.updateVariant(productId, v.id, body), onSuccess: onSaved });
  const submit = () => {
    const p = parseMajor(price, v.price.currency);
    const s = sale.trim() ? parseMajor(sale, v.price.currency) : null;
    if (p === null || p <= 0 || (sale.trim() && (s === null || s <= 0))) return setError("Enter amounts like 599.00");
    if (s !== null && s >= p) return setError("The sale price must be below the price");
    setError(null);
    save.mutate({ price: { amountMinor: p, currency: v.price.currency }, salePrice: s === null ? null : { amountMinor: s, currency: v.price.currency }, isActive: active });
  };
  return (
    <tr className="border-b border-slate-100">
      <Td mono>{v.sku}</Td>
      <Td>{v.name}</Td>
      <Td><input aria-label={`Price of ${v.sku}`} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="w-24 rounded border border-slate-300 px-2 py-1" /></Td>
      <Td><input aria-label={`Sale price of ${v.sku}`} value={sale} onChange={(e) => setSale(e.target.value)} inputMode="decimal" placeholder="none" className="w-24 rounded border border-slate-300 px-2 py-1" /></Td>
      <Td><input type="checkbox" aria-label={`${v.sku} is active`} checked={active} onChange={(e) => setActive(e.target.checked)} /></Td>
      <Td>
        <Button variant="secondary" onClick={submit} disabled={save.isPending}>Save</Button>
        {(error || save.error) && <p role="alert" className="mt-1 text-xs text-red-700">{error ?? (save.error as Error).message}</p>}
      </Td>
    </tr>
  );
}

function AddVariant({ productId, onSaved }: { productId: string; onSaved: () => unknown }) {
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({ mutationFn: (body: Parameters<typeof adminApi.addVariant>[1]) => adminApi.addVariant(productId, body), onSuccess: onSaved });
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const price = parseMajor(String(f.get("price")), "INR");
        const attrs = Object.fromEntries(
          String(f.get("attributes") ?? "")
            .split(",")
            .map((pair) => pair.split("=").map((x) => x.trim()))
            .filter((kv): kv is [string, string] => kv.length === 2 && !!kv[0] && !!kv[1]),
        );
        if (!String(f.get("sku")).trim() || price === null || price <= 0) return setError("SKU and a price like 599.00 are required");
        setError(null);
        add.mutate({ sku: String(f.get("sku")).trim().toUpperCase(), name: String(f.get("name")).trim() || undefined, attributes: attrs, price: { amountMinor: price, currency: "INR" } }, { onSuccess: () => e.currentTarget?.reset() });
      }}
    >
      <Field label="New SKU" name="sku" />
      <Field label="Name" name="name" placeholder="White, L" />
      <Field label="Attributes" name="attributes" placeholder="color=wht, size=L" />
      <Field label="Price (INR)" name="price" inputMode="decimal" />
      <Button type="submit" variant="secondary" disabled={add.isPending}>Add variant</Button>
      {(error || add.error) && <p role="alert" className="w-full text-sm text-red-700">{error ?? (add.error as Error).message}</p>}
    </form>
  );
}
