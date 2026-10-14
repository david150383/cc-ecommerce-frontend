import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { ApiError } from "../../api/http";
import { type Order, type OrderStatus, ordersApi } from "../../api/orders";
import { Button, ErrorAlert, PageTitle, Spinner } from "../../components/ui";
import { formatMoney } from "../../lib/money";

/** Customer-facing wording: internal saga steps collapse into a few states people understand. */
const STATUS: Record<OrderStatus, { label: string; tone: string }> = {
  PENDING: { label: "Being placed", tone: "bg-slate-100 text-slate-800" },
  INVENTORY_RESERVING: { label: "Being placed", tone: "bg-slate-100 text-slate-800" },
  INVENTORY_RESERVED: { label: "Awaiting payment", tone: "bg-amber-100 text-amber-900" },
  PAYMENT_PENDING: { label: "Awaiting payment", tone: "bg-amber-100 text-amber-900" },
  PAYMENT_PROCESSING: { label: "Awaiting payment", tone: "bg-amber-100 text-amber-900" },
  PAYMENT_SUCCEEDED: { label: "Paid", tone: "bg-blue-100 text-blue-900" },
  CONFIRMED: { label: "Confirmed", tone: "bg-blue-100 text-blue-900" },
  PROCESSING: { label: "Preparing", tone: "bg-blue-100 text-blue-900" },
  SHIPPED: { label: "Shipped", tone: "bg-indigo-100 text-indigo-900" },
  DELIVERED: { label: "Delivered", tone: "bg-green-100 text-green-800" },
  CANCELLATION_PENDING: { label: "Cancellation requested", tone: "bg-amber-100 text-amber-900" },
  CANCELLED: { label: "Cancelled", tone: "bg-red-100 text-red-800" },
  FAILED: { label: "Problem", tone: "bg-red-100 text-red-800" },
  REFUND_PENDING: { label: "Refund in progress", tone: "bg-amber-100 text-amber-900" },
  REFUNDED: { label: "Refunded", tone: "bg-slate-100 text-slate-800" },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const s = STATUS[status] ?? { label: status, tone: "bg-slate-100" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.tone}`}>{s.label}</span>;
}

const shortId = (id: string) => id.slice(-8).toUpperCase();
const date = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export function OrdersPage() {
  const orders = useInfiniteQuery({
    queryKey: ["my-orders"],
    queryFn: ({ pageParam }) => ordersApi.mine(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.page.nextCursor ?? undefined,
  });
  const all = orders.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <section aria-labelledby="page-title" className="space-y-6">
      <PageTitle>Your orders</PageTitle>
      {orders.isPending && <Spinner />}
      <ErrorAlert error={orders.error} />
      {orders.isSuccess && all.length === 0 && (
        <p>
          No orders yet. <Link to="/products" className="underline">Start shopping</Link>
        </p>
      )}
      {all.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th scope="col" className="py-2">Order</th>
              <th scope="col" className="py-2">Placed</th>
              <th scope="col" className="py-2">Status</th>
              <th scope="col" className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {all.map((o) => (
              <tr key={o.id} className="border-b border-slate-100">
                <td className="py-2">
                  <Link to={`/account/orders/${o.id}`} className="font-mono underline">#{shortId(o.id)}</Link>
                </td>
                <td className="py-2">{date(o.createdAt)}</td>
                <td className="py-2"><StatusBadge status={o.status} /></td>
                <td className="py-2 text-right">{formatMoney(o.totals.grandTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {orders.hasNextPage && (
        <Button variant="secondary" onClick={() => void orders.fetchNextPage()} disabled={orders.isFetchingNextPage}>
          Show more
        </Button>
      )}
    </section>
  );
}

export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const order = useQuery({ queryKey: ["order", orderId], queryFn: ({ signal }) => ordersApi.get(orderId, signal) });
  if (order.isPending) return <Spinner />;
  if (order.error instanceof ApiError && order.error.status === 404) return <PageTitle>Order not found</PageTitle>;
  if (order.error) return <ErrorAlert error={order.error} />;
  return <OrderDetail order={order.data.order} />;
}

export function OrderDetail({ order: o, admin = false }: { order: Order; admin?: boolean }) {
  const a = o.shippingAddress;
  return (
    <article aria-labelledby="page-title" className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <PageTitle>Order #{shortId(o.id)}</PageTitle>
        <StatusBadge status={o.status} />
      </div>
      <p className="text-sm text-slate-600">Placed {date(o.createdAt)}</p>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th scope="col" className="py-2">Item</th>
            <th scope="col" className="py-2">Qty</th>
            <th scope="col" className="py-2 text-right">Price</th>
            <th scope="col" className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {o.items.map((i) => (
            <tr key={i.sku} className="border-b border-slate-100">
              <td className="py-2">{i.name} <span className="font-mono text-xs text-slate-500">{i.sku}</span></td>
              <td className="py-2">{i.quantity}</td>
              <td className="py-2 text-right">{formatMoney(i.unitPrice)}</td>
              <td className="py-2 text-right">{formatMoney(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto grid max-w-xs grid-cols-2 gap-y-1 text-sm">
        <dt>Subtotal</dt><dd className="text-right">{formatMoney(o.totals.subtotal)}</dd>
        {o.totals.discount.amountMinor > 0 && (<><dt>Discount{o.couponCode && ` (${o.couponCode})`}</dt><dd className="text-right">-{formatMoney(o.totals.discount)}</dd></>)}
        <dt>Tax</dt><dd className="text-right">{formatMoney(o.totals.tax)}</dd>
        <dt>Shipping</dt><dd className="text-right">{formatMoney(o.totals.shipping)}</dd>
        <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{formatMoney(o.totals.grandTotal)}</dd>
      </dl>
      <section aria-labelledby="ship-title" className="space-y-1 text-sm">
        <h2 id="ship-title" className="font-semibold">Shipping to</h2>
        <address className="not-italic">
          {a.name}<br />{a.line1}{a.line2 && <>, {a.line2}</>}<br />{a.city}{a.state && `, ${a.state}`} {a.postalCode}<br />{a.country} · {a.phone}
        </address>
      </section>
      <section aria-labelledby="history-title" className="space-y-2 text-sm">
        <h2 id="history-title" className="font-semibold">History</h2>
        <ol className="space-y-1 border-l border-slate-200 pl-4">
          {o.statusHistory.map((h, n) => (
            <li key={n}>
              <span className="text-slate-500">{date(h.at)}</span> · {admin ? h.to : STATUS[h.to as OrderStatus]?.label ?? h.to}
              {admin && <span className="text-slate-500"> ({h.reason}, {h.actor})</span>}
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
