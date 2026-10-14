"use client";

import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Repeat } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconTile } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { useMoney } from "@/lib/hooks";
import { formatDate } from "@/lib/domain/dates";
import type { Account, Category, Transaction } from "@/lib/domain/types";
import type { BudgetState } from "@/lib/calc/finance";
import { AlertTriangle, CheckCircle2, XOctagon } from "lucide-react";

export const ACCOUNT_TYPE_LABEL: Record<Account["type"], string> = { cash: "Cash", checking: "Checking", savings: "Savings", credit: "Credit card", investment: "Investment", loan: "Loan", other: "Other" };

/** Signed, coloured amount. Sign and arrow carry meaning without colour. */
export function Amount({ tx, currency, className }: { tx: Pick<Transaction, "type" | "amount">; currency: string; className?: string }) {
  const money = useMoney();
  if (tx.type === "transfer") return <span className={cn("num font-medium text-ink-2", className)}>{money(tx.amount, {}, currency)}</span>;
  return <span className={cn("num font-semibold", tx.type === "income" ? "text-positive" : "text-ink", className)}>{tx.type === "income" ? "+" : "−"}{money(tx.amount, {}, currency)}</span>;
}

export function TxIcon({ tx, category }: { tx: Transaction; category?: Category }) {
  if (tx.type === "transfer")
    return (
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-ink-2">
        <ArrowLeftRight className="size-4" aria-hidden />
      </span>
    );
  if (category) return <IconTile name={category.icon} color={category.color} />;
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", tx.type === "income" ? "bg-positive-soft text-positive" : "bg-muted text-ink-3")}>
      {tx.type === "income" ? <ArrowDownLeft className="size-4" aria-hidden /> : <ArrowUpRight className="size-4" aria-hidden />}
    </span>
  );
}

export function TxRow({ tx, categories, accounts, onClick, showDate = true }: { tx: Transaction; categories: Map<string, Category>; accounts: Map<string, Account>; onClick?: () => void; showDate?: boolean }) {
  const cat = tx.categoryId ? categories.get(tx.categoryId) : undefined;
  const acc = accounts.get(tx.accountId);
  const to = tx.toAccountId ? accounts.get(tx.toAccountId) : undefined;
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-subtle">
      <TxIcon tx={tx} category={cat} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-base font-medium text-ink">{tx.description}</span>
          {tx.recurringId ? <Repeat className="size-3 shrink-0 text-ink-3" aria-label="Recurring" /> : null}
          {tx.source ? <Badge tone="info">Imported</Badge> : null}
        </span>
        <span className="block truncate text-caption text-ink-3">
          {tx.type === "transfer" ? `${acc?.name ?? "?"} → ${to?.name ?? "?"}` : [cat?.name ?? "Uncategorized", tx.merchant].filter(Boolean).join(" · ")}
          {showDate ? ` · ${formatDate(tx.date)}` : ""}
        </span>
      </span>
      <Amount tx={tx} currency={acc?.currency ?? "USD"} className="text-base" />
    </button>
  );
}

export function BudgetBadge({ state, pct }: { state: BudgetState; pct: number }) {
  if (state === "over") return <Badge tone="negative" icon={<XOctagon />}>Over budget</Badge>;
  if (state === "warning") return <Badge tone="warning" icon={<AlertTriangle />}>{Math.round(pct * 100)}% used</Badge>;
  return <Badge tone="positive" icon={<CheckCircle2 />}>On track</Badge>;
}

export const budgetTone = (s: BudgetState) => (s === "over" ? "negative" : s === "warning" ? "warning" : "finance") as "negative" | "warning" | "finance";
