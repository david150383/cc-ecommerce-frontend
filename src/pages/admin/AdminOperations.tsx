import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { adminApi, SAGA_STATES, type StockItem } from "../../api/admin";
import { newIdempotencyKey } from "../../api/http";
import { ordersApi, type OrderStatus } from "../../api/orders";
import { isAdmin, useSession } from "../../auth/session";
import { Alert, Button, ErrorAlert, Field, PageTitle, Spinner } from "../../components/ui";
import { formatMoney, parseMajor, toMajorString } from "../../lib/money";
import { OrderDetail } from "../account/OrdersPages";
import { shortId, useCursorList, when } from "./admin-utils";
import { FilterSelect, ListState, Td, Th } from "./AdminLayout";

/** URL-backed filter state for admin lists. */
function useFilter(name: string): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams();
  return [
    params.get(name) ?? "",
    (v) => {
      const next = new URLSearchParams(params);
      if (v) next.set(name, v);
      else next.delete(name);
      setParams(next, { replace: true });
    },
  ];
}

/**
 * An admin write with ONE idempotency key per intended action: a double click or a retry after a
 * timeout is the same request; the key is renewed only after the action finished.
 */
function useKeyedAction<A>(fn: (args: A, key: string) => Promise<unknown>, onSuccess?: () => unknown) {
  const [key, setKey] = useState(newIdempotencyKey);
  return useMutation({
    mutationFn: (args: A) => fn(args, key),
    onSuccess: () => {
      setKey(newIdempotencyKey());
      return onSuccess?.();
    },
  });
}

// ===================================================================================== inventory
const ADJUST_REASONS = ["RESTOCK", "RETURN", "DAMAGED", "CORRECTION"] as const;

export function AdminInventoryPage() {
  const [lowOnly, setLow] = useFilter("low");
  const [selected, setSelected] = useFilter("sku");
  const all = useCursorList(["admin", "stock"], (c) => adminApi.stock(c));
  const low = useQuery({ queryKey: ["admin", "low-stock"], queryFn: adminApi.lowStock, enabled: !!lowOnly });
  const rows: StockItem[] = lowOnly ? (low.data?.data ?? []) : all.items;
  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <PageTitle>Inventory</PageTitle>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!lowOnly} onChange={(e) => setLow(e.target.checked ? "1" : "")} /> Only low stock
      </label>
      <ListState query={lowOnly ? { ...low, hasNextPage: false } : all} empty={rows.length === 0}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200"><Th>SKU</Th><Th right>On hand</Th><Th right>Reserved</Th><Th right>Available</Th><Th right>Low at</Th><Th>{""}</Th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.sku} className={`border-b border-slate-100 ${s.lowStock ? "bg-amber-50" : ""}`}>
                <Td mono>{s.sku}</Td>
                <Td right>{s.onHand}</Td>
                <Td right>{s.reserved}</Td>
                <Td right>{s.available}{s.lowStock && <span className="ml-1 text-xs text-amber-800">low</span>}</Td>
                <Td right>{s.lowStockThreshold}</Td>
                <Td><Button variant="link" onClick={() => setSelected(s.sku)}>Manage</Button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </ListState>
      {selected && <StockPanel sku={selected} key={selected} onClose={() => setSelected("")} />}
    </section>
  );
}

