"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Bell, X, Wallet, Salad, CheckCircle2, Target } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { useUI, closeSheet } from "@/lib/store/ui";
import { useClock, useDb, actions } from "@/lib/hooks";
import { computeInsights, type Insight } from "@/lib/calc/insights";
import { cn } from "@/lib/cn";

const MODULE_ICON = { finance: Wallet, nutrition: Salad, activities: CheckCircle2, goals: Target };
const MODULE_TONE = { finance: "bg-finance-soft text-finance", nutrition: "bg-nutrition-soft text-nutrition", activities: "bg-activities-soft text-activities", goals: "bg-muted text-ink-2" };

export function useInsights(): Insight[] {
  const db = useDb();
  const { today, now } = useClock();
  return useMemo(() => computeInsights(db, today, now), [db, today, now]);
}

export function InsightRow({ insight, onNavigate, compact }: { insight: Insight; onNavigate?: () => void; compact?: boolean }) {
  const Icon = MODULE_ICON[insight.module];
  return (
    <div className={cn("group flex items-start gap-3 rounded-md transition-colors hover:bg-subtle", compact ? "px-2 py-2" : "px-3 py-2.5")}>
      <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-md [&_svg]:size-3.5", MODULE_TONE[insight.module])}>
        <Icon aria-hidden />
      </span>
      <Link href={insight.href} onClick={onNavigate} className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-base font-medium text-ink">
          {insight.tone === "negative" ? <span className="rounded-sm bg-negative-soft px-1 text-micro font-semibold uppercase text-negative">Action</span> : insight.tone === "warning" ? <span className="rounded-sm bg-warning-soft px-1 text-micro font-semibold uppercase text-warning">Soon</span> : null}
          <span className="truncate">{insight.title}</span>
        </p>
        {insight.body ? <p className="mt-0.5 line-clamp-2 text-sm text-ink-3">{insight.body}</p> : null}
      </Link>
      <button onClick={() => actions().dismiss(insight.key)} className="grid size-7 shrink-0 place-items-center rounded text-ink-3 opacity-60 hover:bg-muted hover:text-ink group-hover:opacity-100" aria-label={`Dismiss: ${insight.title}`}>
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function NotificationsDialog() {
  const open = useUI((s) => s.sheet?.kind === "notifications");
  const insights = useInsights();
  return (
    <Dialog open={open} onClose={closeSheet} title="Reminders" description="In-app reminders from your bills, budgets, meals, tasks and habits." size="md">
      {insights.length ? (
        <div className="-mx-2 flex flex-col">
          {insights.map((i) => (
            <InsightRow key={i.key} insight={i} onNavigate={closeSheet} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Bell />} title="You're all caught up" description="Reminders appear here when a bill is due, a budget runs low, or a task is coming up." compact />
      )}
      <p className="mt-4 text-caption text-ink-3">Reminders are shown inside the app only. Push and email notifications aren&apos;t connected.</p>
    </Dialog>
  );
}
