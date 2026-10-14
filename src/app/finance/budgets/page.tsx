"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, PieChart, ChevronDown } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ProgressBar } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty";
import { IconTile } from "@/components/ui/icon";
import { Field, MoneyInput, Select } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { SimpleBars, ACCENT } from "@/components/charts";
import { cn } from "@/lib/cn";
import { useForm } from "@/lib/hooks/use-form";
import { useDb, useMoney, useToday, actions } from "@/lib/hooks";
import { budgetHistory, budgetStatus, spendingByCategory, txInCurrency } from "@/lib/calc/finance";
import { addMonths, diffDays, endOfMonth, formatDate, startOfMonth } from "@/lib/domain/dates";
import { centsToInput, parseMoney, toMajor } from "@/lib/domain/money";
import type { Budget } from "@/lib/domain/types";
import { CategoryOptions } from "@/features/common/options";
import { BudgetBadge, budgetTone } from "@/features/finance/shared";

function BudgetsInner() {
  const db = useDb();
  const money = useMoney();
  const today = useToday();
  const params = useSearchParams();
  const router = useRouter();
  const [month, setMonth] = useState(startOfMonth(today));
  const [editing, setEditing] = useState<Budget | "new" | { categoryId: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (params.get("new")) {
      setEditing("new");
      router.replace("/finance/budgets");
    }
  }, [params, router]);

  const range = { start: month, end: endOfMonth(month) };
  const isCurrent = month === startOfMonth(today);
  const txs = useMemo(() => txInCurrency(db.transactions, db.accounts, money.currency), [db.transactions, db.accounts, money.currency]);
  const statuses = useMemo(() => db.budgets.map((b) => budgetStatus(b, txs, db.categories, range)).sort((a, b) => b.pct - a.pct), [db.budgets, txs, db.categories, range.start]); // eslint-disable-line react-hooks/exhaustive-deps
  const catMap = new Map(db.categories.map((c) => [c.id, c]));
  const totals = statuses.reduce((s, b) => ({ limit: s.limit + b.limit, spent: s.spent + b.spent }), { limit: 0, spent: 0 });
  const budgeted = new Set(db.budgets.map((b) => b.categoryId));
  const unbudgeted = spendingByCategory(txs, db.categories, range).filter((c) => c.categoryId && !budgeted.has(c.categoryId));
  const elapsed = isCurrent ? (diffDays(month, today) + 1) / (diffDays(month, range.end) + 1) : null;

  const del = async (b: Budget) => {
    if (!(await confirm({ title: `Delete the ${catMap.get(b.categoryId)?.name} budget?`, description: "Transactions are not affected." }))) return;
    actions().remove("budgets", b.id);
    toast("Budget deleted");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><ChevronLeft /></Button>
          <span className="min-w-[130px] text-center text-base font-medium">{formatDate(month, { month: "long", year: "numeric" })}</span>
          <Button size="icon-sm" variant="ghost" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><ChevronRight /></Button>
          {!isCurrent ? <Button size="sm" variant="ghost" onClick={() => setMonth(startOfMonth(today))}>This month</Button> : null}
        </div>
        <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
          <Plus /> New budget
        </Button>
      </div>

      {statuses.length ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-ink-3">Spent of total budget</p>
              <p className="num mt-1 text-2xl font-semibold">
                {money(totals.spent, { whole: true })} <span className="text-lg font-normal text-ink-3">/ {money(totals.limit, { whole: true })}</span>
              </p>
            </div>
            <div className="flex gap-6 text-sm">
              <div><p className="text-ink-3">Remaining</p><p className={cn("num font-semibold", totals.limit - totals.spent < 0 && "text-negative")}>{money(totals.limit - totals.spent, { whole: true })}</p></div>
              <div><p className="text-ink-3">Over budget</p><p className="num font-semibold">{statuses.filter((s) => s.state === "over").length}</p></div>
              <div><p className="text-ink-3">Approaching</p><p className="num font-semibold">{statuses.filter((s) => s.state === "warning").length}</p></div>
            </div>
          </div>
          <ProgressBar className="mt-4" value={totals.limit ? totals.spent / totals.limit : 0} tone={totals.spent > totals.limit ? "negative" : "finance"} size="lg" marker={elapsed ?? undefined} label="Total budget used" />
          {elapsed != null ? <p className="mt-1.5 text-caption text-ink-3">The tick marks how much of the month has passed ({Math.round(elapsed * 100)}%).</p> : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Category budgets" subtitle="Monthly limits. Subcategory spending counts toward its parent's budget." />
        <CardBody>
          {statuses.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {statuses.map((s) => {
                const cat = catMap.get(s.budget.categoryId);
                const expanded = open === s.budget.id;
                const hist = expanded ? budgetHistory(s.budget, txs, db.categories, month, 6).map((h) => ({ ...h, spentM: toMajor(h.spent, money.digits) })) : [];
                return (
                  <li key={s.budget.id} className="py-3.5 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      {cat ? <IconTile name={cat.icon} color={cat.color} /> : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="truncate text-base font-medium">{cat?.name ?? "Deleted category"}</span>
                          <BudgetBadge state={s.state} pct={s.pct} />
                        </div>
                        <ProgressBar className="mt-2" value={s.pct} tone={budgetTone(s.state)} marker={s.budget.warnAt} label={`${cat?.name} budget used`} />
                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-caption text-ink-3">
                          <span className="num">
                            {money(s.spent)} of {money(s.limit)} · {s.remaining >= 0 ? <span>{money(s.remaining)} left</span> : <span className="font-medium text-negative">{money(-s.remaining)} over</span>}
                          </span>
                          <span className="flex items-center gap-1">
                            <button className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted hover:text-ink" onClick={() => setOpen(expanded ? null : s.budget.id)} aria-expanded={expanded}>
                              History <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
                            </button>
                            <button className="rounded p-1 hover:bg-muted hover:text-ink" onClick={() => setEditing(s.budget)} aria-label="Edit budget"><Pencil className="size-3.5" /></button>
                            <button className="rounded p-1 hover:bg-muted hover:text-negative" onClick={() => del(s.budget)} aria-label="Delete budget"><Trash2 className="size-3.5" /></button>
                          </span>
                        </div>
                      </div>
                    </div>
                    {expanded ? (
                      <div className="mt-3 rounded-md bg-subtle p-3">
                        <SimpleBars data={hist} xKey="month" yKey="spentM" label="Spent" color={ACCENT.finance} height={150} target={toMajor(s.budget.amount, money.digits)} targetLabel="Budget" valueFormatter={(v) => money(Math.round(v * 10 ** money.digits), { whole: true })} tickFormatter={(m) => formatDate(`${m}-01`, { month: "short" })} labelFormatter={(m) => formatDate(`${m}-01`, { month: "long", year: "numeric" })} dimWhen={(r) => (r.spent as number) <= (r.limit as number)} ariaLabel={`Six-month spending history for ${cat?.name}`} />
                        <p className="mt-1 text-caption text-ink-3">Bars in full colour exceeded the budget that month.</p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={<PieChart />} title="No budgets yet" description="Budgets help you notice when a category is running hot before the month ends." action={<Button variant="primary" onClick={() => setEditing("new")}>Create your first budget</Button>} />
          )}
        </CardBody>
      </Card>

      {unbudgeted.length ? (
        <Card>
          <CardHeader title="Spending without a budget" subtitle={formatDate(month, { month: "long" })} />
          <CardBody>
            <ul className="flex flex-col gap-1">
              {unbudgeted.map((c) => {
                const cat = catMap.get(c.categoryId!);
                return (
                  <li key={c.categoryId} className="flex items-center gap-3 rounded-md px-1 py-1.5">
                    {cat ? <IconTile name={cat.icon} color={cat.color} size="sm" /> : null}
                    <span className="flex-1 text-base">{cat?.name}</span>
                    <span className="num text-base font-medium">{money(c.amount)}</span>
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ categoryId: c.categoryId! })}>Set budget</Button>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      ) : null}
      {editing ? <BudgetDialog budget={typeof editing === "object" && "id" in editing ? editing : undefined} categoryId={typeof editing === "object" && !("id" in editing) ? editing.categoryId : undefined} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

type Values = { categoryId: string; amount: string; warnAt: string };
const schema = z.object({
  categoryId: z.string().min(1, "Choose a category"),
  amount: z.string().refine((s) => (parseMoney(s) ?? 0) > 0, "Enter a monthly amount above zero"),
  warnAt: z.string(),
});

function BudgetDialog({ budget, categoryId, onClose }: { budget?: Budget; categoryId?: string; onClose: () => void }) {
  const db = useDb();
  const money = useMoney();
  const { values, set, errors, setErrors, handleSubmit } = useForm<Values, z.infer<typeof schema>>(schema, {
    categoryId: budget?.categoryId ?? categoryId ?? "",
    amount: budget ? centsToInput(budget.amount, money.digits) : "",
    warnAt: String(Math.round((budget?.warnAt ?? 0.8) * 100)),
  });
  const submit = handleSubmit((v) => {
    if (db.budgets.some((b) => b.categoryId === v.categoryId && b.id !== budget?.id)) return setErrors({ categoryId: "This category already has a budget" });
    const rec = { categoryId: v.categoryId, amount: parseMoney(v.amount, money.digits)!, warnAt: Number(v.warnAt) / 100 };
    if (budget) actions().update("budgets", budget.id, rec);
    else actions().add("budgets", rec);
    toast(budget ? "Budget updated" : "Budget created");
    onClose();
  });
  return (
    <Dialog open onClose={onClose} title={budget ? "Edit budget" : "New budget"} size="sm" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="budget-form">Save</Button></>}>
      <form id="budget-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Category" error={errors.categoryId}>
          {(p) => (
            <Select {...p} value={values.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">Choose…</option>
              <CategoryOptions categories={db.categories} kind="expense" />
            </Select>
          )}
        </Field>
        <Field label="Monthly limit" error={errors.amount}>
          {(p) => <MoneyInput {...p} currency={money.currency} value={values.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" autoFocus />}
        </Field>
        <Field label="Warn me at" hint="You'll see an ‘approaching’ status from this point on.">
          {(p) => (
            <Select {...p} value={values.warnAt} onChange={(e) => set("warnAt", e.target.value)}>
              {[50, 60, 70, 75, 80, 85, 90, 95].map((n) => (
                <option key={n} value={n}>{n}% of the limit</option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  );
}

export default function BudgetsPage() {
  return (
    <Suspense>
      <BudgetsInner />
    </Suspense>
  );
}
