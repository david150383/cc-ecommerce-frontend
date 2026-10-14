import { useQueries } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { catalogApi } from "../api/catalog";
import { cartSubtotal, MAX_QUANTITY, useCart } from "../cart/cart";
import { Alert, Button, PageTitle } from "../components/ui";
import { formatMoney, multiply } from "../lib/money";

export function CartPage() {
  const { lines, setQuantity, remove } = useCart();
  const navigate = useNavigate();
  // Live availability per line: the cart may be days old.
  const stock = useQueries({
    queries: lines.map((l) => ({ queryKey: ["availability", l.sku], queryFn: ({ signal }: { signal: AbortSignal }) => catalogApi.availability(l.sku, signal), staleTime: 15_000 })),
  });
  const problems = lines.filter((l, i) => {
    const a = stock[i]?.data;
    return a && (!a.inStock || a.available < l.quantity);
  });
  const subtotal = cartSubtotal(lines);

  if (lines.length === 0)
    return (
      <section aria-labelledby="page-title" className="space-y-4">
        <PageTitle>Your cart</PageTitle>
        <p className="text-slate-600">Your cart is empty.</p>
        <Link to="/products" className="underline">
          Browse products
        </Link>
      </section>
    );

  return (
    <section aria-labelledby="page-title" className="space-y-6">
      <PageTitle>Your cart</PageTitle>
      <ul className="divide-y divide-slate-200 border-y border-slate-200">
        {lines.map((l, i) => {
          const a = stock[i]?.data;
          return (
            <li key={l.sku} className="flex gap-4 py-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-slate-100">{l.image && <img src={l.image} alt="" className="h-full w-full object-cover" />}</div>
              <div className="flex-1 space-y-1">
                <Link to={`/products/${l.productSlug}`} className="font-medium hover:underline">
                  {l.name}
                </Link>
                <p className="text-sm text-slate-500">{l.variantName}</p>
                {a && !a.inStock && <p className="text-sm font-medium text-red-700">Out of stock: remove it to check out</p>}
                {a?.inStock && a.available < l.quantity && <p className="text-sm font-medium text-amber-700">Only {a.available} left: lower the quantity</p>}
              </div>
              <div className="flex flex-col items-end gap-2">
                <p className="font-medium">{formatMoney(multiply(l.unitPrice, l.quantity))}</p>
                <label className="text-sm">
                  <span className="sr-only">Quantity of {l.name} ({l.variantName})</span>
                  <select value={l.quantity} onChange={(e) => setQuantity(l.sku, Number(e.target.value))} className="rounded-md border border-slate-300 px-2 py-1">
                    {Array.from({ length: MAX_QUANTITY }, (_, n) => n + 1).map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <Button variant="link" onClick={() => remove(l.sku)} aria-label={`Remove ${l.name} (${l.variantName})`}>
                  Remove
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="ml-auto max-w-sm space-y-3">
        <p className="flex justify-between text-lg">
          <span>Subtotal</span>
          <span className="font-semibold">{formatMoney(subtotal)}</span>
        </p>
        <p className="text-sm text-slate-500">Tax and shipping are calculated at checkout. Prices are confirmed when you place the order.</p>
        {problems.length > 0 && <Alert>Some items are not available in the quantity you chose.</Alert>}
        <Button className="w-full" disabled={problems.length > 0} onClick={() => navigate("/checkout")}>
          Check out
        </Button>
      </div>
    </section>
  );
}
