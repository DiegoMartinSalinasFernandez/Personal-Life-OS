/**
 * Import staging: turns provider rows (API or CSV) into ImportedRecords,
 * detects duplicates and decides what needs human review. Pure functions —
 * the store applies the result. Nothing here touches financial summaries:
 * only accepted records become transactions.
 */
import type { Account, ImportedKind, ImportedRecord, Transaction } from "../domain/types";
import { diffDays, type ISODate } from "../domain/dates";
import type { Cents } from "../domain/money";

/** Normalized row produced by a provider adapter or CSV mapping. */
export interface RawRecord {
  externalId: string | null;
  date: ISODate;
  /** Signed: positive = money in, negative = money out. Null when the source doesn't say. */
  signedAmount: Cents | null;
  /** Used when the sign is unknown. */
  absAmount?: Cents;
  currency: string | null;
  description: string;
  counterparty?: string;
  providerStatus?: string;
  fee?: Cents | null;
  typeHint?: string;
}

export interface StageContext {
  provider: string;
  sourceId: string;
  runId: string;
  account: Account | null;
  reviewAll: boolean;
  transactions: Transaction[];
  existing: ImportedRecord[];
}

export interface StageResult {
  records: Omit<ImportedRecord, "id" | "createdAt">[];
  counts: { added: number; duplicates: number; needsReview: number; ignored: number; autoAccept: number };
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

const TRANSFER_RE = /\b(transferencia|transfer|envio de dinero|dinero enviado|dinero recibido|ingreso de dinero|retiro|withdraw(al)?|deposit[o]?|cvu|cbu)\b/;
const INVEST_RE = /\b(compra|venta|suscripcion|rescate|fci|cedear|bono|accion(es)?|dividendo|cupon|buy|sell|trade|caucion)\b/;
const OK_STATUS = new Set(["approved", "accredited", "completed", "ok", "aprobado", "acreditado"]);
const IGNORE_STATUS = new Set(["rejected", "cancelled", "canceled", "rechazado", "cancelado"]);

/** Stable content fingerprint for rows without a provider id (re-importing the same file is idempotent). */
export function fingerprint(r: RawRecord, occurrence: number): string {
  const amt = r.signedAmount ?? r.absAmount ?? 0;
  return `fp:${r.date}|${amt}|${norm(r.description).slice(0, 60)}#${occurrence}`;
}

export function guessKind(r: RawRecord): ImportedKind {
  const text = norm(`${r.typeHint ?? ""} ${r.description}`);
  if (INVEST_RE.test(text)) return "investment";
  if (TRANSFER_RE.test(text)) return "transfer";
  if (r.signedAmount == null) return "unknown";
  return r.signedAmount >= 0 ? "income" : "expense";
}

/** A manual (non-imported) transaction that probably represents the same movement. */
export function findProbableDuplicate(rec: { date: ISODate; amount: Cents; direction: "in" | "out" | "unknown" }, account: Account | null, txs: Transaction[]): Transaction | null {
  if (!account) return null;
  for (const t of txs) {
    if (t.source) continue; // imported ones are matched by id/fingerprint
    if (t.amount !== rec.amount) continue;
    if (Math.abs(diffDays(t.date, rec.date)) > 2) continue;
    const touches = t.accountId === account.id || t.toAccountId === account.id;
    if (!touches) continue;
    const dirOk = rec.direction === "unknown" || t.type === "transfer" || (rec.direction === "in" ? t.type === "income" : t.type === "expense");
    if (dirOk) return t;
  }
  return null;
}

export function stageRecords(rows: RawRecord[], ctx: StageContext): StageResult {
  const knownIds = new Set<string>();
  for (const t of ctx.transactions) if (t.source?.provider === ctx.provider && t.source.externalId) knownIds.add(t.source.externalId);
  for (const r of ctx.existing) if (r.provider === ctx.provider && r.externalId && r.state !== "rejected") knownIds.add(r.externalId);

  const seenFp = new Map<string, number>();
  const counts = { added: 0, duplicates: 0, needsReview: 0, ignored: 0, autoAccept: 0 };
  const records: StageResult["records"] = [];

  for (const r of rows) {
    let externalId = r.externalId?.trim() || null;
    if (!externalId) {
      const base = fingerprint(r, 0).replace(/#0$/, "");
      const n = seenFp.get(base) ?? 0;
      seenFp.set(base, n + 1);
      externalId = `${base}#${n}`;
    }
    const issues: string[] = [];
    const amountRaw = r.signedAmount ?? r.absAmount ?? null;
    const amount = amountRaw == null ? 0 : Math.abs(amountRaw);
    const direction: ImportedRecord["direction"] = r.signedAmount == null ? "unknown" : r.signedAmount >= 0 ? "in" : "out";
    const kindGuess = guessKind(r);
    const currency = (r.currency || ctx.account?.currency || "").toUpperCase();

    const base = {
      sourceId: ctx.sourceId,
      runId: ctx.runId,
      provider: ctx.provider,
      externalId,
      date: r.date,
      amount,
      direction,
      currency,
      description: r.description.trim(),
      counterparty: r.counterparty,
      providerStatus: r.providerStatus,
      fee: r.fee ?? null,
      kindGuess,
      transactionIds: [] as string[],
      duplicateOfId: null as string | null,
    };

    if (knownIds.has(externalId)) {
      counts.duplicates++;
      continue; // already imported or staged: never create it twice
    }
    knownIds.add(externalId);

    const status = r.providerStatus ? norm(r.providerStatus) : null;
    if (status && IGNORE_STATUS.has(status)) {
      records.push({ ...base, issues: [`Provider status “${r.providerStatus}” — no money moved`], state: "ignored" });
      counts.added++;
      counts.ignored++;
      continue;
    }

    if (!amount) issues.push("Amount missing or zero");
    if (direction === "unknown") issues.push("The source doesn't say whether money came in or went out");
    if (!base.description) issues.push("No description");
    if (status && !OK_STATUS.has(status)) issues.push(`Provider status “${r.providerStatus}” is not final`);
    if (!r.currency) issues.push("Currency not provided — assumed to be the account currency");
    if (ctx.account && currency && currency !== ctx.account.currency) issues.push(`Currency ${currency} differs from the linked account (${ctx.account.currency})`);
    if (!ctx.account) issues.push("Link this source to an account before accepting");
    if (kindGuess === "transfer") issues.push("Looks like a transfer — confirm whether it's between your own accounts");
    if (kindGuess === "investment") issues.push("Looks like an investment trade — it changes holdings, not spending");
    if (kindGuess === "unknown") issues.push("Type couldn't be determined");
    const dup = findProbableDuplicate({ date: r.date, amount, direction }, ctx.account, ctx.transactions);
    if (dup) {
      issues.push(`Possible duplicate of “${dup.description}” on ${dup.date}`);
      base.duplicateOfId = dup.id;
    }

    const clean = issues.length === 0;
    const state = "pending" as const;
    if (clean && !ctx.reviewAll) counts.autoAccept++;
    else counts.needsReview++;
    counts.added++;
    records.push({ ...base, issues, state });
  }
  return { records, counts };
}

export type Resolution =
  | { as: "income" | "expense" }
  | { as: "transfer"; toAccountId: string; direction: "in" | "out" }
  | { as: "link"; transactionId: string }
  | { as: "reject" };

/** Builds the transactions an accepted record produces (gross + separate fee when present). */
export function recordToTransactions(rec: ImportedRecord, accountId: string, res: Exclude<Resolution, { as: "reject" } | { as: "link" }>): Omit<Transaction, "id" | "createdAt">[] {
  const source = { sourceId: rec.sourceId, provider: rec.provider, externalId: rec.externalId, runId: rec.runId };
  const tags = ["imported", rec.provider];
  const notes = [rec.counterparty ? `Counterparty: ${rec.counterparty}` : null, rec.providerStatus ? `Provider status: ${rec.providerStatus}` : null].filter(Boolean).join(" · ") || undefined;
  const out: Omit<Transaction, "id" | "createdAt">[] = [];
  if (res.as === "transfer") {
    const fromId = res.direction === "out" ? accountId : res.toAccountId;
    const toId = res.direction === "out" ? res.toAccountId : accountId;
    out.push({ type: "transfer", amount: rec.amount, accountId: fromId, toAccountId: toId, categoryId: null, date: rec.date, description: rec.description || "Transfer", tags, notes, source });
  } else {
    out.push({ type: res.as, amount: rec.amount, accountId, toAccountId: null, categoryId: null, date: rec.date, description: rec.description || (res.as === "income" ? "Imported income" : "Imported expense"), merchant: rec.counterparty, tags, notes, source });
  }
  if (rec.fee && rec.fee > 0 && res.as === "income") {
    out.push({ type: "expense", amount: rec.fee, accountId, toAccountId: null, categoryId: "cat-fees", date: rec.date, description: `${rec.provider === "mercadopago" ? "Mercado Pago" : "Provider"} fees`, tags, source: { ...source, externalId: `${rec.externalId}:fee` } });
  }
  return out;
}

/** Default resolution for a clean record (used for auto-accept). */
export function defaultResolution(rec: ImportedRecord): Exclude<Resolution, { as: "link" } | { as: "reject" } | { as: "transfer" }> | null {
  if (rec.issues.length) return null;
  if (rec.kindGuess === "income" || rec.kindGuess === "expense") return { as: rec.kindGuess };
  return null;
}
