"use client";

import { Fragment, useMemo } from "react";
import { CalendarDays, CheckSquare, Utensils, Receipt, Bell } from "lucide-react";
import { cn } from "@/lib/cn";
import { Checkbox } from "@/components/ui/field";
import { useClock, useDb, useMoney } from "@/lib/hooks";
import { openSheet } from "@/lib/store/ui";
import { eventOccurrences, externalEventsBetween } from "@/lib/calc/productivity";
import { recurringOccurrences } from "@/lib/calc/finance";
import { itemNutrients } from "@/lib/calc/nutrition";
import { timeToMinutes, type ISODate } from "@/lib/domain/dates";
import { completeWithFeedback } from "@/features/activities/task-item";
import type { Database, Task } from "@/lib/domain/types";

type Kind = "event" | "task" | "meal" | "bill" | "reminder" | "external";
interface Item {
  key: string;
  kind: Kind;
  time: string | null;
  end?: string | null;
  title: string;
  sub?: string;
  color: string;
  task?: Task;
  done?: boolean;
  onClick?: () => void;
}

const KIND_META: Record<Kind, { icon: typeof CalendarDays; label: string }> = {
  event: { icon: CalendarDays, label: "Event" },
  task: { icon: CheckSquare, label: "Task" },
  meal: { icon: Utensils, label: "Planned meal" },
  bill: { icon: Receipt, label: "Bill" },
  reminder: { icon: Bell, label: "Habit reminder" },
  external: { icon: CalendarDays, label: "External calendar" },
};

export function buildTimeline(db: Database, date: ISODate, opts: { meals: boolean; bills: boolean; habits: boolean }, money: (c: number) => string): Item[] {
  const items: Item[] = [];
  for (const o of eventOccurrences(db.events, date, date))
    items.push({ key: o.key, kind: "event", time: o.event.allDay ? null : o.event.startTime, end: o.event.endTime, title: o.event.title, sub: o.event.location, color: o.event.color, onClick: () => openSheet({ kind: "event", id: o.event.id, occurrenceDate: o.date }) });
  for (const e of externalEventsBetween(db.externalEvents, db.events, date, date))
    items.push({ key: e.id, kind: "external", time: e.allDay || e.date !== date ? null : e.startTime, end: e.endDate === date ? e.endTime : null, title: e.title, sub: `${e.provider === "google" ? "Google" : "Notion"} · ${e.calendarName}`, color: e.color, onClick: () => openSheet({ kind: "external", id: e.id }) });
  for (const t of db.tasks)
    if (t.dueDate === date && t.startTime)
      items.push({ key: t.id, kind: "task", time: t.startTime, end: t.endTime, title: t.title, color: db.projects.find((p) => p.id === t.projectId)?.color ?? "rgb(var(--activities))", task: t, done: t.done, onClick: () => openSheet({ kind: "task", id: t.id }) });
  if (opts.meals) {
    const foods = new Map(db.foods.map((f) => [f.id, f]));
    for (const p of db.plannedMeals) {
      if (p.date !== date || p.loggedAt) continue;
      const mt = db.mealTypes.find((m) => m.id === p.mealTypeId);
      const protein = p.items.reduce((s, it) => s + itemNutrients(it, foods.get(it.foodId)).protein, 0);
      items.push({ key: p.id, kind: "meal", time: mt?.time ?? null, title: `${mt?.name ?? "Meal"}: ${p.items.map((i) => foods.get(i.foodId)?.name.split(",")[0]).filter(Boolean).slice(0, 2).join(", ")}${p.items.length > 2 ? "…" : ""}`, sub: `${Math.round(protein)} g protein planned`, color: "rgb(var(--nutrition))", onClick: () => openSheet({ kind: "food", date, mealTypeId: p.mealTypeId }) });
    }
  }
  if (opts.bills)
    for (const o of recurringOccurrences(db.recurring.filter((r) => r.kind !== "income"), db.transactions, date, date, date))
      if (o.status !== "paid") items.push({ key: `bill${o.item.id}`, kind: "bill", time: null, title: `${o.item.name} due`, sub: money(o.item.amount), color: "rgb(var(--finance))" });
  if (opts.habits)
    for (const h of db.habits)
      if (!h.archived && h.reminderTime && (h.schedule.type === "daily" || h.schedule.days.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) && date >= h.startDate) {
        const done = db.habitCompletions.some((c) => c.habitId === h.id && c.date === date);
        items.push({ key: `hab${h.id}`, kind: "reminder", time: h.reminderTime, title: h.name, sub: done ? "Done" : undefined, color: h.color, done });
      }
  return items.sort((a, b) => (a.time ?? "00:00").localeCompare(b.time ?? "00:00") || (a.time ? 1 : -1));
}

