import { Link } from "react-router";
import type { ProductSummary } from "../api/catalog";
import { formatMoney } from "../lib/money";

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <li className="group">
      <Link to={`/products/${product.slug}`} className="block space-y-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900">
        <div className="aspect-square overflow-hidden rounded-lg bg-slate-100">
          {product.primaryImage && (
            <img src={product.primaryImage.url} alt={product.primaryImage.alt ?? ""} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
          )}
        </div>
        <div>
          <p className="font-medium group-hover:underline">{product.name}</p>
          {product.brand && <p className="text-sm text-slate-500">{product.brand}</p>}
          <p className="text-sm">
            {product.lowestPrice && <>From {formatMoney(product.lowestPrice)}</>}
            {product.onSale && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">Sale</span>}
          </p>
        </div>
      </Link>
    </li>
  );
}

export function ProductGrid({ products }: { products: ProductSummary[] }) {
  return <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">{products.map((p) => <ProductCard key={p.id} product={p} />)}</ul>;
}
