"use client";

import { z } from "zod";
import { Trash2, Archive } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { Icon, HABIT_ICONS } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { cn } from "@/lib/cn";
import { useForm } from "@/lib/hooks/use-form";
import { useDb, useToday, actions } from "@/lib/hooks";
import { closeSheet } from "@/lib/store/ui";
import { isISODate } from "@/lib/domain/dates";
import { PALETTE } from "@/lib/data/defaults";

type Values = { name: string; icon: string; color: string; scheduleType: "daily" | "days"; days: number[]; reminderTime: string; startDate: string };
const schema = z
  .object({
    name: z.string().trim().min(1, "Name the habit").max(80),
    icon: z.string(),
    color: z.string(),
    scheduleType: z.enum(["daily", "days"]),
    days: z.array(z.number()),
    reminderTime: z.string(),
    startDate: z.string().refine(isISODate, "Enter a valid date"),
  })
  .refine((v) => v.scheduleType === "daily" || v.days.length > 0, { path: ["days"], message: "Pick at least one day" });

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function HabitDialog({ id }: { id?: string }) {
  const db = useDb();
  const today = useToday();
  const existing = id ? db.habits.find((h) => h.id === id) : undefined;
  const { values, set, errors, handleSubmit } = useForm<Values, z.infer<typeof schema>>(schema, {
    name: existing?.name ?? "",
    icon: existing?.icon ?? "target",
    color: existing?.color ?? PALETTE[db.habits.length % PALETTE.length],
    scheduleType: existing?.schedule.type ?? "daily",
    days: existing?.schedule.type === "days" ? existing.schedule.days : [1, 3, 5],
    reminderTime: existing?.reminderTime ?? "",
    startDate: existing?.startDate ?? today,
  });

  const submit = handleSubmit((v) => {
    const record = { name: v.name, icon: v.icon, color: v.color, schedule: v.scheduleType === "daily" ? ({ type: "daily" } as const) : ({ type: "days", days: [...v.days].sort() } as const), reminderTime: v.reminderTime || null, startDate: v.startDate };
    if (existing) {
      actions().update("habits", existing.id, record);
      toast("Habit updated");
    } else {
      actions().add("habits", { ...record, archived: false });
      toast("Habit created");
    }
    closeSheet();
  });

  const del = async () => {
    if (!existing) return;
    if (!(await confirm({ title: `Delete “${existing.name}”?`, description: "Its whole check-in history and streaks will be removed. Archive it instead to keep the history." }))) return;
    actions().deleteHabit(existing.id);
    toast("Habit deleted");
    closeSheet();
  };

  return (
    <Dialog
      open
      onClose={closeSheet}
      title={existing ? "Edit habit" : "New habit"}
      footer={
        <>
          {existing ? (
            <div className="mr-auto flex gap-1">
              <Button variant="ghost" onClick={() => { actions().update("habits", existing.id, { archived: !existing.archived }); toast(existing.archived ? "Habit restored" : "Habit archived"); closeSheet(); }}>
                <Archive /> {existing.archived ? "Restore" : "Archive"}
              </Button>
              <Button variant="ghost" className="text-negative hover:text-negative" onClick={del}>
                <Trash2 /> Delete
              </Button>
            </div>
          ) : null}
          <Button onClick={closeSheet}>Cancel</Button>
          <Button variant="primary" type="submit" form="habit-form">
            {existing ? "Save" : "Create habit"}
          </Button>
        </>
      }
    >
      <form id="habit-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Habit" error={errors.name}>
          {(p) => <Input {...p} value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Read 20 minutes" autoFocus />}
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-2">Schedule</p>
          <Segmented label="Schedule" value={values.scheduleType} onChange={(v) => set("scheduleType", v)} options={[{ value: "daily", label: "Every day" }, { value: "days", label: "Specific days" }]} />
          {values.scheduleType === "days" ? (
            <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Days">
              {WD.map((d, i) => {
                const on = values.days.includes(i);
                return (
                  <button key={d} type="button" aria-pressed={on} onClick={() => set("days", on ? values.days.filter((x) => x !== i) : [...values.days, i])} className={cn("h-8 rounded-md px-2.5 text-sm font-medium", on ? "bg-ink text-canvas" : "bg-muted text-ink-2 hover:bg-line")}>
                    {d}
                  </button>
                );
              })}
            </div>
          ) : null}
          {errors.days ? <p className="mt-1 text-caption text-negative">{errors.days}</p> : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reminder time" optional hint="Shown as an in-app reminder">
            {(p) => <Input {...p} type="time" value={values.reminderTime} onChange={(e) => set("reminderTime", e.target.value)} />}
          </Field>
          <Field label="Tracking starts" error={errors.startDate} hint="Streaks count from this date">
            {(p) => <Input {...p} type="date" value={values.startDate} onChange={(e) => set("startDate", e.target.value)} />}
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-2">Icon & colour</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
            {HABIT_ICONS.map((i) => (
              <button key={i} type="button" role="radio" aria-checked={values.icon === i} aria-label={i} onClick={() => set("icon", i)} className={cn("grid size-8 place-items-center rounded-md [&_svg]:size-4", values.icon === i ? "bg-ink text-canvas" : "bg-muted text-ink-2 hover:bg-line")}>
                <Icon name={i} />
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colour">
            {PALETTE.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={values.color === c} aria-label={c} onClick={() => set("color", c)} className={cn("size-6 rounded-full ring-offset-2 ring-offset-surface", values.color === c && "ring-2 ring-ink")} style={{ background: c }} />
            ))}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
