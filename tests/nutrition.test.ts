import { describe, expect, it } from "vitest";
import type { FoodEntry, MealType, PlannedMeal, Food } from "@/lib/domain/types";
import { daySummary, entryNutrients, plannedTotals, proteinByMeal, proteinStreak, rangeStats, shoppingList, sumEntries, toBaseAmount } from "@/lib/calc/nutrition";

const now = "2026-01-01T00:00:00.000Z";
const chicken = { per: { protein: 31, calories: 165, carbs: 0, fat: 3.6 }, baseUnit: "g" as const, portions: [{ id: "breast", label: "1 breast", amount: 170 }] };
const egg = { per: { protein: 6.3, calories: 72, carbs: null, fat: 4.8 }, baseUnit: "unit" as const, portions: [] };
let i = 0;
const entry = (date: string, meal: string, food: typeof chicken | typeof egg, quantity: number, unit: FoodEntry["unit"]): FoodEntry => ({ id: `e${i++}`, createdAt: now, date, mealTypeId: meal, foodId: "f", foodName: "x", quantity, unit, ...food });

describe("quantities", () => {
  it("converts units and portions", () => {
    expect(toBaseAmount(2, "portion:breast", "g", chicken.portions)).toBe(340);
    expect(toBaseAmount(1, "oz", "g", [])).toBeCloseTo(28.35, 2);
    expect(toBaseAmount(1, "ml", "g", [])).toBeNull();
  });
  it("scales protein with quantity changes", () => {
    const e = entry("2026-03-01", "lunch", chicken, 200, "g");
    expect(entryNutrients(e).protein).toBeCloseTo(62);
    expect(entryNutrients({ ...e, quantity: 100 }).protein).toBeCloseTo(31);
    expect(entryNutrients({ ...e, quantity: 1, unit: "portion:breast" }).protein).toBeCloseTo(52.7);
    expect(entryNutrients(entry("2026-03-01", "b", egg, 3, "unit")).protein).toBeCloseTo(18.9);
  });
  it("flags partial totals when a value is unknown", () => {
    const t = sumEntries([entry("d", "b", egg, 2, "unit"), entry("d", "l", chicken, 100, "g")]);
    expect(t.partial.carbs).toBe(true);
    expect(t.partial.calories).toBe(false);
    expect(t.calories).toBeCloseTo(144 + 165);
  });
});

describe("daily & weekly", () => {
  const meals: MealType[] = [{ id: "b", name: "Breakfast", order: 0, time: "08:00" }, { id: "l", name: "Lunch", order: 1, time: "13:00" }];
  const entries = [
    entry("2026-03-01", "b", egg, 3, "unit"), // 18.9
    entry("2026-03-01", "l", chicken, 200, "g"), // 62
    entry("2026-03-02", "l", chicken, 500, "g"), // 155
    entry("2026-03-03", "l", chicken, 500, "g"), // 155
  ];
  it("summarises a day against the target", () => {
    const d = daySummary(entries, "2026-03-01", 150);
    expect(d.totals.protein).toBeCloseTo(80.9);
    expect(d.remaining).toBeCloseTo(69.1);
    expect(d.reached).toBe(false);
    expect(d.meals).toBe(2);
  });
  it("distributes protein by meal", () => {
    const by = proteinByMeal(entries, "2026-03-01", meals);
    expect(by[0].protein).toBeCloseTo(18.9);
    expect(by[1].protein).toBeCloseTo(62);
  });
  it("averages over logged days only and counts reached days", () => {
    const s = rangeStats(entries, "2026-02-28", "2026-03-03", 150);
    expect(s.loggedDays).toBe(3);
    expect(s.reachedDays).toBe(2);
    expect(s.avgProtein).toBeCloseTo((80.9 + 155 + 155) / 3);
  });
  it("computes streaks without breaking on an unfinished today", () => {
    expect(proteinStreak(entries, "2026-03-04", 150)).toBe(2);
    expect(proteinStreak(entries, "2026-03-03", 150)).toBe(2);
  });
  it("updates when an entry is deleted", () => {
    expect(daySummary(entries.slice(1), "2026-03-01", 150).totals.protein).toBeCloseTo(62);
  });
});

describe("planning", () => {
  const foods: Food[] = [{ id: "c", name: "Chicken", source: "sample", favorite: false, archived: false, createdAt: now, ...chicken }];
  const plan: PlannedMeal[] = [
    { id: "p1", createdAt: now, date: "2026-03-05", mealTypeId: "l", items: [{ foodId: "c", quantity: 200, unit: "g" }] },
    { id: "p2", createdAt: now, date: "2026-03-06", mealTypeId: "l", items: [{ foodId: "c", quantity: 1, unit: "portion:breast" }] },
    { id: "p3", createdAt: now, date: "2026-03-06", mealTypeId: "d", items: [{ foodId: "c", quantity: 100, unit: "g" }], loggedAt: now },
  ];
  it("keeps planned food separate and excludes already-logged plans", () => {
    expect(plannedTotals(plan, foods, "2026-03-06").protein).toBeCloseTo(52.7);
  });
  it("aggregates a shopping list", () => {
    const list = shoppingList(plan, foods, "2026-03-01", "2026-03-10");
    expect(list).toHaveLength(1);
    expect(list[0].amount).toBe(370);
    expect(list[0].meals).toBe(2);
  });
});
