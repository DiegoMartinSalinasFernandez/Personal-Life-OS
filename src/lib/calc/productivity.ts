import type { CalendarEvent, ExternalEvent, Goal, Habit, HabitCompletion, Milestone, Priority, Project, Task, FoodEntry, ID } from "../domain/types";
import { addDays, diffDays, eachDay, inRange, timeToMinutes, weekday, type ISODate, type TimeOfDay } from "../domain/dates";
import { nextOccurrence, occurrencesBetween } from "../domain/recurrence";
import { entryNutrients } from "./nutrition";

// ───────────────────────── Tasks ─────────────────────────

export const PRIORITY_RANK: Record<Priority, number> = { urgent: 3, high: 2, medium: 1, low: 0 };

/** Sort: focus first, then priority, then due date (no date last), then time, then title. */
export function compareTasks(a: Task, b: Task): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.focus !== b.focus) return a.focus ? -1 : 1;
  const p = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (p) return p;
  if (a.dueDate !== b.dueDate) return !a.dueDate ? 1 : !b.dueDate ? -1 : a.dueDate < b.dueDate ? -1 : 1;
  if (a.startTime !== b.startTime) return !a.startTime ? 1 : !b.startTime ? -1 : a.startTime < b.startTime ? -1 : 1;
  return a.title.localeCompare(b.title);
}

export const isOverdue = (t: Task, today: ISODate) => !t.done && !!t.dueDate && t.dueDate < today;
export const isDueToday = (t: Task, today: ISODate) => !t.done && t.dueDate === today;

export interface TodayTasks {
  overdue: Task[];
  dueToday: Task[];
  completedToday: Task[];
  /** Important ≠ due: focus-flagged tasks plus urgent/high tasks due within 3 days. */
  priorities: Task[];
  /** completed today / (completed today + still open for today incl. overdue) */
  completionRate: number | null;
}

export function todayTasks(tasks: Task[], today: ISODate): TodayTasks {
  const overdue = tasks.filter((t) => isOverdue(t, today)).sort(compareTasks);
  const dueToday = tasks.filter((t) => isDueToday(t, today)).sort(compareTasks);
  const completedToday = tasks.filter((t) => t.done && t.completedOn === today);
  const horizon = addDays(today, 3);
  const priorities = tasks
    .filter((t) => !t.done && (t.focus || ((t.priority === "urgent" || t.priority === "high") && t.dueDate && t.dueDate <= horizon)))
    .sort(compareTasks)
    .slice(0, 5);
  const denom = completedToday.length + overdue.length + dueToday.length;
  return { overdue, dueToday, completedToday, priorities, completionRate: denom ? completedToday.length / denom : null };
}

/** The date the next instance of a recurring task should be due on. */
export function nextRecurringDue(task: Task, completedOn: ISODate): ISODate | null {
  if (!task.recurrence) return null;
  const anchor = task.dueDate ?? completedOn;
  // Advance past the current due date; if completing late, skip to the first future occurrence after today.
  const after = task.dueDate && task.dueDate > completedOn ? task.dueDate : completedOn > anchor ? completedOn : anchor;
  return nextOccurrence(anchor, task.recurrence, after);
}

export function completedPerDay(tasks: Task[], start: ISODate, end: ISODate): { date: ISODate; count: number }[] {
  const counts = new Map<ISODate, number>();
  for (const t of tasks) if (t.done && t.completedOn && inRange(t.completedOn, start, end)) counts.set(t.completedOn, (counts.get(t.completedOn) ?? 0) + 1);
  return eachDay(start, end).map((date) => ({ date, count: counts.get(date) ?? 0 }));
}

export interface ProjectProgress {
  project: Project;
  total: number;
  done: number;
  open: number;
  overdue: number;
  pct: number | null;
}

export function projectProgress(project: Project, tasks: Task[], today: ISODate): ProjectProgress {
  const mine = tasks.filter((t) => t.projectId === project.id);
  const done = mine.filter((t) => t.done).length;
  return {
    project,
    total: mine.length,
    done,
    open: mine.length - done,
    overdue: mine.filter((t) => isOverdue(t, today)).length,
    pct: mine.length ? done / mine.length : null,
  };
}

export function plannedMinutes(tasks: Task[], date: ISODate): { estimated: number; scheduled: number } {
  let estimated = 0;
  let scheduled = 0;
  for (const t of tasks) {
    if (t.done || t.dueDate !== date) continue;
    estimated += t.estimateMin ?? 0;
    if (t.startTime && t.endTime) scheduled += Math.max(0, timeToMinutes(t.endTime) - timeToMinutes(t.startTime));
  }
  return { estimated, scheduled };
}

// ───────────────────────── Calendar ─────────────────────────

export interface EventOccurrence {
  event: CalendarEvent;
  date: ISODate;
  key: string;
}

export function eventOccurrences(events: CalendarEvent[], from: ISODate, to: ISODate): EventOccurrence[] {
  const out: EventOccurrence[] = [];
  for (const event of events) {
    const dates = event.recurrence ? occurrencesBetween(event.date, event.recurrence, from, to, event.exDates) : inRange(event.date, from, to) ? [event.date] : [];
    for (const date of dates) out.push({ event, date, key: `${event.id}|${date}` });
  }
  return out.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.event.allDay ? "" : a.event.startTime ?? "").localeCompare(b.event.allDay ? "" : b.event.startTime ?? "")));
}

// ───────────────────────── Habits ─────────────────────────

export function isScheduled(habit: Habit, date: ISODate): boolean {
  if (date < habit.startDate) return false;
  return habit.schedule.type === "daily" || habit.schedule.days.includes(weekday(date));
}

