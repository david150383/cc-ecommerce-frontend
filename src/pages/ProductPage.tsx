import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { catalogApi, type Product, type Variant } from "../api/catalog";
import { ApiError } from "../api/http";
import { MAX_QUANTITY, useCart } from "../cart/cart";
import { Alert, Button, ErrorAlert, PageTitle, Spinner } from "../components/ui";
import { formatMoney } from "../lib/money";

const ATTRIBUTE_LABELS: Record<string, string> = { size: "Size", color: "Colour" };

/** Variant selection by attribute (e.g. colour + size); combinations that do not exist are disabled. */
function useVariantPicker(product: Product) {
  const active = product.variants.filter((v) => v.isActive);
  const keys = [...new Set(active.flatMap((v) => Object.keys(v.attributes)))];
  const [chosen, setChosen] = useState<Record<string, string>>(() => ({ ...active[0]?.attributes }));
  const variant: Variant | undefined = active.find((v) => keys.every((k) => v.attributes[k] === chosen[k]));
  const options = (key: string) => [...new Set(active.map((v) => v.attributes[key]).filter((x): x is string => !!x))];
  const exists = (key: string, value: string) => active.some((v) => v.attributes[key] === value && keys.every((k) => k === key || v.attributes[k] === chosen[k]));
  return { keys, chosen, variant, options, exists, choose: (k: string, v: string) => setChosen((c) => ({ ...c, [k]: v })), active };
}

export function ProductPage() {
  const { slug = "" } = useParams();
  const product = useQuery({ queryKey: ["product", slug], queryFn: ({ signal }) => catalogApi.product(slug, signal) });
  if (product.isPending) return <Spinner />;
  if (product.error instanceof ApiError && product.error.status === 404)
    return (
      <section className="space-y-4">
        <PageTitle>Product not found</PageTitle>
        <Link to="/products" className="underline">Browse all products</Link>
      </section>
    );
  if (product.error) return <ErrorAlert error={product.error} />;
  return <ProductDetail product={product.data} key={product.data.id} />;
}

function ProductDetail({ product }: { product: Product }) {
  const picker = useVariantPicker(product);
  const { variant } = picker;
  const add = useCart((s) => s.add);
  const inCart = useCart((s) => s.lines.find((l) => l.sku === variant?.sku)?.quantity ?? 0);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const availability = useQuery({
    queryKey: ["availability", variant?.sku],
    queryFn: ({ signal }) => catalogApi.availability(variant!.sku, signal),
    enabled: !!variant,
  });
  const image = product.images[0];
  const canAdd = !!variant && availability.data?.inStock && quantity + inCart <= Math.min(MAX_QUANTITY, availability.data.available);
  const fewLeft = availability.data && availability.data.available > 0 && availability.data.available <= 5;
  const specs = useMemo(() => product.specifications ?? [], [product.specifications]);

  return (
    <article aria-labelledby="page-title" className="grid gap-10 md:grid-cols-2">
      <div className="aspect-square overflow-hidden rounded-xl bg-slate-100">{image && <img src={image.url} alt={image.alt ?? product.name} className="h-full w-full object-cover" />}</div>
      <div className="space-y-6">
        <div className="space-y-1">
          {product.brand && <p className="text-sm uppercase tracking-wide text-slate-500">{product.brand}</p>}
          <PageTitle>{product.name}</PageTitle>
          {variant && (
            <p className="text-xl">
              {formatMoney(variant.effectivePrice)}
              {variant.onSale && <span className="ml-3 text-base text-slate-500 line-through">{formatMoney(variant.price)}</span>}
            </p>
          )}
        </div>

        {picker.active.length === 0 ? (
          <Alert kind="info">This product is not available right now.</Alert>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!variant || !canAdd) return;
              add({ sku: variant.sku, productSlug: product.slug, name: product.name, variantName: variant.name, image: image?.url ?? null, unitPrice: variant.effectivePrice }, quantity);
              setAdded(true);
            }}
          >
            {picker.keys.map((key) => (
              <fieldset key={key}>
                <legend className="mb-2 text-sm font-medium">{ATTRIBUTE_LABELS[key] ?? key}</legend>
                <div className="flex flex-wrap gap-2">
                  {picker.options(key).map((value) => (
                    <label key={value} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm has-checked:border-slate-900 has-checked:bg-slate-900 has-checked:text-white has-disabled:cursor-not-allowed has-disabled:opacity-40 has-focus-visible:outline-2 has-focus-visible:outline-slate-900`}>
                      <input
                        type="radio"
                        name={key}
                        value={value}
                        className="sr-only"
                        checked={picker.chosen[key] === value}
                        disabled={!picker.exists(key, value)}
                        onChange={() => {
                          picker.choose(key, value);
                          setAdded(false);
                        }}
                      />
                      {value.toUpperCase()}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}

            <div aria-live="polite" className="text-sm">
              {!variant && <p>That combination is not available.</p>}
              {availability.isPending && variant && <p className="text-slate-500">Checking stock…</p>}
              {availability.data && !availability.data.inStock && <p className="font-medium text-red-700">Out of stock</p>}
              {fewLeft && <p className="font-medium text-amber-700">Only {availability.data!.available} left</p>}
              {availability.data?.inStock && !fewLeft && <p className="text-green-700">In stock</p>}
            </div>

            <div className="flex items-end gap-3">
              <label className="flex flex-col text-sm">
                <span className="font-medium">Quantity</span>
                <select value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="rounded-md border border-slate-300 px-3 py-2">
                  {Array.from({ length: MAX_QUANTITY }, (_, i) => i + 1).map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <Button type="submit" disabled={!canAdd}>
                Add to cart
              </Button>
            </div>
            {variant && availability.data?.inStock && !canAdd && <p className="text-sm text-slate-600">You already have {inCart} in your cart; that is as many as we can sell you right now.</p>}
            {added && (
              <Alert kind="success">
                Added to your cart. <Link to="/cart" className="underline">View cart</Link>
              </Alert>
            )}
          </form>
        )}

        {product.description && <p className="max-w-prose text-slate-700">{product.description}</p>}
        {specs.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            {specs.map((spec) => (
              <div key={spec.name} className="contents">
                <dt className="text-slate-500">{spec.name}</dt>
                <dd>{spec.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}
