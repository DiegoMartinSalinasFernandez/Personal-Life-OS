"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CheckCircle2, Circle } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/tabs";
import { Legend, SERIES, StackedBars } from "@/components/charts";
import { useDb, useToday } from "@/lib/hooks";
import { addDays, formatDate, describeRange } from "@/lib/domain/dates";
import { proteinByMeal, rangeStats, waterOn } from "@/lib/calc/nutrition";
import { cn } from "@/lib/cn";

export default function NutritionHistory() {
  const db = useDb();
  const today = useToday();
  const prefs = db.profile.nutrition;
  const [len, setLen] = useState<"7" | "14" | "30">("7");
  const [end, setEnd] = useState(today);
  const days = Number(len);
  const start = addDays(end, -(days - 1));
  const meals = [...db.mealTypes].sort((a, b) => a.order - b.order);

  const stats = useMemo(() => rangeStats(db.foodEntries, start, end, prefs.proteinTarget), [db.foodEntries, start, end, prefs.proteinTarget]);
  const prev = useMemo(() => rangeStats(db.foodEntries, addDays(start, -days), addDays(start, -1), prefs.proteinTarget), [db.foodEntries, start, days, prefs.proteinTarget]);
  const chart = useMemo(
    () =>
      stats.days.map((d) => {
        const row: Record<string, unknown> = { date: d.date };
        for (const x of proteinByMeal(db.foodEntries, d.date, meals)) row[x.meal.id] = Math.round(x.protein * 10) / 10;
        return row;
      }),
    [stats.days, db.foodEntries, meals],
  );
  const series = meals.map((m, i) => ({ key: m.id, label: m.name, color: SERIES[Math.min(i, 4)] }));
  const logged = stats.days.filter((d) => d.entries > 0);
  const avgKcal = logged.length ? logged.reduce((s, d) => s + d.totals.calories, 0) / logged.length : 0;
  const delta = prev.loggedDays && stats.loggedDays ? stats.avgProtein - prev.avgProtein : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => setEnd(addDays(end, -days))} aria-label="Earlier"><ChevronLeft /></Button>
          <span className="min-w-[170px] text-center text-base font-medium">{describeRange("custom", { start, end })}</span>
          <Button size="icon-sm" variant="ghost" onClick={() => setEnd(addDays(end, days) > today ? today : addDays(end, days))} disabled={end >= today} aria-label="Later"><ChevronRight /></Button>
          {end !== today ? <Button size="sm" variant="ghost" onClick={() => setEnd(today)}>Latest</Button> : null}
        </div>
        <Segmented size="sm" label="Range" value={len} onChange={setLen} options={[{ value: "7", label: "7 days" }, { value: "14", label: "14 days" }, { value: "30", label: "30 days" }]} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-sm text-ink-3">Average protein</p>
          <p className="num mt-1 text-xl font-semibold">{stats.loggedDays ? `${Math.round(stats.avgProtein)} g` : "—"}</p>
          <p className="text-caption text-ink-3">{delta == null ? "on logged days" : `${delta >= 0 ? "+" : "−"}${Math.abs(Math.round(delta))} g vs previous ${days} days`}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-ink-3">Days at target</p>
          <p className="num mt-1 text-xl font-semibold">{stats.reachedDays}<span className="text-base font-normal text-ink-3"> / {days}</span></p>
          <p className="text-caption text-ink-3">target {prefs.proteinTarget} g</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-ink-3">Days logged</p>
          <p className="num mt-1 text-xl font-semibold">{stats.loggedDays}<span className="text-base font-normal text-ink-3"> / {days}</span></p>
          <p className="text-caption text-ink-3">consistency of logging</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-ink-3">{prefs.calorieTracking ? "Average calories" : "Average meals"}</p>
          <p className="num mt-1 text-xl font-semibold">{prefs.calorieTracking ? (logged.length ? `${Math.round(avgKcal)}` : "—") : logged.length ? (logged.reduce((s, d) => s + d.meals, 0) / logged.length).toFixed(1) : "—"}</p>
          <p className="text-caption text-ink-3">{prefs.calorieTracking ? "kcal on logged days" : "per logged day"}</p>
        </div>
      </div>

      <Card>
        <CardHeader title="Protein by day" subtitle="Stacked by meal. Dashed line is your target." action={<Legend items={[...series.map((s) => ({ label: s.label, color: s.color })), { label: "Target", color: "rgb(var(--ink-2))", dashed: true }]} />} />
        <CardBody>
          <StackedBars data={chart} xKey="date" series={series} target={prefs.proteinTarget} valueFormatter={(v) => `${Math.round(v)} g`} tickFormatter={(k) => (days > 14 ? formatDate(k, { month: "numeric", day: "numeric" }) : formatDate(k, { weekday: "short", day: "numeric" }))} labelFormatter={(k) => formatDate(k, { weekday: "long", month: "short", day: "numeric" })} height={280} ariaLabel={`Protein per day by meal from ${start} to ${end}`} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Daily log" subtitle="Open a day to review or correct its entries." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-base">
            <thead>
              <tr className="border-y border-line text-left text-caption uppercase tracking-wide text-ink-3">
                <th className="px-5 py-2 font-medium">Day</th>
                <th className="px-2 py-2 text-right font-medium">Protein</th>
                <th className="px-2 py-2 font-medium">vs target</th>
                {prefs.calorieTracking ? <th className="px-2 py-2 text-right font-medium">kcal</th> : null}
                <th className="px-2 py-2 text-right font-medium">Meals</th>
                {prefs.waterTracking ? <th className="px-5 py-2 text-right font-medium">Water</th> : null}
              </tr>
            </thead>
            <tbody>
              {[...stats.days].reverse().map((d) => (
                <tr key={d.date} className="border-b border-line/70 last:border-0 hover:bg-subtle">
                  <td className="px-5 py-2">
                    <Link href={`/nutrition?date=${d.date}`} className="font-medium text-ink hover:underline">{formatDate(d.date, { weekday: "short", month: "short", day: "numeric" })}</Link>
                  </td>
                  <td className="num px-2 py-2 text-right font-semibold">{d.entries ? `${Math.round(d.totals.protein)} g` : <span className="font-normal text-ink-3">—</span>}</td>
                  <td className="px-2 py-2">
                    {d.entries ? (
                      <span className={cn("inline-flex items-center gap-1.5 text-sm", d.reached ? "text-positive" : "text-ink-3")}>
                        {d.reached ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />}
                        <span className="num">{Math.round(d.pct * 100)}%</span>
                      </span>
                    ) : <span className="text-sm text-ink-3">Not logged</span>}
                  </td>
                  {prefs.calorieTracking ? <td className="num px-2 py-2 text-right text-ink-2">{d.entries ? Math.round(d.totals.calories) : "—"}</td> : null}
                  <td className="num px-2 py-2 text-right text-ink-2">{d.meals || "—"}</td>
                  {prefs.waterTracking ? <td className="num px-5 py-2 text-right text-ink-2">{waterOn(db.waterLogs, d.date) ? `${(waterOn(db.waterLogs, d.date) / 1000).toFixed(1)} L` : "—"}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
