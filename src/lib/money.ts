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
