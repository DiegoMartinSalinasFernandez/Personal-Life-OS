"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CheckSquare, Repeat } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { useClock, useDb, useMediaQuery, useSessionState } from "@/lib/hooks";
import { openSheet } from "@/lib/store/ui";
import { eventOccurrences, externalEventsBetween } from "@/lib/calc/productivity";
import { addDays, addMonths, eachDay, endOfMonth, endOfWeek, formatDate, minutesToTime, startOfMonth, startOfWeek, timeToMinutes, describeRange, relativeDay, type ISODate } from "@/lib/domain/dates";
import { completeWithFeedback } from "@/features/activities/task-item";
import type { CalendarEvent, ExternalEvent, Task } from "@/lib/domain/types";

type View = "day" | "week" | "month" | "agenda";
const HOUR = 48;

interface Block {
  key: string;
  title: string;
  start: number;
  end: number;
  color: string;
  kind: "event" | "task" | "external";
  event?: CalendarEvent;
  ext?: ExternalEvent;
  task?: Task;
  date: ISODate;
  repeats?: boolean;
}

/** Assigns overlapping blocks to side-by-side columns. */
function layout(blocks: Block[]) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: (Block & { col: number; cols: number })[] = [];
  let cluster: (Block & { col: number; cols: number })[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    cluster.forEach((c) => (c.cols = cols));
    out.push(...cluster);
    cluster = [];
  };
  for (const b of sorted) {
    if (b.start >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => c.end > b.start).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ ...b, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  flush();
  return out;
}

