import type { Account, Budget, Category, Goal, GoalContribution, ID, RecurringItem, Transaction } from "../domain/types";
import { LIABILITY_TYPES } from "../domain/types";
import type { Cents } from "../domain/money";
import { addDays, addMonths, diffDays, eachDay, endOfMonth, inRange, monthKey, startOfMonth, startOfWeek, type DateRange, type ISODate } from "../domain/dates";
import { occurrencesBetween } from "../domain/recurrence";

// ───────────────────────── Balances ─────────────────────────

/**
 * Signed effect of a transaction on one account. Transfers move money between
 * accounts and are neutral overall — they are never income or spending.
 */
export function txEffectOn(tx: Transaction, accountId: ID): Cents {
  if (tx.type === "transfer") {
    let e = 0;
    if (tx.accountId === accountId) e -= tx.amount;
    if (tx.toAccountId === accountId) e += tx.amount;
    return e;
  }
  if (tx.accountId !== accountId) return 0;
  return tx.type === "income" ? tx.amount : -tx.amount;
}

export function accountBalance(account: Account, txs: Transaction[], asOf?: ISODate): Cents {
  let bal = account.openingBalance;
  for (const tx of txs) {
    if (asOf && tx.date > asOf) continue;
    if (tx.accountId !== account.id && tx.toAccountId !== account.id) continue;
    bal += txEffectOn(tx, account.id);
  }
  return bal;
}

export const isLiability = (a: Account) => LIABILITY_TYPES.includes(a.type);

export interface BalanceSummary {
  currency: string;
  assets: Cents;
  liabilities: Cents; // positive number = amount owed
  net: Cents;
  byAccount: { account: Account; balance: Cents }[];
  /** Active accounts in other currencies are excluded from totals (no FX conversion). */
  excluded: { account: Account; balance: Cents }[];
}

export function balanceSummary(accounts: Account[], txs: Transaction[], currency: string, asOf?: ISODate): BalanceSummary {
  const byAccount: BalanceSummary["byAccount"] = [];
  const excluded: BalanceSummary["excluded"] = [];
  let assets = 0;
  let liabilities = 0;
  for (const account of accounts) {
    if (account.archived) continue;
    const balance = accountBalance(account, txs, asOf);
    if (account.currency !== currency) {
      excluded.push({ account, balance });
      continue;
    }
    byAccount.push({ account, balance });
    // A liability account normally carries a negative balance (money owed);
    // an asset account in overdraft is also counted as owed.
    if (balance >= 0) assets += balance;
    else liabilities += -balance;
  }
  return { currency, assets, liabilities, net: assets - liabilities, byAccount, excluded };
}

// ───────────────────────── Period totals ─────────────────────────

/** Only transactions on accounts in the base currency contribute to totals. */
export function txInCurrency(txs: Transaction[], accounts: Account[], currency: string): Transaction[] {
  const ok = new Set(accounts.filter((a) => a.currency === currency).map((a) => a.id));
  return txs.filter((t) => ok.has(t.accountId));
}

export interface PeriodTotals {
  income: Cents;
  expenses: Cents;
  net: Cents;
  /** net / income, null when there is no income. */
  savingsRate: number | null;
  count: number;
}

export function periodTotals(txs: Transaction[], range: DateRange): PeriodTotals {
  let income = 0;
  let expenses = 0;
  let count = 0;
  for (const t of txs) {
    if (!inRange(t.date, range.start, range.end) || t.type === "transfer") continue;
    count++;
    if (t.type === "income") income += t.amount;
    else expenses += t.amount;
  }
  const net = income - expenses;
  return { income, expenses, net, savingsRate: income > 0 ? net / income : null, count };
}

/** Relative change, null when the previous value is zero (no meaningful %). */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

// ───────────────────────── Categories ─────────────────────────

/** Top-level category id (subcategories roll up to their parent). */
export function rootCategoryId(categoryId: ID | null, byId: Map<ID, Category>): ID | null {
  if (!categoryId) return null;
  let c = byId.get(categoryId);
  let guard = 0;
  while (c?.parentId && guard++ < 10) c = byId.get(c.parentId);
  return c?.id ?? categoryId;
}

export function descendantIds(categoryId: ID, categories: Category[]): Set<ID> {
  const out = new Set<ID>([categoryId]);
  let added = true;
  while (added) {
    added = false;
    for (const c of categories) if (c.parentId && out.has(c.parentId) && !out.has(c.id)) { out.add(c.id); added = true; }
  }
  return out;
}

export interface CategorySpend {
  categoryId: ID | null;
  amount: Cents;
  share: number;
}

