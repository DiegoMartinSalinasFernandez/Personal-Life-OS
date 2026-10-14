"use client";

import { useMemo } from "react";
import { Wallet, Salad, CheckCircle2, Lightbulb } from "lucide-react";
import { PageHeader } from "@/components/shell/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/stat";
import { GroupedBars, Legend, SimpleBars, BarList, SERIES, ACCENT } from "@/components/charts";
import { useDb, useMoney, useToday } from "@/lib/hooks";
import { InsightRow, useInsights } from "@/components/shell/notifications";
import { cashflowSeries, pctChange, periodTotals, spendingByCategory, txInCurrency } from "@/lib/calc/finance";
import { rangeStats } from "@/lib/calc/nutrition";
import { completedPerDay, habitRate, projectProgress } from "@/lib/calc/productivity";
import { addDays, addMonths, diffDays, endOfMonth, formatDate, startOfMonth, startOfWeek } from "@/lib/domain/dates";
import { toMajor } from "@/lib/domain/money";

function Metric({ label, value, delta, goodWhen = "up", note }: { label: string; value: React.ReactNode; delta?: number | null; goodWhen?: "up" | "down" | "neutral"; note?: string }) {
  return (
    <div className="rounded-md bg-subtle p-3">
      <p className="text-sm text-ink-3">{label}</p>
      <p className="num mt-0.5 text-lg font-semibold">{value}</p>
      {delta !== undefined ? <Delta value={delta} goodWhen={goodWhen} suffix="vs last week" /> : note ? <p className="text-caption text-ink-3">{note}</p> : null}
    </div>
  );
}

