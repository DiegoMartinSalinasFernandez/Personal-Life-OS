"use client";

import { Flame, Droplets, Plus, Minus } from "lucide-react";
import { ProgressRing, ProgressBar } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { DaySummary } from "@/lib/calc/nutrition";
import type { NutritionPrefs } from "@/lib/domain/types";
import { actions } from "@/lib/hooks";
import type { ISODate } from "@/lib/domain/dates";

export function ProteinRing({ day, size = 188 }: { day: DaySummary; size?: number }) {
  const consumed = Math.round(day.totals.protein);
  return (
    <ProgressRing value={day.pct} size={size} stroke={Math.round(size / 14)} tone="nutrition" label={`${consumed} of ${day.target} grams of protein`}>
      <div>
        <p className="num text-[34px] font-semibold leading-none tracking-tight text-ink">{consumed}<span className="text-lg font-medium text-ink-3"> g</span></p>
        <p className="mt-1 text-caption text-ink-3">of {day.target} g protein</p>
        <p className="num mt-1.5 text-sm font-semibold text-nutrition">{Math.round(day.pct * 100)}%</p>
      </div>
    </ProgressRing>
  );
}

export function MacroRow({ label, value, target, unit, partial }: { label: string; value: number; target: number | null; unit: string; partial?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-ink-2">{label}</span>
        <span className="num font-medium text-ink">
          {Math.round(value)}
          {partial ? "+" : ""}
          {target ? <span className="font-normal text-ink-3"> / {target} {unit}</span> : <span className="font-normal text-ink-3"> {unit}</span>}
        </span>
      </div>
      {target ? <ProgressBar value={value / target} tone={value > target ? "warning" : "ink"} size="sm" label={`${label} vs target`} /> : null}
    </div>
  );
}

export function WaterTracker({ ml, prefs, date }: { ml: number; prefs: NutritionPrefs; date: ISODate }) {
  const target = prefs.waterTargetMl ?? 2000;
  const imperial = prefs.units === "imperial";
  const step = imperial ? 237 : 250;
  const show = (v: number) => (imperial ? `${Math.round(v / 29.574)} fl oz` : v >= 1000 ? `${(v / 1000).toFixed(2).replace(/0$/, "")} L` : `${v} ml`);
  return (
    <div className="rounded-md border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-ink-2">
          <Droplets className="size-4 text-info" aria-hidden /> Water
        </span>
        <span className="num text-sm text-ink">
          <span className="font-semibold">{show(ml)}</span> <span className="text-ink-3">/ {show(target)}</span>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <ProgressBar value={ml / target} tone="info" size="sm" className="flex-1" label="Water vs target" />
        <Button size="icon-sm" variant="secondary" onClick={() => actions().addWater(date, -Math.min(step, ml))} disabled={ml <= 0} aria-label={`Remove ${show(step)}`}>
          <Minus />
        </Button>
        <Button size="icon-sm" variant="secondary" onClick={() => actions().addWater(date, step)} aria-label={`Add ${show(step)}`}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}

export function CaloriesLine({ value, target, partial }: { value: number; target: number | null; partial: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-2">
      <Flame className="size-4 text-nutrition" aria-hidden />
      <span className="num font-medium text-ink">{Math.round(value)}{partial ? "+" : ""} kcal</span>
      {target ? <span className="text-ink-3">of {target}</span> : null}
    </div>
  );
}
