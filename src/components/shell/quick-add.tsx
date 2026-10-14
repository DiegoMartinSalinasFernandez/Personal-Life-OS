"use client";

import { useEffect } from "react";
import { ArrowLeftRight, Apple, CheckSquare, CalendarPlus, Repeat2, Target } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { useUI, openSheet, closeSheet, type Sheet } from "@/lib/store/ui";
import { cn } from "@/lib/cn";

export const QUICK_ADD: { kind: Sheet["kind"]; label: string; hint: string; icon: typeof Apple; tone: string }[] = [
  { kind: "transaction", label: "Transaction", hint: "Income, expense or transfer", icon: ArrowLeftRight, tone: "bg-finance-soft text-finance" },
  { kind: "food", label: "Food", hint: "Log what you ate", icon: Apple, tone: "bg-nutrition-soft text-nutrition" },
  { kind: "task", label: "Task", hint: "Something to get done", icon: CheckSquare, tone: "bg-activities-soft text-activities" },
  { kind: "event", label: "Event", hint: "A time on your calendar", icon: CalendarPlus, tone: "bg-activities-soft text-activities" },
  { kind: "habit", label: "Habit", hint: "A recurring routine", icon: Repeat2, tone: "bg-activities-soft text-activities" },
  { kind: "goal", label: "Goal", hint: "Savings, nutrition or project", icon: Target, tone: "bg-muted text-ink-2" },
];

export function QuickAddDialog() {
  const open = useUI((s) => s.sheet?.kind === "quickadd");
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      if (i >= 0 && i < QUICK_ADD.length) {
        e.preventDefault();
        openSheet({ kind: QUICK_ADD[i].kind } as Sheet);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <Dialog open={open} onClose={closeSheet} title="Create" description="Add anything to your workspace." size="md">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {QUICK_ADD.map((q, i) => (
          <button key={q.kind} onClick={() => openSheet({ kind: q.kind } as Sheet)} className="group flex flex-col items-start gap-3 rounded-md border border-line bg-surface p-3 text-left transition hover:border-line-strong hover:bg-subtle">
            <span className={cn("grid size-9 place-items-center rounded-md [&_svg]:size-[18px]", q.tone)}>
              <q.icon aria-hidden />
            </span>
            <span>
              <span className="flex items-center gap-2 text-base font-medium text-ink">
                {q.label}
                <kbd className="hidden rounded border border-line px-1 text-micro text-ink-3 sm:inline">{i + 1}</kbd>
              </span>
              <span className="text-caption text-ink-3">{q.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
