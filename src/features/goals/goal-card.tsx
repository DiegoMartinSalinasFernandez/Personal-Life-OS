"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, MoreHorizontal, Pencil, Plus, Archive, Trophy, Wallet, Salad, CheckSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { Menu } from "@/components/ui/menu";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, MoneyInput } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useDb, useMoney, useToday, actions } from "@/lib/hooks";
import { openSheet } from "@/lib/store/ui";
import { moneyGoalProgress } from "@/lib/calc/finance";
import { goalProgress, daysLeft } from "@/lib/calc/productivity";
import { formatDate, isISODate } from "@/lib/domain/dates";
import { currencyDigits, parseMoney } from "@/lib/domain/money";
import type { Goal } from "@/lib/domain/types";

const MODULE = {
  finance: { icon: Wallet, tone: "finance" as const, label: "Savings" },
  nutrition: { icon: Salad, tone: "nutrition" as const, label: "Nutrition" },
  activities: { icon: CheckSquare, tone: "activities" as const, label: "Activities" },
};

export function useGoalSummary(goal: Goal) {
  const db = useDb();
  const today = useToday();
  const money = useMoney();
  return useMemo(() => {
    if (goal.measure.type === "money") {
      const p = moneyGoalProgress(goal, db.goalContributions, today)!;
      const cur = goal.measure.currency;
      return {
        pct: p.pct as number | null,
        headline: `${money(p.saved, { whole: true }, cur)} of ${money(p.target, { whole: true }, cur)}`,
        detail:
          p.remaining === 0
            ? "Target reached"
            : p.monthlyPace > 0
              ? `Saving ~${money(p.monthlyPace, { whole: true }, cur)}/mo · at this pace ≈ ${formatDate(p.estimatedDate!, { month: "short", year: "numeric" })}`
              : "No contributions in the last 3 months",
        need: p.neededPerMonth != null && p.remaining > 0 ? `${money(p.neededPerMonth, { whole: true }, cur)}/mo needed to hit the date` : null,
        onTrack: p.onTrack,
        reached: p.remaining === 0,
      };
    }
    const p = goalProgress(goal, { today, milestones: db.milestones, habitCompletions: db.habitCompletions, foodEntries: db.foodEntries, proteinTarget: db.profile.nutrition.proteinTarget });
    if (p.kind === "protein_days") return { pct: p.pct, headline: `${p.reached} of ${p.target} days`, detail: `Days at ≥ ${db.profile.nutrition.proteinTarget} g protein since ${formatDate(p.windowStart)}`, need: null, onTrack: null, reached: p.reached >= p.target };
    if (p.kind === "habit") {
      const h = db.habits.find((x) => x.id === (goal.measure as { habitId: string }).habitId);
      return { pct: p.pct, headline: `${p.count} of ${p.target} check-ins`, detail: h ? `“${h.name}” since ${formatDate(goal.startDate)}` : "Linked habit was removed", need: null, onTrack: null, reached: p.count >= p.target };
    }
    if (p.kind === "milestones") return { pct: p.pct, headline: p.total ? `${p.done} of ${p.total} milestones` : "No milestones yet", detail: p.total ? null : "Add milestones to track progress", need: null, onTrack: null, reached: p.total > 0 && p.done === p.total };
    return { pct: null, headline: "", detail: null, need: null, onTrack: null, reached: false };
  }, [goal, db, today, money]);
}

