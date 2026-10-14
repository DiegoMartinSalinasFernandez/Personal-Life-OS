"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, MoreHorizontal, Copy, BookmarkPlus, CalendarCheck2, Flame, Trophy, ArrowRight, Utensils } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Menu } from "@/components/ui/menu";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { SimpleBars, SERIES, ACCENT } from "@/components/charts";
import { useDb, useToday, actions } from "@/lib/hooks";
import { openSheet } from "@/lib/store/ui";
import { addDays, formatDate, isISODate, relativeDay, type ISODate } from "@/lib/domain/dates";
import { daySummary, entriesOn, entryNutrients, formatQuantity, itemNutrients, plannedTotals, proteinByMeal, proteinStreak, rangeStats, waterOn } from "@/lib/calc/nutrition";
import type { MealType } from "@/lib/domain/types";
import { ProteinRing, MacroRow, WaterTracker } from "@/features/nutrition/protein-hero";

function NutritionToday() {
  const db = useDb();
  const today = useToday();
  const params = useSearchParams();
  const router = useRouter();
  const date: ISODate = isISODate(params.get("date")) ? params.get("date")! : today;
  const setDate = (d: ISODate) => router.replace(d === today ? "/nutrition" : `/nutrition?date=${d}`, { scroll: false });
  const prefs = db.profile.nutrition;
  const [saveMeal, setSaveMeal] = useState<MealType | null>(null);

  const d = useMemo(() => {
    const day = daySummary(db.foodEntries, date, prefs.proteinTarget);
    const byMeal = proteinByMeal(db.foodEntries, date, db.mealTypes);
    const entries = entriesOn(db.foodEntries, date);
    const planned = db.plannedMeals.filter((p) => p.date === date && !p.loggedAt);
    const plannedProtein = plannedTotals(db.plannedMeals, db.foods, date).protein;
    const week = rangeStats(db.foodEntries, addDays(date, -6), date, prefs.proteinTarget);
    const streak = proteinStreak(db.foodEntries, today, prefs.proteinTarget);
    return { day, byMeal, entries, planned, plannedProtein, week, streak };
  }, [db.foodEntries, db.mealTypes, db.plannedMeals, db.foods, date, prefs.proteinTarget, today]);
  const meals = [...db.mealTypes].sort((a, b) => a.order - b.order);
  const water = waterOn(db.waterLogs, date);
  const isToday = date === today;
  const hasYesterday = entriesOn(db.foodEntries, addDays(date, -1)).length > 0;
  const foodsById = new Map(db.foods.map((f) => [f.id, f]));

  const copyYesterday = async (mealTypeId?: string) => {
    if (d.entries.length && !mealTypeId && !(await confirm({ title: "Copy yesterday's food?", description: "Yesterday's entries will be added alongside what's already logged.", confirmLabel: "Copy", danger: false }))) return;
    const n = actions().copyEntries(addDays(date, -1), date, mealTypeId);
    toast(n ? `Copied ${n} item${n === 1 ? "" : "s"} from ${formatDate(addDays(date, -1))}` : "Nothing to copy", { tone: n ? "success" : "info" });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft /></Button>
          <span className="min-w-[150px] text-center text-base font-medium">{relativeDay(date, today)}{!isToday ? <span className="text-ink-3"> · {formatDate(date, { month: "short", day: "numeric" })}</span> : null}</span>
          <Button size="icon-sm" variant="ghost" onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight /></Button>
          {!isToday ? <Button size="sm" variant="ghost" onClick={() => setDate(today)}>Today</Button> : null}
          <Input type="date" aria-label="Pick a date" value={date} onChange={(e) => isISODate(e.target.value) && setDate(e.target.value)} className="ml-1 h-8 w-auto text-sm" />
        </div>
        {hasYesterday ? <Button size="sm" variant="ghost" onClick={() => copyYesterday()}><Copy /> Copy previous day</Button> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Protein hero */}
        <Card className="lg:col-span-5">
          <div className="flex flex-col items-center gap-5 p-5 sm:flex-row sm:items-center lg:flex-col 2xl:flex-row">
            <ProteinRing day={d.day} />
            <div className="flex w-full flex-1 flex-col gap-3">
              <div>
                <p className="text-sm text-ink-3">Protein remaining</p>
                <p className="num text-display font-semibold tracking-tight text-nutrition">{d.day.reached ? "0" : Math.round(d.day.remaining)}<span className="text-xl font-medium text-ink-3"> g</span></p>
                {d.day.reached ? <Badge tone="positive" icon={<Trophy />}>Target reached</Badge> : d.plannedProtein > 0 ? <p className="text-caption text-ink-3">{Math.round(d.plannedProtein)} g more is planned (not counted yet)</p> : null}
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["Meals", String(d.day.meals)],
                  ["7-day avg", d.week.loggedDays ? `${Math.round(d.week.avgProtein)} g` : "—"],
                  ["Streak", `${d.streak}d`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-md bg-subtle px-2 py-2">
                    <dd className="num whitespace-nowrap text-base font-semibold">{v}</dd>
                    <dt className="whitespace-nowrap text-caption text-ink-3">{k}</dt>
                  </div>
                ))}
              </dl>
              <Button variant="nutrition" size="lg" className="w-full" onClick={() => openSheet({ kind: "food", date })}>
                <Plus /> Add food
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-line p-5">
            {prefs.calorieTracking ? <MacroRow label="Calories" value={d.day.totals.calories} target={prefs.calorieTarget} unit="kcal" partial={d.day.totals.partial.calories} /> : null}
            {prefs.macroTracking ? (
              <div className="grid grid-cols-2 gap-4">
                <MacroRow label="Carbs" value={d.day.totals.carbs} target={prefs.carbTarget} unit="g" partial={d.day.totals.partial.carbs} />
                <MacroRow label="Fat" value={d.day.totals.fat} target={prefs.fatTarget} unit="g" partial={d.day.totals.partial.fat} />
              </div>
            ) : null}
            {prefs.waterTracking ? <WaterTracker ml={water} prefs={prefs} date={date} /> : null}
            {d.day.totals.partial.calories && prefs.calorieTracking ? <p className="text-caption text-ink-3">“+” means some foods have no value for that nutrient.</p> : null}
          </div>
        </Card>

        {/* Meals */}
        <div className="flex flex-col gap-3 lg:col-span-7">
          {meals.map((m) => {
            const mine = d.entries.filter((e) => e.mealTypeId === m.id).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
            const planned = d.planned.filter((p) => p.mealTypeId === m.id);
            const protein = d.byMeal.find((x) => x.meal.id === m.id)?.protein ?? 0;
            const kcal = mine.reduce((s, e) => s + (entryNutrients(e).calories ?? 0), 0);
            return (
              <Card key={m.id} as="article">
                <header className="flex items-center gap-3 px-4 pt-3.5 pb-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-md font-semibold">{m.name}</h2>
                    <p className="num text-caption text-ink-3">
                      {mine.length ? `${Math.round(protein)} g protein${prefs.calorieTracking ? ` · ${Math.round(kcal)} kcal` : ""}` : "Nothing logged"}
                    </p>
                  </div>
                  <Menu
                    label={`${m.name} actions`}
                    trigger={(p) => <Button {...p} size="icon-sm" variant="ghost" aria-label={`${m.name} options`}><MoreHorizontal /></Button>}
                    items={[
                      { label: `Copy ${m.name.toLowerCase()} from previous day`, icon: <Copy />, onSelect: () => copyYesterday(m.id) },
                      { label: "Save as reusable meal", icon: <BookmarkPlus />, disabled: !mine.length, onSelect: () => setSaveMeal(m) },
                    ]}
                  />
                  <Button size="sm" onClick={() => openSheet({ kind: "food", date, mealTypeId: m.id })} aria-label={`Add food to ${m.name}`}>
                    <Plus /> Add
                  </Button>
                </header>
                {mine.length || planned.length ? (
                  <ul className="px-2 pb-2">
                    {mine.map((e) => {
                      const n = entryNutrients(e);
                      return (
                        <li key={e.id}>
                          <button onClick={() => openSheet({ kind: "food", entryId: e.id })} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-subtle">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-base text-ink">{e.foodName}</span>
                              <span className="num block truncate text-caption text-ink-3">
                                {formatQuantity(e.quantity, e.unit, e.portions)}
                                {prefs.calorieTracking && n.calories != null ? ` · ${Math.round(n.calories)} kcal` : ""}
                                {e.notes ? ` · ${e.notes}` : ""}
                              </span>
                            </span>
                            <span className="num text-base font-semibold text-ink">{n.protein.toFixed(n.protein < 10 ? 1 : 0)} g</span>
                          </button>
                        </li>
                      );
                    })}
                    {planned.map((p) => {
                      const pp = p.items.reduce((s, it) => s + itemNutrients(it, foodsById.get(it.foodId)).protein, 0);
                      return (
                        <li key={p.id} className="mx-1 mt-1 flex items-center gap-3 rounded-md border border-dashed border-line-strong px-2 py-1.5">
                          <CalendarCheck2 className="size-4 shrink-0 text-ink-3" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink-2">Planned: {p.items.map((it) => foodsById.get(it.foodId)?.name ?? "Removed food").join(", ")}</span>
                            <span className="num block text-caption text-ink-3">{Math.round(pp)} g protein · not counted until logged</span>
                          </span>
                          <Button size="sm" variant="subtle" onClick={() => { const n = actions().logPlannedMeal(p.id, isToday ? undefined : m.time); toast(`Logged ${n} planned item${n === 1 ? "" : "s"}`); }}>
                            Log it
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </Card>
            );
          })}
          <Link href="/settings#nutrition" className="self-end text-caption text-ink-3 hover:text-ink">Customize meal types →</Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader title="Protein distribution" subtitle="How today's protein is spread across meals" />
          <CardBody>
            {d.day.totals.protein > 0 ? (
              <>
                <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Protein by meal">
                  {d.byMeal.filter((x) => x.protein > 0).map((x) => (
                    <div key={x.meal.id} style={{ width: `${(x.protein / d.day.totals.protein) * 100}%`, background: SERIES[Math.min(meals.findIndex((m) => m.id === x.meal.id), 4)] }} title={`${x.meal.name}: ${Math.round(x.protein)} g`} />
                  ))}
                </div>
                <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
                  {d.byMeal.map((x, i) => (
                    <li key={x.meal.id} className="flex items-center justify-between gap-2 text-base">
                      <span className="flex items-center gap-2 text-ink-2"><span className="size-2.5 rounded-sm" style={{ background: SERIES[Math.min(i, 4)] }} aria-hidden />{x.meal.name}</span>
                      <span className="num font-medium">{Math.round(x.protein)} g <span className="text-caption font-normal text-ink-3">{d.day.totals.protein ? Math.round((x.protein / d.day.totals.protein) * 100) : 0}%</span></span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-caption text-ink-3">There&apos;s no single right split — this just shows how your intake is spread.</p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Utensils className="size-5 text-ink-3" />
                <p className="text-sm text-ink-3">Log food to see how protein is spread across your meals.</p>
              </div>
            )}
          </CardBody>
        </Card>
        <Card className="lg:col-span-7">
          <CardHeader
            title="Last 7 days"
            subtitle={`${d.week.reachedDays} of 7 days at target · avg ${Math.round(d.week.avgProtein)} g on logged days`}
            icon={<Flame className="size-4 text-nutrition" />}
            action={<Link href="/nutrition/history" className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">History <ArrowRight className="size-3.5" /></Link>}
          />
          <CardBody>
            <SimpleBars
              data={d.week.days.map((x) => ({ date: x.date, protein: Math.round(x.totals.protein), reached: x.reached }))}
              xKey="date"
              yKey="protein"
              label="Protein"
              color={ACCENT.nutrition}
              target={prefs.proteinTarget}
              targetLabel={`Target ${prefs.proteinTarget} g`}
              dimWhen={(r) => !r.reached}
              valueFormatter={(v) => `${Math.round(v)} g`}
              tickFormatter={(k) => formatDate(k, { weekday: "short" })}
              labelFormatter={(k) => formatDate(k, { weekday: "long", month: "short", day: "numeric" })}
              height={190}
              ariaLabel="Protein per day for the last 7 days compared with target"
            />
            <p className="mt-1 text-caption text-ink-3">Solid bars reached the target; faded bars didn&apos;t.</p>
          </CardBody>
        </Card>
      </div>
      {saveMeal ? <SaveMealDialog meal={saveMeal} date={date} onClose={() => setSaveMeal(null)} /> : null}
    </div>
  );
}

function SaveMealDialog({ meal, date, onClose }: { meal: MealType; date: ISODate; onClose: () => void }) {
  const db = useDb();
  const entries = db.foodEntries.filter((e) => e.date === date && e.mealTypeId === meal.id && e.foodId);
  const [name, setName] = useState(`My ${meal.name.toLowerCase()}`);
  const save = () => {
    if (!name.trim()) return;
    actions().add("savedMeals", { name: name.trim(), mealTypeId: meal.id, items: entries.map((e) => ({ foodId: e.foodId!, quantity: e.quantity, unit: e.unit })), favorite: true });
    toast(`Saved “${name.trim()}” — find it at the top of Add food`);
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title="Save as reusable meal" size="sm" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={!name.trim()}>Save meal</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex flex-col gap-3">
        <Field label="Name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}</Field>
        <ul className="text-sm text-ink-2">
          {entries.map((e) => <li key={e.id}>• {e.foodName} — {formatQuantity(e.quantity, e.unit, e.portions)}</li>)}
        </ul>
      </form>
    </Dialog>
  );
}

export default function NutritionPage() {
  return (
    <Suspense>
      <NutritionToday />
    </Suspense>
  );
}
