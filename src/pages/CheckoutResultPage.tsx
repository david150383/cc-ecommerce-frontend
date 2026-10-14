import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { checkoutApi, FINAL_CHECKOUT } from "../api/orders";
import { useCart } from "../cart/cart";
import { describeFailure, forgetAttempt, safePaymentUrl } from "../checkout/checkout";
import { Alert, ErrorAlert, PageTitle, Spinner } from "../components/ui";

/**
 * Where the payment page sends the customer back. `?result=success` from the provider proves
 * nothing (anyone can type it): only the saga's COMPLETED status, which follows the verified
 * webhook, counts as a successful order.
 */
export function CheckoutResultPage() {
  const [params] = useSearchParams();
  const sagaId = params.get("saga") ?? "";
  const cameBackWithoutPaying = params.get("result") === "cancelled";
  const clearCart = useCart((s) => s.clear);
  const status = useQuery({
    queryKey: ["checkout", sagaId],
    queryFn: ({ signal }) => checkoutApi.status(sagaId, signal),
    enabled: !!sagaId,
    refetchInterval: (q) => (q.state.data && FINAL_CHECKOUT.has(q.state.data.status) ? false : 2_000),
  });
  const s = status.data;

  useEffect(() => {
    if (s?.status === "COMPLETED") {
      clearCart();
      forgetAttempt();
    }
    if (s?.status === "CANCELLED") forgetAttempt();
  }, [s?.status, clearCart]);

  if (!sagaId) return <Alert>Missing checkout reference.</Alert>;
  if (status.isPending) return <Spinner label="Checking your order…" />;
  if (status.error) return <ErrorAlert error={status.error} />;

  const payUrl = safePaymentUrl(s!.checkoutUrl);
  return (
    <section aria-labelledby="page-title" className="max-w-xl space-y-4" aria-live="polite">
      {s!.status === "COMPLETED" && (
        <>
          <PageTitle>Thank you! Your order is confirmed</PageTitle>
          <Alert kind="success">We received your payment and reserved your items. A confirmation email is on its way.</Alert>
          {s!.orderId && <Link to={`/account/orders/${s!.orderId}`} className="underline">View your order</Link>}
        </>
      )}
      {(s!.status === "PROCESSING" || s!.status === "AWAITING_PAYMENT") && (
        <>
          <PageTitle>{cameBackWithoutPaying ? "Payment not completed" : "Confirming your payment…"}</PageTitle>
          {cameBackWithoutPaying ? (
            <p>Your items are reserved for a little while. You can go back and pay, or leave it: the order is cancelled automatically if not paid.</p>
          ) : (
            <Spinner label="Waiting for the payment provider to confirm. This usually takes a few seconds." />
          )}
          {payUrl && (
            <a href={payUrl} className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Return to payment
            </a>
          )}
        </>
      )}
      {s!.status === "CANCELLED" && (
        <>
          <PageTitle>Your order was not placed</PageTitle>
          <Alert>{describeFailure(s!.failureReason)}</Alert>
          <Link to="/cart" className="underline">Back to your cart</Link>
        </>
      )}
      {(s!.status === "FAILED" || s!.status === "UNDER_REVIEW") && (
        <>
          <PageTitle>We are checking your order</PageTitle>
          <Alert kind="info">Something unexpected happened and our team is looking into it. You will get an email; if you were charged and the order cannot go ahead, the money is refunded.</Alert>
        </>
      )}
    </section>
  );
}
