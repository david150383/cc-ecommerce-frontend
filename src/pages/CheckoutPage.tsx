import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import { ApiError } from "../api/http";
import { checkoutApi, type CheckoutRequest, type CheckoutStatus } from "../api/orders";
import { useSession } from "../auth/session";
import { cartSubtotal, useCart } from "../cart/cart";
import { idempotencyKeyFor, safePaymentUrl } from "../checkout/checkout";
import { Alert, Button, ErrorAlert, Field, PageTitle, Spinner } from "../components/ui";
import { browser } from "../lib/browser";
import { formatMoney, multiply } from "../lib/money";

// Mirrors the Saga Orchestrator's validation for instant feedback.
const AddressSchema = z.object({
  name: z.string().trim().min(1, "Required").max(200),
  line1: z.string().trim().min(1, "Required").max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1, "Required").max(100),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().min(1, "Required").max(20),
  country: z.string().regex(/^[A-Z]{2}$/),
  phone: z.string().regex(/^\+[1-9][0-9]{6,14}$/, "International format, e.g. +919800000001"),
  couponCode: z.string().trim().max(32).optional(),
});
type AddressForm = z.infer<typeof AddressSchema>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait until the saga has an answer: a payment page to go to, or a final outcome. */
async function untilActionable(sagaId: string, first: CheckoutStatus, onProgress: (s: CheckoutStatus) => void): Promise<CheckoutStatus> {
  let s = first;
  for (let i = 0; i < 60 && s.status === "PROCESSING"; i++) {
    await sleep(1_000);
    s = await checkoutApi.status(sagaId);
    onProgress(s);
  }
  return s;
}

export function CheckoutPage() {
  const user = useSession((s) => s.user);
  const lines = useCart((s) => s.lines);
  const navigate = useNavigate();
  const [progress, setProgress] = useState<CheckoutStatus | null>(null);
  const form = useForm<AddressForm>({ resolver: zodResolver(AddressSchema), defaultValues: { name: user?.fullName ?? "", country: "IN" } });
  const currencies = new Set(lines.map((l) => l.unitPrice.currency));

  const place = useMutation({
    mutationFn: async (v: AddressForm) => {
      const { couponCode, ...address } = v;
      const req: CheckoutRequest = {
        items: lines.map((l) => ({ sku: l.sku, quantity: l.quantity })),
        currency: lines[0]!.unitPrice.currency,
        shippingAddress: { ...address, line2: address.line2 || undefined, state: address.state || undefined },
        ...(couponCode && { couponCode }),
      };
      const started = await checkoutApi.start(req, idempotencyKeyFor(req));
      setProgress(started);
      return untilActionable(started.sagaId, started, setProgress);
    },
    onSuccess: (s) => {
      const payUrl = s.status === "AWAITING_PAYMENT" ? safePaymentUrl(s.checkoutUrl) : null;
      if (payUrl) browser.assign(payUrl); // leave the shop for the payment page
      else navigate(`/checkout/result?saga=${s.sagaId}`, { replace: true });
    },
  });

  if (lines.length === 0)
    return (
      <section aria-labelledby="page-title" className="space-y-4">
        <PageTitle>Checkout</PageTitle>
        <p>Your cart is empty. <Link to="/products" className="underline">Browse products</Link></p>
      </section>
    );

  const e = form.formState.errors;
  const busy = place.isPending || (place.isSuccess && progress?.status === "AWAITING_PAYMENT");
  return (
    <section aria-labelledby="page-title" className="grid gap-10 md:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <PageTitle>Checkout</PageTitle>
        {currencies.size > 1 && <Alert>Your cart mixes currencies; remove items until one currency is left.</Alert>}
        {place.error instanceof ApiError && place.error.code === "TOO_MANY_ACTIVE_CHECKOUTS" ? (
          <Alert>
            You already have checkouts waiting for payment. Pay for one of them or let it expire, then try again.{" "}
            <Link to="/account/orders" className="underline">Your orders</Link>
          </Alert>
        ) : place.error instanceof ApiError && place.error.code === "IDEMPOTENCY_KEY_REUSED" ? (
          <Alert>Please try again.</Alert>
        ) : (
          <ErrorAlert error={place.error} />
        )}
        <form noValidate onSubmit={form.handleSubmit((v) => place.mutate(v))} className="space-y-4" aria-describedby="checkout-note">
          <fieldset className="grid gap-4 sm:grid-cols-2" disabled={busy}>
            <legend className="mb-2 text-lg font-semibold">Shipping address</legend>
            <Field label="Full name" autoComplete="name" error={e.name?.message} {...form.register("name")} className="sm:col-span-2" />
            <Field label="Address line 1" autoComplete="address-line1" error={e.line1?.message} {...form.register("line1")} className="sm:col-span-2" />
            <Field label="Address line 2 (optional)" autoComplete="address-line2" error={e.line2?.message} {...form.register("line2")} className="sm:col-span-2" />
            <Field label="City" autoComplete="address-level2" error={e.city?.message} {...form.register("city")} />
            <Field label="State (optional)" autoComplete="address-level1" error={e.state?.message} {...form.register("state")} />
            <Field label="Postal code" autoComplete="postal-code" error={e.postalCode?.message} {...form.register("postalCode")} />
            <div className="space-y-1">
              <label htmlFor="country" className="block text-sm font-medium">Country</label>
              <select id="country" autoComplete="country" {...form.register("country")} className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="IN">India</option>
              </select>
            </div>
            <Field label="Phone" type="tel" autoComplete="tel" placeholder="+919800000001" error={e.phone?.message} {...form.register("phone")} className="sm:col-span-2" />
            <Field label="Coupon code (optional)" error={e.couponCode?.message} {...form.register("couponCode")} className="sm:col-span-2" />
          </fieldset>
          <p id="checkout-note" className="text-sm text-slate-600">
            Next you pay on our payment provider's secure page. Card details never pass through this shop.
          </p>
          <Button type="submit" disabled={busy || currencies.size > 1} className="w-full sm:w-auto">
            {busy ? "Placing your order…" : "Continue to payment"}
          </Button>
          {busy && (
            <div aria-live="polite">
              <Spinner label={progress?.status === "AWAITING_PAYMENT" ? "Taking you to the payment page…" : "Reserving your items…"} />
            </div>
          )}
        </form>
      </div>
      <aside aria-labelledby="summary-title" className="h-fit space-y-3 rounded-lg border border-slate-200 p-4">
        <h2 id="summary-title" className="font-semibold">Order summary</h2>
        <ul className="space-y-2 text-sm">
          {lines.map((l) => (
            <li key={l.sku} className="flex justify-between gap-2">
              <span>
                {l.quantity} × {l.name} <span className="text-slate-500">({l.variantName})</span>
              </span>
              <span>{formatMoney(multiply(l.unitPrice, l.quantity))}</span>
            </li>
          ))}
        </ul>
        <p className="flex justify-between border-t border-slate-200 pt-2 font-medium">
          <span>Estimated subtotal</span>
          <span>{formatMoney(cartSubtotal(lines))}</span>
        </p>
        <p className="text-xs text-slate-500">The final total, with tax and shipping, is shown on the payment page and in your order.</p>
      </aside>
    </section>
  );
}

