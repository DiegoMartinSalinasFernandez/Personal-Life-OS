import type { BaseUnit, Food, FoodEntry, MealItem, MealType, Nutrients, PlannedMeal, Portion, QuantityUnit, WaterLog, ID } from "../domain/types";
import { addDays, eachDay, inRange, type ISODate } from "../domain/dates";

export const OZ_TO_G = 28.349523125;
export const FLOZ_TO_ML = 29.5735295625;

export interface Totals {
  protein: number;
  calories: number;
  carbs: number;
  fat: number;
  /** Whether any contributing entry lacked a value (so the total is a lower bound). */
  partial: { calories: boolean; carbs: boolean; fat: boolean };
}

export const emptyTotals = (): Totals => ({ protein: 0, calories: 0, carbs: 0, fat: 0, partial: { calories: false, carbs: false, fat: false } });

/** Converts a logged quantity to the food's base unit amount (g, ml or units). */
export function toBaseAmount(quantity: number, unit: QuantityUnit, baseUnit: BaseUnit, portions: Portion[]): number | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  if (unit.startsWith("portion:")) {
    const p = portions.find((x) => x.id === unit.slice(8));
    return p ? quantity * p.amount : null;
  }
  if (unit === baseUnit) return quantity;
  if (unit === "oz" && baseUnit === "g") return quantity * OZ_TO_G;
  if (unit === "floz" && baseUnit === "ml") return quantity * FLOZ_TO_ML;
  return null;
}

/** Scales per-base nutrients (per 100 g/ml, or per 1 unit) to an amount. */
export function scaleNutrients(per: Nutrients, baseUnit: BaseUnit, baseAmount: number): Nutrients {
  const f = baseUnit === "unit" ? baseAmount : baseAmount / 100;
  const s = (v: number | null) => (v == null ? null : v * f);
  return { protein: per.protein * f, calories: s(per.calories), carbs: s(per.carbs), fat: s(per.fat) };
}

export function entryNutrients(e: Pick<FoodEntry, "per" | "baseUnit" | "portions" | "quantity" | "unit">): Nutrients {
  const base = toBaseAmount(e.quantity, e.unit, e.baseUnit, e.portions) ?? 0;
  return scaleNutrients(e.per, e.baseUnit, base);
}

export function itemNutrients(item: MealItem, food: Food | undefined): Nutrients {
  if (!food) return { protein: 0, calories: null, carbs: null, fat: null };
  const base = toBaseAmount(item.quantity, item.unit, food.baseUnit, food.portions) ?? 0;
  return scaleNutrients(food.per, food.baseUnit, base);
}

export function addNutrients(t: Totals, n: Nutrients): Totals {
  t.protein += n.protein;
  if (n.calories == null) t.partial.calories = true; else t.calories += n.calories;
  if (n.carbs == null) t.partial.carbs = true; else t.carbs += n.carbs;
  if (n.fat == null) t.partial.fat = true; else t.fat += n.fat;
  return t;
}

export function sumEntries(entries: FoodEntry[]): Totals {
  return entries.reduce((t, e) => addNutrients(t, entryNutrients(e)), emptyTotals());
}

export const entriesOn = (entries: FoodEntry[], date: ISODate) => entries.filter((e) => e.date === date);

export interface DaySummary {
  date: ISODate;
  totals: Totals;
  target: number;
  remaining: number;
  pct: number;
  reached: boolean;
  meals: number; // distinct meal types with at least one entry
  entries: number;
}

export function daySummary(entries: FoodEntry[], date: ISODate, proteinTarget: number): DaySummary {
  const day = entriesOn(entries, date);
  const totals = sumEntries(day);
  const remaining = Math.max(0, proteinTarget - totals.protein);
  return {
    date,
    totals,
    target: proteinTarget,
    remaining,
    pct: proteinTarget > 0 ? totals.protein / proteinTarget : 0,
    reached: proteinTarget > 0 && totals.protein >= proteinTarget - 0.05,
    meals: new Set(day.map((e) => e.mealTypeId)).size,
    entries: day.length,
  };
}

export function proteinByMeal(entries: FoodEntry[], date: ISODate, mealTypes: MealType[]): { meal: MealType; protein: number; count: number }[] {
  const day = entriesOn(entries, date);
  return [...mealTypes]
    .sort((a, b) => a.order - b.order)
    .map((meal) => {
      const mine = day.filter((e) => e.mealTypeId === meal.id);
      return { meal, protein: mine.reduce((s, e) => s + entryNutrients(e).protein, 0), count: mine.length };
    });
}

