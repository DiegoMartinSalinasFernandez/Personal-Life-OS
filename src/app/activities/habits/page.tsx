"use client";

import { useMemo, useState } from "react";
import { Plus, Flame, Trophy, Pencil, Repeat2, Check } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { IconTile } from "@/components/ui/icon";
import { SimpleBars, ACCENT } from "@/components/charts";
import { cn } from "@/lib/cn";
import { useDb, useToday, actions } from "@/lib/hooks";
import { openSheet } from "@/lib/store/ui";
import { bestStreak, habitRate, habitStreak, isScheduled } from "@/lib/calc/productivity";
import { addDays, eachDay, formatDate, startOfWeek } from "@/lib/domain/dates";
import type { Habit } from "@/lib/domain/types";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const scheduleLabel = (h: Habit) => (h.schedule.type === "daily" ? "Every day" : h.schedule.days.length === 5 && [1, 2, 3, 4, 5].every((d) => (h.schedule as { days: number[] }).days.includes(d)) ? "Weekdays" : h.schedule.days.map((d) => WD[d]).join(", "));

export default function HabitsPage() {
  const db = useDb();
  const today = useToday();
  const [showArchived, setShowArchived] = useState(false);
  const habits = db.habits.filter((h) => showArchived || !h.archived);
  const week = eachDay(addDays(today, -6), today);
  const completions = useMemo(() => new Set(db.habitCompletions.map((c) => `${c.habitId}|${c.date}`)), [db.habitCompletions]);

  const weekly = useMemo(() => {
    // Overall consistency per week (last 8 weeks): completed / scheduled across active habits.
    const out: { week: string; rate: number }[] = [];
    const ws = db.profile.weekStartsOn;
    for (let i = 7; i >= 0; i--) {
      const start = addDays(startOfWeek(today, ws), -7 * i);
      const end = i === 0 ? today : addDays(start, 6);
      let s = 0, d = 0;
      for (const h of db.habits.filter((x) => !x.archived)) {
        const r = habitRate(h, db.habitCompletions, start, end);
        s += r.scheduled;
        d += r.done;
      }
      out.push({ week: start, rate: s ? Math.round((d / s) * 100) : 0 });
    }
    return out;
  }, [db.habits, db.habitCompletions, today, db.profile.weekStartsOn]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-3">Tap a day to check it in. Streaks count scheduled days only and use your local calendar dates.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Hide archived" : "Show archived"}</Button>
          <Button size="sm" variant="primary" onClick={() => openSheet({ kind: "habit" })}><Plus /> New habit</Button>
        </div>
      </div>

      {habits.length ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-line text-caption text-ink-3">
                  <th className="px-4 py-2.5 text-left font-medium">Habit</th>
                  {week.map((d) => (
                    <th key={d} className={cn("w-11 px-1 py-2 text-center font-medium", d === today && "text-activities")}>
                      <span className="block uppercase">{formatDate(d, { weekday: "narrow" })}</span>
                      <span className="num">{Number(d.slice(8))}</span>
                    </th>
                  ))}
                  <th className="px-2 py-2.5 text-right font-medium">Streak</th>
                  <th className="px-2 py-2.5 text-right font-medium">Best</th>
                  <th className="px-2 py-2.5 text-right font-medium">30-day</th>
                  <th className="px-3"><span className="sr-only">Edit</span></th>
                </tr>
              </thead>
              <tbody>
                {habits.map((h) => {
                  const streak = habitStreak(h, db.habitCompletions, today);
                  const best = bestStreak(h, db.habitCompletions, today);
                  const rate = habitRate(h, db.habitCompletions, addDays(today, -29), today);
                  return (
                    <tr key={h.id} className={cn("border-b border-line/70 last:border-0", h.archived && "opacity-50")}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <IconTile name={h.icon} color={h.color} />
                          <div className="min-w-0">
                            <p className="truncate text-base font-medium">{h.name}</p>
                            <p className="truncate text-caption text-ink-3">{scheduleLabel(h)}{h.reminderTime ? ` · reminder ${h.reminderTime}` : ""}</p>
                          </div>
                        </div>
                      </td>
                      {week.map((d) => {
                        const sched = isScheduled(h, d);
                        const done = completions.has(`${h.id}|${d}`);
                        return (
                          <td key={d} className="px-1 py-2 text-center">
                            <button
                              onClick={() => actions().toggleHabit(h.id, d)}
                              disabled={d < h.startDate || h.archived}
                              aria-pressed={done}
                              aria-label={`${h.name} on ${formatDate(d, { weekday: "long", month: "short", day: "numeric" })}: ${done ? "done" : sched ? "not done" : "not scheduled"}`}
                              className={cn(
                                "mx-auto grid size-8 place-items-center rounded-md transition-colors disabled:opacity-30",
                                done ? "text-white" : sched ? "border border-line-strong bg-surface hover:bg-muted" : "border border-dashed border-line text-ink-3 hover:bg-muted",
                              )}
                              style={done ? { background: h.color } : undefined}
                            >
                              {done ? <Check className="size-4" /> : sched ? null : <span className="text-micro">–</span>}
                            </button>
                          </td>
                        );
                      })}
                      <td className="num px-2 text-right text-base font-semibold"><span className="inline-flex items-center gap-1">{streak > 0 ? <Flame className="size-3.5 text-nutrition" /> : null}{streak}</span></td>
                      <td className="num px-2 text-right text-sm text-ink-2"><span className="inline-flex items-center gap-1">{best >= 7 ? <Trophy className="size-3 text-warning" /> : null}{best}</span></td>
                      <td className="num px-2 text-right text-sm text-ink-2">{rate.rate == null ? "—" : `${Math.round(rate.rate * 100)}%`}</td>
                      <td className="px-3 text-right"><Button size="icon-sm" variant="ghost" onClick={() => openSheet({ kind: "habit", id: h.id })} aria-label={`Edit ${h.name}`}><Pencil /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card><EmptyState icon={<Repeat2 />} title="No habits yet" description="Track routines like exercise, reading or reviewing your finances. Choose daily or specific days." action={<Button variant="primary" onClick={() => openSheet({ kind: "habit" })}>Create a habit</Button>} /></Card>
      )}

      {db.habits.some((h) => !h.archived) ? (
        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-7">
            <CardHeader title="Weekly consistency" subtitle="Share of scheduled check-ins completed, all active habits" />
            <CardBody>
              <SimpleBars data={weekly} xKey="week" yKey="rate" label="Completed" color={ACCENT.activities} valueFormatter={(v) => `${Math.round(v)}%`} tickFormatter={(w) => formatDate(w, { month: "short", day: "numeric" })} labelFormatter={(w) => `Week of ${formatDate(w, { month: "long", day: "numeric" })}`} height={200} ariaLabel="Habit completion rate per week for the last 8 weeks" />
            </CardBody>
          </Card>
          <Card className="lg:col-span-5">
            <CardHeader title="History" subtitle="Last 12 weeks" />
            <CardBody className="flex flex-col gap-3">
              {db.habits.filter((h) => !h.archived).map((h) => <Heatmap key={h.id} habit={h} completions={completions} today={today} />)}
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function Heatmap({ habit, completions, today }: { habit: Habit; completions: Set<string>; today: string }) {
  const start = addDays(startOfWeek(today, 1), -7 * 11);
  const days = eachDay(start, today);
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-sm text-ink-2">{habit.name}</span>
      <div className="grid grid-flow-col grid-rows-7 gap-[2px]" role="img" aria-label={`${habit.name} completion history`}>
        {days.map((d) => {
          const done = completions.has(`${habit.id}|${d}`);
          const sched = isScheduled(habit, d);
          return <span key={d} title={`${formatDate(d)}: ${done ? "done" : sched ? "missed" : "not scheduled"}`} className={cn("size-2.5 rounded-[2px]", !done && (sched ? "bg-line-strong/70" : "bg-muted"))} style={done ? { background: habit.color } : undefined} />;
        })}
      </div>
    </div>
  );
}
