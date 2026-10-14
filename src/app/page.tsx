"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, SlidersHorizontal, Wallet, Salad, CheckCircle2, Sparkles, ChevronUp, ChevronDown, CalendarDays, Lightbulb } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar, ProgressRing } from "@/components/ui/progress";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { useClock, useDb, useMoney, actions } from "@/lib/hooks";
import { openSheet } from "@/lib/store/ui";
import { balanceSummary, budgetStatus, periodTotals, recurringOccurrences, txInCurrency } from "@/lib/calc/finance";
import { daySummary } from "@/lib/calc/nutrition";
import { eventOccurrences, habitsToday, todayTasks } from "@/lib/calc/productivity";
import { addDays, addMonths, diffDays, endOfMonth, relativeDay, startOfMonth, timeToMinutes } from "@/lib/domain/dates";
import type { ModuleKey } from "@/lib/domain/types";
import { TaskItem } from "@/features/activities/task-item";
import { DayTimeline } from "@/features/overview/timeline";
import { InsightRow, useInsights } from "@/components/shell/notifications";

function greeting(now: string) {
  const h = Number(now.slice(0, 2));
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function ModuleCard({ accent, icon: Icon, title, href, children, action }: { accent: ModuleKey; icon: typeof Wallet; title: string; href: string; children: React.ReactNode; action?: React.ReactNode }) {
  const tone = { finance: "bg-finance-soft text-finance", nutrition: "bg-nutrition-soft text-nutrition", activities: "bg-activities-soft text-activities" }[accent];
  return (
    <Card className="flex flex-col">
      <header className="flex items-center justify-between gap-2 px-5 pt-4">
        <Link href={href} className="group flex items-center gap-2.5">
          <span className={cn("grid size-7 place-items-center rounded-md", tone)}><Icon className="size-4" aria-hidden /></span>
          <h2 className="text-md font-semibold">{title}</h2>
          <ArrowRight className="size-3.5 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
        {action}
      </header>
      <div className="flex flex-1 flex-col gap-4 p-5 pt-4">{children}</div>
    </Card>
  );
}

function FinanceSummary() {
  const db = useDb();
  const { today } = useClock();
  const money = useMoney();
  const d = useMemo(() => {
    const txs = txInCurrency(db.transactions, db.accounts, db.profile.currency);
    const bal = balanceSummary(db.accounts, db.transactions, db.profile.currency);
    const mtd = periodTotals(txs, { start: startOfMonth(today), end: today });
    const dayOfMonth = Number(today.slice(8));
    const lastStart = addMonths(startOfMonth(today), -1);
    const lastSame = periodTotals(txs, { start: lastStart, end: addDays(lastStart, Math.min(dayOfMonth, Number(endOfMonth(lastStart).slice(8))) - 1) });
    const month = { start: startOfMonth(today), end: endOfMonth(today) };
    const budgets = db.budgets.map((b) => budgetStatus(b, txs, db.categories, month));
    const next = recurringOccurrences(db.recurring.filter((r) => r.kind !== "income"), db.transactions, addDays(today, -14), addDays(today, 30), today).find((o) => o.status !== "paid");
    return { bal, mtd, lastSame, budgets, next };
  }, [db, today]);
  if (!db.accounts.length)
    return (
      <div className="flex flex-1 flex-col items-start justify-center gap-3">
        <p className="text-sm text-ink-3">Add an account to see your balance, spending and bills here.</p>
        <Link href="/finance/accounts?new=1"><Button size="sm">Add account</Button></Link>
      </div>
    );
  const over = d.budgets.filter((b) => b.state === "over").length;
  const warn = d.budgets.filter((b) => b.state === "warning").length;
  const limit = d.budgets.reduce((s, b) => s + b.limit, 0);
  const spentB = d.budgets.reduce((s, b) => s + b.spent, 0);
  const diff = d.mtd.expenses - d.lastSame.expenses;
  return (
    <>
      <div>
        <p className="text-sm text-ink-3">Net balance</p>
        <p className="num text-2xl font-semibold tracking-tight">{money(d.bal.net)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-ink-3">Spent this month</p>
          <p className="num text-base font-semibold">{money(d.mtd.expenses, { whole: true })}</p>
          {d.lastSame.expenses ? <p className={cn("num text-caption", diff > 0 ? "text-negative" : "text-positive")}>{diff > 0 ? "▲" : "▼"} {money(Math.abs(diff), { whole: true })} vs last month</p> : null}
        </div>
        <div>
          <p className="text-ink-3">Income this month</p>
          <p className="num text-base font-semibold">{money(d.mtd.income, { whole: true })}</p>
        </div>
      </div>
      {d.budgets.length ? (
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-ink-2">Budgets</span>
            <span className="flex gap-1">{over ? <Badge tone="negative">{over} over</Badge> : null}{warn ? <Badge tone="warning">{warn} close</Badge> : null}{!over && !warn ? <Badge tone="positive">All on track</Badge> : null}</span>
          </div>
          <ProgressBar value={limit ? spentB / limit : 0} tone={spentB > limit ? "negative" : "finance"} size="sm" label="Budget used this month" />
          <p className="num mt-1 text-caption text-ink-3">{money(spentB, { whole: true })} of {money(limit, { whole: true })}</p>
        </div>
      ) : null}
      {d.next ? (
        <Link href="/finance/bills" className="mt-auto flex items-center justify-between rounded-md bg-subtle px-3 py-2 text-sm hover:bg-muted">
          <span className="text-ink-2">Next: <span className="font-medium text-ink">{d.next.item.name}</span> · {d.next.status === "overdue" ? <span className="text-negative">overdue</span> : relativeDay(d.next.date, today)}</span>
          <span className="num font-semibold">{money(d.next.item.amount)}</span>
        </Link>
      ) : null}
    </>
  );
}

function NutritionSummary() {
  const db = useDb();
  const { today } = useClock();
  const day = daySummary(db.foodEntries, today, db.profile.nutrition.proteinTarget);
  return (
    <>
      <div className="flex items-center gap-5">
        <ProgressRing value={day.pct} size={112} stroke={10} tone="nutrition" label={`${Math.round(day.totals.protein)} of ${day.target} g protein`}>
          <div>
            <p className="num text-xl font-semibold leading-none">{Math.round(day.totals.protein)}</p>
            <p className="text-micro text-ink-3">of {day.target} g</p>
          </div>
        </ProgressRing>
        <div className="flex flex-col gap-1.5">
          <div>
            <p className="text-sm text-ink-3">Protein remaining</p>
            <p className="num text-2xl font-semibold text-nutrition">{day.reached ? "Done" : `${Math.round(day.remaining)} g`}</p>
          </div>
          <p className="text-sm text-ink-2">
            <span className="num font-medium">{day.meals}</span> meal{day.meals === 1 ? "" : "s"} logged
            {db.profile.nutrition.calorieTracking ? <span className="text-ink-3"> · <span className="num">{Math.round(day.totals.calories)}</span> kcal</span> : null}
          </p>
        </div>
      </div>
      <div className="mt-auto flex gap-2">
        <Button variant="nutrition" className="flex-1" onClick={() => openSheet({ kind: "food" })}><Plus /> Add food</Button>
        <Link href="/nutrition"><Button>Today&apos;s log</Button></Link>
      </div>
    </>
  );
}

function ActivitiesSummary() {
  const db = useDb();
  const { today, now } = useClock();
  const tt = todayTasks(db.tasks, today);
  const habits = habitsToday(db.habits, db.habitCompletions, today);
  const nextEvent = eventOccurrences(db.events, today, addDays(today, 2)).find((o) => o.date > today || o.event.allDay || timeToMinutes(o.event.endTime ?? o.event.startTime ?? "23:59") > timeToMinutes(now));
  const remaining = tt.overdue.length + tt.dueToday.length;
  const top = tt.priorities.length ? tt.priorities : [...tt.overdue, ...tt.dueToday];
  return (
    <>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-subtle px-2 py-2">
          <p className="num text-lg font-semibold">{remaining}</p>
          <p className="text-caption text-ink-3">Remaining</p>
          {tt.overdue.length ? <p className="text-micro font-medium text-negative">{tt.overdue.length} overdue</p> : null}
        </div>
        <div className="rounded-md bg-subtle px-2 py-2">
          <p className="num text-lg font-semibold">{tt.completedToday.length}</p>
          <p className="text-caption text-ink-3">Done today</p>
        </div>
        <div className="rounded-md bg-subtle px-2 py-2">
          <p className="num text-lg font-semibold">{habits.done}/{habits.total}</p>
          <p className="text-caption text-ink-3">Habits</p>
        </div>
      </div>
      <div>
        <p className="eyebrow mb-1">{tt.priorities.length ? "Top priorities" : "Up next"}</p>
        {top.length ? <div className="-mx-2">{top.slice(0, 3).map((t) => <TaskItem key={t.id} task={t} compact />)}</div> : <p className="text-sm text-ink-3">Nothing due. Nice.</p>}
      </div>
      {nextEvent ? (
        <button onClick={() => openSheet({ kind: "event", id: nextEvent.event.id, occurrenceDate: nextEvent.date })} className="mt-auto flex items-center gap-2 rounded-md bg-subtle px-3 py-2 text-left text-sm hover:bg-muted">
          <CalendarDays className="size-4 text-activities" aria-hidden />
          <span className="flex-1 truncate"><span className="font-medium">{nextEvent.event.title}</span> <span className="text-ink-3">· {relativeDay(nextEvent.date, today)}{nextEvent.event.allDay ? "" : ` ${nextEvent.event.startTime}`}</span></span>
        </button>
      ) : null}
    </>
  );
}

function useDailySummary() {
  const db = useDb();
  const { today } = useClock();
  const money = useMoney();
  return useMemo(() => {
    const parts: string[] = [];
    const tt = todayTasks(db.tasks, today);
    const open = tt.overdue.length + tt.dueToday.length;
    if (db.tasks.length) parts.push(open ? `${open} task${open === 1 ? "" : "s"} to finish${tt.overdue.length ? ` (${tt.overdue.length} overdue)` : ""}` : "no tasks due");
    const ev = eventOccurrences(db.events, today, today).length;
    if (ev) parts.push(`${ev} event${ev === 1 ? "" : "s"} on the calendar`);
    if (db.foodEntries.length) {
      const d = daySummary(db.foodEntries, today, db.profile.nutrition.proteinTarget);
      parts.push(d.reached ? "protein target reached" : `${Math.round(d.remaining)} g of protein to go`);
    }
    const bill = recurringOccurrences(db.recurring.filter((r) => r.kind !== "income"), db.transactions, today, addDays(today, 3), today).find((o) => o.status !== "paid");
    if (bill) parts.push(`${bill.item.name} (${money(bill.item.amount)}) due ${diffDays(today, bill.date) === 0 ? "today" : relativeDay(bill.date, today).toLowerCase() === "tomorrow" ? "tomorrow" : `on ${relativeDay(bill.date, today)}`}`);
    if (!parts.length) return "Your workspace is empty — add a transaction, a meal or a task to get started.";
    const s = parts.join(", ");
    return `Today: ${s.charAt(0).toLowerCase()}${s.slice(1)}.`;
  }, [db, today, money]);
}

export default function OverviewPage() {
  const db = useDb();
  const { today, now } = useClock();
  const insights = useInsights();
  const summary = useDailySummary();
  const [customizing, setCustomizing] = useState(false);
  const home = db.profile.home;
  const order = home.order.filter((m) => !home.hidden.includes(m));
  const cards: Record<ModuleKey, React.ReactNode> = {
    finance: <ModuleCard key="finance" accent="finance" icon={Wallet} title="Finance" href="/finance"><FinanceSummary /></ModuleCard>,
    nutrition: <ModuleCard key="nutrition" accent="nutrition" icon={Salad} title="Nutrition" href="/nutrition"><NutritionSummary /></ModuleCard>,
    activities: <ModuleCard key="activities" accent="activities" icon={CheckCircle2} title="Activities" href="/activities" action={<Button size="icon-sm" variant="ghost" onClick={() => openSheet({ kind: "task" })} aria-label="Add task"><Plus /></Button>}><ActivitiesSummary /></ModuleCard>,
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{greeting(now)}{db.profile.name ? `, ${db.profile.name}` : ""}</h1>
          <p className="mt-1 max-w-2xl text-base text-ink-2">{summary}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setCustomizing(true)}><SlidersHorizontal /> Customize</Button>
          <Button variant="primary" onClick={() => openSheet({ kind: "quickadd" })}><Plus /> Quick add</Button>
        </div>
      </div>
      {db.profile.demo ? (
        <div className="flex items-start gap-2 rounded-md border border-dashed border-warning/40 bg-warning-soft/50 px-3 py-2 text-sm text-ink-2">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            You&apos;re exploring <strong className="font-medium">demo data</strong>. Everything works — edit freely, then{" "}
            <Link href="/settings#data" className="font-medium text-ink underline underline-offset-2">start fresh</Link> when ready.
          </p>
        </div>
      ) : null}

      {order.length ? <div className={cn("grid gap-4", order.length === 3 ? "lg:grid-cols-3" : order.length === 2 ? "lg:grid-cols-2" : "")}>{order.map((m) => cards[m])}</div> : null}

      {home.showTimeline || home.showInsights ? (
        <div className="grid gap-4 lg:grid-cols-12">
          {home.showTimeline ? (
            <Card className={home.showInsights ? "lg:col-span-7" : "lg:col-span-12"}>
              <CardHeader title="Your day" subtitle="Events, scheduled tasks, planned meals, bills and habit reminders" action={<Link href="/activities/calendar" className="text-sm font-medium text-ink-2 hover:text-ink">Calendar</Link>} />
              <CardBody>
                <DayTimeline date={today} meals={!home.hidden.includes("nutrition")} bills={!home.hidden.includes("finance")} emptyText="Nothing scheduled today. Add an event or give a task a start time to see it here." />
              </CardBody>
            </Card>
          ) : null}
          {home.showInsights ? (
            <Card className={home.showTimeline ? "lg:col-span-5" : "lg:col-span-12"}>
              <CardHeader title="Worth a look" subtitle="Based only on your own data · dismiss what isn't useful" icon={<Lightbulb className="size-4 text-warning" />} />
              <CardBody className="pb-3">
                {insights.length ? (
                  <div className="-mx-3 flex flex-col">{insights.slice(0, 6).map((i) => <InsightRow key={i.key} insight={i} />)}</div>
                ) : (
                  <p className="py-4 text-sm text-ink-3">Nothing needs your attention right now.</p>
                )}
              </CardBody>
            </Card>
          ) : null}
        </div>
      ) : null}
      {customizing ? <CustomizeDialog onClose={() => setCustomizing(false)} /> : null}
    </div>
  );
}

function CustomizeDialog({ onClose }: { onClose: () => void }) {
  const home = useDb().profile.home;
  const labels: Record<ModuleKey, string> = { finance: "Finance", nutrition: "Nutrition", activities: "Activities" };
  const set = (patch: Partial<typeof home>) => actions().setProfile({ home: { ...home, ...patch } });
  const move = (i: number, dir: -1 | 1) => {
    const next = [...home.order];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set({ order: next });
  };
  return (
    <Dialog open onClose={onClose} title="Customize overview" description="Choose which modules appear and in what order." size="sm" footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <ul className="flex flex-col gap-2">
        {home.order.map((m, i) => (
          <li key={m} className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
            <span className="flex-1"><Switch checked={!home.hidden.includes(m)} onChange={(v) => set({ hidden: v ? home.hidden.filter((x) => x !== m) : [...home.hidden, m] })} label={labels[m]} /></span>
            <Button size="icon-sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${labels[m]} up`}><ChevronUp /></Button>
            <Button size="icon-sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === home.order.length - 1} aria-label={`Move ${labels[m]} down`}><ChevronDown /></Button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3">
        <Switch checked={home.showTimeline} onChange={(v) => set({ showTimeline: v })} label="Daily timeline" />
        <Switch checked={home.showInsights} onChange={(v) => set({ showInsights: v })} label="Insights & reminders" />
      </div>
    </Dialog>
  );
}