export interface RangeStats {
  days: DaySummary[];
  /** Average over days that have at least one entry (unlogged days are not counted as zero). */
  avgProtein: number;
  loggedDays: number;
  reachedDays: number;
}

export function rangeStats(entries: FoodEntry[], start: ISODate, end: ISODate, proteinTarget: number): RangeStats {
  const inR = entries.filter((e) => inRange(e.date, start, end));
  const days = eachDay(start, end).map((d) => daySummary(inR, d, proteinTarget));
  const logged = days.filter((d) => d.entries > 0);
  return {
    days,
    avgProtein: logged.length ? logged.reduce((s, d) => s + d.totals.protein, 0) / logged.length : 0,
    loggedDays: logged.length,
    reachedDays: days.filter((d) => d.reached).length,
  };
}

/** Consecutive days (ending today, or yesterday if today isn't reached yet) that hit the target. */
export function proteinStreak(entries: FoodEntry[], today: ISODate, proteinTarget: number): number {
  const byDate = new Map<ISODate, number>();
  for (const e of entries) byDate.set(e.date, (byDate.get(e.date) ?? 0) + entryNutrients(e).protein);
  const hit = (d: ISODate) => (byDate.get(d) ?? 0) >= proteinTarget - 0.05 && proteinTarget > 0;
  let d = hit(today) ? today : addDays(today, -1);
  let n = 0;
  while (hit(d) && n < 3650) { n++; d = addDays(d, -1); }
  return n;
}

export const waterOn = (logs: WaterLog[], date: ISODate) => logs.filter((l) => l.date === date).reduce((s, l) => s + l.ml, 0);

/** Planned nutrients for a date — reported separately, never merged into consumed totals. */
export function plannedTotals(planned: PlannedMeal[], foods: Food[], date: ISODate): Totals {
  const byId = new Map(foods.map((f) => [f.id, f]));
  const t = emptyTotals();
  for (const pm of planned) if (pm.date === date && !pm.loggedAt) for (const it of pm.items) addNutrients(t, itemNutrients(it, byId.get(it.foodId)));
  return t;
}

export interface ShoppingLine {
  foodId: ID;
  name: string;
  baseUnit: BaseUnit;
  amount: number; // base units
  meals: number;
}

/** Aggregates planned (not yet logged) items in a date range into a shopping list. */
export function shoppingList(planned: PlannedMeal[], foods: Food[], start: ISODate, end: ISODate): ShoppingLine[] {
  const byId = new Map(foods.map((f) => [f.id, f]));
  const lines = new Map<ID, ShoppingLine>();
  for (const pm of planned) {
    if (pm.loggedAt || !inRange(pm.date, start, end)) continue;
    for (const it of pm.items) {
      const food = byId.get(it.foodId);
      if (!food) continue;
      const amt = toBaseAmount(it.quantity, it.unit, food.baseUnit, food.portions) ?? 0;
      const line = lines.get(food.id) ?? { foodId: food.id, name: food.name, baseUnit: food.baseUnit, amount: 0, meals: 0 };
      line.amount += amt;
      line.meals += 1;
      lines.set(food.id, line);
    }
  }
  return [...lines.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Foods most recently logged, de-duplicated, newest first. */
export function recentFoodIds(entries: FoodEntry[], limit = 8): ID[] {
  const sorted = [...entries].sort((a, b) => (a.date === b.date ? (b.time ?? "").localeCompare(a.time ?? "") || b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
  const out: ID[] = [];
  for (const e of sorted) {
    if (e.foodId && !out.includes(e.foodId)) out.push(e.foodId);
    if (out.length >= limit) break;
  }
  return out;
}

export function unitLabel(unit: QuantityUnit, portions: Portion[]): string {
  if (unit.startsWith("portion:")) return portions.find((p) => p.id === unit.slice(8))?.label ?? "portion";
  return { g: "g", ml: "ml", unit: "unit", oz: "oz", floz: "fl oz" }[unit as "g"] ?? unit;
}

export function formatQuantity(quantity: number, unit: QuantityUnit, portions: Portion[]): string {
  const q = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(quantity < 10 ? 2 : 1).replace(/\.?0+$/, "");
  if (unit.startsWith("portion:")) {
    const label = unitLabel(unit, portions);
    return quantity === 1 ? label : `${q} × ${label}`;
  }
  if (unit === "unit") return `${q} ${quantity === 1 ? "unit" : "units"}`;
  return `${q} ${unitLabel(unit, portions)}`;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const fmtG = (n: number) => `${Math.round(n)} g`;