export function DayTimeline({ date, meals = true, bills = true, habits = true, emptyText = "Nothing scheduled." }: { date: ISODate; meals?: boolean; bills?: boolean; habits?: boolean; emptyText?: string }) {
  const db = useDb();
  const { today, now } = useClock();
  const money = useMoney();
  const items = useMemo(() => buildTimeline(db, date, { meals, bills, habits }, (c) => money(c)), [db, date, meals, bills, habits, money]);
  const allDay = items.filter((i) => !i.time);
  const timed = items.filter((i) => i.time);
  const nowMin = timeToMinutes(now);
  const nowIndex = date === today ? timed.findIndex((i) => timeToMinutes(i.end ?? i.time!) > nowMin) : -1;

  if (!items.length) return <p className="py-4 text-sm text-ink-3">{emptyText}</p>;

  const Row = ({ i }: { i: Item }) => {
    const Meta = KIND_META[i.kind];
    const past = date < today || (date === today && i.time && timeToMinutes(i.end ?? i.time) < nowMin);
    return (
      <li className={cn("flex items-stretch gap-3", past && "opacity-60")}>
        <span className="num w-11 shrink-0 pt-2 text-right text-caption text-ink-3">{i.time ?? "All day"}</span>
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-3 py-2",
            i.kind === "event" ? "bg-subtle" : i.kind === "task" ? "border border-line bg-surface" : i.kind === "external" ? "border border-dashed bg-subtle" : "border border-dashed border-line-strong",
          )}
          style={i.kind === "event" || i.kind === "external" ? { boxShadow: `inset 3px 0 0 ${i.color}`, borderColor: i.kind === "external" ? i.color : undefined } : undefined}
        >
          {i.kind === "task" && i.task ? (
            <Checkbox checked={!!i.done} onChange={() => completeWithFeedback(i.task!, today)} label={`Complete ${i.title}`} size="sm" />
          ) : (
            <Meta.icon className="size-4 shrink-0" style={{ color: i.color }} aria-hidden />
          )}
          <button onClick={i.onClick} disabled={!i.onClick} className="min-w-0 flex-1 text-left disabled:cursor-default">
            <span className={cn("block truncate text-base font-medium", i.done && "text-ink-3 line-through")}>{i.title}</span>
            <span className="block truncate text-caption text-ink-3">
              {Meta.label}
              {i.end && i.time ? ` · ${i.time}–${i.end}` : ""}
              {i.sub ? ` · ${i.sub}` : ""}
            </span>
          </button>
        </div>
      </li>
    );
  };

  return (
    <ol className="flex flex-col gap-1.5">
      {allDay.map((i) => <Row key={i.key} i={i} />)}
      {timed.map((i, idx) => (
        <Fragment key={i.key}>
          {idx === nowIndex ? (
            <li className="flex items-center gap-3" aria-label={`Now, ${now}`}>
              <span className="num w-11 text-right text-caption font-semibold text-negative">{now}</span>
              <span className="h-px flex-1 bg-negative/60" />
            </li>
          ) : null}
          <Row i={i} />
        </Fragment>
      ))}
    </ol>
  );
}