function completionSet(habitId: ID, completions: HabitCompletion[]): Set<ISODate> {
  return new Set(completions.filter((c) => c.habitId === habitId).map((c) => c.date));
}

/**
 * Current streak in scheduled days. Calendar-date based (no instants), so it
 * can't break across timezones or DST. Today counts if done; if today is
 * scheduled but not done yet, the streak is still alive from yesterday.
 */
export function habitStreak(habit: Habit, completions: HabitCompletion[], today: ISODate): number {
  const done = completionSet(habit.id, completions);
  let d = today;
  if (isScheduled(habit, today) && !done.has(today)) d = addDays(today, -1);
  let n = 0;
  for (let i = 0; i < 3650 && d >= habit.startDate; i++, d = addDays(d, -1)) {
    if (!isScheduled(habit, d)) continue;
    if (done.has(d)) n++;
    else break;
  }
  return n;
}

export function bestStreak(habit: Habit, completions: HabitCompletion[], today: ISODate): number {
  const done = completionSet(habit.id, completions);
  let best = 0;
  let cur = 0;
  for (const d of eachDay(habit.startDate, today)) {
    if (!isScheduled(habit, d)) continue;
    if (done.has(d)) { cur++; best = Math.max(best, cur); }
    else if (d !== today) cur = 0;
  }
  return best;
}

export function habitRate(habit: Habit, completions: HabitCompletion[], start: ISODate, end: ISODate): { scheduled: number; done: number; rate: number | null } {
  const set = completionSet(habit.id, completions);
  let scheduled = 0;
  let done = 0;
  for (const d of eachDay(start < habit.startDate ? habit.startDate : start, end)) {
    if (!isScheduled(habit, d)) continue;
    scheduled++;
    if (set.has(d)) done++;
  }
  return { scheduled, done, rate: scheduled ? done / scheduled : null };
}

export function habitsToday(habits: Habit[], completions: HabitCompletion[], today: ISODate) {
  const scheduled = habits.filter((h) => !h.archived && isScheduled(h, today));
  const doneIds = new Set(completions.filter((c) => c.date === today).map((c) => c.habitId));
  const done = scheduled.filter((h) => doneIds.has(h.id)).length;
  return { scheduled, done, total: scheduled.length, doneIds };
}

// ───────────────────────── Goals (non-money) ─────────────────────────

export type GoalProgress =
  | { kind: "money" } // handled by finance.moneyGoalProgress
  | { kind: "protein_days"; reached: number; target: number; windowStart: ISODate; pct: number }
  | { kind: "habit"; count: number; target: number; pct: number }
  | { kind: "milestones"; done: number; total: number; pct: number | null };

export function goalProgress(
  goal: Goal,
  ctx: { today: ISODate; milestones: Milestone[]; habitCompletions: HabitCompletion[]; foodEntries: FoodEntry[]; proteinTarget: number },
): GoalProgress {
  const m = goal.measure;
  switch (m.type) {
    case "money":
      return { kind: "money" };
    case "protein_days": {
      const windowStart = addDays(ctx.today, -(m.windowDays - 1));
      const byDate = new Map<ISODate, number>();
      for (const e of ctx.foodEntries) if (inRange(e.date, windowStart, ctx.today)) byDate.set(e.date, (byDate.get(e.date) ?? 0) + entryNutrients(e).protein);
      const reached = [...byDate.values()].filter((p) => ctx.proteinTarget > 0 && p >= ctx.proteinTarget - 0.05).length;
      return { kind: "protein_days", reached, target: m.targetDays, windowStart, pct: m.targetDays ? Math.min(1, reached / m.targetDays) : 0 };
    }
    case "habit": {
      const count = ctx.habitCompletions.filter((c) => c.habitId === m.habitId && c.date >= goal.startDate && c.date <= ctx.today).length;
      return { kind: "habit", count, target: m.targetCount, pct: m.targetCount ? Math.min(1, count / m.targetCount) : 0 };
    }
    case "milestones": {
      const mine = ctx.milestones.filter((x) => x.goalId === goal.id);
      const done = mine.filter((x) => x.done).length;
      // No milestones → no artificial percentage.
      return { kind: "milestones", done, total: mine.length, pct: mine.length ? done / mine.length : null };
    }
  }
}

export const daysLeft = (target: ISODate | null, today: ISODate) => (target ? diffDays(today, target) : null);

export function minutesUntil(time: TimeOfDay, now: TimeOfDay): number {
  return timeToMinutes(time) - timeToMinutes(now);
}

// ───────────────────────── External calendars ─────────────────────────

const evKey = (title: string, date: string, time: string | null) => `${title.trim().toLowerCase()}|${date}|${time ?? "allday"}`;

/**
 * Cached external events overlapping [from, to], minus those a local event
 * already represents (same title, date and start time) — so nothing shows twice.
 */
export function externalEventsBetween(external: ExternalEvent[], local: CalendarEvent[], from: ISODate, to: ISODate): ExternalEvent[] {
  const localKeys = new Set(eventOccurrences(local, from, to).map((o) => evKey(o.event.title, o.date, o.event.allDay ? null : o.event.startTime)));
  const seen = new Set<string>();
  return external
    .filter((e) => e.date <= to && e.endDate >= from)
    .filter((e) => {
      const k = evKey(e.title, e.date, e.allDay ? null : e.startTime);
      if (localKeys.has(k) || seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .sort((a, b) => (a.date === b.date ? (a.startTime ?? "").localeCompare(b.startTime ?? "") : a.date < b.date ? -1 : 1));
}