export function spendingByCategory(txs: Transaction[], categories: Category[], range: DateRange, kind: "expense" | "income" = "expense"): CategorySpend[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<ID | null, Cents>();
  let total = 0;
  for (const t of txs) {
    if (t.type !== kind || !inRange(t.date, range.start, range.end)) continue;
    const root = rootCategoryId(t.categoryId, byId);
    totals.set(root, (totals.get(root) ?? 0) + t.amount);
    total += t.amount;
  }
  return [...totals.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount, share: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

// ───────────────────────── Budgets ─────────────────────────

export type BudgetState = "ok" | "warning" | "over";
export interface BudgetStatus {
  budget: Budget;
  /** Budget amount scaled to the evaluated range (monthly budgets prorated for non-month ranges). */
  limit: Cents;
  spent: Cents;
  remaining: Cents;
  pct: number;
  state: BudgetState;
}

export function budgetState(spent: Cents, limit: Cents, warnAt: number): BudgetState {
  if (limit <= 0) return spent > 0 ? "over" : "ok";
  if (spent > limit) return "over";
  if (spent >= limit * warnAt) return "warning";
  return "ok";
}

/** Number of months a range spans, counted precisely by days per month. */
export function monthsInRange(range: DateRange): number {
  let months = 0;
  let cursor = range.start;
  while (cursor <= range.end) {
    const mEnd = endOfMonth(cursor);
    const segEnd = mEnd < range.end ? mEnd : range.end;
    const dim = diffDays(startOfMonth(cursor), mEnd) + 1;
    months += (diffDays(cursor, segEnd) + 1) / dim;
    cursor = addDays(segEnd, 1);
  }
  return months;
}

export function budgetStatus(budget: Budget, txs: Transaction[], categories: Category[], range: DateRange): BudgetStatus {
  const ids = descendantIds(budget.categoryId, categories);
  let spent = 0;
  for (const t of txs) {
    if (t.type !== "expense" || !t.categoryId || !ids.has(t.categoryId)) continue;
    if (inRange(t.date, range.start, range.end)) spent += t.amount;
  }
  const limit = Math.round(budget.amount * monthsInRange(range));
  return {
    budget,
    limit,
    spent,
    remaining: limit - spent,
    pct: limit > 0 ? spent / limit : spent > 0 ? Infinity : 0,
    state: budgetState(spent, limit, budget.warnAt),
  };
}

export function budgetHistory(budget: Budget, txs: Transaction[], categories: Category[], monthAnchor: ISODate, months = 6) {
  const out: { month: string; spent: Cents; limit: Cents }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = addMonths(startOfMonth(monthAnchor), -i);
    const s = budgetStatus(budget, txs, categories, { start: m, end: endOfMonth(m) });
    out.push({ month: monthKey(m), spent: s.spent, limit: s.limit });
  }
  return out;
}

// ───────────────────────── Time series ─────────────────────────

export type Bucket = "day" | "week" | "month";
export function chooseBucket(range: DateRange): Bucket {
  const days = diffDays(range.start, range.end) + 1;
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

export function bucketKey(date: ISODate, bucket: Bucket, weekStartsOn: 0 | 1): ISODate {
  if (bucket === "day") return date;
  if (bucket === "week") return startOfWeek(date, weekStartsOn);
  return startOfMonth(date);
}

export interface CashflowPoint {
  key: ISODate;
  income: Cents;
  expenses: Cents;
  net: Cents;
}

export function cashflowSeries(txs: Transaction[], range: DateRange, bucket: Bucket, weekStartsOn: 0 | 1 = 1): CashflowPoint[] {
  const keys: ISODate[] = [];
  const seen = new Set<string>();
  for (const d of eachDay(range.start, range.end)) {
    const k = bucketKey(d, bucket, weekStartsOn);
    if (!seen.has(k)) { seen.add(k); keys.push(k); }
  }
  const map = new Map<ISODate, CashflowPoint>(keys.map((k) => [k, { key: k, income: 0, expenses: 0, net: 0 }]));
  for (const t of txs) {
    if (t.type === "transfer" || !inRange(t.date, range.start, range.end)) continue;
    const p = map.get(bucketKey(t.date, bucket, weekStartsOn));
    if (!p) continue;
    if (t.type === "income") p.income += t.amount;
    else p.expenses += t.amount;
    p.net = p.income - p.expenses;
  }
  return keys.map((k) => map.get(k)!);
}

/** Daily total balance across base-currency accounts (for the balance sparkline). */
export function balanceSeries(accounts: Account[], txs: Transaction[], currency: string, range: DateRange): { key: ISODate; balance: Cents }[] {
  const active = accounts.filter((a) => !a.archived && a.currency === currency);
  const ids = new Set(active.map((a) => a.id));
  let bal = active.reduce((s, a) => s + accountBalance(a, txs, addDays(range.start, -1)), 0);
  const deltas = new Map<ISODate, Cents>();
  for (const t of txs) {
    if (!inRange(t.date, range.start, range.end)) continue;
    let d = 0;
    for (const id of ids) d += txEffectOn(t, id);
    if (d) deltas.set(t.date, (deltas.get(t.date) ?? 0) + d);
  }
  return eachDay(range.start, range.end).map((key) => {
    bal += deltas.get(key) ?? 0;
    return { key, balance: bal };
  });
}

// ───────────────────────── Recurring / bills ─────────────────────────

export interface Occurrence {
  item: RecurringItem;
  date: ISODate;
  /** Transaction that settled this occurrence, if any. */
  paidTx: Transaction | null;
  status: "paid" | "due" | "overdue" | "scheduled";
}

export function recurringOccurrences(items: RecurringItem[], txs: Transaction[], from: ISODate, to: ISODate, today: ISODate): Occurrence[] {
  const settled = new Map<string, Transaction>();
  for (const t of txs) if (t.recurringId && t.occurrenceDate) settled.set(`${t.recurringId}|${t.occurrenceDate}`, t);
  const out: Occurrence[] = [];
  for (const item of items) {
    if (!item.active) continue;
    for (const date of occurrencesBetween(item.startDate, item.rule, from, to)) {
      const paidTx = settled.get(`${item.id}|${date}`) ?? null;
      const status = paidTx ? "paid" : date < today ? "overdue" : diffDays(today, date) <= item.remindDaysBefore ? "due" : "scheduled";
      out.push({ item, date, paidTx, status });
    }
  }
  return out.sort((a, b) => (a.date === b.date ? a.item.name.localeCompare(b.item.name) : a.date < b.date ? -1 : 1));
}

/** Normalised monthly cost of a recurring item (for subscription totals). */
export function monthlyEquivalent(item: RecurringItem): Cents {
  const n = Math.max(1, item.rule.interval);
  switch (item.rule.freq) {
    case "daily": return Math.round((item.amount * 365) / 12 / n);
    case "weekly": return Math.round((item.amount * 52 * Math.max(1, item.rule.byWeekday?.length ?? 1)) / 12 / n);
    case "monthly": return Math.round(item.amount / n);
    case "yearly": return Math.round(item.amount / 12 / n);
  }
}

// ───────────────────────── Savings goals ─────────────────────────

export interface MoneyGoalProgress {
  saved: Cents;
  target: Cents;
  remaining: Cents;
  pct: number;
  /** Average net contribution per month over the last 3 months, from recorded contributions only. */
  monthlyPace: Cents;
  /** Needed per month to reach target by targetDate (null without a date or when reached). */
  neededPerMonth: Cents | null;
  /** Straight-line estimate from monthlyPace; no returns or interest are assumed. */
  estimatedDate: ISODate | null;
  onTrack: boolean | null;
}

export function moneyGoalProgress(goal: Goal, contributions: GoalContribution[], today: ISODate): MoneyGoalProgress | null {
  if (goal.measure.type !== "money") return null;
  const target = goal.measure.targetAmount;
  const mine = contributions.filter((c) => c.goalId === goal.id && c.date <= today);
  const saved = mine.reduce((s, c) => s + c.amount, 0);
  const remaining = Math.max(0, target - saved);
  const since = addMonths(today, -3);
  const recent = mine.filter((c) => c.date > since).reduce((s, c) => s + c.amount, 0);
  const monthlyPace = Math.round(recent / 3);
  let neededPerMonth: Cents | null = null;
  if (goal.targetDate && remaining > 0) {
    const months = Math.max(1, diffDays(today, goal.targetDate) / 30.44);
    neededPerMonth = goal.targetDate > today ? Math.ceil(remaining / months) : remaining;
  }
  let estimatedDate: ISODate | null = null;
  if (remaining === 0) estimatedDate = today;
  else if (monthlyPace > 0) estimatedDate = addDays(today, Math.ceil((remaining / monthlyPace) * 30.44));
  const onTrack = remaining === 0 ? true : goal.targetDate && estimatedDate ? estimatedDate <= goal.targetDate : goal.targetDate ? false : null;
  return { saved, target, remaining, pct: target > 0 ? Math.min(1, saved / target) : 0, monthlyPace, neededPerMonth, estimatedDate, onTrack };
}
