"use client";

import { useMemo } from "react";
import { useClock, useDb } from "@/lib/hooks";
import { eventOccurrences, todayTasks } from "@/lib/calc/productivity";
import { timeToMinutes } from "@/lib/domain/dates";

/** The single most useful thing to do next: an imminent timed item, else the top priority. */
export function useNextAction() {
  const db = useDb();
  const { today, now } = useClock();
  return useMemo(() => {
    const nowMin = timeToMinutes(now);
    const timed = [
      ...eventOccurrences(db.events, today, today).filter((o) => !o.event.allDay && o.event.startTime && timeToMinutes(o.event.endTime ?? o.event.startTime) > nowMin).map((o) => ({ kind: "event" as const, title: o.event.title, time: o.event.startTime!, end: o.event.endTime, id: o.event.id, date: o.date })),
      ...db.tasks.filter((t) => !t.done && t.dueDate === today && t.startTime && timeToMinutes(t.endTime ?? t.startTime) > nowMin).map((t) => ({ kind: "task" as const, title: t.title, time: t.startTime!, end: t.endTime, id: t.id, date: today })),
    ].sort((a, b) => a.time.localeCompare(b.time));
    const tt = todayTasks(db.tasks, today);
    const topTask = tt.priorities[0] ?? tt.overdue[0] ?? tt.dueToday[0] ?? null;
    const nextTimed = timed[0];
    // A timed item starting within the hour beats the top priority; otherwise focus on the most important task.
    if (nextTimed && (timeToMinutes(nextTimed.time) - nowMin <= 60 || !topTask)) return { ...nextTimed, now: timeToMinutes(nextTimed.time) <= nowMin };
    if (topTask) return { kind: "task" as const, title: topTask.title, time: null, end: null, id: topTask.id, date: today, now: false, task: topTask };
    if (nextTimed) return { ...nextTimed, now: false };
    return null;
  }, [db.events, db.tasks, today, now]);
}

