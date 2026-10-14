/**
 * Column mapping for statement/holdings CSVs. Presets only *suggest* columns
 * by header name; the user always sees and can correct the mapping.
 */
import { normalizeDate, type DateFormat } from "../data/csv";
import { parseMoney } from "../domain/money";
import type { RawRecord } from "./importer";

export type TxField = "date" | "description" | "amount" | "credit" | "debit" | "currency" | "externalId" | "status" | "type" | "counterparty";
export type HoldingField = "symbol" | "name" | "quantity" | "currency" | "price" | "valuation" | "date";
export type Mapping<F extends string> = Partial<Record<F, number>>;

const n = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s_-]+/g, " ");

export const TX_FIELDS: { key: TxField; label: string; aliases: string[] }[] = [
  { key: "date", label: "Date", aliases: ["date", "fecha", "transaction date", "fecha de operacion", "fecha operacion", "fecha de liquidacion", "posted date"] },
  { key: "description", label: "Description", aliases: ["description", "descripcion", "concepto", "detalle", "memo", "details", "record type"] },
  { key: "amount", label: "Amount (signed)", aliases: ["amount", "importe", "monto", "total", "net amount", "importe neto"] },
  { key: "credit", label: "Money in (credit)", aliases: ["net credit amount", "credit", "credito", "ingreso", "deposit", "money in", "haber"] },
  { key: "debit", label: "Money out (debit)", aliases: ["net debit amount", "debit", "debito", "egreso", "withdrawal", "money out", "debe"] },
  { key: "currency", label: "Currency", aliases: ["currency", "moneda", "currency id", "settlement currency"] },
  { key: "externalId", label: "Provider id", aliases: ["source id", "id", "operation id", "id de operacion", "numero de operacion", "referencia", "reference", "transaction id"] },
  { key: "status", label: "Status", aliases: ["status", "estado"] },
  { key: "type", label: "Type", aliases: ["type", "tipo", "record type", "transaction type", "tipo de operacion"] },
  { key: "counterparty", label: "Counterparty", aliases: ["counterparty", "contraparte", "payer", "pagador", "merchant", "comercio"] },
];

export const HOLDING_FIELDS: { key: HoldingField; label: string; aliases: string[]; required?: boolean }[] = [
  { key: "symbol", label: "Asset / ticker", aliases: ["ticker", "symbol", "simbolo", "especie", "instrumento", "activo"], required: true },
  { key: "name", label: "Name", aliases: ["name", "nombre", "descripcion"] },
  { key: "quantity", label: "Quantity", aliases: ["quantity", "cantidad", "nominales", "cuotapartes", "tenencia"], required: true },
  { key: "currency", label: "Currency", aliases: ["currency", "moneda"] },
  { key: "price", label: "Unit price", aliases: ["price", "precio", "ultimo precio", "cotizacion"] },
  { key: "valuation", label: "Valuation", aliases: ["valuation", "valuacion", "valor", "monto", "total", "valorizado"] },
  { key: "date", label: "Valuation date", aliases: ["date", "fecha", "fecha de valuacion"] },
];

export interface DetectedPreset {
  id: "mercadopago-report" | "generic";
  label: string;
  note: string;
}

export function detectPreset(header: string[]): DetectedPreset {
  const h = header.map(n);
  if (h.includes("source id") && (h.includes("net credit amount") || h.includes("net debit amount")))
    return { id: "mercadopago-report", label: "Mercado Pago account report", note: "Matched by column names (SOURCE_ID, NET_CREDIT_AMOUNT/NET_DEBIT_AMOUNT). Check the mapping against your file." };
  return { id: "generic", label: "Generic statement", note: "Columns matched by common names in English and Spanish. Review the mapping below." };
}

export function autoMap<F extends string>(header: string[], fields: { key: F; aliases: string[] }[]): Mapping<F> {
  const h = header.map(n);
  const out: Mapping<F> = {};
  const used = new Set<number>();
  // Aliases are listed in priority order: the best-matching header wins, not the first column.
  for (const f of fields) {
    for (const alias of f.aliases) {
      const i = h.findIndex((x, idx) => !used.has(idx) && x === alias);
      if (i >= 0) {
        out[f.key] = i;
        used.add(i);
        break;
      }
    }
  }
  return out;
}

