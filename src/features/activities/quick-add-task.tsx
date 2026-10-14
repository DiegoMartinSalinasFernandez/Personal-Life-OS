"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, CalendarDays, Flag, Hash } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useDb, useToday, actions } from "@/lib/hooks";
import { relativeDay, type ISODate } from "@/lib/domain/dates";
import type { Task } from "@/lib/domain/types";
import { parseQuickTask } from "./quick-parse";
import { PRIORITY_CLASS, PRIORITY_LABEL } from "./task-form";

/** Inline, keyboard-first task capture. Enter to add; shortcuts parsed live. */
export function QuickAddTask({ defaults, placeholder = "Add a task — try “Email Sam tomorrow !high #work”", className }: { defaults?: Partial<Task> & { dueDate?: ISODate | null }; placeholder?: string; className?: string }) {
  const db = useDb();
  const today = useToday();
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => (text.trim() ? parseQuickTask(text, today, db.projects) : null), [text, today, db.projects]);
  const project = parsed?.projectId ? db.projects.find((p) => p.id === parsed.projectId) : null;

  const submit = () => {
    if (!parsed?.title) return;
    actions().add("tasks", {
      title: parsed.title,
      done: false,
      completedAt: null,
      completedOn: null,
      priority: parsed.priority !== "medium" ? parsed.priority : defaults?.priority ?? "medium",
      focus: defaults?.focus ?? false,
      dueDate: parsed.dueDate ?? (defaults && "dueDate" in defaults ? defaults.dueDate ?? null : null),
      startDate: null,
      startTime: null,
      endTime: null,
      projectId: parsed.projectId ?? defaults?.projectId ?? null,
      tags: parsed.tags,
      estimateMin: null,
      recurrence: null,
      subtasks: [],
      reminderMinBefore: null,
    });
    toast(`Added “${parsed.title}”`);
    setText("");
    ref.current?.focus();
  };

  return (
    <div className={cn("rounded-md border border-line bg-surface transition focus-within:border-activities focus-within:ring-2 focus-within:ring-activities/20", className)}>
      <div className="flex items-center gap-2 px-3">
        <Plus className="size-4 shrink-0 text-activities" aria-hidden />
        <input
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") setText("");
          }}
          placeholder={placeholder}
          aria-label="Quick add task"
          className="h-10 flex-1 bg-transparent text-base outline-none placeholder:text-ink-3"
        />
        {text ? <kbd className="hidden rounded border border-line px-1.5 text-micro text-ink-3 sm:block">Enter</kbd> : null}
      </div>
      {parsed && (parsed.dueDate || parsed.priority !== "medium" || project || parsed.tags.length) ? (
        <div className="flex flex-wrap gap-1.5 border-t border-line px-3 py-1.5 text-caption text-ink-2">
          {parsed.dueDate ? <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5"><CalendarDays className="size-3" />{relativeDay(parsed.dueDate, today)}</span> : null}
          {parsed.priority !== "medium" ? <span className={cn("inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5", PRIORITY_CLASS[parsed.priority])}><Flag className="size-3" />{PRIORITY_LABEL[parsed.priority]}</span> : null}
          {project ? <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5"><span className="size-1.5 rounded-full" style={{ background: project.color }} />{project.name}</span> : null}
          {parsed.tags.map((t) => <span key={t} className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5"><Hash className="size-3" />{t}</span>)}
        </div>
      ) : null}
    </div>
  );
}
