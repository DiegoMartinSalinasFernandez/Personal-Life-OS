/**
 * Cross-module insights & reminders. Every insight is derived from the user's
 * own records; when there is no supporting data, nothing is produced.
 * Each has a stable `key` (including the date it applies to) so dismissing it
 * hides that instance only.
 */
import type { Database } from "../domain/types";
import { addDays, diffDays, formatDate, startOfMonth, endOfMonth, timeToMinutes, type ISODate, type TimeOfDay } from "../domain/dates";
import { formatMoney } from "../domain/money";
import { budgetStatus, moneyGoalProgress, recurringOccurrences, txInCurrency } from "./finance";
import { daySummary, entriesOn } from "./nutrition";
import { eventOccurrences, goalProgress, habitStreak, isScheduled, todayTasks } from "./productivity";

export type InsightModule = "finance" | "nutrition" | "activities" | "goals";
export interface Insight {
  key: string;
  module: InsightModule;
  tone: "info" | "warning" | "negative" | "positive";
  title: string;
  body?: string;
  href: string;
  /** Lower = more important. */
  rank: number;
}

export function computeInsights(db: Database, today: ISODate, now: TimeOfDay): Insight[] {
  const out: Insight[] = [];
  const { profile } = db;
  const money = (c: number) => formatMoney(c, profile.currency, { locale: profile.locale });
  const nowMin = timeToMinutes(now);

  // ── Finance: bills ──
  const occ = recurringOccurrences(db.recurring.filter((r) => r.kind !== "income"), db.transactions, addDays(today, -21), addDays(today, 7), today);
  for (const o of occ) {
    if (o.status === "overdue") {
      out.push({ key: `bill-overdue:${o.item.id}:${o.date}`, module: "finance", tone: "negative", rank: 1, title: `${o.item.name} is past due`, body: `${money(o.item.amount)} was scheduled for ${formatDate(o.date)} and isn't marked as paid.`, href: "/finance/bills" });
    } else if (o.status === "due") {
      const d = diffDays(today, o.date);
      out.push({ key: `bill-due:${o.item.id}:${o.date}`, module: "finance", tone: "warning", rank: 2, title: `${o.item.name} due ${d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`}`, body: `${money(o.item.amount)} scheduled for ${formatDate(o.date, { weekday: "short", month: "short", day: "numeric" })}.`, href: "/finance/bills" });
    }
  }

  // ── Finance: budgets (current month) ──
  const month = { start: startOfMonth(today), end: endOfMonth(today) };
  const txs = txInCurrency(db.transactions, db.accounts, profile.currency);
  const catName = new Map(db.categories.map((c) => [c.id, c.name]));
  for (const b of db.budgets) {
    const s = budgetStatus(b, txs, db.categories, month);
    if (s.spent === 0) continue;
    const name = catName.get(b.categoryId) ?? "A category";
    if (s.state === "over") out.push({ key: `budget-over:${b.id}:${month.start}`, module: "finance", tone: "negative", rank: 3, title: `${name} budget exceeded`, body: `${money(s.spent)} spent of ${money(s.limit)} this month (${money(-s.remaining)} over).`, href: "/finance/budgets" });
    else if (s.state === "warning") out.push({ key: `budget-warn:${b.id}:${month.start}`, module: "finance", tone: "warning", rank: 5, title: `${name} budget at ${Math.round(s.pct * 100)}%`, body: `${money(s.remaining)} left for the rest of the month.`, href: "/finance/budgets" });
  }

  // ── Nutrition ── (only for users who actually log food)
  const n = profile.nutrition;
  if (db.foodEntries.length > 0) {
    const todays = entriesOn(db.foodEntries, today);
    const lunch = db.mealTypes.find((m) => m.name.toLowerCase() === "lunch");
    if (lunch && n.mealReminderTime && nowMin >= timeToMinutes(n.mealReminderTime) && !todays.some((e) => e.mealTypeId === lunch.id)) {
      out.push({ key: `no-lunch:${today}`, module: "nutrition", tone: "info", rank: 4, title: "Lunch isn't logged yet", body: "Add it now so today's protein total stays accurate.", href: "/nutrition" });
    }
    const day = daySummary(db.foodEntries, today, n.proteinTarget);
    if (n.proteinTarget > 0 && todays.length > 0 && nowMin >= 17 * 60 && !day.reached) {
      out.push({ key: `protein-left:${today}`, module: "nutrition", tone: "info", rank: 6, title: `${Math.round(day.remaining)} g protein left today`, body: `You've logged ${Math.round(day.totals.protein)} g of your ${n.proteinTarget} g target.`, href: "/nutrition" });
    }
  }

  // ── Activities ──
  const tt = todayTasks(db.tasks, today);
  if (tt.overdue.length) out.push({ key: `overdue:${today}:${tt.overdue.length}`, module: "activities", tone: "warning", rank: 3, title: `${tt.overdue.length} overdue ${tt.overdue.length === 1 ? "task" : "tasks"}`, body: tt.overdue.slice(0, 2).map((t) => t.title).join(" · "), href: "/activities/tasks?view=overdue" });
  for (const t of db.tasks) {
    if (t.done || t.dueDate !== today || !t.startTime || (t.priority !== "high" && t.priority !== "urgent")) continue;
    const mins = timeToMinutes(t.startTime) - nowMin;
    if (mins >= 0 && mins <= 90) out.push({ key: `task-soon:${t.id}:${today}`, module: "activities", tone: "warning", rank: 2, title: `“${t.title}” starts ${mins === 0 ? "now" : `in ${mins} min`}`, body: `${t.priority === "urgent" ? "Urgent" : "High"} priority, scheduled ${t.startTime}.`, href: "/activities" });
  }
  // User-configured task reminders (relative to start time on the due date).
  for (const t of db.tasks) {
    if (t.done || t.reminderMinBefore == null || !t.dueDate) continue;
    const startMin = t.startTime ? timeToMinutes(t.startTime) : 9 * 60;
    const minutesUntil = diffDays(today, t.dueDate) * 1440 + startMin - nowMin;
    if (minutesUntil <= t.reminderMinBefore && minutesUntil >= -30)
      out.push({ key: `task-reminder:${t.id}:${t.dueDate}`, module: "activities", tone: "info", rank: 2, title: `Reminder: ${t.title}`, body: t.startTime ? `Scheduled ${t.dueDate === today ? "today" : formatDate(t.dueDate)} at ${t.startTime}.` : `Due ${t.dueDate === today ? "today" : formatDate(t.dueDate)}.`, href: "/activities" });
  }
  for (const h of db.habits) {
    if (h.archived || !h.reminderTime || !isScheduled(h, today) || nowMin < timeToMinutes(h.reminderTime)) continue;
    if (db.habitCompletions.some((c) => c.habitId === h.id && c.date === today)) continue;
    out.push({ key: `habit-reminder:${h.id}:${today}`, module: "activities", tone: "info", rank: 5, title: `Time for “${h.name}”`, body: `Your reminder was set for ${h.reminderTime}.`, href: "/activities/habits" });
  }
  for (const o of eventOccurrences(db.events, today, today)) {
    if (o.event.allDay || !o.event.startTime) continue;
    const mins = timeToMinutes(o.event.startTime) - nowMin;
    if (mins >= 0 && mins <= 45) out.push({ key: `event-soon:${o.key}`, module: "activities", tone: "info", rank: 2, title: `${o.event.title} in ${mins} min`, body: o.event.location ? `At ${o.event.location}` : undefined, href: "/activities/calendar" });
  }
  if (nowMin >= 18 * 60) {
    for (const h of db.habits) {
      if (h.archived || !isScheduled(h, today)) continue;
      if (db.habitCompletions.some((c) => c.habitId === h.id && c.date === today)) continue;
      if (h.reminderTime && nowMin >= timeToMinutes(h.reminderTime)) continue; // the reminder already covers it
      const streak = habitStreak(h, db.habitCompletions, today);
      if (streak >= 5) out.push({ key: `habit-streak:${h.id}:${today}`, module: "activities", tone: "info", rank: 6, title: `Keep your ${streak}-day “${h.name}” streak`, body: "It's scheduled today and not checked off yet.", href: "/activities/habits" });
    }
  }

  // ── Goals close to completion ──
  for (const g of db.goals) {
    if (g.archived || g.completedAt) continue;
    if (g.measure.type === "money") {
      const p = moneyGoalProgress(g, db.goalContributions, today);
      if (p && p.pct >= 0.9 && p.pct < 1) out.push({ key: `goal-near:${g.id}:${Math.floor(p.pct * 100)}`, module: "goals", tone: "positive", rank: 7, title: `“${g.title}” is ${Math.round(p.pct * 100)}% funded`, body: `${money(p.remaining)} to go.`, href: "/goals" });
      if (p && p.pct >= 1) out.push({ key: `goal-done:${g.id}`, module: "goals", tone: "positive", rank: 7, title: `“${g.title}” reached its target`, body: "Mark it complete on the Goals page.", href: "/goals" });
    } else {
      const p = goalProgress(g, { today, milestones: db.milestones, habitCompletions: db.habitCompletions, foodEntries: db.foodEntries, proteinTarget: n.proteinTarget });
      if (p.kind !== "money" && p.pct != null && p.pct >= 0.85 && p.pct < 1) out.push({ key: `goal-near:${g.id}:${Math.floor(p.pct * 100)}`, module: "goals", tone: "positive", rank: 7, title: `“${g.title}” is close to complete`, body: `${Math.round(p.pct * 100)}% of the way there.`, href: "/goals" });
    }
  }

  const dismissed = new Set(db.dismissed);
  return out.filter((i) => !dismissed.has(i.key)).sort((a, b) => a.rank - b.rank);
}
