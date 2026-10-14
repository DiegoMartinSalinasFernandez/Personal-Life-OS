"use client";

import { z } from "zod";
import { Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { cn } from "@/lib/cn";
import { useForm } from "@/lib/hooks/use-form";
import { useDb, useToday, actions } from "@/lib/hooks";
import { closeSheet } from "@/lib/store/ui";
import { formatDate, isISODate, timeToMinutes, type ISODate } from "@/lib/domain/dates";
import type { CalendarEvent } from "@/lib/domain/types";
import type { Recurrence } from "@/lib/domain/recurrence";
import { PALETTE } from "@/lib/data/defaults";
import { ProjectOptions } from "@/features/common/options";
import { RecurrenceField } from "./recurrence-field";

type Values = { title: string; date: string; allDay: boolean; startTime: string; endTime: string; location: string; notes: string; color: string; recurrence: Recurrence | null; projectId: string };
const schema = z
  .object({
    title: z.string().trim().min(1, "Add a title").max(160),
    date: z.string().refine(isISODate, "Enter a valid date"),
    allDay: z.boolean(),
    startTime: z.string(),
    endTime: z.string(),
    location: z.string().max(160),
    notes: z.string().max(4000),
    color: z.string(),
    recurrence: z.custom<Recurrence | null>(),
    projectId: z.string(),
  })
  .superRefine((v, ctx) => {
    if (!v.allDay && !v.startTime) ctx.addIssue({ code: "custom", path: ["startTime"], message: "Add a start time or mark as all-day" });
    if (!v.allDay && v.startTime && v.endTime && timeToMinutes(v.endTime) <= timeToMinutes(v.startTime)) ctx.addIssue({ code: "custom", path: ["endTime"], message: "End must be after start" });
  });

export function EventDialog({ id, defaults, occurrenceDate }: { id?: string; defaults?: Partial<CalendarEvent>; occurrenceDate?: ISODate }) {
  const db = useDb();
  const today = useToday();
  const existing = id ? db.events.find((e) => e.id === id) : undefined;
  const src: Partial<CalendarEvent> = { ...defaults, ...existing };
  const { values, set, errors, handleSubmit } = useForm<Values, z.infer<typeof schema>>(schema, {
    title: src.title ?? "",
    date: src.date ?? today,
    allDay: src.allDay ?? false,
    startTime: src.startTime ?? "09:00",
    endTime: src.endTime ?? "10:00",
    location: src.location ?? "",
    notes: src.notes ?? "",
    color: src.color ?? PALETTE[2],
    recurrence: src.recurrence ?? null,
    projectId: src.projectId ?? "",
  });

  const submit = handleSubmit((v) => {
    const record = {
      title: v.title,
      date: v.date,
      allDay: v.allDay,
      startTime: v.allDay ? null : v.startTime || null,
      endTime: v.allDay ? null : v.endTime || null,
      location: v.location || undefined,
      notes: v.notes || undefined,
      color: v.color,
      recurrence: v.recurrence,
      projectId: v.projectId || null,
    };
    if (existing) {
      actions().update("events", existing.id, record);
      toast("Event updated");
    } else {
      actions().add("events", { ...record, exDates: [] });
      toast("Event added to your calendar");
    }
    closeSheet();
  });

  const del = async (scope: "one" | "all") => {
    if (!existing) return;
    if (scope === "one" && occurrenceDate) {
      actions().skipEventOccurrence(existing.id, occurrenceDate);
      toast(`Removed the ${formatDate(occurrenceDate)} occurrence`);
      closeSheet();
      return;
    }
    if (!(await confirm({ title: existing.recurrence ? "Delete the whole series?" : "Delete this event?", description: "This can't be undone." }))) return;
    actions().remove("events", existing.id);
    toast("Event deleted", { action: { label: "Undo", onClick: () => actions().add("events", existing) } });
    closeSheet();
  };

  return (
    <Dialog
      open
      onClose={closeSheet}
      title={existing ? "Edit event" : "New event"}
      description={existing?.recurrence ? "Changes apply to every occurrence in the series." : undefined}
      footer={
        <>
          {existing ? (
            <div className="mr-auto flex gap-1">
              {existing.recurrence && occurrenceDate ? (
                <Button variant="ghost" className="text-negative hover:text-negative" onClick={() => del("one")}>
                  <Trash2 /> This one
                </Button>
              ) : null}
              <Button variant="ghost" className="text-negative hover:text-negative" onClick={() => del("all")}>
                {existing.recurrence ? "Delete series" : <><Trash2 /> Delete</>}
              </Button>
            </div>
          ) : null}
          <Button onClick={closeSheet}>Cancel</Button>
          <Button variant="primary" type="submit" form="event-form">
            {existing ? "Save" : "Add event"}
          </Button>
        </>
      }
    >
      <form id="event-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Title" error={errors.title} className="sm:col-span-2">
          {(p) => <Input {...p} value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Dentist" autoFocus />}
        </Field>
        <Field label={values.recurrence ? "First date" : "Date"} error={errors.date}>
          {(p) => <Input {...p} type="date" value={values.date} onChange={(e) => set("date", e.target.value)} />}
        </Field>
        <div className="flex items-end pb-1">
          <div className="w-full"><Switch checked={values.allDay} onChange={(v) => set("allDay", v)} label="All day" /></div>
        </div>
        {!values.allDay ? (
          <>
            <Field label="Starts" error={errors.startTime}>
              {(p) => <Input {...p} type="time" value={values.startTime} onChange={(e) => set("startTime", e.target.value)} />}
            </Field>
            <Field label="Ends" error={errors.endTime} optional>
              {(p) => <Input {...p} type="time" value={values.endTime} onChange={(e) => set("endTime", e.target.value)} />}
            </Field>
          </>
        ) : null}
        <Field label="Repeat" className="sm:col-span-2">
          {(p) => <RecurrenceField id={p.id} value={values.recurrence} onChange={(r) => set("recurrence", r)} anchor={values.date} />}
        </Field>
        <Field label="Location" optional>
          {(p) => <Input {...p} value={values.location} onChange={(e) => set("location", e.target.value)} />}
        </Field>
        <Field label="Project" optional>
          {(p) => (
            <Select {...p} value={values.projectId} onChange={(e) => set("projectId", e.target.value)}>
              <option value="">None</option>
              <ProjectOptions projects={db.projects} />
            </Select>
          )}
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-medium text-ink-2">Colour</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colour">
            {PALETTE.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={values.color === c} aria-label={c} onClick={() => set("color", c)} className={cn("size-7 rounded-full ring-offset-2 ring-offset-surface", values.color === c && "ring-2 ring-ink")} style={{ background: c }} />
            ))}
          </div>
        </div>
        <Field label="Notes" optional className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} />}
        </Field>
        <p className="text-caption text-ink-3 sm:col-span-2">This is your internal calendar. External calendars (Google, Outlook) aren&apos;t connected.</p>
      </form>
    </Dialog>
  );
}
