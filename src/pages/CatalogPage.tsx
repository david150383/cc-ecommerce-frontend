import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { type Category, catalogApi, type ProductQuery } from "../api/catalog";
import { ProductGrid } from "../components/ProductCard";
import { Button, ErrorAlert, PageTitle, Spinner } from "../components/ui";

const SORTS: { value: NonNullable<ProductQuery["sort"]>; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "name", label: "Name" },
];
const PAGE_SIZE = 12;

function flatten(categories: Category[], depth = 0): { id: string; slug: string; label: string }[] {
  return categories.flatMap((c) => [{ id: c.id, slug: c.slug, label: `${"— ".repeat(depth)}${c.name}` }, ...flatten(c.children, depth + 1)]);
}

/** Search, filter, sort and page: all state lives in the URL, so it is shareable and survives reloads. */
export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const sort = (params.get("sort") as ProductQuery["sort"]) || (q ? "relevance" : "newest");
  const page = Math.max(1, Number(params.get("page")) || 1);

  const categories = useQuery({ queryKey: ["categories"], queryFn: catalogApi.categories, staleTime: 5 * 60_000 });
  const flat = flatten(categories.data ?? []);
  // The URL keeps the readable slug; the Product Service filters by id (subcategories included).
  const categoryId = flat.find((c) => c.slug === category)?.id;
  const products = useQuery({
    queryKey: ["products", { q, categoryId, sort, page }],
    queryFn: ({ signal }) => catalogApi.products({ q: q || undefined, category: categoryId, sort, page, pageSize: PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
    enabled: !category || categoryId !== undefined,
  });

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in changes)) next.delete("page"); // a new filter starts at page 1
    setParams(next);
  };

  const total = products.data?.page.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section aria-labelledby="page-title" className="space-y-6">
      <PageTitle>{q ? `Results for “${q}”` : "All products"}</PageTitle>
      <form
        role="search"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() });
        }}
      >
        <label className="flex flex-col text-sm">
          <span className="font-medium">Search</span>
          <input name="q" type="search" defaultValue={q} key={q} className="rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        <label className="flex flex-col text-sm">
          <span className="font-medium">Category</span>
          <select value={category} onChange={(e) => update({ category: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2">
            <option value="">All</option>
            {flat.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm">
          <span className="font-medium">Sort by</span>
          <select value={sort} onChange={(e) => update({ sort: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2">
            {SORTS.filter((s) => s.value !== "relevance" || q).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </form>

      {category && categories.isSuccess && !categoryId ? (
        <p className="text-sm text-slate-600">That category does not exist.</p>
      ) : (
        products.isPending && <Spinner />
      )}
      <ErrorAlert error={products.error} />
      {products.data && (
        <>
          <p className="text-sm text-slate-600" aria-live="polite">
            {total === 0 ? "No products match." : `${total} product${total === 1 ? "" : "s"}`}
          </p>
          <ProductGrid products={products.data.data} />
          {pages > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-center gap-4">
              <Button variant="secondary" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
                Previous
              </Button>
              <span className="text-sm">
                Page {page} of {pages}
              </span>
              <Button variant="secondary" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
