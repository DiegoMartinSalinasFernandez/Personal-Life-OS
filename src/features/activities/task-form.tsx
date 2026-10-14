"use client";

import { useState } from "react";
import { z } from "zod";
import { ChevronDown, Trash2, Plus, X, Flag, Star, RotateCcw } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { cn } from "@/lib/cn";
import { useForm } from "@/lib/hooks/use-form";
import { useDb, useToday, actions } from "@/lib/hooks";
import { closeSheet } from "@/lib/store/ui";
import { isISODate, timeToMinutes } from "@/lib/domain/dates";
import type { Priority, Subtask, Task } from "@/lib/domain/types";
import type { Recurrence } from "@/lib/domain/recurrence";
import { uid } from "@/lib/data/defaults";
import { ProjectOptions, parseTags } from "@/features/common/options";
import { RecurrenceField } from "./recurrence-field";
import { parseQuickTask } from "./quick-parse";

export const PRIORITY_LABEL: Record<Priority, string> = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" };
export const PRIORITY_CLASS: Record<Priority, string> = { urgent: "text-negative", high: "text-warning", medium: "text-info", low: "text-ink-3" };

type Values = {
  title: string;
  description: string;
  priority: Priority;
  focus: boolean;
  dueDate: string;
  startDate: string;
  startTime: string;
  endTime: string;
  projectId: string;
  tags: string;
  estimate: string;
  recurrence: Recurrence | null;
  reminder: string;
  notes: string;
  subtasks: Subtask[];
};

const optDate = z.string().refine((s) => s === "" || isISODate(s), "Enter a valid date");
const schema = z
  .object({
    title: z.string().trim().min(1, "Give the task a title").max(200),
    description: z.string().max(2000),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    focus: z.boolean(),
    dueDate: optDate,
    startDate: optDate,
    startTime: z.string(),
    endTime: z.string(),
    projectId: z.string(),
    tags: z.string(),
    estimate: z.string().refine((s) => s === "" || (/^\d+$/.test(s) && Number(s) > 0 && Number(s) <= 1440), "Minutes between 1 and 1440"),
    recurrence: z.custom<Recurrence | null>(),
    reminder: z.string(),
    notes: z.string().max(5000),
    subtasks: z.array(z.custom<Subtask>()),
  })
  .superRefine((v, ctx) => {
    if (v.startDate && v.dueDate && v.startDate > v.dueDate) ctx.addIssue({ code: "custom", path: ["startDate"], message: "Start date is after the due date" });
    if (v.startTime && v.endTime && timeToMinutes(v.endTime) <= timeToMinutes(v.startTime)) ctx.addIssue({ code: "custom", path: ["endTime"], message: "End must be after start" });
    if ((v.startTime || v.recurrence) && !v.dueDate) ctx.addIssue({ code: "custom", path: ["dueDate"], message: v.recurrence ? "Recurring tasks need a first due date" : "Scheduled tasks need a date" });
  });

