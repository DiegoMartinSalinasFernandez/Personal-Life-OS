"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Star, AlertTriangle, CalendarClock, Sparkles, CheckCircle2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/progress";
import { toast } from "@/components/ui/toast";
import { useClock, useDb, actions } from "@/lib/hooks";
import { openSheet } from "@/lib/store/ui";
import { eventOccurrences, habitsToday, plannedMinutes, todayTasks } from "@/lib/calc/productivity";
import { addDays, formatDate, relativeDay } from "@/lib/domain/dates";
import { TaskItem } from "@/features/activities/task-item";
import { QuickAddTask } from "@/features/activities/quick-add-task";
import { HabitChips } from "@/features/activities/habit-chips";
import { DayTimeline } from "@/features/overview/timeline";
import { useNextAction } from "@/features/activities/next-action";

export default function ActivitiesToday() {
  const db = useDb();
  const { today } = useClock();
  const tt = useMemo(() => todayTasks(db.tasks, today), [db.tasks, today]);
  const habits = habitsToday(db.habits, db.habitCompletions, today);
  const next = useNextAction();
  const planned = plannedMinutes(db.tasks, today);
  const upcoming = useMemo(() => eventOccurrences(db.events, addDays(today, 1), addDays(today, 7)).slice(0, 6), [db.events, today]);
  const priorityIds = new Set(tt.priorities.map((t) => t.id));
  const dueNotPriority = tt.dueToday.filter((t) => !priorityIds.has(t.id));
  const openToday = tt.overdue.length + tt.dueToday.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="overflow-hidden lg:col-span-8">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="eyebrow flex items-center gap-1.5 text-activities"><Sparkles className="size-3" /> Next action</p>
              {next ? (
                <>
                  <p className="mt-1.5 truncate text-xl font-semibold tracking-tight">{next.title}</p>
                  <p className="mt-0.5 text-base text-ink-3">
                    {next.kind === "event" ? "Event" : "Task"}
                    {next.time ? ` · ${next.now ? "happening now" : `at ${next.time}`}${next.end ? `–${next.end}` : ""}` : " · your top priority today"}
                  </p>
                </>
              ) : (
                <p className="mt-1.5 text-lg text-ink-2">Nothing pressing. Capture what&apos;s on your mind below.</p>
              )}
            </div>
            {next ? (
              <div className="flex gap-2">
                {next.kind === "task" ? (
                  <Button variant="primary" onClick={() => { actions().toggleTask(next.id, today); toast(`Completed “${next.title}”`); }}>
                    <CheckCircle2 /> Done
                  </Button>
                ) : null}
                <Button onClick={() => openSheet(next.kind === "task" ? { kind: "task", id: next.id } : { kind: "event", id: next.id, occurrenceDate: next.date })}>Open</Button>
              </div>
            ) : null}
          </div>
          <div className="border-t border-line bg-subtle/60 px-5 py-3">
            <QuickAddTask defaults={{ dueDate: today }} placeholder="Add a task for today — e.g. “Call dentist !high”" />
          </div>
        </Card>
        <Card className="flex items-center gap-5 p-5 lg:col-span-4">
          <ProgressRing value={tt.completionRate ?? 0} size={96} stroke={9} tone="activities" label="Today's completion rate">
            <span className="num text-lg font-semibold">{tt.completionRate == null ? "—" : `${Math.round(tt.completionRate * 100)}%`}</span>
          </ProgressRing>
          <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <div><dt className="text-ink-3">Done today</dt><dd className="num text-lg font-semibold">{tt.completedToday.length}</dd></div>
            <div><dt className="text-ink-3">Remaining</dt><dd className="num text-lg font-semibold">{openToday}</dd></div>
            <div><dt className="text-ink-3">Habits</dt><dd className="num text-lg font-semibold">{habits.done}/{habits.total}</dd></div>
            <div><dt className="text-ink-3">Estimated</dt><dd className="num text-lg font-semibold">{planned.estimated ? `${Math.floor(planned.estimated / 60)}h ${planned.estimated % 60}m` : "—"}</dd></div>
          </dl>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-7">
          <Card>
            <CardHeader title="Top priorities" subtitle="Focus-flagged, or urgent/high and due within 3 days" icon={<Star className="size-4 text-warning" />} />
            <CardBody className="pb-3">
              {tt.priorities.length ? (
                <div className="-mx-2">{tt.priorities.map((t) => <TaskItem key={t.id} task={t} />)}</div>
              ) : (
                <p className="text-sm text-ink-3">No priorities flagged. Star a task as <strong>Focus</strong> to pin it here.</p>
              )}
            </CardBody>
          </Card>
          {tt.overdue.length ? (
            <Card>
              <CardHeader
                title={`Overdue (${tt.overdue.length})`}
                icon={<AlertTriangle className="size-4 text-negative" />}
                action={
                  <Button size="sm" variant="ghost" onClick={() => { tt.overdue.forEach((t) => actions().update("tasks", t.id, { dueDate: today })); toast(`Moved ${tt.overdue.length} tasks to today`); }}>
                    Move all to today
                  </Button>
                }
              />
              <CardBody className="pb-3"><div className="-mx-2">{tt.overdue.map((t) => <TaskItem key={t.id} task={t} />)}</div></CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Due today" subtitle={dueNotPriority.length || tt.completedToday.length ? `${tt.completedToday.length} completed` : undefined} action={<Link href="/activities/tasks" className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">All tasks <ArrowRight className="size-3.5" /></Link>} />
            <CardBody className="pb-3">
              {dueNotPriority.length || tt.completedToday.length ? (
                <div className="-mx-2">
                  {dueNotPriority.map((t) => <TaskItem key={t.id} task={t} showDue={false} />)}
                  {tt.completedToday.map((t) => <TaskItem key={t.id} task={t} showDue={false} compact />)}
                </div>
              ) : (
                <p className="text-sm text-ink-3">Nothing else is due today.</p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-5">
          <Card>
            <CardHeader title="Agenda" subtitle={formatDate(today, { weekday: "long", month: "long", day: "numeric" })} icon={<CalendarClock className="size-4 text-ink-3" />} action={<Link href="/activities/calendar" className="text-sm font-medium text-ink-2 hover:text-ink">Calendar</Link>} />
            <CardBody>
              <DayTimeline date={today} meals={false} bills={false} emptyText="No events or scheduled tasks today." />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Habits" subtitle={`${habits.done} of ${habits.total} done today`} action={<Link href="/activities/habits" className="text-sm font-medium text-ink-2 hover:text-ink">All habits</Link>} />
            <CardBody><HabitChips /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Coming up" subtitle="Next 7 days" />
            <CardBody className="pb-3">
              {upcoming.length ? (
                <ul className="-mx-2">
                  {upcoming.map((o) => (
                    <li key={o.key}>
                      <button onClick={() => openSheet({ kind: "event", id: o.event.id, occurrenceDate: o.date })} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-subtle">
                        <span className="h-8 w-1 rounded-full" style={{ background: o.event.color }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-medium">{o.event.title}</span>
                          <span className="block text-caption text-ink-3">{relativeDay(o.date, today)}{o.event.allDay ? " · all day" : ` · ${o.event.startTime}`}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-3">No events in the next week.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
