import type { BaseUnit, Food } from "../domain/types";

/**
 * LOCAL SAMPLE FOOD DATABASE
 * ──────────────────────────
 * Approximate, rounded values in the range of commonly published reference
 * data (per 100 g / 100 ml, or per unit). They are NOT verified for any
 * specific product and are labelled "Sample" in the UI. Users should check
 * packaging or create custom foods with their own values.
 *
 * To plug in a real nutrition API later, implement `FoodProvider` in
 * src/lib/data/food-provider.ts and map results into `Food` with source "api".
 */
type Row = [key: string, name: string, base: BaseUnit, protein: number, kcal: number | null, carbs: number | null, fat: number | null, portions?: [string, number][]];

const ROWS: Row[] = [
  ["chicken-breast", "Chicken breast, cooked", "g", 31, 165, 0, 3.6, [["1 breast (≈150 g)", 150]]],
  ["chicken-thigh", "Chicken thigh, cooked", "g", 25, 210, 0, 11, [["1 thigh (≈100 g)", 100]]],
  ["turkey-breast", "Turkey breast, roasted", "g", 29, 135, 0, 1],
  ["beef-lean", "Ground beef 90% lean, cooked", "g", 26, 215, 0, 12],
  ["pork-tenderloin", "Pork tenderloin, cooked", "g", 26, 145, 0, 3.5],
  ["salmon", "Salmon, cooked", "g", 25, 205, 0, 12, [["1 fillet (≈150 g)", 150]]],
  ["tuna-can", "Tuna, canned in water (drained)", "g", 25, 115, 0, 1, [["1 can drained (≈120 g)", 120]]],
  ["shrimp", "Shrimp, cooked", "g", 24, 100, 0, 0.5],
  ["cod", "Cod, cooked", "g", 23, 105, 0, 0.9],
  ["egg", "Egg, large", "unit", 6.3, 72, 0.4, 4.8],
  ["egg-white", "Egg whites", "g", 11, 52, 0.7, 0.2, [["1 large white (≈33 g)", 33]]],
  ["greek-yogurt", "Greek yogurt, plain non-fat", "g", 10, 59, 3.6, 0.4, [["1 pot (170 g)", 170]]],
  ["cottage", "Cottage cheese, low-fat", "g", 11, 80, 3.4, 2.3, [["½ cup (113 g)", 113]]],
  ["skyr", "Skyr, plain", "g", 11, 63, 4, 0.2, [["1 pot (150 g)", 150]]],
  ["milk-whole", "Milk, whole", "ml", 3.3, 61, 4.8, 3.3, [["1 glass (250 ml)", 250]]],
  ["milk-skim", "Milk, skim", "ml", 3.4, 35, 5, 0.1, [["1 glass (250 ml)", 250]]],
  ["soy-milk", "Soy milk, unsweetened", "ml", 3.3, 33, 0.6, 1.8, [["1 glass (250 ml)", 250]]],
  ["cheddar", "Cheddar cheese", "g", 25, 400, 1.3, 33, [["1 slice (28 g)", 28]]],
  ["mozzarella", "Mozzarella", "g", 22, 280, 3, 17],
  ["whey", "Whey protein powder (generic)", "g", 78, 390, 8, 6, [["1 scoop (30 g)", 30]]],
  ["protein-bar", "Protein bar (generic)", "unit", 20, 200, 22, 7],
  ["tofu", "Tofu, firm", "g", 15, 145, 3, 9, [["¼ block (≈100 g)", 100]]],
  ["tempeh", "Tempeh", "g", 20, 195, 9, 11],
  ["seitan", "Seitan", "g", 25, 120, 4, 2],
  ["edamame", "Edamame, shelled", "g", 11, 120, 9, 5],
  ["lentils", "Lentils, cooked", "g", 9, 116, 20, 0.4, [["1 cup (≈200 g)", 200]]],
  ["chickpeas", "Chickpeas, cooked", "g", 8.9, 164, 27, 2.6, [["1 cup (≈165 g)", 165]]],
  ["black-beans", "Black beans, cooked", "g", 8.9, 132, 24, 0.5, [["1 cup (≈172 g)", 172]]],
  ["hummus", "Hummus", "g", 7.9, 166, 14, 9.6, [["2 tbsp (30 g)", 30]]],
  ["peanut-butter", "Peanut butter", "g", 25, 590, 20, 50, [["1 tbsp (16 g)", 16]]],
  ["almonds", "Almonds", "g", 21, 580, 22, 50, [["1 handful (28 g)", 28]]],
  ["oats", "Rolled oats, dry", "g", 13, 380, 66, 7, [["½ cup (40 g)", 40]]],
  ["rice-white", "White rice, cooked", "g", 2.7, 130, 28, 0.3, [["1 cup (≈160 g)", 160]]],
  ["rice-brown", "Brown rice, cooked", "g", 2.6, 123, 26, 1, [["1 cup (≈195 g)", 195]]],
  ["quinoa", "Quinoa, cooked", "g", 4.4, 120, 21, 1.9, [["1 cup (≈185 g)", 185]]],
  ["pasta", "Pasta, cooked", "g", 5.8, 158, 31, 0.9, [["1 cup (≈140 g)", 140]]],
  ["bread-ww", "Whole-wheat bread", "g", 13, 250, 41, 3.4, [["1 slice (32 g)", 32]]],
  ["tortilla", "Flour tortilla", "unit", 4, 140, 24, 3.5],
  ["potato", "Potato, baked", "g", 2.5, 93, 21, 0.1, [["1 medium (≈170 g)", 170]]],
  ["sweet-potato", "Sweet potato, baked", "g", 2, 90, 21, 0.2, [["1 medium (≈150 g)", 150]]],
  ["broccoli", "Broccoli", "g", 2.8, 34, 7, 0.4, [["1 cup (≈90 g)", 90]]],
  ["spinach", "Spinach, raw", "g", 2.9, 23, 3.6, 0.4, [["1 cup (30 g)", 30]]],
  ["mixed-salad", "Mixed salad greens", "g", 1.5, 18, 3, 0.2],
  ["avocado", "Avocado", "g", 2, 160, 9, 15, [["½ avocado (≈100 g)", 100]]],
  ["banana", "Banana", "g", 1.1, 89, 23, 0.3, [["1 medium (≈118 g)", 118]]],
  ["apple", "Apple", "g", 0.3, 52, 14, 0.2, [["1 medium (≈180 g)", 180]]],
  ["blueberries", "Blueberries", "g", 0.7, 57, 14, 0.3, [["1 cup (≈150 g)", 150]]],
  ["orange-juice", "Orange juice", "ml", 0.7, 45, 10, 0.2, [["1 glass (250 ml)", 250]]],
  ["olive-oil", "Olive oil", "ml", 0, 820, 0, 92, [["1 tbsp (15 ml)", 15]]],
  ["dark-chocolate", "Dark chocolate 70%", "g", 7.8, 600, 46, 43, [["2 squares (20 g)", 20]]],
  ["coffee-latte", "Latte (whole milk)", "ml", 3.2, 55, 4.5, 2.9, [["1 regular (350 ml)", 350]]],
];

export function sampleFoods(stamp: string): Food[] {
  return ROWS.map(([key, name, baseUnit, protein, calories, carbs, fat, portions]) => ({
    id: `food-${key}`,
    name,
    baseUnit,
    per: { protein, calories, carbs, fat },
    portions: (portions ?? []).map(([label, amount], i) => ({ id: `${key}-p${i}`, label, amount })),
    source: "sample" as const,
    favorite: false,
    archived: false,
    createdAt: stamp,
  }));
}
