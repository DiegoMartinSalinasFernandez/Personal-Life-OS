"use client";

import { Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { Recurrence } from "@/lib/domain/recurrence";
import { weekday, type ISODate } from "@/lib/domain/dates";

const WD = ["S", "M", "T", "W", "T", "F", "S"];
const WD_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Preset = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly";
function presetOf(r: Recurrence | null): Preset {
  if (!r) return "none";
  if (r.freq === "weekly" && r.byWeekday?.slice().sort().join() === "1,2,3,4,5" && r.interval === 1) return "weekdays";
  return r.freq;
}

export function RecurrenceField({ value, onChange, anchor, id }: { value: Recurrence | null; onChange: (r: Recurrence | null) => void; anchor: ISODate | null; id?: string }) {
  const preset = presetOf(value);
  const setPreset = (p: Preset) => {
    if (p === "none") return onChange(null);
    if (p === "weekdays") return onChange({ freq: "weekly", interval: 1, byWeekday: [1, 2, 3, 4, 5], until: value?.until });
    onChange({ freq: p, interval: value?.interval ?? 1, byWeekday: p === "weekly" ? [anchor ? weekday(anchor) : 1] : undefined, until: value?.until });
  };
  return (
    <div className="flex flex-col gap-2">
      <Select id={id} value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
        <option value="none">Doesn&apos;t repeat</option>
        <option value="daily">Daily</option>
        <option value="weekdays">Every weekday (Mon–Fri)</option>
        <option value="weekly">Weekly…</option>
        <option value="monthly">Monthly{anchor ? ` on day ${Number(anchor.slice(8))}` : ""}</option>
        <option value="yearly">Yearly</option>
      </Select>
      {value && preset !== "weekdays" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <span>Every</span>
          <Input aria-label="Interval" inputMode="numeric" className="h-8 w-14 text-center" value={String(value.interval)} onChange={(e) => onChange({ ...value, interval: Math.max(1, Math.min(99, Number(e.target.value.replace(/\D/g, "")) || 1)) })} />
          <span>{{ daily: "day(s)", weekly: "week(s)", monthly: "month(s)", yearly: "year(s)" }[value.freq]}</span>
        </div>
      ) : null}
      {value?.freq === "weekly" && preset === "weekly" ? (
        <div className="flex gap-1" role="group" aria-label="Repeat on">
          {WD.map((d, i) => {
            const on = value.byWeekday?.includes(i) ?? false;
            return (
              <button
                key={i}
                type="button"
                aria-pressed={on}
                aria-label={WD_LONG[i]}
                onClick={() => {
                  const set = new Set(value.byWeekday ?? []);
                  if (on) set.delete(i);
                  else set.add(i);
                  if (set.size) onChange({ ...value, byWeekday: [...set].sort() });
                }}
                className={cn("size-8 rounded-full text-sm font-medium", on ? "bg-ink text-canvas" : "bg-muted text-ink-2 hover:bg-line")}
              >
                {d}
              </button>
            );
          })}
        </div>
      ) : null}
      {value ? (
        <label className="flex items-center gap-2 text-sm text-ink-2">
          Ends
          <Input type="date" className="h-8 w-auto" value={value.until ?? ""} min={anchor ?? undefined} onChange={(e) => onChange({ ...value, until: e.target.value || undefined })} aria-label="Repeat until" />
          {value.until ? (
            <button type="button" className="text-caption text-ink-3 underline" onClick={() => onChange({ ...value, until: undefined })}>
              never
            </button>
          ) : <span className="text-caption text-ink-3">never</span>}
        </label>
      ) : null}
    </div>
  );
}