export function GoalCard({ goal, compact }: { goal: Goal; compact?: boolean }) {
  const db = useDb();
  const today = useToday();
  const s = useGoalSummary(goal);
  const meta = MODULE[goal.module];
  const left = daysLeft(goal.targetDate, today);
  const [contrib, setContrib] = useState(false);
  const milestones = db.milestones.filter((m) => m.goalId === goal.id).sort((a, b) => a.order - b.order);
  const projects = db.projects.filter((p) => goal.linkedProjectIds.includes(p.id));
  const tone = meta.tone;

  return (
    <article className={cn("card flex flex-col gap-3 p-4", goal.completedAt && "opacity-75")}>
      <header className="flex items-start gap-3">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4", { finance: "bg-finance-soft text-finance", nutrition: "bg-nutrition-soft text-nutrition", activities: "bg-activities-soft text-activities" }[tone])}>
          <meta.icon aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-md font-semibold text-ink">{goal.title}</h3>
          <p className="flex flex-wrap items-center gap-x-2 text-caption text-ink-3">
            <span>{goal.category}</span>
            {goal.targetDate ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <CalendarClock className="size-3" aria-hidden />
                {formatDate(goal.targetDate, { month: "short", day: "numeric", year: "numeric" })}
                {left != null && !goal.completedAt ? <span className={cn(left < 0 && "text-negative")}>({left < 0 ? `${-left}d overdue` : `${left}d left`})</span> : null}
              </span>
            ) : null}
          </p>
        </div>
        <Menu
          label="Goal actions"
          trigger={(p) => (
            <Button {...p} size="icon-sm" variant="ghost" aria-label="Goal actions">
              <MoreHorizontal />
            </Button>
          )}
          items={[
            { label: "Edit goal", icon: <Pencil />, onSelect: () => openSheet({ kind: "goal", id: goal.id }) },
            goal.completedAt
              ? { label: "Reopen goal", icon: <CheckCircle2 />, onSelect: () => actions().update("goals", goal.id, { completedAt: null }) }
              : { label: "Mark complete", icon: <Trophy />, onSelect: () => { actions().update("goals", goal.id, { completedAt: new Date().toISOString() }); toast("Goal completed — nice work"); } },
            { label: goal.archived ? "Unarchive" : "Archive", icon: <Archive />, onSelect: () => actions().update("goals", goal.id, { archived: !goal.archived }) },
          ]}
        />
      </header>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <p className="num text-base font-semibold text-ink">{s.headline}</p>
          {s.pct != null ? <p className="num text-sm font-medium text-ink-2">{Math.round(s.pct * 100)}%</p> : null}
        </div>
        {s.pct != null ? <ProgressBar value={s.pct} tone={tone} label={`${goal.title} progress`} /> : <div className="h-2 rounded-full border border-dashed border-line" aria-hidden />}
        {s.detail ? <p className="mt-1.5 text-caption text-ink-3">{s.detail}</p> : null}
      </div>

      {!compact ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {goal.completedAt ? <Badge tone="positive" icon={<CheckCircle2 />}>Completed</Badge> : s.reached ? <Badge tone="positive" icon={<Trophy />}>Target reached</Badge> : s.onTrack === true ? <Badge tone="positive">On track</Badge> : s.onTrack === false ? <Badge tone="warning">Behind pace</Badge> : null}
          {s.need ? <span className="text-caption text-ink-3">{s.need}</span> : null}
        </div>
      ) : null}

      {!compact && goal.measure.type === "milestones" && milestones.length ? (
        <ul className="flex flex-col gap-1 border-t border-line pt-3">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center gap-2.5 text-base">
              <Checkbox size="sm" checked={m.done} label={m.title} onChange={(d) => actions().update("milestones", m.id, { done: d })} />
              <span className={cn("flex-1", m.done && "text-ink-3 line-through")}>{m.title}</span>
              {m.dueDate ? <span className={cn("num text-caption", !m.done && m.dueDate < today ? "text-negative" : "text-ink-3")}>{formatDate(m.dueDate)}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!compact && projects.length ? (
        <div className="flex flex-wrap gap-1.5">
          {projects.map((p) => (
            <Link key={p.id} href={`/activities/projects?id=${p.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-caption text-ink-2 hover:bg-muted">
              <span className="size-1.5 rounded-full" style={{ background: p.color }} />
              {p.name}
            </Link>
          ))}
        </div>
      ) : null}

      {!compact && goal.measure.type === "money" && !goal.completedAt ? (
        <div className="mt-auto flex gap-2 pt-1">
          <Button size="sm" onClick={() => setContrib(true)}>
            <Plus /> Add contribution
          </Button>
        </div>
      ) : null}
      {contrib ? <ContributionDialog goal={goal} onClose={() => setContrib(false)} today={today} /> : null}
    </article>
  );
}

function ContributionDialog({ goal, onClose, today }: { goal: Goal; onClose: () => void; today: string }) {
  const db = useDb();
  const money = useMoney();
  const currency = goal.measure.type === "money" ? goal.measure.currency : db.profile.currency;
  const digits = currencyDigits(currency);
  const [dir, setDir] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const cents = parseMoney(amount, digits);
  const valid = cents != null && cents > 0 && isISODate(date);
  const history = db.goalContributions.filter((c) => c.goalId === goal.id).sort((a, b) => (a.date < b.date ? 1 : -1));

  const save = () => {
    if (!valid) return;
    actions().add("goalContributions", { goalId: goal.id, amount: dir === "in" ? cents! : -cents!, date, note: note || undefined });
    toast(dir === "in" ? "Contribution recorded" : "Withdrawal recorded");
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={goal.title}
      description="Record money you set aside for this goal. Progress is based only on what you record — no returns are assumed."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!valid}>
            Save
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="sm:col-span-2">
          <Segmented label="Direction" value={dir} onChange={setDir} options={[{ value: "in", label: "Add money" }, { value: "out", label: "Withdraw" }]} />
        </div>
        <Field label="Amount" error={amount && !valid ? "Enter an amount above zero" : undefined}>
          {(p) => <MoneyInput {...p} currency={currency} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus placeholder="0.00" />}
        </Field>
        <Field label="Date">
          {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label="Note" optional className="sm:col-span-2">
          {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </form>
      {history.length ? (
        <div className="mt-5">
          <p className="eyebrow mb-2">History</p>
          <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-md border border-line">
            {history.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                <span className="num w-20 text-ink-3">{formatDate(c.date, { month: "short", day: "numeric", year: "2-digit" })}</span>
                <span className="flex-1 truncate text-ink-2">{c.note ?? ""}</span>
                <span className={cn("num font-medium", c.amount < 0 ? "text-negative" : "text-ink")}>{money(c.amount, { signed: true }, currency)}</span>
                <button onClick={() => actions().remove("goalContributions", c.id)} className="text-ink-3 hover:text-negative" aria-label="Delete contribution">
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Dialog>
  );
}
