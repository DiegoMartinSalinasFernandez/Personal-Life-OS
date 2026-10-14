"use client";

import { useState } from "react";
import { z } from "zod";
import { Trash2, Plus, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { cn } from "@/lib/cn";
import { useForm } from "@/lib/hooks/use-form";
import { useDb, useToday, actions } from "@/lib/hooks";
import { closeSheet } from "@/lib/store/ui";
import { centsToInput, currencyDigits, parseMoney } from "@/lib/domain/money";
import { isISODate } from "@/lib/domain/dates";
import type { GoalMeasure, GoalModule } from "@/lib/domain/types";
import { uid } from "@/lib/data/defaults";

type ActivityMeasure = "milestones" | "habit";
type Values = {
  module: GoalModule;
  title: string;
  description: string;
  category: string;
  targetDate: string;
  notes: string;
  targetAmount: string;
  startingAmount: string;
  windowDays: string;
  targetDays: string;
  activityMeasure: ActivityMeasure;
  habitId: string;
  targetCount: string;
  linkedProjectIds: string[];
  milestones: { id: string; title: string; dueDate: string; done: boolean; isNew?: boolean }[];
  digits: number;
};

const int = (s: string) => /^\d+$/.test(s.trim()) && Number(s) > 0;
const schema = z
  .object({
    module: z.enum(["finance", "nutrition", "activities"]),
    title: z.string().trim().min(1, "Give the goal a name").max(120),
    description: z.string().max(1000),
    category: z.string().max(40),
    targetDate: z.string().refine((s) => s === "" || isISODate(s), "Enter a valid date"),
    notes: z.string().max(4000),
    targetAmount: z.string(),
    startingAmount: z.string(),
    windowDays: z.string(),
    targetDays: z.string(),
    activityMeasure: z.enum(["milestones", "habit"]),
    habitId: z.string(),
    targetCount: z.string(),
    linkedProjectIds: z.array(z.string()),
    milestones: z.array(z.object({ id: z.string(), title: z.string(), dueDate: z.string(), done: z.boolean(), isNew: z.boolean().optional() })),
    digits: z.number(),
  })
  .superRefine((v, ctx) => {
    if (v.module === "finance") {
      const t = parseMoney(v.targetAmount, v.digits);
      if (t == null || t <= 0) ctx.addIssue({ code: "custom", path: ["targetAmount"], message: "Enter a target amount above zero" });
      if (v.startingAmount && parseMoney(v.startingAmount, v.digits) == null) ctx.addIssue({ code: "custom", path: ["startingAmount"], message: "Enter a valid amount" });
    }
    if (v.module === "nutrition") {
      if (!int(v.windowDays) || Number(v.windowDays) > 365) ctx.addIssue({ code: "custom", path: ["windowDays"], message: "1–365 days" });
      if (!int(v.targetDays)) ctx.addIssue({ code: "custom", path: ["targetDays"], message: "Enter a number of days" });
      else if (Number(v.targetDays) > Number(v.windowDays)) ctx.addIssue({ code: "custom", path: ["targetDays"], message: "Can't exceed the window" });
    }
    if (v.module === "activities" && v.activityMeasure === "habit") {
      if (!v.habitId) ctx.addIssue({ code: "custom", path: ["habitId"], message: "Choose a habit" });
      if (!int(v.targetCount)) ctx.addIssue({ code: "custom", path: ["targetCount"], message: "Enter a number of check-ins" });
    }
  });

export function GoalDialog({ id, module: initialModule }: { id?: string; module?: GoalModule }) {
  const db = useDb();
  const today = useToday();
  const existing = id ? db.goals.find((g) => g.id === id) : undefined;
  const m = existing?.measure;
  const currency = m?.type === "money" ? m.currency : db.profile.currency;
  const digits = currencyDigits(currency);
  const [newMs, setNewMs] = useState("");

  const { values, set, errors, handleSubmit } = useForm<Values, z.infer<typeof schema>>(schema, {
    module: existing?.module ?? initialModule ?? "finance",
    title: existing?.title ?? "",
    description: existing?.description ?? "",
    category: existing?.category ?? "",
    targetDate: existing?.targetDate ?? "",
    notes: existing?.notes ?? "",
    targetAmount: m?.type === "money" ? centsToInput(m.targetAmount, digits) : "",
    startingAmount: "",
    windowDays: m?.type === "protein_days" ? String(m.windowDays) : "30",
    targetDays: m?.type === "protein_days" ? String(m.targetDays) : "20",
    activityMeasure: m?.type === "habit" ? "habit" : "milestones",
    habitId: m?.type === "habit" ? m.habitId : db.habits.find((h) => !h.archived)?.id ?? "",
    targetCount: m?.type === "habit" ? String(m.targetCount) : "30",
    linkedProjectIds: existing?.linkedProjectIds ?? [],
    milestones: db.milestones.filter((x) => x.goalId === existing?.id).sort((a, b) => a.order - b.order).map((x) => ({ id: x.id, title: x.title, dueDate: x.dueDate ?? "", done: x.done })),
    digits,
  });

  const submit = handleSubmit((v) => {
    let measure: GoalMeasure;
    if (v.module === "finance") measure = { type: "money", targetAmount: parseMoney(v.targetAmount, v.digits)!, currency };
    else if (v.module === "nutrition") measure = { type: "protein_days", windowDays: Number(v.windowDays), targetDays: Number(v.targetDays) };
    else if (v.activityMeasure === "habit") measure = { type: "habit", habitId: v.habitId, targetCount: Number(v.targetCount) };
    else measure = { type: "milestones" };

    const record = {
      title: v.title,
      description: v.description || undefined,
      module: v.module,
      category: v.category || { finance: "Savings", nutrition: "Nutrition", activities: "Personal" }[v.module],
      targetDate: v.targetDate || null,
      measure,
      linkedProjectIds: v.module === "activities" ? v.linkedProjectIds : [],
      notes: v.notes || undefined,
    };
    const s = actions();
    let goalId = existing?.id;
    if (existing) s.update("goals", existing.id, record);
    else goalId = s.add("goals", { ...record, startDate: today, archived: false, completedAt: null });

    if (v.module === "finance" && !existing && v.startingAmount) {
      const amt = parseMoney(v.startingAmount, v.digits);
      if (amt) s.add("goalContributions", { goalId: goalId!, amount: amt, date: today, note: "Starting amount" });
    }
    if (measure.type === "milestones") {
      const keep = new Set(v.milestones.map((x) => x.id));
      for (const old of db.milestones.filter((x) => x.goalId === goalId && !keep.has(x.id))) s.remove("milestones", old.id);
      v.milestones.forEach((x, order) => {
        const rec = { goalId: goalId!, title: x.title.trim() || "Untitled milestone", dueDate: x.dueDate || null, done: x.done, order };
        if (db.milestones.some((o) => o.id === x.id)) s.update("milestones", x.id, rec);
        else s.add("milestones", { ...rec, id: x.id });
      });
    }
    toast(existing ? "Goal updated" : "Goal created");
    closeSheet();
  });

  const del = async () => {
    if (!existing) return;
    if (!(await confirm({ title: `Delete “${existing.title}”?`, description: "Its contributions and milestones are deleted too. Linked projects, habits and transactions are not affected." }))) return;
    actions().deleteGoal(existing.id);
    toast("Goal deleted");
    closeSheet();
  };

  const addMilestone = () => {
    if (!newMs.trim()) return;
    set("milestones", [...values.milestones, { id: uid(), title: newMs.trim(), dueDate: "", done: false, isNew: true }]);
    setNewMs("");
  };

  return (
    <Dialog
      open
      onClose={closeSheet}
      title={existing ? "Edit goal" : "New goal"}
      size="lg"
      footer={
        <>
          {existing ? (
            <Button variant="ghost" className="mr-auto text-negative hover:text-negative" onClick={del}>
              <Trash2 /> Delete
            </Button>
          ) : null}
          <Button onClick={closeSheet}>Cancel</Button>
          <Button variant="primary" type="submit" form="goal-form">
            {existing ? "Save" : "Create goal"}
          </Button>
        </>
      }
    >
      <form id="goal-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        {!existing ? (
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-sm font-medium text-ink-2">What kind of goal?</p>
            <Segmented label="Goal type" value={values.module} onChange={(v) => set("module", v)} options={[{ value: "finance", label: "Savings" }, { value: "nutrition", label: "Nutrition" }, { value: "activities", label: "Project / habit" }]} />
            <p className="mt-1.5 text-caption text-ink-3">
              {values.module === "finance" ? "Measured in money, from contributions you record." : values.module === "nutrition" ? "Measured in days you reach your protein target." : "Measured by milestones you complete or habit check-ins."}
            </p>
          </div>
        ) : null}
        <Field label="Goal" error={errors.title} className="sm:col-span-2">
          {(p) => <Input {...p} value={values.title} onChange={(e) => set("title", e.target.value)} placeholder={values.module === "finance" ? "e.g. Emergency fund" : values.module === "nutrition" ? "e.g. Hit protein 5 days a week" : "e.g. Finish the course"} autoFocus />}
        </Field>

        {values.module === "finance" ? (
          <>
            <Field label="Target amount" error={errors.targetAmount}>
              {(p) => <MoneyInput {...p} currency={currency} value={values.targetAmount} onChange={(e) => set("targetAmount", e.target.value)} placeholder="0.00" />}
            </Field>
            {!existing ? (
              <Field label="Already saved" error={errors.startingAmount} optional>
                {(p) => <MoneyInput {...p} currency={currency} value={values.startingAmount} onChange={(e) => set("startingAmount", e.target.value)} placeholder="0.00" />}
              </Field>
            ) : <div />}
          </>
        ) : null}

        {values.module === "nutrition" ? (
          <>
            <Field label="Reach target on (days)" error={errors.targetDays} hint={`Uses your current target of ${db.profile.nutrition.proteinTarget} g`}>
              {(p) => <Input {...p} inputMode="numeric" value={values.targetDays} onChange={(e) => set("targetDays", e.target.value.replace(/\D/g, ""))} />}
            </Field>
            <Field label="Out of the last (days)" error={errors.windowDays}>
              {(p) => <Input {...p} inputMode="numeric" value={values.windowDays} onChange={(e) => set("windowDays", e.target.value.replace(/\D/g, ""))} />}
            </Field>
          </>
        ) : null}

        {values.module === "activities" ? (
          <>
            <div className="sm:col-span-2">
              <Segmented label="Measure" value={values.activityMeasure} onChange={(v) => set("activityMeasure", v)} options={[{ value: "milestones", label: "Milestones" }, { value: "habit", label: "Habit check-ins" }]} />
            </div>
            {values.activityMeasure === "habit" ? (
              db.habits.length ? (
                <>
                  <Field label="Habit" error={errors.habitId}>
                    {(p) => (
                      <Select {...p} value={values.habitId} onChange={(e) => set("habitId", e.target.value)}>
                        <option value="">Choose…</option>
                        {db.habits.filter((h) => !h.archived).map((h) => (
                          <option key={h.id} value={h.id}>{h.name}</option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Target check-ins" error={errors.targetCount} hint="Counted from the goal's start date">
                    {(p) => <Input {...p} inputMode="numeric" value={values.targetCount} onChange={(e) => set("targetCount", e.target.value.replace(/\D/g, ""))} />}
                  </Field>
                </>
              ) : (
                <p className="rounded-md bg-subtle p-3 text-sm text-ink-2 sm:col-span-2">Create a habit first, then link it here.</p>
              )
            ) : (
              <div className="sm:col-span-2">
                <p className="mb-1.5 text-sm font-medium text-ink-2">Milestones</p>
                <ul className="flex flex-col gap-1.5">
                  {values.milestones.map((x, i) => (
                    <li key={x.id} className="flex items-center gap-2">
                      <span className="num w-5 text-caption text-ink-3">{i + 1}.</span>
                      <Input className="h-8 flex-1" value={x.title} onChange={(e) => set("milestones", values.milestones.map((y) => (y.id === x.id ? { ...y, title: e.target.value } : y)))} aria-label={`Milestone ${i + 1}`} />
                      <Input className="h-8 w-[150px]" type="date" value={x.dueDate} onChange={(e) => set("milestones", values.milestones.map((y) => (y.id === x.id ? { ...y, dueDate: e.target.value } : y)))} aria-label="Due date" />
                      <Button size="icon-sm" variant="ghost" onClick={() => set("milestones", values.milestones.filter((y) => y.id !== x.id))} aria-label="Remove milestone"><X /></Button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-2">
                  <Input className="h-8" value={newMs} onChange={(e) => setNewMs(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMilestone(); } }} placeholder="Add a milestone and press Enter" aria-label="New milestone" />
                  <Button size="sm" onClick={addMilestone} disabled={!newMs.trim()}><Plus /> Add</Button>
                </div>
                {!values.milestones.length ? <p className="mt-1.5 text-caption text-ink-3">Without milestones no progress percentage is shown.</p> : null}
              </div>
            )}
            {db.projects.length ? (
              <div className="sm:col-span-2">
                <p className="mb-1.5 text-sm font-medium text-ink-2">Linked projects <span className="font-normal text-ink-3">(optional)</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {db.projects.filter((p) => !p.archived).map((p) => {
                    const on = values.linkedProjectIds.includes(p.id);
                    return (
                      <button key={p.id} type="button" aria-pressed={on} onClick={() => set("linkedProjectIds", on ? values.linkedProjectIds.filter((x) => x !== p.id) : [...values.linkedProjectIds, p.id])} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm", on ? "border-ink bg-ink text-canvas" : "border-line text-ink-2 hover:bg-muted")}>
                        <span className="size-2 rounded-full" style={{ background: p.color }} />
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        <Field label="Target date" error={errors.targetDate} optional>
          {(p) => <Input {...p} type="date" value={values.targetDate} onChange={(e) => set("targetDate", e.target.value)} />}
        </Field>
        <Field label="Category" optional>
          {(p) => <Input {...p} value={values.category} onChange={(e) => set("category", e.target.value)} placeholder={values.module === "finance" ? "Travel, Safety net…" : "Fitness, Study…"} />}
        </Field>
        <Field label="Description" optional className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={2} value={values.description} onChange={(e) => set("description", e.target.value)} />}
        </Field>
        <Field label="Notes" optional className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} />}
        </Field>
      </form>
    </Dialog>
  );
}