export function TaskDialog({ id, defaults }: { id?: string; defaults?: Partial<Task> }) {
  const db = useDb();
  const today = useToday();
  const existing = id ? db.tasks.find((t) => t.id === id) : undefined;
  const src: Partial<Task> = { ...defaults, ...existing };
  const [advanced, setAdvanced] = useState(!!existing);
  const [newSub, setNewSub] = useState("");

  const { values, set, errors, handleSubmit } = useForm<Values, z.infer<typeof schema>>(schema, {
    title: src.title ?? "",
    description: src.description ?? "",
    priority: src.priority ?? "medium",
    focus: src.focus ?? false,
    dueDate: src.dueDate ?? (existing ? "" : today),
    startDate: src.startDate ?? "",
    startTime: src.startTime ?? "",
    endTime: src.endTime ?? "",
    projectId: src.projectId ?? "",
    tags: (src.tags ?? []).join(", "),
    estimate: src.estimateMin ? String(src.estimateMin) : "",
    recurrence: src.recurrence ?? null,
    reminder: src.reminderMinBefore != null ? String(src.reminderMinBefore) : "",
    notes: src.notes ?? "",
    subtasks: src.subtasks ?? [],
  });

  const submit = handleSubmit((v) => {
    // On new tasks, honour inline shortcuts typed in the title (e.g. "tomorrow !high").
    const parsed = existing ? null : parseQuickTask(v.title, today, db.projects);
    const record = {
      title: parsed?.title || v.title,
      description: v.description || undefined,
      priority: parsed && parsed.priority !== "medium" ? parsed.priority : v.priority,
      focus: v.focus,
      dueDate: parsed?.dueDate ?? (v.dueDate || null),
      startDate: v.startDate || null,
      startTime: v.startTime || null,
      endTime: v.endTime || null,
      projectId: parsed?.projectId ?? (v.projectId || null),
      tags: [...new Set([...parseTags(v.tags), ...(parsed?.tags ?? [])])],
      estimateMin: v.estimate ? Number(v.estimate) : null,
      recurrence: v.recurrence,
      reminderMinBefore: v.reminder ? Number(v.reminder) : null,
      notes: v.notes || undefined,
      subtasks: v.subtasks,
    };
    const s = actions();
    if (existing) {
      s.update("tasks", existing.id, record);
      toast("Task updated");
    } else {
      s.add("tasks", { ...record, done: false, completedAt: null, completedOn: null, spawnedNextId: null });
      toast("Task added");
    }
    closeSheet();
  });

  const del = async () => {
    if (!existing) return;
    if (!(await confirm({ title: "Delete this task?", description: existing.recurrence ? "Only this instance is deleted. Already-completed instances stay in your history." : "This can't be undone." }))) return;
    actions().deleteTask(existing.id);
    toast("Task deleted", { action: { label: "Undo", onClick: () => actions().add("tasks", existing) } });
    closeSheet();
  };

  const addSub = () => {
    const t = newSub.trim();
    if (!t) return;
    set("subtasks", [...values.subtasks, { id: uid(), title: t, done: false }]);
    setNewSub("");
  };

  return (
    <Dialog
      open
      onClose={closeSheet}
      title={existing ? "Edit task" : "New task"}
      description={existing?.done ? `Completed ${existing.completedOn ?? ""}` : !existing ? "Tip: type “tomorrow !high #project” in the title." : undefined}
      footer={
        <>
          {existing ? (
            <>
              <Button variant="ghost" className="text-negative hover:text-negative" onClick={del}>
                <Trash2 /> Delete
              </Button>
              <Button variant="ghost" className="mr-auto" onClick={() => { actions().toggleTask(existing.id, today); toast(existing.done ? "Task reopened" : "Task completed"); closeSheet(); }}>
                {existing.done ? <><RotateCcw /> Reopen</> : "Mark complete"}
              </Button>
            </>
          ) : null}
          <Button onClick={closeSheet}>Cancel</Button>
          <Button variant="primary" type="submit" form="task-form">
            {existing ? "Save" : "Add task"}
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Title" error={errors.title}>
          {(p) => <Input {...p} value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="What needs to be done?" autoFocus className="h-10 text-md" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date" error={errors.dueDate} optional>
            {(p) => (
              <div className="flex gap-1.5">
                <Input {...p} type="date" value={values.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
                {values.dueDate ? <Button size="icon" variant="ghost" onClick={() => set("dueDate", "")} aria-label="Clear due date"><X /></Button> : null}
              </div>
            )}
          </Field>
          <Field label="Project" optional>
            {(p) => (
              <Select {...p} value={values.projectId} onChange={(e) => set("projectId", e.target.value)}>
                <option value="">No project (Inbox)</option>
                <ProjectOptions projects={db.projects} />
              </Select>
            )}
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Priority"
            value={values.priority}
            onChange={(p) => set("priority", p)}
            options={(["low", "medium", "high", "urgent"] as Priority[]).map((p) => ({ value: p, label: <span className="inline-flex items-center gap-1"><Flag className={cn("size-3", PRIORITY_CLASS[p])} aria-hidden />{PRIORITY_LABEL[p]}</span> }))}
          />
          <button type="button" aria-pressed={values.focus} onClick={() => set("focus", !values.focus)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium", values.focus ? "border-warning/40 bg-warning-soft text-warning" : "border-line text-ink-2 hover:bg-muted")}>
            <Star className={cn("size-3.5", values.focus && "fill-current")} /> Focus
          </button>
        </div>
        <p className="-mt-2 text-caption text-ink-3">Priority says how important it is. Focus pins it to today&apos;s top priorities regardless of its due date.</p>

        <button type="button" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced} className="flex items-center gap-1.5 self-start text-sm font-medium text-ink-2 hover:text-ink">
          <ChevronDown className={cn("size-4 transition-transform", advanced && "rotate-180")} /> {advanced ? "Fewer options" : "More options"} — schedule, repeat, subtasks
        </button>

        {advanced ? (
          <div className="flex flex-col gap-4 border-t border-line pt-4">
            <Field label="Description" optional>
              {(p) => <Textarea {...p} rows={2} value={values.description} onChange={(e) => set("description", e.target.value)} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Start time" optional>
                {(p) => <Input {...p} type="time" value={values.startTime} onChange={(e) => set("startTime", e.target.value)} />}
              </Field>
              <Field label="End time" error={errors.endTime} optional>
                {(p) => <Input {...p} type="time" value={values.endTime} onChange={(e) => set("endTime", e.target.value)} />}
              </Field>
              <Field label="Estimate (min)" error={errors.estimate} optional>
                {(p) => <Input {...p} inputMode="numeric" value={values.estimate} onChange={(e) => set("estimate", e.target.value.replace(/\D/g, ""))} placeholder="30" />}
              </Field>
              <Field label="Start date" error={errors.startDate} optional hint="When you can begin">
                {(p) => <Input {...p} type="date" value={values.startDate} onChange={(e) => set("startDate", e.target.value)} />}
              </Field>
              <Field label="Reminder" optional hint="Shown in-app">
                {(p) => (
                  <Select {...p} value={values.reminder} onChange={(e) => set("reminder", e.target.value)}>
                    <option value="">None</option>
                    <option value="0">At start time</option>
                    <option value="15">15 min before</option>
                    <option value="60">1 hour before</option>
                    <option value="1440">1 day before</option>
                  </Select>
                )}
              </Field>
              <Field label="Tags" optional>
                {(p) => <Input {...p} value={values.tags} onChange={(e) => set("tags", e.target.value)} placeholder="writing, calls" />}
              </Field>
            </div>
            <Field label="Repeat">
              {(p) => <RecurrenceField id={p.id} value={values.recurrence} onChange={(r) => set("recurrence", r)} anchor={values.dueDate || null} />}
            </Field>
            {values.recurrence ? <p className="-mt-2 text-caption text-ink-3">When you complete it, the next instance is created automatically — once.</p> : null}
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-2">Subtasks</p>
              <ul className="flex flex-col gap-1">
                {values.subtasks.map((s) => (
                  <li key={s.id} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-subtle">
                    <Checkbox size="sm" checked={s.done} label={s.title} onChange={(d) => set("subtasks", values.subtasks.map((x) => (x.id === s.id ? { ...x, done: d } : x)))} />
                    <input value={s.title} onChange={(e) => set("subtasks", values.subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))} className={cn("flex-1 bg-transparent text-base outline-none", s.done && "text-ink-3 line-through")} aria-label="Subtask title" />
                    <button type="button" onClick={() => set("subtasks", values.subtasks.filter((x) => x.id !== s.id))} className="text-ink-3 opacity-0 hover:text-negative group-hover:opacity-100 focus:opacity-100" aria-label={`Remove ${s.title}`}>
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-1 flex gap-2">
                <Input value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }} placeholder="Add a subtask and press Enter" className="h-8" aria-label="New subtask" />
                <Button size="sm" onClick={addSub} disabled={!newSub.trim()}>
                  <Plus /> Add
                </Button>
              </div>
            </div>
            <Field label="Notes" optional>
              {(p) => <Textarea {...p} rows={3} value={values.notes} onChange={(e) => set("notes", e.target.value)} />}
            </Field>
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}
