import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { forwardRef, useId } from "react";
import { ApiError } from "../api/http";
import { errorMessage } from "../lib/errors";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "link" }) {
  const styles = {
    primary: "bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-400",
    secondary: "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 disabled:text-slate-400",
    danger: "bg-red-700 text-white hover:bg-red-600 disabled:bg-red-300",
    link: "text-slate-900 underline underline-offset-2 hover:text-slate-600 px-0",
  }[variant];
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string };

/** A labelled input; errors are announced and linked with aria-describedby. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, error, hint, className = "", ...props }, ref) {
  const id = useId();
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-xs focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 aria-invalid:border-red-600"
        {...props}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
});

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: ReactNode }) {
  const styles = { error: "border-red-200 bg-red-50 text-red-900", success: "border-green-200 bg-green-50 text-green-900", info: "border-slate-200 bg-slate-50 text-slate-800" }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
      <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      {label}
    </p>
  );
}

export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  const id = error instanceof ApiError ? error.correlationId : undefined;
  return (
    <Alert>
      {errorMessage(error)}
      {id && <span className="mt-1 block font-mono text-xs opacity-70">Reference: {id}</span>}
    </Alert>
  );
}

export function PageTitle({ children, id = "page-title" }: { children: ReactNode; id?: string }) {
  return (
    <h1 id={id} className="text-2xl font-bold tracking-tight">
      {children}
    </h1>
  );
}
