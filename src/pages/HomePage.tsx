import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { catalogApi } from "../api/catalog";
import { ProductGrid } from "../components/ProductCard";
import { ErrorAlert, Spinner } from "../components/ui";

export function HomePage() {
  const featured = useQuery({ queryKey: ["products", { featured: true }], queryFn: ({ signal }) => catalogApi.products({ featured: true, pageSize: 8 }, signal) });
  return (
    <div className="space-y-10">
      <section aria-labelledby="home-title" className="space-y-3 rounded-2xl bg-slate-900 px-8 py-12 text-white">
        <h1 id="home-title" className="text-3xl font-bold tracking-tight">
          Welcome
        </h1>
        <p className="max-w-prose text-slate-300">Everyday clothing, priced fairly. Free returns within 30 days.</p>
        <Link to="/products" className="inline-block rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100">
          Browse all products
        </Link>
      </section>
      <section aria-labelledby="featured-title" className="space-y-4">
        <h2 id="featured-title" className="text-xl font-semibold">
          Featured
        </h2>
        {featured.isPending && <Spinner />}
        <ErrorAlert error={featured.error} />
        {featured.data && <ProductGrid products={featured.data.data} />}
      </section>
    </div>
  );
}
