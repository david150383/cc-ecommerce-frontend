import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { adminApi } from "../../api/admin";
import { Button, ErrorAlert, PageTitle, Spinner } from "../../components/ui";

const SECTIONS = [
  ["", "Overview"],
  ["products", "Products"],
  ["inventory", "Inventory"],
  ["orders", "Orders"],
  ["payments", "Payments"],
  ["checkouts", "Checkouts"],
  ["users", "Users"],
  ["notifications", "Notifications"],
] as const;

export function AdminLayout() {
  return (
    <div className="grid gap-8 md:grid-cols-[12rem_1fr]">
      <nav aria-label="Admin" className="flex flex-row flex-wrap gap-1 md:flex-col">
        {SECTIONS.map(([path, label]) => (
          <NavLink
            key={path}
            to={`/admin${path ? `/${path}` : ""}`}
            end={!path}
            className={({ isActive }) => `rounded-md px-3 py-2 text-sm ${isActive ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

export function ListState({ query, empty, children }: { query: { isPending: boolean; error: unknown; hasNextPage?: boolean; isFetchingNextPage?: boolean; fetchNextPage?: () => unknown }; empty: boolean; children: ReactNode }) {
  return (
    <>
      {query.isPending && <Spinner />}
      <ErrorAlert error={query.error} />
      {!query.isPending && !query.error && empty && <p className="text-sm text-slate-600">Nothing here.</p>}
      {children}
      {query.hasNextPage && (
        <Button variant="secondary" onClick={() => void query.fetchNextPage?.()} disabled={query.isFetchingNextPage}>
          Load more
        </Button>
      )}
    </>
  );
}

export const Th = ({ children, right = false }: { children: ReactNode; right?: boolean }) => (
  <th scope="col" className={`py-2 pr-3 ${right ? "text-right" : ""}`}>
    {children}
  </th>
);
export const Td = ({ children, right = false, mono = false }: { children: ReactNode; right?: boolean; mono?: boolean }) => (
  <td className={`py-2 pr-3 align-top ${right ? "text-right" : ""} ${mono ? "font-mono text-xs" : ""}`}>{children}</td>
);
export function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col text-sm">
      <span className="font-medium">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2">
        <option value="">All</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

/** Overview: what needs a human right now. */
export function AdminDashboard() {
  const review = useQuery({ queryKey: ["admin", "sagas", "MANUAL_REVIEW"], queryFn: () => adminApi.sagas({ state: "MANUAL_REVIEW" }) });
  const low = useQuery({ queryKey: ["admin", "low-stock"], queryFn: adminApi.lowStock });
  const failed = useQuery({ queryKey: ["admin", "notifications", "FAILED"], queryFn: () => adminApi.notifications({ status: "FAILED" }) });
  const dlq = useQuery({ queryKey: ["admin", "dead-letters"], queryFn: adminApi.deadLetters });
  const dead = dlq.data ? Object.values(dlq.data.depths).reduce((a, b) => a + b, 0) : undefined;
  const card = (title: string, value: number | undefined, to: string, error: unknown) => (
    <Link to={to} className="block rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
      <p className="text-sm text-slate-600">{title}</p>
      <p className={`text-3xl font-semibold ${value ? "text-red-700" : ""}`}>{error ? "?" : (value ?? "…")}</p>
    </Link>
  );
  return (
    <section aria-labelledby="page-title" className="space-y-6">
      <PageTitle>Overview</PageTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {card("Checkouts needing review", review.data?.data.length, "/admin/checkouts?state=MANUAL_REVIEW", review.error)}
        {card("SKUs low on stock", low.data?.data.length, "/admin/inventory?low=1", low.error)}
        {card("Failed notifications", failed.data?.data.length, "/admin/notifications?status=FAILED", failed.error)}
        {card("Dead-lettered messages", dead, "/admin/notifications?tab=dead-letters", dlq.error)}
      </div>
    </section>
  );
}
