"use client";

import { Flag, Repeat, Star, ListChecks, Clock, CalendarDays } from "lucide-react";
import { Checkbox } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { actions, useDb, useToday } from "@/lib/hooks";
import { openSheet } from "@/lib/store/ui";
import { relativeDay } from "@/lib/domain/dates";
import type { Task } from "@/lib/domain/types";
import { PRIORITY_CLASS, PRIORITY_LABEL } from "./task-form";

export function completeWithFeedback(task: Task, today: string) {
  actions().toggleTask(task.id, today);
  if (!task.done) {
    toast(task.recurrence ? `Done — next “${task.title}” scheduled` : `Completed “${task.title}”`, {
      action: { label: "Undo", onClick: () => actions().toggleTask(task.id, today) },
    });
  }
}

export function TaskItem({ task, showProject = true, showDue = true, selectable, selected, onSelect, compact }: { task: Task; showProject?: boolean; showDue?: boolean; selectable?: boolean; selected?: boolean; onSelect?: (v: boolean) => void; compact?: boolean }) {
  const db = useDb();
  const today = useToday();
  const project = task.projectId ? db.projects.find((p) => p.id === task.projectId) : null;
  const overdue = !task.done && task.dueDate && task.dueDate < today;
  const subDone = task.subtasks.filter((s) => s.done).length;

  return (
    <div className={cn("group flex items-start gap-3 rounded-md px-2 transition-colors hover:bg-subtle", compact ? "py-1.5" : "py-2", selected && "bg-activities-soft/50")}>
      {selectable ? (
        <input type="checkbox" className="mt-1 size-4 accent-[rgb(var(--activities))]" checked={!!selected} onChange={(e) => onSelect?.(e.target.checked)} aria-label={`Select ${task.title}`} />
      ) : null}
      <Checkbox className="mt-0.5" checked={task.done} label={task.done ? `Reopen ${task.title}` : `Complete ${task.title}`} onChange={() => completeWithFeedback(task, today)} />
      <button onClick={() => openSheet({ kind: "task", id: task.id })} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1.5">
          {task.focus && !task.done ? <Star className="size-3.5 shrink-0 fill-warning text-warning" aria-label="Focus" /> : null}
          <span className={cn("truncate text-base", task.done ? "text-ink-3 line-through" : "text-ink")}>{task.title}</span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-caption text-ink-3">
          {showDue && task.dueDate ? (
            <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-negative")}>
              <CalendarDays className="size-3" aria-hidden />
              {overdue ? `Overdue · ${relativeDay(task.dueDate, today)}` : relativeDay(task.dueDate, today)}
            </span>
          ) : null}
          {task.startTime ? (
            <span className="num inline-flex items-center gap-1">
              <Clock className="size-3" aria-hidden />
              {task.startTime}
              {task.endTime ? `–${task.endTime}` : ""}
            </span>
          ) : null}
          {task.priority !== "medium" ? (
            <span className={cn("inline-flex items-center gap-1", PRIORITY_CLASS[task.priority])}>
              <Flag className="size-3" aria-hidden />
              {PRIORITY_LABEL[task.priority]}
            </span>
          ) : null}
          {task.subtasks.length ? (
            <span className="num inline-flex items-center gap-1">
              <ListChecks className="size-3" aria-hidden />
              {subDone}/{task.subtasks.length}
            </span>
          ) : null}
          {task.recurrence ? <Repeat className="size-3" aria-label="Repeats" /> : null}
          {task.estimateMin ? <span className="num">{task.estimateMin >= 60 ? `${(task.estimateMin / 60).toFixed(task.estimateMin % 60 ? 1 : 0)}h` : `${task.estimateMin}m`}</span> : null}
          {showProject && project ? (
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full" style={{ background: project.color }} aria-hidden />
              {project.name}
            </span>
          ) : null}
          {task.tags.map((t) => (
            <span key={t}>#{t}</span>
          ))}
        </span>
      </button>
    </div>
  );
}
