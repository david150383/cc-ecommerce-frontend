export interface Money {
  amountMinor: number;
  currency: string;
}

/**
 * Integer minor units → "₹1,177.64", without floating-point arithmetic on the amount.
 * Display only: every amount shown here is a copy; the services own the real numbers.
 */
export function formatMoney(m: Money | null | undefined): string {
  if (!m) return "";
  const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: m.currency });
  const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
  const scale = 10 ** digits;
  const negative = m.amountMinor < 0;
  const abs = Math.abs(m.amountMinor);
  const major = Math.floor(abs / scale);
  const minor = abs % scale;
  const out = fmt
    .formatToParts(major)
    .map((p) => (p.type === "fraction" ? String(minor).padStart(digits, "0") : p.type === "decimal" && digits === 0 ? "" : p.value))
    .join("");
  return negative ? `-${out}` : out;
}

export function multiply(m: Money, quantity: number): Money {
  return { amountMinor: m.amountMinor * quantity, currency: m.currency };
}

/** Fraction digits of a currency (INR 2, JPY 0). */
export function currencyDigits(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/**
 * "1,177.64" → 117764 minor units, by string arithmetic (no floating point). Returns null for
 * anything that is not a plain non-negative amount with at most the currency's fraction digits.
 */
export function parseMajor(input: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  const s = input.trim().replaceAll(",", "");
  const m = /^(\d{1,12})(?:\.(\d+))?$/.exec(s);
  if (!m || (m[2] && m[2].length > digits)) return null;
  const minor = Number(m[1]) * 10 ** digits + Number((m[2] ?? "").padEnd(digits, "0") || "0");
  return Number.isSafeInteger(minor) ? minor : null;
}

/** 117764 → "1177.64" (for editing). */
export function toMajorString(m: Money): string {
  const digits = currencyDigits(m.currency);
  if (digits === 0) return String(m.amountMinor);
  const s = String(Math.abs(m.amountMinor)).padStart(digits + 1, "0");
  return `${m.amountMinor < 0 ? "-" : ""}${s.slice(0, -digits)}.${s.slice(-digits)}`;
}
