"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Upload, Search, X, ArrowUpDown, ReceiptText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useDb, useMoney, useSessionState } from "@/lib/hooks";
import { openSheet } from "@/lib/store/ui";
import { formatDate, relativeDay, isISODate } from "@/lib/domain/dates";
import { useToday } from "@/lib/hooks";
import { descendantIds } from "@/lib/calc/finance";
import { downloadText, toCSV } from "@/lib/data/csv";
import { centsToInput, currencyDigits } from "@/lib/domain/money";
import type { Transaction, TxType } from "@/lib/domain/types";
import { CategoryOptions, AccountOptions } from "@/features/common/options";
import { Amount, TxIcon } from "@/features/finance/shared";
import { CsvImportDialog } from "@/features/finance/csv-import";

type Sort = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";
interface Filters {
  q: string;
  type: "all" | TxType;
  account: string;
  category: string;
  from: string;
  to: string;
  sort: Sort;
}
const PAGE = 50;

function TransactionsInner() {
  const db = useDb();
  const money = useMoney();
  const today = useToday();
  const params = useSearchParams();
  const [f, setF] = useSessionState<Filters>("tx-filters", { q: "", type: "all", account: params.get("account") ?? "", category: params.get("category") ?? "", from: "", to: "", sort: "date-desc" });
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => {
    const account = params.get("account");
    const category = params.get("category");
    if (account || category) setF((prev) => ({ ...prev, account: account ?? prev.account, category: category ?? prev.category }));
  }, [params, setF]);
  const [importing, setImporting] = useState(false);
  const patch = (p: Partial<Filters>) => {
    setF({ ...f, ...p });
    setLimit(PAGE);
  };
  const catMap = useMemo(() => new Map(db.categories.map((c) => [c.id, c])), [db.categories]);
  const accMap = useMemo(() => new Map(db.accounts.map((a) => [a.id, a])), [db.accounts]);

  const filtered = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const catIds = f.category && f.category !== "none" ? descendantIds(f.category, db.categories) : null;
    const out = db.transactions.filter((t) => {
      if (f.type !== "all" && t.type !== f.type) return false;
      if (f.account && t.accountId !== f.account && t.toAccountId !== f.account) return false;
      if (f.category === "none" && (t.categoryId || t.type === "transfer")) return false;
      if (catIds && (!t.categoryId || !catIds.has(t.categoryId))) return false;
      if (f.from && t.date < f.from) return false;
      if (f.to && t.date > f.to) return false;
      if (q) {
        const hay = `${t.description} ${t.merchant ?? ""} ${t.notes ?? ""} ${t.tags.join(" ")} ${catMap.get(t.categoryId ?? "")?.name ?? ""}`.toLowerCase();
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const dir = f.sort.endsWith("asc") ? 1 : -1;
    return out.sort((a, b) => (f.sort.startsWith("amount") ? (a.amount - b.amount) * dir || (a.date < b.date ? 1 : -1) : (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date < b.date ? -1 : 1) * dir));
  }, [db.transactions, db.categories, f, catMap]);

  const summary = useMemo(() => {
    let income = 0, expenses = 0;
    for (const t of filtered) {
      if (accMap.get(t.accountId)?.currency !== money.currency) continue;
      if (t.type === "income") income += t.amount;
      else if (t.type === "expense") expenses += t.amount;
    }
    return { income, expenses };
  }, [filtered, accMap, money.currency]);

  const active = f.q || f.type !== "all" || f.account || f.category || f.from || f.to;
  const shown = filtered.slice(0, limit);
  const groups = useMemo(() => {
    if (!f.sort.startsWith("date")) return null;
    const g: { date: string; items: Transaction[] }[] = [];
    for (const t of shown) {
      const last = g[g.length - 1];
      if (last?.date === t.date) last.items.push(t);
      else g.push({ date: t.date, items: [t] });
    }
    return g;
  }, [shown, f.sort]);

  const exportCsv = () => {
    const rows = filtered.map((t) => {
      const acc = accMap.get(t.accountId);
      const digits = currencyDigits(acc?.currency ?? money.currency);
      return [t.date, t.type, t.description, centsToInput(t.type === "expense" ? -t.amount : t.amount, digits), acc?.currency ?? "", acc?.name ?? "", t.toAccountId ? accMap.get(t.toAccountId)?.name ?? "" : "", catMap.get(t.categoryId ?? "")?.name ?? "", t.merchant ?? "", t.tags.join(";"), t.notes ?? ""];
    });
    downloadText(`transactions-${today}.csv`, toCSV(["date", "type", "description", "amount", "currency", "account", "to_account", "category", "merchant", "tags", "notes"], rows));
    toast(`Exported ${rows.length} transactions`);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input value={f.q} onChange={(e) => patch({ q: e.target.value })} placeholder="Search description, merchant, tag…" className="pl-9" aria-label="Search transactions" />
          </div>
          <Segmented size="sm" label="Type" value={f.type} onChange={(type) => patch({ type })} options={[{ value: "all", label: "All" }, { value: "expense", label: "Expenses" }, { value: "income", label: "Income" }, { value: "transfer", label: "Transfers" }]} />
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => setImporting(true)}>
              <Upload /> Import CSV
            </Button>
            <Button size="sm" onClick={exportCsv} disabled={!filtered.length}>
              <Download /> Export
            </Button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
          <Select aria-label="Account" value={f.account} onChange={(e) => patch({ account: e.target.value })} className="h-8 text-sm">
            <option value="">All accounts</option>
            <AccountOptions accounts={db.accounts} />
          </Select>
          <Select aria-label="Category" value={f.category} onChange={(e) => patch({ category: e.target.value })} className="h-8 text-sm">
            <option value="">All categories</option>
            <option value="none">Uncategorized</option>
            <CategoryOptions categories={db.categories} />
          </Select>
          <Input type="date" aria-label="From date" value={f.from} max={f.to || undefined} onChange={(e) => patch({ from: isISODate(e.target.value) ? e.target.value : "" })} className="h-8 text-sm" />
          <Input type="date" aria-label="To date" value={f.to} min={f.from || undefined} onChange={(e) => patch({ to: isISODate(e.target.value) ? e.target.value : "" })} className="h-8 text-sm" />
          <div className="relative col-span-2 md:col-span-1">
            <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
            <Select aria-label="Sort" value={f.sort} onChange={(e) => patch({ sort: e.target.value as Sort })} className="h-8 pl-8 text-sm">
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="amount-desc">Largest amount</option>
              <option value="amount-asc">Smallest amount</option>
            </Select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-2.5 text-sm text-ink-3">
          <span>
            <span className="num font-medium text-ink">{filtered.length}</span> transactions
          </span>
          <span>
            In <span className="num font-medium text-positive">+{money(summary.income)}</span>
          </span>
          <span>
            Out <span className="num font-medium text-ink">−{money(summary.expenses)}</span>
          </span>
          {active ? (
            <button onClick={() => patch({ q: "", type: "all", account: "", category: "", from: "", to: "" })} className="ml-auto inline-flex items-center gap-1 font-medium text-ink-2 hover:text-ink">
              <X className="size-3.5" /> Clear filters
            </button>
          ) : null}
        </div>
      </Card>

      <Card>
        {!filtered.length ? (
          <EmptyState
            icon={<ReceiptText />}
            title={db.transactions.length ? "No transactions match these filters" : "No transactions yet"}
            description={db.transactions.length ? "Try widening the date range or clearing filters." : "Add one manually or import a CSV export from your bank."}
            action={
              db.transactions.length ? (
                <Button onClick={() => patch({ q: "", type: "all", account: "", category: "", from: "", to: "" })}>Clear filters</Button>
              ) : (
                <>
                  <Button variant="primary" onClick={() => openSheet({ kind: "transaction" })}>Add transaction</Button>
                  <Button onClick={() => setImporting(true)}>Import CSV</Button>
                </>
              )
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden w-full text-base md:table">
              <thead>
                <tr className="border-b border-line text-left text-caption uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-2 py-2.5 font-medium">Description</th>
                  <th className="px-2 py-2.5 font-medium">Category</th>
                  <th className="px-2 py-2.5 font-medium">Account</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => {
                  const cat = catMap.get(t.categoryId ?? "");
                  const acc = accMap.get(t.accountId);
                  return (
                    <tr key={t.id} onClick={() => openSheet({ kind: "transaction", id: t.id })} className="cursor-pointer border-b border-line/70 last:border-0 hover:bg-subtle">
                      <td className="num whitespace-nowrap px-4 py-2 text-sm text-ink-2">{formatDate(t.date, { month: "short", day: "numeric", year: "numeric" })}</td>
                      <td className="max-w-[320px] px-2 py-2">
                        <button className="flex w-full items-center gap-2.5 text-left" onClick={(e) => { e.stopPropagation(); openSheet({ kind: "transaction", id: t.id }); }}>
                          <TxIcon tx={t} category={cat} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink">{t.description}</span>
                            <span className="block truncate text-caption text-ink-3">
                              {t.merchant ?? ""}
                              {t.tags.length ? ` ${t.tags.map((x) => `#${x}`).join(" ")}` : ""}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="px-2 py-2 text-sm text-ink-2">{t.type === "transfer" ? <Badge>Transfer</Badge> : cat?.name ?? <span className="text-ink-3">Uncategorized</span>}</td>
                      <td className="px-2 py-2 text-sm text-ink-2">{t.type === "transfer" ? `${acc?.name} → ${accMap.get(t.toAccountId ?? "")?.name ?? "?"}` : acc?.name}</td>
                      <td className="px-4 py-2 text-right">
                        <Amount tx={t} currency={acc?.currency ?? money.currency} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Mobile list grouped by day */}
            <div className="md:hidden">
              {(groups ?? [{ date: "", items: shown }]).map((g) => (
                <section key={g.date || "all"}>
                  {g.date ? <p className="sticky top-[88px] z-10 border-b border-line bg-subtle/95 px-4 py-1.5 text-caption font-medium text-ink-2 backdrop-blur">{relativeDay(g.date, today)}</p> : null}
                  <ul className="px-2 py-1">
                    {g.items.map((t) => {
                      const cat = catMap.get(t.categoryId ?? "");
                      const acc = accMap.get(t.accountId);
                      return (
                        <li key={t.id}>
                          <button onClick={() => openSheet({ kind: "transaction", id: t.id })} className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left active:bg-muted">
                            <TxIcon tx={t} category={cat} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-base font-medium">{t.description}</span>
                              <span className="block truncate text-caption text-ink-3">{t.type === "transfer" ? "Transfer" : cat?.name ?? "Uncategorized"} · {acc?.name}</span>
                            </span>
                            <Amount tx={t} currency={acc?.currency ?? money.currency} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
            {filtered.length > limit ? (
              <div className={cn("flex justify-center border-t border-line p-3")}>
                <Button onClick={() => setLimit((l) => l + PAGE)}>
                  Show more ({filtered.length - limit} remaining)
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
      {importing ? <CsvImportDialog onClose={() => setImporting(false)} /> : null}
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense>
      <TransactionsInner />
    </Suspense>
  );
}
