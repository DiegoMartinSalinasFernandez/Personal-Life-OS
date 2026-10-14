import type { Category, Database, MealType, Profile } from "../domain/types";
import { browserTimeZone } from "../domain/dates";

export const DB_VERSION = 1;

/** Restrained, mutually distinguishable hues for categories, projects and habits. */
export const PALETTE = ["#1E6B57", "#C4622D", "#4A56C9", "#A86C16", "#8A4FB0", "#2F7FA8", "#B4495F", "#5C7A2E", "#6B6B76", "#3B8C8C", "#9A5B34", "#5A6FA8"];

export const uid = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const nowStamp = () => new Date().toISOString();

export function defaultProfile(): Profile {
  let locale = "en-US";
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
  } catch {}
  return {
    name: "",
    currency: "USD",
    timezone: browserTimeZone(),
    locale,
    weekStartsOn: 1,
    hour12: false,
    theme: "system",
    home: { order: ["finance", "nutrition", "activities"], hidden: [], showTimeline: true, showInsights: true },
    nutrition: {
      proteinTarget: 120,
      calorieTracking: true,
      calorieTarget: null,
      macroTracking: false,
      carbTarget: null,
      fatTarget: null,
      waterTracking: true,
      waterTargetMl: 2000,
      units: "metric",
      dietaryPreferences: [],
      avoidFoods: [],
      mealReminderTime: "14:00",
    },
    onboarded: false,
    demo: false,
  };
}

type CatSeed = [key: string, name: string, kind: "income" | "expense", icon: string, color: string, parent?: string];
const CATS: CatSeed[] = [
  ["housing", "Housing", "expense", "home", PALETTE[5]],
  ["rent", "Rent & mortgage", "expense", "home", PALETTE[5], "housing"],
  ["utilities", "Utilities", "expense", "zap", PALETTE[5], "housing"],
  ["internet", "Internet & phone", "expense", "wifi", PALETTE[5], "housing"],
  ["groceries", "Groceries", "expense", "shopping-basket", PALETTE[0]],
  ["dining", "Dining out", "expense", "utensils", PALETTE[1]],
  ["transport", "Transport", "expense", "car", PALETTE[2]],
  ["fuel", "Fuel", "expense", "fuel", PALETTE[2], "transport"],
  ["transit", "Public transit", "expense", "train", PALETTE[2], "transport"],
  ["health", "Health & fitness", "expense", "heart-pulse", PALETTE[6]],
  ["shopping", "Shopping", "expense", "shopping-bag", PALETTE[4]],
  ["entertainment", "Entertainment", "expense", "clapperboard", PALETTE[3]],
  ["subscriptions", "Subscriptions", "expense", "repeat", PALETTE[9]],
  ["travel", "Travel", "expense", "plane", PALETTE[11]],
  ["education", "Education", "expense", "graduation-cap", PALETTE[7]],
  ["personal", "Personal care", "expense", "sparkles", PALETTE[10]],
  ["gifts", "Gifts & donations", "expense", "gift", PALETTE[6]],
  ["fees", "Fees & charges", "expense", "receipt", PALETTE[8]],
  ["other-exp", "Other", "expense", "circle-dashed", PALETTE[8]],
  ["salary", "Salary", "income", "briefcase", PALETTE[0]],
  ["freelance", "Freelance", "income", "laptop", PALETTE[2]],
  ["interest", "Interest", "income", "percent", PALETTE[9]],
  ["refunds", "Refunds", "income", "rotate-ccw", PALETTE[3]],
  ["other-inc", "Other income", "income", "plus-circle", PALETTE[8]],
];

/** Stable ids ("cat-groceries") so demo data and imports can reference them. */
export function defaultCategories(stamp = nowStamp()): Category[] {
  return CATS.map(([key, name, kind, icon, color, parent]) => ({
    id: `cat-${key}`,
    name,
    kind,
    icon,
    color,
    parentId: parent ? `cat-${parent}` : null,
    archived: false,
    createdAt: stamp,
  }));
}

export function defaultMealTypes(): MealType[] {
  return [
    { id: "meal-breakfast", name: "Breakfast", order: 0, time: "08:00" },
    { id: "meal-lunch", name: "Lunch", order: 1, time: "13:00" },
    { id: "meal-snack", name: "Snacks", order: 2, time: "16:30" },
    { id: "meal-dinner", name: "Dinner", order: 3, time: "19:30" },
  ];
}

export const PROJECT_AREAS = ["Work", "Personal", "Study", "Fitness", "Finance", "Health", "Side projects"];

export function emptyDatabase(profile: Profile = defaultProfile()): Database {
  return {
    version: DB_VERSION,
    profile,
    accounts: [],
    categories: defaultCategories(),
    transactions: [],
    budgets: [],
    recurring: [],
    foods: [],
    mealTypes: defaultMealTypes(),
    foodEntries: [],
    savedMeals: [],
    plannedMeals: [],
    waterLogs: [],
    tasks: [],
    projects: [],
    events: [],
    habits: [],
    habitCompletions: [],
    goals: [],
    goalContributions: [],
    milestones: [],
    integrationSources: [],
    importRuns: [],
    importedRecords: [],
    holdings: [],
    externalEvents: [],
    calendarSources: [],
    dismissed: [],
  };
}

/** Makes any loaded/imported object conform to the current Database shape. */
export function normalizeDatabase(raw: unknown): Database {
  const base = emptyDatabase();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<Database>;
  const out = { ...base } as Database;
  for (const key of Object.keys(base) as (keyof Database)[]) {
    const bv = base[key];
    const rv = r[key];
    if (Array.isArray(bv)) (out as unknown as Record<string, unknown>)[key] = Array.isArray(rv) ? rv : bv;
  }
  const p = (r.profile ?? {}) as Partial<Profile>;
  out.profile = {
    ...base.profile,
    ...p,
    home: { ...base.profile.home, ...(p.home ?? {}) },
    nutrition: { ...base.profile.nutrition, ...(p.nutrition ?? {}) },
  };
  if (!out.mealTypes.length) out.mealTypes = defaultMealTypes();
  out.version = DB_VERSION;
  return out;
}