export interface RowError {
  line: number;
  reason: string;
}

/** Applies a transaction mapping. Rows that can't be read are reported, never guessed. */
export function rowsToRaw(rows: string[][], map: Mapping<TxField>, dateFormat: DateFormat, digits = 2): { raw: RawRecord[]; errors: RowError[] } {
  const raw: RawRecord[] = [];
  const errors: RowError[] = [];
  const get = (r: string[], k: TxField) => (map[k] != null ? (r[map[k]!] ?? "").trim() : "");
  rows.forEach((r, i) => {
    const line = i + 2;
    const date = normalizeDate(get(r, "date"), dateFormat);
    if (!date) return errors.push({ line, reason: `Unreadable date “${get(r, "date")}”` });
    let signed: number | null = null;
    if (map.amount != null) {
      const v = parseMoney(get(r, "amount"), digits);
      if (v == null) return errors.push({ line, reason: "Unreadable amount" });
      signed = v;
    } else if (map.credit != null || map.debit != null) {
      const c = get(r, "credit") ? parseMoney(get(r, "credit"), digits) : 0;
      const d = get(r, "debit") ? parseMoney(get(r, "debit"), digits) : 0;
      if (c == null || d == null) return errors.push({ line, reason: "Unreadable credit/debit" });
      signed = Math.abs(c) - Math.abs(d);
    } else return errors.push({ line, reason: "No amount column mapped" });
    // A type column that explicitly states direction overrides an unsigned amount.
    const t = n(get(r, "type"));
    if (signed != null && signed > 0 && /(debit|debito|egreso|expense|gasto|pago|payment)/.test(t) && !/(credit|ingreso)/.test(t)) signed = -signed;
    if (signed === 0) return errors.push({ line, reason: "Zero amount" });
    raw.push({
      externalId: get(r, "externalId") || null,
      date,
      signedAmount: signed,
      currency: get(r, "currency") ? get(r, "currency").toUpperCase() : null,
      description: get(r, "description"),
      counterparty: get(r, "counterparty") || undefined,
      providerStatus: get(r, "status") || undefined,
      typeHint: get(r, "type") || undefined,
    });
  });
  return { raw, errors };
}

export interface RawHolding {
  symbol: string;
  name?: string;
  quantity: number;
  currency: string | null;
  price: number | null;
  valuation: number | null;
  date: string | null;
}

export function rowsToHoldings(rows: string[][], map: Mapping<HoldingField>, dateFormat: DateFormat, digits = 2): { holdings: RawHolding[]; errors: RowError[] } {
  const holdings: RawHolding[] = [];
  const errors: RowError[] = [];
  const get = (r: string[], k: HoldingField) => (map[k] != null ? (r[map[k]!] ?? "").trim() : "");
  rows.forEach((r, i) => {
    const line = i + 2;
    const symbol = get(r, "symbol").toUpperCase();
    if (!symbol) return errors.push({ line, reason: "Missing asset/ticker" });
    // Quantity can be fractional (e.g. fund units): parse as a plain decimal.
    const qCents = parseMoney(get(r, "quantity"), 6);
    if (qCents == null) return errors.push({ line, reason: "Unreadable quantity" });
    const date = get(r, "date") ? normalizeDate(get(r, "date"), dateFormat) : null;
    if (get(r, "date") && !date) return errors.push({ line, reason: "Unreadable date" });
    holdings.push({
      symbol,
      name: get(r, "name") || undefined,
      quantity: qCents / 1e6,
      currency: get(r, "currency") ? get(r, "currency").toUpperCase() : null,
      price: get(r, "price") ? parseMoney(get(r, "price"), digits) : null,
      valuation: get(r, "valuation") ? parseMoney(get(r, "valuation"), digits) : null,
      date,
    });
  });
  return { holdings, errors };
}