export default function InsightsPage() {
  const db = useDb();
  const today = useToday();
  const money = useMoney();
  const insights = useInsights();
  const ws = db.profile.weekStartsOn;
  const weekStart = startOfWeek(today, ws);
  const lastWeek = { start: addDays(weekStart, -7), end: addDays(weekStart, -1) };
  const thisWeek = { start: weekStart, end: today };
  // Compare like-for-like: the same number of elapsed days last week.
  const lastWeekSoFar = { start: lastWeek.start, end: addDays(lastWeek.start, diffDays(weekStart, today)) };

  const fin = useMemo(() => {
    const txs = txInCurrency(db.transactions, db.accounts, db.profile.currency);
    const tw = periodTotals(txs, thisWeek);
    const lw = periodTotals(txs, lastWeekSoFar);
    const sixMonths = { start: addMonths(startOfMonth(today), -5), end: endOfMonth(today) };
    const monthly = cashflowSeries(txs, sixMonths, "month").map((p) => ({ ...p, inc: toMajor(p.income, money.digits), exp: toMajor(p.expenses, money.digits) }));
    const month = periodTotals(txs, { start: startOfMonth(today), end: today });
    const prevMonth = periodTotals(txs, { start: addMonths(startOfMonth(today), -1), end: endOfMonth(addMonths(startOfMonth(today), -1)) });
    const cats = spendingByCategory(txs, db.categories, { start: startOfMonth(today), end: today }).slice(0, 5);
    return { tw, lw, monthly, month, prevMonth, cats };
  }, [db, today, money.digits]); // eslint-disable-line react-hooks/exhaustive-deps

  const nut = useMemo(() => {
    const t = db.profile.nutrition.proteinTarget;
    return { tw: rangeStats(db.foodEntries, thisWeek.start, thisWeek.end, t), lw: rangeStats(db.foodEntries, lastWeek.start, lastWeek.end, t), four: rangeStats(db.foodEntries, addDays(today, -27), today, t) };
  }, [db.foodEntries, db.profile.nutrition.proteinTarget, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const prod = useMemo(() => {
    const perDay = completedPerDay(db.tasks, addDays(today, -13), today);
    const tw = perDay.filter((d) => d.date >= thisWeek.start).reduce((s, d) => s + d.count, 0);
    const lw = completedPerDay(db.tasks, lastWeekSoFar.start, lastWeekSoFar.end).reduce((s, d) => s + d.count, 0);
    const overdue = db.tasks.filter((t) => !t.done && t.dueDate && t.dueDate < today).length;
    let sched = 0, done = 0, lsched = 0, ldone = 0;
    for (const h of db.habits.filter((x) => !x.archived)) {
      const r = habitRate(h, db.habitCompletions, thisWeek.start, thisWeek.end);
      const l = habitRate(h, db.habitCompletions, lastWeek.start, lastWeek.end);
      sched += r.scheduled; done += r.done; lsched += l.scheduled; ldone += l.done;
    }
    const projects = db.projects.filter((p) => !p.archived).map((p) => projectProgress(p, db.tasks, today)).filter((p) => p.total);
    const estimated = db.tasks.filter((t) => t.done && t.completedOn && t.completedOn >= thisWeek.start).reduce((s, t) => s + (t.estimateMin ?? 0), 0);
    return { perDay, tw, lw, overdue, habit: sched ? done / sched : null, lhabit: lsched ? ldone / lsched : null, projects, estimated };
  }, [db.tasks, db.habits, db.habitCompletions, db.projects, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const catMap = new Map(db.categories.map((c) => [c.id, c]));
  const fmtVal = (v: number) => money(Math.round(v * 10 ** money.digits), { whole: true });
  const fmtAxis = (v: number) => money(Math.round(v * 10 ** money.digits), { compact: true });

  return (
    <>
      <PageHeader title="Insights" description={`Weekly review · week of ${formatDate(weekStart, { month: "long", day: "numeric" })}. Each area keeps its own measures — nothing is blended into a single score.`} />
      <div className="flex flex-col gap-4">
        {insights.length ? (
          <Card>
            <CardHeader title="Needs attention" icon={<Lightbulb className="size-4 text-warning" />} />
            <CardBody className="grid gap-1 pb-3 md:grid-cols-2">{insights.map((i) => <InsightRow key={i.key} insight={i} compact />)}</CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Money" icon={<Wallet className="size-4 text-finance" />} subtitle="This week so far vs the same days last week" />
          <CardBody className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric label="Spent this week" value={money(fin.tw.expenses)} delta={pctChange(fin.tw.expenses, fin.lw.expenses)} goodWhen="down" />
              <Metric label="Earned this week" value={money(fin.tw.income)} delta={pctChange(fin.tw.income, fin.lw.income)} />
              <Metric label="Savings rate (month)" value={fin.month.savingsRate == null ? "—" : `${Math.round(fin.month.savingsRate * 100)}%`} note={fin.prevMonth.savingsRate == null ? "No income last month" : `Last month ${Math.round(fin.prevMonth.savingsRate * 100)}%`} />
              <Metric label="Transactions (week)" value={fin.tw.count} note="income & expenses" />
            </div>
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-8">
                <div className="mb-2 flex items-center justify-between"><p className="text-sm font-medium text-ink-2">Last 6 months</p><Legend items={[{ label: "Income", color: SERIES[1] }, { label: "Expenses", color: SERIES[0] }]} /></div>
                <GroupedBars data={fin.monthly} xKey="key" series={[{ key: "inc", label: "Income", color: SERIES[1] }, { key: "exp", label: "Expenses", color: SERIES[0] }]} valueFormatter={fmtVal} axisFormatter={fmtAxis} tickFormatter={(k) => formatDate(k, { month: "short" })} labelFormatter={(k) => formatDate(k, { month: "long", year: "numeric" })} height={220} ariaLabel="Monthly income and expenses for the last six months" />
              </div>
              <div className="lg:col-span-4">
                <p className="mb-3 text-sm font-medium text-ink-2">Top spending this month</p>
                {fin.cats.length ? <BarList items={fin.cats.map((c) => ({ key: c.categoryId ?? "none", label: catMap.get(c.categoryId ?? "")?.name ?? "Uncategorized", value: c.amount, dot: catMap.get(c.categoryId ?? "")?.color }))} valueFormatter={(v) => money(v, { whole: true })} /> : <p className="text-sm text-ink-3">No spending yet this month.</p>}
              </div>
            </div>
          </CardBody>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Nutrition" icon={<Salad className="size-4 text-nutrition" />} subtitle={`Target ${db.profile.nutrition.proteinTarget} g protein/day`} />
            <CardBody className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Avg protein (logged days)" value={nut.tw.loggedDays ? `${Math.round(nut.tw.avgProtein)} g` : "—"} delta={nut.tw.loggedDays && nut.lw.loggedDays ? pctChange(nut.tw.avgProtein, nut.lw.avgProtein) : null} />
                <Metric label="Days at target" value={`${nut.tw.reachedDays} / ${nut.tw.days.length}`} note={`Last week ${nut.lw.reachedDays} / 7`} />
              </div>
              <SimpleBars data={nut.four.days.map((d) => ({ date: d.date, p: Math.round(d.totals.protein), reached: d.reached }))} xKey="date" yKey="p" label="Protein" color={ACCENT.nutrition} target={db.profile.nutrition.proteinTarget} dimWhen={(r) => !r.reached} valueFormatter={(v) => `${Math.round(v)} g`} tickFormatter={(k) => formatDate(k, { month: "numeric", day: "numeric" })} labelFormatter={(k) => formatDate(k, { weekday: "short", month: "short", day: "numeric" })} height={180} ariaLabel="Protein per day over the last 4 weeks" />
              <p className="text-caption text-ink-3">Last 28 days: {nut.four.reachedDays} days at target, {nut.four.loggedDays} days logged.</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Productivity" icon={<CheckCircle2 className="size-4 text-activities" />} subtitle="Completed tasks and routines" />
            <CardBody className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <Metric label="Done this week" value={prod.tw} delta={pctChange(prod.tw, prod.lw)} />
                <Metric label="Habit consistency" value={prod.habit == null ? "—" : `${Math.round(prod.habit * 100)}%`} note={prod.lhabit == null ? undefined : `Last week ${Math.round(prod.lhabit * 100)}%`} />
                <Metric label="Overdue now" value={prod.overdue} note={prod.estimated ? `${Math.round(prod.estimated / 60)}h estimated work done` : undefined} />
              </div>
              <SimpleBars data={prod.perDay} xKey="date" yKey="count" label="Completed" color={ACCENT.activities} valueFormatter={(v) => String(Math.round(v))} tickFormatter={(k) => formatDate(k, { weekday: "narrow" })} labelFormatter={(k) => formatDate(k, { weekday: "long", month: "short", day: "numeric" })} height={160} ariaLabel="Tasks completed per day, last 14 days" />
              {prod.projects.length ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-ink-2">Progress by project</p>
                  <BarList items={prod.projects.map((p) => ({ key: p.project.id, label: p.project.name, value: Math.round((p.pct ?? 0) * 100), sub: `${p.done}/${p.total}`, dot: p.project.color }))} valueFormatter={(v) => `${v}%`} color={ACCENT.activities} max={100} />
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
