/**
 * Money is stored as integer minor units (cents) to avoid floating-point
 * drift. Every amount carries an explicit ISO-4217 currency at the account
 * level; totals are only computed across accounts sharing a currency.
 */
export type Cents = number;

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY", "MXN", "BRL", "ARS", "CLP", "COP", "PEN", "SEK", "NOK", "DKK", "PLN", "INR", "SGD", "NZD"] as const;

/** Number of minor-unit digits for a currency (JPY = 0, CLP = 0, most = 2). */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * Parses user input like "1,234.56", "1234,56", "$ 12", "-3.5" into cents.
 * Uses string arithmetic — never `parseFloat(x) * 100`.
 * Returns null when the input is not a valid amount.
 */
export function parseMoney(input: string | number, digits = 2): Cents | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 10 ** digits);
  }
  let s = input.trim().replace(/[\s '’]/g, "").replace(/[^\d.,\-+]/g, "");
  if (!s) return null;
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!s || /[-+]/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let decimalSep: "." | "," | null = null;
  if (lastDot >= 0 && lastComma >= 0) decimalSep = lastDot > lastComma ? "." : ",";
  else if (lastComma >= 0) {
    // A single comma followed by exactly 3 digits reads as a thousands separator ("1,234");
    // otherwise a lone comma is a decimal separator ("12,5").
    const single = s.indexOf(",") === lastComma;
    decimalSep = single && s.length - lastComma - 1 !== 3 ? "," : null;
  } else if (lastDot >= 0) {
    // Several dots ("1.234.567") are thousands separators; a single dot is decimal.
    decimalSep = s.indexOf(".") === lastDot ? "." : null;
  }

  let intPart = s;
  let frac = "";
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    intPart = s.slice(0, idx);
    frac = s.slice(idx + 1);
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac)) return null;
  if (!intPart && !frac) return null;

  const rounded = frac.length > digits ? Number(frac[digits]) >= 5 : false;
  const fracPadded = (frac + "0".repeat(digits)).slice(0, digits);
  let value = Number(intPart || "0") * 10 ** digits + Number(fracPadded || "0");
  if (rounded) value += 1;
  if (!Number.isSafeInteger(value)) return null;
  return negative ? -value : value;
}

/** Converts cents to a plain decimal string suitable for an input field. */
export function centsToInput(cents: Cents, digits = 2): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  if (digits === 0) return `${neg ? "-" : ""}${abs}`;
  const major = Math.floor(abs / 10 ** digits);
  const minor = String(abs % 10 ** digits).padStart(digits, "0");
  return `${neg ? "-" : ""}${major}.${minor}`;
}

export const toMajor = (cents: Cents, digits = 2) => cents / 10 ** digits;

const fmtCache = new Map<string, Intl.NumberFormat>();
function getFmt(currency: string, locale: string | undefined, compact: boolean, digits?: number) {
  const key = `${currency}|${locale}|${compact}|${digits}`;
  let f = fmtCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        notation: compact ? "compact" : "standard",
        maximumFractionDigits: compact ? 1 : digits,
        minimumFractionDigits: compact ? 0 : digits,
      });
    } catch {
      f = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    }
    fmtCache.set(key, f);
  }
  return f;
}

export interface MoneyFormatOptions {
  locale?: string;
  compact?: boolean;
  /** Always show + for positive values. */
  signed?: boolean;
  /** Drop minor units (e.g. "$1,204"). */
  whole?: boolean;
}

export function formatMoney(cents: Cents, currency: string, opts: MoneyFormatOptions = {}): string {
  const digits = currencyDigits(currency);
  const value = toMajor(cents, digits);
  const s = getFmt(currency, opts.locale, !!opts.compact, opts.whole ? 0 : digits).format(value);
  if (opts.signed && cents > 0) return `+${s}`;
  return s;
}

export const sumCents = (values: Cents[]) => values.reduce((a, b) => a + b, 0);