function StockPanel({ sku, onClose }: { sku: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const item = useQuery({ queryKey: ["admin", "stock-item", sku], queryFn: () => adminApi.stockItem(sku) });
  const movements = useQuery({ queryKey: ["admin", "movements", sku], queryFn: () => adminApi.movements(sku) });
  const [error, setError] = useState<string | null>(null);
  const adjust = useKeyedAction(
    (body: Parameters<typeof adminApi.adjustStock>[1], key) => adminApi.adjustStock(sku, body, key),
    () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
  );
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const delta = Number(f.get("delta"));
    const threshold = String(f.get("threshold")).trim();
    if (!Number.isInteger(delta) || (delta === 0 && threshold === "")) return setError("Enter a non-zero whole number, or a new threshold.");
    if (delta !== 0 && !String(f.get("note")).trim()) return setError("Say why (the note is kept in the audit history).");
    setError(null);
    adjust.mutate({
      ...(delta !== 0 && { delta, reason: String(f.get("reason")), note: String(f.get("note")).trim() }),
      ...(threshold !== "" && { lowStockThreshold: Number(threshold) }),
    });
  };
  return (
    <section aria-labelledby="stock-title" className="space-y-4 rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <h2 id="stock-title" className="font-mono text-lg font-semibold">{sku}</h2>
        <Button variant="link" onClick={onClose}>Close</Button>
      </div>
      {item.data && <p className="text-sm">On hand {item.data.onHand} · reserved {item.data.reserved} · available {item.data.available} · low at {item.data.lowStockThreshold}</p>}
      {error && <Alert>{error}</Alert>}
      <ErrorAlert error={adjust.error} />
      {adjust.isSuccess && <Alert kind="success">Updated.</Alert>}
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3" noValidate>
        <Field label="Change on hand" name="delta" type="number" defaultValue={0} hint="Negative to write off" className="w-36" />
        <label className="flex flex-col text-sm">
          <span className="font-medium">Reason</span>
          <select name="reason" className="rounded-md border border-slate-300 px-3 py-2">{ADJUST_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
        </label>
        <Field label="Note" name="note" className="w-56" />
        <Field label="Low-stock threshold" name="threshold" type="number" min={0} placeholder="unchanged" className="w-40" />
        <Button type="submit" disabled={adjust.isPending}>Apply</Button>
      </form>
      <h3 className="font-semibold">History</h3>
      {movements.isPending && <Spinner />}
      <table className="w-full text-left text-xs">
        <thead><tr className="border-b border-slate-200"><Th>When</Th><Th right>On hand</Th><Th right>Reserved</Th><Th>Reason</Th><Th>By</Th><Th>Note</Th></tr></thead>
        <tbody>
          {movements.data?.data.map((m) => (
            <tr key={m.id} className="border-b border-slate-100">
              <Td>{when(m.createdAt)}</Td><Td right>{m.deltaOnHand > 0 ? `+${m.deltaOnHand}` : m.deltaOnHand}</Td><Td right>{m.deltaReserved}</Td><Td>{m.reason}</Td><Td>{m.actor}</Td><Td>{m.note ?? ""}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ======================================================================================== orders
const ORDER_FILTERS = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLATION_PENDING", "CANCELLED", "PAYMENT_PENDING", "FAILED"] as const;
const NEXT_STEP: Partial<Record<OrderStatus, "PROCESSING" | "SHIPPED" | "DELIVERED">> = { CONFIRMED: "PROCESSING", PROCESSING: "SHIPPED", SHIPPED: "DELIVERED" };

export function AdminOrdersPage() {
  const [status, setStatus] = useFilter("status");
  const list = useCursorList(["admin", "orders", status], (c) => adminApi.orders({ status: status || undefined, cursor: c }));
  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <PageTitle>Orders</PageTitle>
      <FilterSelect label="Status" value={status} options={ORDER_FILTERS} onChange={setStatus} />
      <ListState query={list} empty={list.items.length === 0}>
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-slate-200"><Th>Order</Th><Th>Placed</Th><Th>Status</Th><Th>Customer</Th><Th right>Total</Th></tr></thead>
          <tbody>
            {list.items.map((o) => (
              <tr key={o.id} className="border-b border-slate-100">
                <Td mono><Link to={`/admin/orders/${o.id}`} className="underline">#{shortId(o.id)}</Link></Td>
                <Td>{when(o.createdAt)}</Td>
                <Td><span className="font-mono text-xs">{o.status}</span></Td>
                <Td mono>{shortId(o.customerId)}</Td>
                <Td right>{formatMoney(o.totals.grandTotal)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </ListState>
    </section>
  );
}

export function AdminOrderPage() {
  const { orderId = "" } = useParams();
  const queryClient = useQueryClient();
  const order = useQuery({ queryKey: ["admin", "order", orderId], queryFn: () => ordersApi.get(orderId) });
  const [reason, setReason] = useState("");
  const fulfil = useMutation({
    mutationFn: (to: "PROCESSING" | "SHIPPED" | "DELIVERED") => adminApi.fulfil(orderId, to, reason.trim()),
    onSuccess: (r) => {
      queryClient.setQueryData(["admin", "order", orderId], r);
      setReason("");
    },
  });
  if (order.isPending) return <Spinner />;
  if (order.error) return <ErrorAlert error={order.error} />;
  const o = order.data.order;
  const next = NEXT_STEP[o.status];
  return (
    <div className="space-y-6">
      <OrderDetail order={o} admin />
      {next && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) fulfil.mutate(next);
          }}
        >
          <Field label={`Note for "${next}"`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={next === "SHIPPED" ? "Courier + tracking number" : "Note"} className="w-72" />
          <Button type="submit" disabled={!reason.trim() || fulfil.isPending}>Mark as {next.toLowerCase()}</Button>
          <ErrorAlert error={fulfil.error} />
        </form>
      )}
      {o.status === "CANCELLATION_PENDING" && <Alert kind="info">The customer asked to cancel a paid order. Refund it from Payments; this order then needs its status closed by hand (no automated flow yet).</Alert>}
      <p className="text-sm"><Link to={`/admin/payments?customerId=${o.customerId}`} className="underline">Payments of this customer</Link></p>
    </div>
  );
}

// ====================================================================================== payments
const PAYMENT_FILTERS = ["PENDING", "SUCCEEDED", "FAILED", "EXPIRED", "PARTIALLY_REFUNDED", "REFUNDED"] as const;

export function AdminPaymentsPage() {
  const [status, setStatus] = useFilter("status");
  const [customerId] = useFilter("customerId");
  const [selected, setSelected] = useFilter("payment");
  const list = useCursorList(["admin", "payments", status, customerId], (c) => adminApi.payments({ status: status || undefined, customerId: customerId || undefined, cursor: c }));
  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <PageTitle>Payments</PageTitle>
      <FilterSelect label="Status" value={status} options={PAYMENT_FILTERS} onChange={setStatus} />
      {customerId && <p className="text-sm">Customer <span className="font-mono">{shortId(customerId)}</span></p>}
      <ListState query={list} empty={list.items.length === 0}>
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-slate-200"><Th>Payment</Th><Th>Created</Th><Th>Status</Th><Th>Order</Th><Th right>Amount</Th><Th right>Refunded</Th></tr></thead>
          <tbody>
            {list.items.map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <Td mono><Button variant="link" onClick={() => setSelected(p.id)}>#{shortId(p.id)}</Button></Td>
                <Td>{when(p.createdAt)}</Td>
                <Td><span className="font-mono text-xs">{p.status}</span>{p.failureCode && <span className="text-xs text-slate-500"> ({p.failureCode})</span>}</Td>
                <Td mono><Link to={`/admin/orders/${p.orderId}`} className="underline">#{shortId(p.orderId)}</Link></Td>
                <Td right>{formatMoney(p.amount)}</Td>
                <Td right>{p.refunded.amountMinor > 0 ? formatMoney(p.refunded) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </ListState>
      {selected && <PaymentPanel paymentId={selected} key={selected} />}
    </section>
  );
}

function PaymentPanel({ paymentId }: { paymentId: string }) {
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ["admin", "payment", paymentId], queryFn: () => adminApi.payment(paymentId), refetchInterval: (q) => (q.state.data?.refunds.some((r) => r.status === "PENDING") ? 2_000 : false) });
  const [error, setError] = useState<string | null>(null);
  const refund = useKeyedAction(
    (body: Parameters<typeof adminApi.refund>[1], key) => adminApi.refund(paymentId, body, key),
    () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
  );
  if (detail.isPending) return <Spinner />;
  if (detail.error) return <ErrorAlert error={detail.error} />;
  const { payment: p, refunds } = detail.data;
  const pending = refunds.filter((r) => r.status === "PENDING").reduce((n, r) => n + r.amount.amountMinor, 0);
  const refundable = { amountMinor: p.amount.amountMinor - p.refunded.amountMinor - pending, currency: p.amount.currency };
  const canRefund = (p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED") && refundable.amountMinor > 0;
  return (
    <section aria-labelledby="pay-title" className="space-y-4 rounded-lg border border-slate-200 p-4">
      <h2 id="pay-title" className="text-lg font-semibold">Payment #{shortId(p.id)} · {p.status}</h2>
      <p className="text-sm">Paid {formatMoney(p.amount)} via {p.provider} · refunded {formatMoney(p.refunded)}{pending > 0 && ` · ${formatMoney({ amountMinor: pending, currency: p.amount.currency })} pending`}</p>
      {refunds.length > 0 && (
        <ul className="text-sm">
          {refunds.map((r) => (
            <li key={r.id}>{when(r.createdAt)} · {formatMoney(r.amount)} · {r.status}{r.failureCode && ` (${r.failureCode})`} · {r.reason}</li>
          ))}
        </ul>
      )}
      {canRefund && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const raw = String(new FormData(e.currentTarget).get("amount")).trim();
            const minor = raw ? parseMajor(raw, p.amount.currency) : refundable.amountMinor;
            if (minor === null || minor <= 0 || minor > refundable.amountMinor) return setError(`Enter an amount up to ${formatMoney(refundable)}`);
            setError(null);
            refund.mutate({ ...(minor !== refundable.amountMinor || raw ? { amount: { amountMinor: minor, currency: p.amount.currency } } : {}), reason: "ADMIN" });
          }}
        >
          <Field label={`Refund amount (up to ${toMajorString(refundable)})`} name="amount" inputMode="decimal" placeholder="full remaining amount" className="w-64" />
          <Button type="submit" variant="danger" disabled={refund.isPending}>Refund</Button>
        </form>
      )}
      {error && <Alert>{error}</Alert>}
      <ErrorAlert error={refund.error} />
      {refund.isSuccess && <Alert kind="info">Refund requested. It completes when the payment provider confirms it.</Alert>}
    </section>
  );
}

// ===================================================================================== checkouts
export function AdminCheckoutsPage() {
  const [state, setState] = useFilter("state");
  const list = useCursorList(["admin", "sagas", state], (c) => adminApi.sagas({ state: state || undefined, cursor: c }));
  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <PageTitle>Checkouts</PageTitle>
      <FilterSelect label="State" value={state} options={SAGA_STATES} onChange={setState} />
      <ListState query={list} empty={list.items.length === 0}>
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-slate-200"><Th>Checkout</Th><Th>Started</Th><Th>State</Th><Th>Reason</Th><Th>Order</Th><Th right>Total</Th></tr></thead>
          <tbody>
            {list.items.map((s) => (
              <tr key={s.id} className={`border-b border-slate-100 ${s.state === "MANUAL_REVIEW" ? "bg-red-50" : ""}`}>
                <Td mono><Link to={`/admin/checkouts/${s.id}`} className="underline">#{shortId(s.id)}</Link></Td>
                <Td>{when(s.createdAt)}</Td>
                <Td><span className="font-mono text-xs">{s.state}</span></Td>
                <Td>{s.failureReason ?? ""}</Td>
                <Td mono>{s.orderId ? <Link to={`/admin/orders/${s.orderId}`} className="underline">#{shortId(s.orderId)}</Link> : "—"}</Td>
                <Td right>{formatMoney(s.total)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </ListState>
    </section>
  );
}

export function AdminCheckoutPage() {
  const { sagaId = "" } = useParams();
  const queryClient = useQueryClient();
  const saga = useQuery({ queryKey: ["admin", "saga", sagaId], queryFn: () => adminApi.saga(sagaId) });
  const done = () => queryClient.invalidateQueries({ queryKey: ["admin"] });
  const retry = useMutation({ mutationFn: () => adminApi.retrySaga(sagaId), onSuccess: done });
  const [resolution, setResolution] = useState("");
  const resolve = useMutation({ mutationFn: () => adminApi.resolveSaga(sagaId, resolution.trim()), onSuccess: done });
  if (saga.isPending) return <Spinner />;
  if (saga.error) return <ErrorAlert error={saga.error} />;
  const { saga: s, steps } = saga.data;
  const finished = ["COMPLETED", "CANCELLED", "FAILED", "RESOLVED"].includes(s.state);
  return (
    <section aria-labelledby="page-title" className="space-y-6">
      <PageTitle>Checkout #{shortId(s.id)}</PageTitle>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-slate-500">State</dt><dd className="font-mono">{s.state}</dd>
        <dt className="text-slate-500">Reason</dt><dd>{s.failureReason ?? "—"}</dd>
        <dt className="text-slate-500">Order / payment</dt><dd className="font-mono">{shortId(s.orderId)} / {shortId(s.paymentId)}</dd>
        <dt className="text-slate-500">Total</dt><dd>{formatMoney(s.total)}</dd>
        <dt className="text-slate-500">Next deadline</dt><dd>{when(s.deadlineAt)} (attempts {s.stepAttempts})</dd>
        <dt className="text-slate-500">Compensation</dt><dd className="font-mono text-xs">{JSON.stringify(s.compensation)}</dd>
      </dl>
      <ErrorAlert error={retry.error ?? resolve.error} />
      <div className="flex flex-wrap items-end gap-3">
        {!finished && s.state !== "MANUAL_REVIEW" && <Button variant="secondary" onClick={() => retry.mutate()} disabled={retry.isPending}>Retry current step now</Button>}
        {s.state === "MANUAL_REVIEW" && (
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => (e.preventDefault(), resolution.trim() && resolve.mutate())}>
            <Field label="Resolution (what you did)" value={resolution} onChange={(e) => setResolution(e.target.value)} className="w-96" />
            <Button type="submit" disabled={!resolution.trim() || resolve.isPending}>Mark resolved</Button>
          </form>
        )}
      </div>
      <h2 className="text-lg font-semibold">Step history</h2>
      <table className="w-full text-left text-xs">
        <thead><tr className="border-b border-slate-200"><Th>When</Th><Th>From</Th><Th>To</Th><Th>Trigger</Th><Th>Detail</Th></tr></thead>
        <tbody>
          {steps.map((st, i) => (
            <tr key={i} className="border-b border-slate-100"><Td>{when(st.at)}</Td><Td mono>{st.from ?? "—"}</Td><Td mono>{st.to}</Td><Td mono>{st.trigger}</Td><Td>{st.detail ?? ""}</Td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ========================================================================================= users
export function AdminUsersPage() {
  const [q, setQ] = useFilter("q");
  const [status, setStatus] = useFilter("status");
  const me = useSession((s) => s.user);
  const queryClient = useQueryClient();
  const list = useCursorList(["admin", "users", q, status], (c) => adminApi.users({ q: q || undefined, status: status || undefined, cursor: c }));
  const change = useMutation({
    mutationFn: (a: { id: string; status: "ACTIVE" | "SUSPENDED"; reason: string }) => adminApi.setUserStatus(a.id, a.status, a.reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <PageTitle>Users</PageTitle>
      <div className="flex flex-wrap items-end gap-3">
        <form role="search" onSubmit={(e) => (e.preventDefault(), setQ(String(new FormData(e.currentTarget).get("q") ?? "").trim()))}>
          <label className="flex flex-col text-sm"><span className="font-medium">Search email or name</span><input name="q" type="search" defaultValue={q} className="rounded-md border border-slate-300 px-3 py-2" /></label>
        </form>
        <FilterSelect label="Status" value={status} options={["ACTIVE", "SUSPENDED"]} onChange={setStatus} />
      </div>
      <ErrorAlert error={change.error} />
      <ListState query={list} empty={list.items.length === 0}>
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-slate-200"><Th>Name</Th><Th>Email</Th><Th>Roles</Th><Th>Status</Th><Th>Joined</Th><Th>{""}</Th></tr></thead>
          <tbody>
            {list.items.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <Td>{u.fullName}</Td>
                <Td>{u.email}{!u.emailVerified && <span className="ml-1 text-xs text-slate-500">(unverified)</span>}</Td>
                <Td>{u.roles.join(", ")}</Td>
                <Td>{u.status}</Td>
                <Td>{when(u.createdAt)}</Td>
                <Td>
                  {u.id !== me?.id && !isAdmin(u) && (
                    <Button
                      variant="link"
                      onClick={() => {
                        const next = u.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
                        const reason = window.prompt(`Reason to ${next === "SUSPENDED" ? "suspend" : "reactivate"} ${u.email}?`)?.trim();
                        if (reason) change.mutate({ id: u.id, status: next, reason });
                      }}
                    >
                      {u.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </ListState>
    </section>
  );
}

// ================================================================================= notifications
export function AdminNotificationsPage() {
  const [tab, setTab] = useFilter("tab");
  const [status, setStatus] = useFilter("status");
  const [channel, setChannel] = useFilter("channel");
  const queryClient = useQueryClient();
  const list = useCursorList(["admin", "notifications", status, channel], (c) => adminApi.notifications({ status: status || undefined, channel: channel || undefined, cursor: c }));
  const dead = useQuery({ queryKey: ["admin", "dead-letters"], queryFn: adminApi.deadLetters, enabled: tab === "dead-letters" });
  const retry = useMutation({ mutationFn: adminApi.retryNotification, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "notifications"] }) });
  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <PageTitle>Notifications</PageTitle>
      <div role="tablist" className="flex gap-2">
        <Button role="tab" aria-selected={tab !== "dead-letters"} variant={tab !== "dead-letters" ? "primary" : "secondary"} onClick={() => setTab("")}>Delivery log</Button>
        <Button role="tab" aria-selected={tab === "dead-letters"} variant={tab === "dead-letters" ? "primary" : "secondary"} onClick={() => setTab("dead-letters")}>Dead letters</Button>
      </div>
      {tab === "dead-letters" ? (
        <>
          {dead.isPending && <Spinner />}
          <ErrorAlert error={dead.error} />
          {dead.data && (
            <>
              <p className="text-sm">{Object.entries(dead.data.depths).map(([q, n]) => `${q}: ${n}`).join(" · ")}</p>
              {dead.data.data.length === 0 ? (
                <Alert kind="success">No dead-lettered messages.</Alert>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead><tr className="border-b border-slate-200"><Th>Queue</Th><Th>Type</Th><Th>Message</Th><Th>Correlation</Th><Th>Sent</Th><Th right>Receives</Th></tr></thead>
                  <tbody>
                    {dead.data.data.map((d) => (
                      <tr key={d.sqsMessageId} className="border-b border-slate-100"><Td mono>{d.queue}</Td><Td>{d.messageType ?? "(unparseable)"}</Td><Td mono>{d.messageId ?? "—"}</Td><Td mono>{d.correlationId ?? "—"}</Td><Td>{when(d.sentAt)}</Td><Td right>{d.receiveCount}</Td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="text-xs text-slate-500">Messages stay in the queue: inspect them and redrive with the AWS tooling once the cause is fixed.</p>
            </>
          )}
        </>
      ) : (
        <>
          <div className="flex gap-3">
            <FilterSelect label="Status" value={status} options={["QUEUED", "SENDING", "SENT", "FAILED", "SKIPPED"]} onChange={setStatus} />
            <FilterSelect label="Channel" value={channel} options={["email", "sms"]} onChange={setChannel} />
          </div>
          <ErrorAlert error={retry.error} />
          <ListState query={list} empty={list.items.length === 0}>
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-slate-200"><Th>Created</Th><Th>Template</Th><Th>Channel</Th><Th>Status</Th><Th right>Attempts</Th><Th>Last error</Th><Th>{""}</Th></tr></thead>
              <tbody>
                {list.items.map((n) => (
                  <tr key={n.id} className="border-b border-slate-100">
                    <Td>{when(n.createdAt)}</Td><Td mono>{n.templateKey}</Td><Td>{n.channel}</Td>
                    <Td>{n.status}{n.skipReason && <span className="text-xs text-slate-500"> ({n.skipReason})</span>}</Td>
                    <Td right>{n.attempts}/{n.maxAttempts}</Td>
                    <Td>{n.lastError ?? ""}</Td>
                    <Td>{n.status === "FAILED" && n.sourceType !== "transactional" && <Button variant="link" onClick={() => retry.mutate(n.id)} disabled={retry.isPending}>Retry</Button>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ListState>
        </>
      )}
    </section>
  );
}