export default function CalendarPage() {
  const db = useDb();
  const { today, now } = useClock();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [view, setView] = useSessionState<View>("cal-view", "week");
  const [anchor, setAnchor] = useState(today);
  const ws = db.profile.weekStartsOn;
  const effectiveView: View = isMobile && view === "week" ? "day" : view;
  const scrollRef = useRef<HTMLDivElement>(null);

  const range = useMemo(() => {
    if (effectiveView === "day") return { start: anchor, end: anchor };
    if (effectiveView === "week") return { start: startOfWeek(anchor, ws), end: endOfWeek(anchor, ws) };
    if (effectiveView === "month") return { start: startOfWeek(startOfMonth(anchor), ws), end: endOfWeek(endOfMonth(anchor), ws) };
    return { start: anchor, end: addDays(anchor, 29) };
  }, [effectiveView, anchor, ws]);
  const days = eachDay(range.start, range.end);

  const occ = useMemo(() => eventOccurrences(db.events, range.start, range.end), [db.events, range.start, range.end]);
  const ext = useMemo(() => externalEventsBetween(db.externalEvents, db.events, range.start, range.end), [db.externalEvents, db.events, range.start, range.end]);
  const tasks = useMemo(() => db.tasks.filter((t) => t.dueDate && t.dueDate >= range.start && t.dueDate <= range.end), [db.tasks, range.start, range.end]);

  const step = (dir: -1 | 1) => setAnchor(effectiveView === "day" ? addDays(anchor, dir) : effectiveView === "week" ? addDays(anchor, 7 * dir) : effectiveView === "month" ? addMonths(anchor, dir) : addDays(anchor, 30 * dir));
  const label = effectiveView === "day" ? formatDate(anchor, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : effectiveView === "month" ? formatDate(anchor, { month: "long", year: "numeric" }) : describeRange("custom", range);

  const blocksFor = (d: ISODate): Block[] => [
    ...occ.filter((o) => o.date === d && !o.event.allDay && o.event.startTime).map((o) => {
      const s = timeToMinutes(o.event.startTime!);
      return { key: o.key, title: o.event.title, start: s, end: o.event.endTime ? Math.max(s + 15, timeToMinutes(o.event.endTime)) : s + 60, color: o.event.color, kind: "event" as const, event: o.event, date: d, repeats: !!o.event.recurrence };
    }),
    ...tasks.filter((t) => t.dueDate === d && t.startTime).map((t) => {
      const s = timeToMinutes(t.startTime!);
      return { key: t.id, title: t.title, start: s, end: t.endTime ? Math.max(s + 15, timeToMinutes(t.endTime)) : s + (t.estimateMin ?? 30), color: db.projects.find((p) => p.id === t.projectId)?.color ?? "rgb(var(--activities))", kind: "task" as const, task: t, date: d };
    }),
    ...ext.filter((e) => e.date === d && !e.allDay && e.startTime).map((e) => {
      const s = timeToMinutes(e.startTime!);
      const end = e.endTime && e.endDate === e.date ? Math.max(s + 15, timeToMinutes(e.endTime)) : e.endDate > e.date ? 24 * 60 - 1 : s + 60;
      return { key: e.id, title: e.title, start: s, end, color: e.color, kind: "external" as const, ext: e, date: d, repeats: e.recurring };
    }),
  ];
  const allDayFor = (d: ISODate) => ({ events: occ.filter((o) => o.date === d && (o.event.allDay || !o.event.startTime)), tasks: tasks.filter((t) => t.dueDate === d && !t.startTime), external: ext.filter((e) => e.date === d && (e.allDay || !e.startTime)) });
  const ExtChip = ({ e }: { e: ExternalEvent }) => (
    <button onClick={() => openSheet({ kind: "external", id: e.id })} className="flex w-full items-center gap-1 truncate rounded border border-dashed bg-surface px-1.5 py-0.5 text-left text-caption font-medium" style={{ borderColor: e.color }} title={`${e.calendarName} (${e.provider === "google" ? "Google" : "Notion"})`}>
      <span className="grid size-3.5 shrink-0 place-items-center rounded-sm text-[9px] font-bold text-white" style={{ background: e.color }} aria-label={e.provider === "google" ? "Google Calendar" : "Notion"}>{e.provider === "google" ? "G" : "N"}</span>
      <span className="truncate">{e.allDay ? "" : `${e.startTime} `}{e.title}</span>
    </button>
  );

  const allBlocks = days.flatMap(blocksFor);
  const minHour = Math.min(7, ...allBlocks.map((b) => Math.floor(b.start / 60)));
  const maxHour = Math.max(22, ...allBlocks.map((b) => Math.ceil(b.end / 60)));
  const hours = Array.from({ length: maxHour - minHour }, (_, i) => minHour + i);

  useEffect(() => {
    if (scrollRef.current && (effectiveView === "week" || effectiveView === "day")) scrollRef.current.scrollTop = Math.max(0, (8 - minHour) * HOUR);
  }, [effectiveView, minHour]);

  const TaskChip = ({ t }: { t: Task }) => (
    <div className="flex items-center gap-1.5 rounded border border-line bg-surface px-1.5 py-0.5 text-caption">
      <Checkbox size="sm" checked={t.done} label={`Complete ${t.title}`} onChange={() => completeWithFeedback(t, today)} />
      <button onClick={() => openSheet({ kind: "task", id: t.id })} className={cn("truncate text-left", t.done && "text-ink-3 line-through")}>{t.title}</button>
    </div>
  );
  const EventChip = ({ e, d }: { e: CalendarEvent; d: ISODate }) => (
    <button onClick={() => openSheet({ kind: "event", id: e.id, occurrenceDate: d })} className="block w-full truncate rounded px-1.5 py-0.5 text-left text-caption font-medium text-white" style={{ background: e.color }}>
      {e.allDay ? "" : `${e.startTime} `}
      {e.title}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft /></Button>
          <Button size="icon-sm" variant="ghost" onClick={() => step(1)} aria-label="Next"><ChevronRight /></Button>
          <Button size="sm" variant="ghost" onClick={() => setAnchor(today)}>Today</Button>
          <h2 className="ml-1 text-md font-semibold">{label}</h2>
        </div>
        <Segmented size="sm" label="Calendar view" value={effectiveView} onChange={setView} options={[{ value: "day", label: "Day" }, ...(isMobile ? [] : [{ value: "week" as View, label: "Week" }]), { value: "month", label: "Month" }, { value: "agenda", label: "Agenda" }]} />
      </div>
      <div className="flex flex-wrap items-center gap-4 text-caption text-ink-3">
        <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm bg-activities" /> Events (solid)</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm border border-dashed border-ink-3 bg-surface" /> Scheduled tasks (outlined)</span>
        {db.externalEvents.length ? <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm border border-dashed border-l-[3px] border-info bg-subtle" /> External calendars (read-only)</span> : null}
        <span>Click an empty slot to add an event{db.externalEvents.length ? "" : " · connect Google Calendar in Settings → Integrations"}</span>
      </div>

      {effectiveView === "week" || effectiveView === "day" ? (
        <Card className="overflow-hidden">
          {/* Header row */}
          <div className="grid border-b border-line" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0,1fr))` }}>
            <div />
            {days.map((d) => (
              <div key={d} className="border-l border-line px-2 py-2 text-center">
                <p className="text-caption uppercase text-ink-3">{formatDate(d, { weekday: "short" })}</p>
                <p className={cn("num mx-auto mt-0.5 grid size-7 place-items-center rounded-full text-base font-semibold", d === today && "bg-activities text-white")}>{Number(d.slice(8))}</p>
              </div>
            ))}
          </div>
          {/* All-day row */}
          <div className="grid border-b border-line bg-subtle/50" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0,1fr))` }}>
            <div className="px-1 py-1.5 text-right text-micro uppercase text-ink-3">All day</div>
            {days.map((d) => {
              const a = allDayFor(d);
              return (
                <div key={d} className="flex min-h-[34px] flex-col gap-1 border-l border-line p-1">
                  {a.events.map((o) => <EventChip key={o.key} e={o.event} d={d} />)}
                  {a.tasks.map((t) => <TaskChip key={t.id} t={t} />)}
                  {a.external.map((e) => <ExtChip key={e.id} e={e} />)}
                </div>
              );
            })}
          </div>
          {/* Time grid */}
          <div ref={scrollRef} className="scrollbar-thin max-h-[640px] overflow-y-auto">
            <div className="relative grid" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0,1fr))` }}>
              <div>
                {hours.map((h) => (
                  <div key={h} className="num relative pr-2 text-right text-micro text-ink-3" style={{ height: HOUR }}>
                    <span className="absolute -top-1.5 right-2">{h === minHour ? "" : `${String(h).padStart(2, "0")}:00`}</span>
                  </div>
                ))}
              </div>
              {days.map((d) => (
                <div key={d} className="relative border-l border-line">
                  {hours.map((h) => (
                    <button
                      key={h}
                      className="block w-full border-b border-line/60 hover:bg-activities-soft/40"
                      style={{ height: HOUR }}
                      onClick={() => openSheet({ kind: "event", defaults: { date: d, startTime: minutesToTime(h * 60), endTime: minutesToTime(h * 60 + 60) } })}
                      aria-label={`Add event on ${formatDate(d)} at ${h}:00`}
                    />
                  ))}
                  {layout(blocksFor(d)).map((b) => {
                    const top = ((b.start - minHour * 60) / 60) * HOUR;
                    const height = Math.max(20, ((b.end - b.start) / 60) * HOUR - 2);
                    const width = 100 / b.cols;
                    return (
                      <div
                        key={b.key}
                        className={cn("absolute overflow-hidden rounded-md px-1.5 py-1 text-caption leading-tight shadow-card", b.kind === "event" ? "text-white" : b.kind === "external" ? "border border-dashed border-l-[3px] bg-subtle text-ink" : "border border-dashed bg-surface text-ink")}
                        style={{ top, height, left: `calc(${b.col * width}% + 2px)`, width: `calc(${width}% - 4px)`, background: b.kind === "event" ? b.color : undefined, borderColor: b.kind !== "event" ? b.color : undefined }}
                      >
                        <button className="block h-full w-full text-left" onClick={() => (b.kind === "event" ? openSheet({ kind: "event", id: b.event!.id, occurrenceDate: b.date }) : b.kind === "external" ? openSheet({ kind: "external", id: b.ext!.id }) : openSheet({ kind: "task", id: b.task!.id }))}>
                          <span className={cn("flex items-center gap-1 font-semibold", b.task?.done && "line-through opacity-60")}>
                            {b.kind === "task" ? <CheckSquare className="size-3 shrink-0" style={{ color: b.color }} aria-label="Task" /> : null}
                            {b.kind === "external" ? <span className="grid size-3.5 shrink-0 place-items-center rounded-sm text-[9px] font-bold text-white" style={{ background: b.color }} aria-label={b.ext!.provider === "google" ? "Google Calendar event" : "Notion entry"}>{b.ext!.provider === "google" ? "G" : "N"}</span> : null}
                            <span className="truncate">{b.title}</span>
                            {b.repeats ? <Repeat className="size-2.5 shrink-0 opacity-80" aria-label="Repeats" /> : null}
                          </span>
                          {height > 30 ? <span className="num block opacity-80">{minutesToTime(b.start)}–{minutesToTime(b.end)}</span> : null}
                        </button>
                      </div>
                    );
                  })}
                  {d === today && timeToMinutes(now) >= minHour * 60 && timeToMinutes(now) <= maxHour * 60 ? (
                    <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-negative" style={{ top: ((timeToMinutes(now) - minHour * 60) / 60) * HOUR }}>
                      <span className="absolute -left-1 -top-1 size-2.5 rounded-full bg-negative" />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      {effectiveView === "month" ? (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line">
            {days.slice(0, 7).map((d) => (
              <div key={d} className="px-2 py-2 text-center text-caption uppercase text-ink-3">{formatDate(d, { weekday: isMobile ? "narrow" : "short" })}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const a = allDayFor(d);
              const timed = occ.filter((o) => o.date === d && !o.event.allDay && o.event.startTime);
              const timedTasks = tasks.filter((t) => t.dueDate === d && t.startTime);
              const inMonth = d.slice(0, 7) === anchor.slice(0, 7);
              const evs = [...a.events, ...timed];
              const allTasks = [...a.tasks, ...timedTasks];
              const extDay = ext.filter((e) => e.date === d);
              return (
                <div key={d} className={cn("min-h-[92px] border-b border-r border-line p-1 text-left md:min-h-[116px]", !inMonth && "bg-subtle/60")}>
                  <button onClick={() => { setAnchor(d); setView("day"); }} className={cn("num mb-1 grid size-6 place-items-center rounded-full text-caption font-semibold hover:bg-muted", d === today && "bg-activities text-white hover:bg-activities", !inMonth && "text-ink-3")} aria-label={`Open ${formatDate(d, { month: "long", day: "numeric" })}`}>
                    {Number(d.slice(8))}
                  </button>
                  <div className="hidden flex-col gap-0.5 md:flex">
                    {evs.slice(0, 3).map((o) => <EventChip key={o.key} e={o.event} d={d} />)}
                    {allTasks.slice(0, Math.max(0, 3 - evs.length)).map((t) => <TaskChip key={t.id} t={t} />)}
                    {extDay.slice(0, Math.max(0, 3 - evs.length - allTasks.length)).map((e) => <ExtChip key={e.id} e={e} />)}
                    {evs.length + allTasks.length + extDay.length > 3 ? <span className="px-1 text-micro text-ink-3">+{evs.length + allTasks.length + extDay.length - 3} more</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-0.5 md:hidden">
                    {evs.slice(0, 4).map((o) => <span key={o.key} className="size-1.5 rounded-full" style={{ background: o.event.color }} />)}
                    {allTasks.length ? <span className="size-1.5 rounded-full border border-ink-3" /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {effectiveView === "agenda" ? (
        <Card className="p-2">
          {days.filter((d) => occ.some((o) => o.date === d) || tasks.some((t) => t.dueDate === d) || ext.some((e) => e.date === d)).map((d) => (
            <section key={d} className="border-b border-line px-3 py-3 last:border-0">
              <h3 className={cn("mb-2 text-sm font-semibold", d === today ? "text-activities" : "text-ink")}>{relativeDay(d, today)} <span className="font-normal text-ink-3">· {formatDate(d, { weekday: "short", month: "short", day: "numeric" })}</span></h3>
              <ul className="flex flex-col gap-1">
                {occ.filter((o) => o.date === d).map((o) => (
                  <li key={o.key}>
                    <button onClick={() => openSheet({ kind: "event", id: o.event.id, occurrenceDate: d })} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-subtle">
                      <span className="num w-24 shrink-0 text-sm text-ink-3">{o.event.allDay ? "All day" : `${o.event.startTime}${o.event.endTime ? `–${o.event.endTime}` : ""}`}</span>
                      <span className="h-5 w-1 rounded-full" style={{ background: o.event.color }} />
                      <span className="flex-1 truncate text-base">{o.event.title}</span>
                      {o.event.location ? <span className="hidden truncate text-caption text-ink-3 sm:block">{o.event.location}</span> : null}
                    </button>
                  </li>
                ))}
                {ext.filter((e) => e.date === d).map((e) => (
                  <li key={e.id}>
                    <button onClick={() => openSheet({ kind: "external", id: e.id })} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-subtle">
                      <span className="num w-24 shrink-0 text-sm text-ink-3">{e.allDay ? "All day" : `${e.startTime}${e.endTime ? `–${e.endTime}` : ""}`}</span>
                      <span className="h-5 w-1 rounded-full border border-dashed" style={{ borderColor: e.color }} />
                      <span className="flex-1 truncate text-base">{e.title}</span>
                      <span className="text-caption text-ink-3">{e.provider === "google" ? "Google" : "Notion"} · {e.calendarName}</span>
                    </button>
                  </li>
                ))}
                {tasks.filter((t) => t.dueDate === d).map((t) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-subtle">
                    <span className="num w-24 shrink-0 text-sm text-ink-3">{t.startTime ?? "Task"}</span>
                    <Checkbox size="sm" checked={t.done} label={`Complete ${t.title}`} onChange={() => completeWithFeedback(t, today)} />
                    <button onClick={() => openSheet({ kind: "task", id: t.id })} className={cn("flex-1 truncate text-left text-base", t.done && "text-ink-3 line-through")}>{t.title}</button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!occ.length && !tasks.length && !ext.length ? <p className="p-6 text-center text-sm text-ink-3">Nothing scheduled in the next 30 days.</p> : null}
        </Card>
      ) : null}
    </div>
  );
}
