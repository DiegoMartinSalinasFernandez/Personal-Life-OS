"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Banknote, CalendarClock, PiggyBank, TrendingDown, TrendingUp, Info, Wallet, Receipt } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat, Delta } from "@/components/ui/stat";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { BarList, GroupedBars, Legend, SERIES, TrendArea, ACCENT } from "@/components/charts";
import { PeriodPicker, resolvePeriod, type PeriodState } from "@/features/common/period-picker";
import { TxRow, BudgetBadge, budgetTone } from "@/features/finance/shared";
import { GoalCard } from "@/features/goals/goal-card";
import { useDb, useMoney, useSessionState, useToday, actions } from "@/lib/hooks";
import { openSheet } from "@/lib/store/ui";
import { toast } from "@/components/ui/toast";
import { balanceSeries, balanceSummary, budgetStatus, cashflowSeries, chooseBucket, pctChange, periodTotals, recurringOccurrences, spendingByCategory, txInCurrency } from "@/lib/calc/finance";
import { addDays, diffDays, formatDate, previousRange, relativeDay } from "@/lib/domain/dates";
import { toMajor } from "@/lib/domain/money";

export default function FinanceOverview() {
  const db = useDb();
  const today = useToday();
  const money = useMoney();
  const { profile } = db;
  const [period, setPeriod] = useSessionState<PeriodState>("finance-period", { kind: "month", anchor: today });
  const range = resolvePeriod(period, profile.weekStartsOn);
  const prev = previousRange(period.kind, range, profile.weekStartsOn);

  const data = useMemo(() => {
    const txs = txInCurrency(db.transactions, db.accounts, profile.currency);
    const balances = balanceSummary(db.accounts, db.transactions, profile.currency, range.end < today ? range.end : undefined);
    const startBalances = balanceSummary(db.accounts, db.transactions, profile.currency, addDays(range.start, -1));
    const totals = periodTotals(txs, range);
    const prevTotals = periodTotals(txs, prev);
    const bucket = chooseBucket(range);
    const flow = cashflowSeries(txs, range, bucket, profile.weekStartsOn).map((p) => ({ ...p, incomeM: toMajor(p.income, money.digits), expensesM: toMajor(p.expenses, money.digits) }));
    const trendEnd = range.end < today ? range.end : today;
    const trend = trendEnd >= range.start ? balanceSeries(db.accounts, db.transactions, profile.currency, { start: range.start, end: trendEnd }).map((p) => ({ ...p, balanceM: toMajor(p.balance, money.digits) })) : [];
    const cats = spendingByCategory(txs, db.categories, range);
    const budgets = db.budgets.map((b) => budgetStatus(b, txs, db.categories, range)).sort((a, b) => b.pct - a.pct);
    const upcoming = recurringOccurrences(db.recurring.filter((r) => r.kind !== "income"), db.transactions, addDays(today, -14), addDays(today, 21), today).filter((o) => o.status !== "paid");
    const recent = [...db.transactions].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : a.date < b.date ? 1 : -1)).slice(0, 7);
    return { balances, startBalances, totals, prevTotals, flow, bucket, trend, cats, budgets, upcoming, recent };
  }, [db, profile.currency, profile.weekStartsOn, range.start, range.end, prev.start, prev.end, today, money.digits]); // eslint-disable-line react-hooks/exhaustive-deps

  const catMap = new Map(db.categories.map((c) => [c.id, c]));
  const accMap = new Map(db.accounts.map((a) => [a.id, a]));
  const { balances, totals, prevTotals } = data;
  const tick = (k: string) => (data.bucket === "month" ? formatDate(k, { month: "short" }) : formatDate(k, { month: "short", day: "numeric" }));
  const labelFor = (k: string) => (data.bucket === "day" ? formatDate(k, { weekday: "short", month: "short", day: "numeric" }) : data.bucket === "week" ? `Week of ${formatDate(k)}` : formatDate(k, { month: "long", year: "numeric" }));
  const fmtAxis = (v: number) => money(Math.round(v * 10 ** money.digits), { compact: true });
  const fmtVal = (v: number) => money(Math.round(v * 10 ** money.digits));
  const budgetTotal = data.budgets.reduce((s, b) => ({ limit: s.limit + b.limit, spent: s.spent + Math.min(b.spent, Number.MAX_SAFE_INTEGER) }), { limit: 0, spent: 0 });

  if (!db.accounts.length) {
    return (
      <Card>
        <EmptyState
          icon={<Wallet />}
          title="Add your first account"
          description="Start with the accounts you use day to day — checking, cash, a credit card. Balances and reports are calculated from the transactions you record."
          action={
            <Link href="/finance/accounts?new=1">
              <Button variant="primary">Add account</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const netChange = balances.net - data.startBalances.net;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker value={period} onChange={setPeriod} weekStartsOn={profile.weekStartsOn} today={today} locale={profile.locale} />
        {balances.excluded.length ? (
          <p className="flex items-center gap-1.5 text-caption text-ink-3">
            <Info className="size-3.5" /> {balances.excluded.length} account{balances.excluded.length > 1 ? "s" : ""} in other currencies not included in totals.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-ink-3">Net balance{range.end < today ? ` on ${formatDate(range.end)}` : ""}</p>
              <p className="num mt-1 text-display font-semibold tracking-tight text-ink">{money(balances.net)}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-3">
                <span className={netChange >= 0 ? "text-positive" : "text-negative"}>
                  <span className="num font-semibold">{money(netChange, { signed: true })}</span>
                </span>
                since {formatDate(range.start, { month: "short", day: "numeric" })}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:text-right">
              <dt className="text-ink-3">Assets</dt>
              <dd className="num font-semibold text-ink">{money(balances.assets)}</dd>
              <dt className="text-ink-3">Liabilities</dt>
              <dd className="num font-semibold text-ink">{balances.liabilities ? `−${money(balances.liabilities)}` : money(0)}</dd>
            </dl>
          </div>
          <div className="px-2 pb-3">
            {data.trend.length > 1 ? (
              <TrendArea data={data.trend} xKey="key" yKey="balanceM" label="Net balance" color={ACCENT.finance} height={236} valueFormatter={fmtVal} axisFormatter={fmtAxis} tickFormatter={(k) => formatDate(k, { month: "short", day: "numeric" })} labelFormatter={(k) => formatDate(k, { weekday: "short", month: "short", day: "numeric" })} ariaLabel={`Net balance trend from ${range.start} to ${range.end}`} />
            ) : (
              <p className="px-3 pb-3 text-sm text-ink-3">This period hasn&apos;t started yet.</p>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader title="Upcoming bills" subtitle="Next 3 weeks and anything overdue" icon={<CalendarClock className="size-4 text-ink-3" />} action={<Link href="/finance/bills" className="text-sm font-medium text-ink-2 hover:text-ink">All</Link>} />
          <CardBody className="pb-3">
            {data.upcoming.length ? (
              <ul className="-mx-2 flex flex-col">
                {data.upcoming.slice(0, 5).map((o) => {
                  const d = diffDays(today, o.date);
                  return (
                    <li key={`${o.item.id}${o.date}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-subtle">
                      <div className="grid w-11 shrink-0 place-items-center rounded-md border border-line py-1 text-center leading-none">
                        <span className="text-micro uppercase text-ink-3">{formatDate(o.date, { month: "short" })}</span>
                        <span className="num text-md font-semibold">{Number(o.date.slice(8))}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-medium">{o.item.name}</p>
                        <p className="text-caption">
                          {o.status === "overdue" ? <span className="font-medium text-negative">Overdue · {-d}d</span> : <span className="text-ink-3">{relativeDay(o.date, today)}</span>}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="num text-base font-semibold">{money(o.item.amount)}</span>
                        <button className="text-caption font-medium text-finance hover:underline" onClick={() => { actions().settleOccurrence(o.item.id, o.date); toast(`${o.item.name} marked paid`); }}>
                          Mark paid
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState icon={<Receipt />} title="Nothing due soon" description="Add recurring bills and subscriptions to see them here." compact action={<Link href="/finance/bills?new=1"><Button size="sm">Add a bill</Button></Link>} />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat label="Income" value={money(totals.income)} icon={<TrendingUp />} accent="finance" sub={<Delta value={pctChange(totals.income, prevTotals.income)} goodWhen="up" />} />
        <Stat label="Expenses" value={money(totals.expenses)} icon={<TrendingDown />} sub={<Delta value={pctChange(totals.expenses, prevTotals.expenses)} goodWhen="down" />} />
        <Stat label="Net cash flow" value={<span className={totals.net < 0 ? "text-negative" : ""}>{money(totals.net, { signed: true })}</span>} icon={<Banknote />} sub={<span className="text-caption text-ink-3">Prev. {money(prevTotals.net, { signed: true })}</span>} />
        <Stat
          label="Savings rate"
          value={totals.savingsRate == null ? "—" : `${Math.round(totals.savingsRate * 100)}%`}
          icon={<PiggyBank />}
          sub={<span className="text-caption text-ink-3">{totals.savingsRate == null ? "No income this period" : "of income kept after expenses"}</span>}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader title="Cash flow" subtitle={`Income vs expenses by ${data.bucket}. Transfers excluded.`} action={<Legend items={[{ label: "Income", color: SERIES[1] }, { label: "Expenses", color: SERIES[0] }]} />} />
          <CardBody>
            {totals.count ? (
              <GroupedBars data={data.flow} xKey="key" series={[{ key: "incomeM", label: "Income", color: SERIES[1] }, { key: "expensesM", label: "Expenses", color: SERIES[0] }]} valueFormatter={fmtVal} axisFormatter={fmtAxis} tickFormatter={tick} labelFormatter={labelFor} height={250} ariaLabel="Income versus expenses chart" />
            ) : (
              <EmptyState title="No income or expenses in this period" compact action={<Button size="sm" onClick={() => openSheet({ kind: "transaction" })}>Add transaction</Button>} />
            )}
          </CardBody>
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader title="Spending by category" subtitle={totals.expenses ? `${money(totals.expenses)} total` : undefined} action={<Link href="/finance/transactions" className="text-sm font-medium text-ink-2 hover:text-ink">Details</Link>} />
          <CardBody>
            {data.cats.length ? (
              <BarList
                items={data.cats.slice(0, 7).map((c) => {
                  const cat = c.categoryId ? catMap.get(c.categoryId) : undefined;
                  return { key: c.categoryId ?? "none", label: cat?.name ?? "Uncategorized", value: c.amount, sub: `${Math.round(c.share * 100)}%`, dot: cat?.color ?? "rgb(var(--ink-3))" };
                })}
                valueFormatter={(v) => money(v, { whole: true })}
                color={ACCENT.finance}
              />
            ) : (
              <p className="py-6 text-center text-sm text-ink-3">No spending recorded in this period.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <CardHeader title="Budgets" subtitle={budgetTotal.limit ? `${money(budgetTotal.spent, { whole: true })} of ${money(budgetTotal.limit, { whole: true })} used` : undefined} action={<Link href="/finance/budgets" className="text-sm font-medium text-ink-2 hover:text-ink">Manage</Link>} />
          <CardBody>
            {data.budgets.length ? (
              <ul className="flex flex-col gap-3.5">
                {data.budgets.slice(0, 5).map((b) => (
                  <li key={b.budget.id}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-base text-ink">{catMap.get(b.budget.categoryId)?.name ?? "Category"}</span>
                      <BudgetBadge state={b.state} pct={b.pct} />
                    </div>
                    <ProgressBar value={b.pct} tone={budgetTone(b.state)} size="sm" marker={b.budget.warnAt} label={`${catMap.get(b.budget.categoryId)?.name} budget`} />
                    <p className="num mt-1 text-caption text-ink-3">
                      {money(b.spent, { whole: true })} / {money(b.limit, { whole: true })} · {b.remaining >= 0 ? `${money(b.remaining, { whole: true })} left` : `${money(-b.remaining, { whole: true })} over`}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No budgets yet" description="Set monthly limits for the categories you want to watch." compact action={<Link href="/finance/budgets?new=1"><Button size="sm">Create budget</Button></Link>} />
            )}
            {period.kind !== "month" && data.budgets.length ? <p className="mt-3 text-caption text-ink-3">Monthly budgets are prorated to the selected period.</p> : null}
          </CardBody>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title="Recent transactions" action={<Link href="/finance/transactions" className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">View all <ArrowRight className="size-3.5" /></Link>} />
          <CardBody className="pb-3">
            {data.recent.length ? (
              <div className="-mx-2 flex flex-col">
                {data.recent.map((t) => (
                  <TxRow key={t.id} tx={t} categories={catMap} accounts={accMap} onClick={() => openSheet({ kind: "transaction", id: t.id })} />
                ))}
              </div>
            ) : (
              <EmptyState title="No transactions yet" compact action={<Button size="sm" variant="primary" onClick={() => openSheet({ kind: "transaction" })}>Add transaction</Button>} />
            )}
          </CardBody>
        </Card>

        <div className="flex flex-col gap-3 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-md font-semibold">Savings goals</h2>
            <Link href="/finance/goals" className="text-sm font-medium text-ink-2 hover:text-ink">All</Link>
          </div>
          {db.goals.filter((g) => g.module === "finance" && !g.archived && !g.completedAt).slice(0, 2).map((g) => <GoalCard key={g.id} goal={g} compact />)}
          {!db.goals.some((g) => g.module === "finance" && !g.archived) ? (
            <Card>
              <EmptyState title="No savings goals" compact action={<Button size="sm" onClick={() => openSheet({ kind: "goal", module: "finance" })}>New goal</Button>} />
            </Card>
          ) : null}
          {profile.demo ? <Badge tone="warning" className="self-start">Demo data</Badge> : null}
        </div>
      </div>
    </div>
  );
}
