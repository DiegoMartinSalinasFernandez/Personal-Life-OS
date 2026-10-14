/**
 * DEMO DATA GENERATOR
 * Builds a realistic, internally consistent sample workspace relative to
 * "today" so every chart and insight has something to show. All records are
 * flagged through `profile.demo = true`; Settings → Data can wipe them.
 */
import type { ID, Account, CalendarEvent, Database, FoodEntry, Goal, GoalContribution, Habit, HabitCompletion, MealItem, Milestone, PlannedMeal, Project, RecurringItem, SavedMeal, Task, Transaction, WaterLog } from "../domain/types";
import { addDays, addMonths, diffDays, startOfMonth, weekday, type ISODate } from "../domain/dates";
import { occurrencesBetween } from "../domain/recurrence";
import { defaultProfile, emptyDatabase, PALETTE } from "./defaults";
import { sampleFoods } from "./sample-foods";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemo(today: ISODate, base = defaultProfile()): Database {
  const r = rng(20261014);
  const between = (a: number, b: number) => a + r() * (b - a);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const cents = (a: number, b: number) => Math.round(between(a, b)) * 100 + pick([0, 0, 49, 99, 25, 50]);
  const stamp = new Date().toISOString();
  let n = 0;
  const id = (p: string) => `${p}-demo-${(n++).toString(36)}`;

  const db = emptyDatabase({
    ...base,
    name: base.name || "Alex",
    onboarded: true,
    demo: true,
    nutrition: { ...base.nutrition, proteinTarget: 140, calorieTarget: 2300, calorieTracking: true, waterTargetMl: 2500 },
  });
  const start = addDays(startOfMonth(addMonths(today, -4)), 0);

  // ───────────── Accounts ─────────────
  const acc = (name: string, type: Account["type"], opening: number, color: string, institution?: string): Account => ({
    id: id("acc"), name, type, currency: db.profile.currency, openingBalance: opening, openingDate: start, institution, color, archived: false, createdAt: stamp,
  });
  const checking = acc("Everyday Checking", "checking", 324000, PALETTE[0], "Northfield Bank");
  const savings = acc("High-Yield Savings", "savings", 1180000, PALETTE[5], "Northfield Bank");
  const card = acc("Rewards Credit Card", "credit", -48500, PALETTE[1], "Meridian Card");
  const cash = acc("Wallet", "cash", 12000, PALETTE[3]);
  db.accounts = [checking, savings, card, cash];

  const txs: Transaction[] = [];
  const add = (t: Omit<Transaction, "id" | "createdAt" | "tags"> & { tags?: string[] }) => {
    if (t.date > today) return;
    txs.push({ id: id("tx"), createdAt: stamp, tags: [], ...t });
  };

  // ───────────── Recurring items (settled in the past) ─────────────
  const rec = (kind: RecurringItem["kind"], name: string, amount: number, day: number, categoryId: string, accountId: string, merchant?: string, remind = 3): RecurringItem => ({
    id: id("rec"), kind, name, amount, accountId, categoryId, merchant, startDate: addDays(start, day - 1), rule: { freq: "monthly", interval: 1 }, remindDaysBefore: remind, active: true, createdAt: stamp,
  });
  const dueSoonDay = Number(addDays(today, 2).slice(8, 10));
  const recurring: RecurringItem[] = [
    rec("income", "Salary — first half", 285000, 1, "cat-salary", checking.id, "Acme Studio", 0),
    rec("income", "Salary — second half", 285000, 15, "cat-salary", checking.id, "Acme Studio", 0),
    rec("bill", "Rent", 145000, 1, "cat-rent", checking.id, "Parkview Properties"),
    rec("bill", "Electricity", 8900, 9, "cat-utilities", checking.id, "City Power"),
    rec("bill", "Internet", 5500, Math.min(dueSoonDay, 28), "cat-internet", checking.id, "FiberNet"),
    rec("subscription", "Mobile plan", 3500, 12, "cat-internet", card.id, "Telco"),
    rec("subscription", "Streaming", 1599, 20, "cat-subscriptions", card.id, "StreamFlix"),
    rec("subscription", "Gym membership", 3900, 3, "cat-health", card.id, "Forge Gym"),
    rec("subscription", "Cloud storage", 299, 24, "cat-subscriptions", card.id, "CloudBox"),
  ];
  recurring.push({ ...rec("subscription", "Design software", 14400, 5, "cat-subscriptions", card.id, "Pixelware"), rule: { freq: "yearly", interval: 1 }, startDate: addMonths(addDays(today, 18), -12) });
  db.recurring = recurring;
  for (const item of recurring) {
    for (const date of occurrencesBetween(item.startDate, item.rule, start, addDays(today, -1))) {
      // Leave this month's internet bill unpaid only if it is still upcoming; utilities vary.
      const amount = item.name === "Electricity" ? cents(72, 128) : item.amount;
      add({ type: item.kind === "income" ? "income" : "expense", amount, accountId: item.accountId, categoryId: item.categoryId, date, description: item.name, merchant: item.merchant, recurringId: item.id, occurrenceDate: date });
    }
  }

  // ───────────── Everyday spending ─────────────
  const groceries = ["Green Market", "FreshCo", "Corner Grocer", "Harvest Foods"];
  const dining = ["Noodle Bar", "Café Lumen", "Taqueria Sol", "Burger Lab", "Sushi Ten", "Bakery 27"];
  const shops = ["Bookshop", "Outfitters", "HomeGoods", "Online store"];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const wd = weekday(d);
    if (wd === 2 || wd === 6) add({ type: "expense", amount: cents(38, 118), accountId: card.id, categoryId: "cat-groceries", date: d, description: "Groceries", merchant: pick(groceries) });
    if (r() < 0.36) add({ type: "expense", amount: cents(9, 46), accountId: r() < 0.8 ? card.id : cash.id, categoryId: "cat-dining", date: d, description: pick(["Lunch", "Dinner", "Coffee & pastry", "Takeaway"]), merchant: pick(dining) });
    if (wd === 1) add({ type: "expense", amount: 4000, accountId: checking.id, categoryId: "cat-transit", date: d, description: "Weekly transit pass", merchant: "Metro" });
    if (r() < 0.06) add({ type: "expense", amount: cents(42, 68), accountId: card.id, categoryId: "cat-fuel", date: d, description: "Fuel", merchant: "Route 9 Fuel" });
    if (r() < 0.07) add({ type: "expense", amount: cents(18, 140), accountId: card.id, categoryId: "cat-shopping", date: d, description: pick(["Books", "Clothing", "Home supplies", "Electronics accessory"]), merchant: pick(shops) });
    if (r() < 0.05) add({ type: "expense", amount: cents(12, 55), accountId: card.id, categoryId: "cat-entertainment", date: d, description: pick(["Cinema", "Concert tickets", "Museum"]), merchant: pick(["Odeon", "Ticketline", "City Museum"]) });
    if (r() < 0.03) add({ type: "expense", amount: cents(15, 60), accountId: card.id, categoryId: "cat-personal", date: d, description: pick(["Haircut", "Pharmacy"]), merchant: pick(["Studio Cut", "Pharmacy+"]) });
    if (d.endsWith("-18")) add({ type: "transfer", amount: 50000, accountId: checking.id, toAccountId: savings.id, categoryId: null, date: d, description: "Monthly savings transfer" });
    if (d.endsWith("-25")) add({ type: "transfer", amount: 95000, accountId: checking.id, toAccountId: card.id, categoryId: null, date: d, description: "Credit card payment" });
    if (d.endsWith("-28")) add({ type: "income", amount: Math.round(between(1100, 1500)), accountId: savings.id, categoryId: "cat-interest", date: d, description: "Interest" });
  }
  add({ type: "income", amount: 62000, accountId: checking.id, categoryId: "cat-freelance", date: addDays(today, -9), description: "Logo design project", merchant: "Bright Co.", tags: ["side-income"] });
  add({ type: "expense", amount: 38900, accountId: card.id, categoryId: "cat-travel", date: addDays(today, -26), description: "Flights — weekend trip", merchant: "SkyAir", tags: ["trip"] });
  add({ type: "expense", amount: 14000, accountId: cash.id, categoryId: "cat-gifts", date: addDays(today, -12), description: "Birthday gift", tags: ["family"] });
  db.transactions = txs.sort((a, b) => (a.date < b.date ? 1 : -1));

  db.budgets = [
    ["cat-groceries", 60000], ["cat-dining", 22000], ["cat-transport", 22000], ["cat-shopping", 20000], ["cat-entertainment", 10000], ["cat-subscriptions", 4500],
  ].map(([categoryId, amount]) => ({ id: id("bud"), categoryId: categoryId as string, amount: amount as number, warnAt: 0.8, createdAt: stamp }));

  // ───────────── Nutrition ─────────────
  db.foods = sampleFoods(stamp);
  const fav = new Set(["food-greek-yogurt", "food-chicken-breast", "food-whey", "food-egg", "food-oats"]);
  db.foods = db.foods.map((f) => (fav.has(f.id) ? { ...f, favorite: true } : f));
  db.foods.push({ id: id("food"), name: "Overnight oats (homemade)", baseUnit: "unit", per: { protein: 28, calories: 430, carbs: 52, fat: 11 }, portions: [], source: "custom", favorite: true, archived: false, createdAt: stamp });
  const F = (k: string) => db.foods.find((f) => f.id === `food-${k}`)!;
  const snap = (k: string) => {
    const f = F(k);
    return { foodId: f.id, foodName: f.name, baseUnit: f.baseUnit, per: f.per, portions: f.portions };
  };
  type Line = [food: string, q: number, unit: FoodEntry["unit"]];
  const breakfasts: Line[][] = [
    [["greek-yogurt", 1, "portion:greek-yogurt-p0"], ["blueberries", 80, "g"], ["oats", 40, "g"]],
    [["egg", 3, "unit"], ["egg-white", 100, "g"], ["bread-ww", 2, "portion:bread-ww-p0"]],
    [["oats", 1, "portion:oats-p0"], ["whey", 1, "portion:whey-p0"], ["banana", 1, "portion:banana-p0"], ["milk-skim", 200, "ml"]],
    [["skyr", 2, "portion:skyr-p0"], ["almonds", 20, "g"], ["blueberries", 80, "g"]],
  ];
  const lunches: Line[][] = [
    [["chicken-breast", 190, "g"], ["rice-brown", 180, "g"], ["broccoli", 100, "g"]],
    [["tuna-can", 1.5, "portion:tuna-can-p0"], ["mixed-salad", 120, "g"], ["chickpeas", 150, "g"], ["olive-oil", 10, "ml"]],
    [["tofu", 250, "g"], ["quinoa", 180, "g"], ["edamame", 100, "g"]],
    [["turkey-breast", 160, "g"], ["tortilla", 2, "unit"], ["hummus", 40, "g"]],
  ];
  const dinners: Line[][] = [
    [["salmon", 1, "portion:salmon-p0"], ["sweet-potato", 180, "g"], ["broccoli", 120, "g"]],
    [["beef-lean", 170, "g"], ["pasta", 180, "g"], ["spinach", 30, "g"]],
    [["chicken-thigh", 180, "g"], ["rice-white", 160, "g"], ["edamame", 80, "g"]],
    [["lentils", 250, "g"], ["tofu", 150, "g"], ["rice-brown", 120, "g"]],
    [["shrimp", 200, "g"], ["quinoa", 150, "g"], ["avocado", 60, "g"]],
  ];
  const snacks: Line[][] = [[["protein-bar", 1, "unit"]], [["cottage", 1, "portion:cottage-p0"]], [["whey", 1, "portion:whey-p0"], ["milk-skim", 250, "ml"]], [["peanut-butter", 1, "portion:peanut-butter-p0"], ["apple", 1, "portion:apple-p0"]], [["almonds", 28, "g"]]];

  const entries: FoodEntry[] = [];
  const logMeal = (date: ISODate, mealTypeId: string, time: string, lines: Line[]) => {
    for (const [k, quantity, unit] of lines) entries.push({ id: id("fe"), createdAt: stamp, date, time, mealTypeId, quantity, unit, ...snap(k) });
  };
  for (let i = 27; i >= 1; i--) {
    const d = addDays(today, -i);
    if (r() < 0.06) continue; // occasional unlogged day
    logMeal(d, "meal-breakfast", "08:" + String(Math.floor(between(0, 45))).padStart(2, "0"), pick(breakfasts));
    if (r() < 0.93) logMeal(d, "meal-lunch", "13:10", pick(lunches));
    if (r() < 0.75) logMeal(d, "meal-snack", "16:40", pick(snacks));
    if (r() < 0.95) logMeal(d, "meal-dinner", "19:45", pick(dinners));
  }
  logMeal(today, "meal-breakfast", "08:15", breakfasts[2]);
  db.foodEntries = entries;

  const water: WaterLog[] = [];
  for (let i = 13; i >= 1; i--) water.push({ id: id("w"), createdAt: stamp, date: addDays(today, -i), ml: Math.round(between(1500, 2900) / 250) * 250 });
  water.push({ id: id("w"), createdAt: stamp, date: today, ml: 750 });
  db.waterLogs = water;

  const items = (lines: Line[]): MealItem[] => lines.map(([k, quantity, unit]) => ({ foodId: F(k).id, quantity, unit }));
  const saved: SavedMeal[] = [
    { id: id("sm"), createdAt: stamp, name: "Protein oats", mealTypeId: "meal-breakfast", items: items(breakfasts[2]), favorite: true },
    { id: id("sm"), createdAt: stamp, name: "Chicken & rice bowl", mealTypeId: "meal-lunch", items: items(lunches[0]), favorite: true },
    { id: id("sm"), createdAt: stamp, name: "Salmon plate", mealTypeId: "meal-dinner", items: items(dinners[0]), favorite: false },
    { id: id("sm"), createdAt: stamp, name: "Shake", mealTypeId: "meal-snack", items: items(snacks[2]), favorite: true },
  ];
  db.savedMeals = saved;
  const plan = (date: ISODate, mealTypeId: string, lines: Line[], note?: string): PlannedMeal => ({ id: id("pm"), createdAt: stamp, date, mealTypeId, items: items(lines), note, loggedAt: null });
  db.plannedMeals = [
    plan(today, "meal-lunch", lunches[0], "Meal-prepped on Sunday"),
    plan(today, "meal-dinner", dinners[0]),
    plan(addDays(today, 1), "meal-breakfast", breakfasts[0]),
    plan(addDays(today, 1), "meal-lunch", lunches[1]),
    plan(addDays(today, 1), "meal-dinner", dinners[2]),
    plan(addDays(today, 2), "meal-lunch", lunches[2]),
    plan(addDays(today, 2), "meal-dinner", dinners[4]),
  ];

  // ───────────── Projects & tasks ─────────────
  const proj = (name: string, area: string, color: string, deadline: ISODate | null, description?: string): Project => ({ id: id("prj"), createdAt: stamp, name, area, color, deadline, description, archived: false });
  const launch = proj("Q4 product launch", "Work", PALETTE[2], addDays(today, 24), "Ship the redesigned onboarding flow.");
  const thesis = proj("Thesis research", "Study", PALETTE[4], addDays(today, 60), "Literature review and data analysis chapters.");
  const home = proj("Apartment refresh", "Personal", PALETTE[1], null);
  const marathon = proj("Half-marathon prep", "Fitness", PALETTE[6], addDays(today, 45));
  const money = proj("Money admin", "Finance", PALETTE[0], null);
  db.projects = [launch, thesis, home, marathon, money];

  const task = (title: string, p: Partial<Task> = {}): Task => ({
    id: id("task"), createdAt: stamp, title, done: false, completedAt: null, completedOn: null, priority: "medium", focus: false, dueDate: null, startDate: null, startTime: null, endTime: null, projectId: null, tags: [], estimateMin: null, recurrence: null, subtasks: [], reminderMinBefore: null, ...p,
  });
  const done = (t: Task, daysAgo: number): Task => ({ ...t, done: true, completedOn: addDays(today, -daysAgo), completedAt: `${addDays(today, -daysAgo)}T17:00:00.000Z` });
  const tasks: Task[] = [
    task("Finalize onboarding copy", { projectId: launch.id, priority: "urgent", dueDate: today, focus: true, startTime: "10:00", endTime: "11:30", estimateMin: 90, tags: ["writing"], subtasks: [{ id: id("st"), title: "Welcome screen", done: true }, { id: id("st"), title: "Permissions step", done: false }, { id: id("st"), title: "Empty states", done: false }] }),
    task("Review analytics dashboard PR", { projectId: launch.id, priority: "high", dueDate: today, estimateMin: 45, tags: ["review"] }),
    task("Book physiotherapy appointment", { priority: "medium", dueDate: today, estimateMin: 10, tags: ["health"] }),
    task("Read two papers on habit formation", { projectId: thesis.id, priority: "high", dueDate: addDays(today, 1), focus: true, estimateMin: 120 }),
    task("Send invoice to Bright Co.", { projectId: money.id, priority: "high", dueDate: addDays(today, -2), estimateMin: 15 }),
    task("Return library books", { priority: "low", dueDate: addDays(today, -1) }),
    task("Prepare launch checklist", { projectId: launch.id, priority: "high", dueDate: addDays(today, 3), estimateMin: 60 }),
    task("Write methods section draft", { projectId: thesis.id, priority: "medium", dueDate: addDays(today, 6), estimateMin: 180 }),
    task("Order paint samples", { projectId: home.id, priority: "low", dueDate: addDays(today, 5) }),
    task("Measure living room for shelves", { projectId: home.id, priority: "low" }),
    task("10 km tempo run", { projectId: marathon.id, priority: "medium", dueDate: addDays(today, 2), startTime: "07:00", endTime: "08:00", estimateMin: 60 }),
    task("Plan long-run route", { projectId: marathon.id, priority: "low", dueDate: addDays(today, 4) }),
    task("Weekly review", { priority: "medium", dueDate: addDays(today, (7 - weekday(today)) % 7), recurrence: { freq: "weekly", interval: 1, byWeekday: [0] }, estimateMin: 30, tags: ["routine"] }),
    task("Pay credit card statement", { projectId: money.id, priority: "high", dueDate: addDays(startOfMonth(addMonths(today, 1)), 24), recurrence: { freq: "monthly", interval: 1 } }),
    task("Renew passport", { priority: "medium", dueDate: addDays(today, 20), notes: "Need new photos first." }),
    done(task("Draft launch announcement", { projectId: launch.id, priority: "high", dueDate: addDays(today, -1) }), 1),
    done(task("User interview synthesis", { projectId: launch.id, priority: "high" }), 2),
    done(task("Fix onboarding illustrations", { projectId: launch.id, priority: "medium" }), 3),
    done(task("Outline literature review", { projectId: thesis.id, priority: "medium" }), 4),
    done(task("Buy running shoes", { projectId: marathon.id, priority: "low" }), 5),
    done(task("Set up savings transfer", { projectId: money.id, priority: "medium" }), 6),
    done(task("Clean out closet", { projectId: home.id, priority: "low" }), 8),
    done(task("Stakeholder update", { projectId: launch.id, priority: "medium" }), 9),
    done(task("Collect survey data", { projectId: thesis.id, priority: "high" }), 10),
    done(task("Call landlord about heater", { priority: "medium" }), 11),
    done(task("Sprint planning prep", { projectId: launch.id }), 0),
  ];
  db.tasks = tasks;

  // ───────────── Events ─────────────
  const ev = (title: string, date: ISODate, startTime: string | null, endTime: string | null, color: string, p: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id: id("ev"), createdAt: stamp, title, date, allDay: !startTime, startTime, endTime, color, recurrence: null, exDates: [], projectId: null, ...p,
  });
  const monday = addDays(today, -((weekday(today) + 6) % 7) - 14);
  db.events = [
    ev("Team standup", monday, "09:30", "09:45", PALETTE[2], { recurrence: { freq: "weekly", interval: 1, byWeekday: [1, 2, 3, 4, 5] }, projectId: launch.id, location: "Video call" }),
    ev("Yoga class", monday, "18:00", "19:00", PALETTE[6], { recurrence: { freq: "weekly", interval: 1, byWeekday: [2, 4] }, location: "Studio North" }),
    ev("Design sync", today, "14:00", "15:00", PALETTE[2], { projectId: launch.id }),
    ev("Thesis advisor meeting", addDays(today, 2), "11:00", "11:45", PALETTE[4], { projectId: thesis.id, location: "Room 3.12" }),
    ev("Dentist", addDays(today, 3), "10:00", "10:45", PALETTE[5], { location: "Smile Clinic" }),
    ev("Dinner with friends", addDays(today, 4), "19:30", "22:00", PALETTE[1]),
    ev("Long run", addDays(today, 5), "08:00", "09:45", PALETTE[6], { projectId: marathon.id }),
    ev("Launch day", launch.deadline!, null, null, PALETTE[2], { projectId: launch.id }),
    ev("Quarterly budget review", addDays(today, 9), "17:30", "18:30", PALETTE[0]),
  ];

  // ───────────── Habits ─────────────
  const habitStart = addDays(today, -60);
  const habit = (name: string, icon: string, color: string, schedule: Habit["schedule"], reminderTime: string | null = null): Habit => ({ id: id("hab"), createdAt: stamp, name, icon, color, schedule, startDate: habitStart, reminderTime, archived: false });
  const habits = [
    habit("Exercise", "dumbbell", PALETTE[6], { type: "days", days: [1, 3, 5, 6] }, "07:00"),
    habit("Read 20 minutes", "book-open", PALETTE[4], { type: "daily" }, "21:30"),
    habit("Drink 2 L of water", "droplets", PALETTE[5], { type: "daily" }),
    habit("Meal prep", "chef-hat", PALETTE[1], { type: "days", days: [0] }),
    habit("Review finances", "wallet", PALETTE[0], { type: "days", days: [0] }),
    habit("Lights out by 23:00", "moon", PALETTE[8], { type: "daily" }),
  ];
  db.habits = habits;
  const comps: HabitCompletion[] = [];
  const odds = [0.82, 0.78, 0.7, 0.85, 0.9, 0.62];
  habits.forEach((h, hi) => {
    for (let i = diffDays(habitStart, today); i >= 1; i--) {
      const d = addDays(today, -i);
      const sched = h.schedule.type === "daily" || h.schedule.days.includes(weekday(d));
      // Keep the last week strong so streaks are visible.
      if (sched && r() < (i <= 7 ? 0.97 : odds[hi])) comps.push({ id: id("hc"), habitId: h.id, date: d });
    }
  });
  comps.push({ id: id("hc"), habitId: habits[2].id, date: today });
  db.habitCompletions = comps;

  // ───────────── Goals ─────────────
  const goal = (g: Omit<Goal, "id" | "createdAt" | "archived" | "completedAt" | "linkedProjectIds"> & { linkedProjectIds?: ID[] }): Goal => ({ id: id("goal"), createdAt: stamp, archived: false, completedAt: null, linkedProjectIds: [], ...g });
  const emergency = goal({ title: "Emergency fund", module: "finance", category: "Safety net", startDate: addMonths(today, -5), targetDate: addMonths(today, 10), measure: { type: "money", targetAmount: 1500000, currency: db.profile.currency }, description: "Six months of essential expenses." });
  const trip = goal({ title: "Japan trip", module: "finance", category: "Travel", startDate: addMonths(today, -3), targetDate: addMonths(today, 6), measure: { type: "money", targetAmount: 400000, currency: db.profile.currency } });
  const protein = goal({ title: "Hit protein target 20 of 30 days", module: "nutrition", category: "Consistency", startDate: addDays(today, -30), targetDate: null, measure: { type: "protein_days", windowDays: 30, targetDays: 20 } });
  const run = goal({ title: "40 workouts before race day", module: "activities", category: "Fitness", startDate: addDays(today, -45), targetDate: marathon.deadline, measure: { type: "habit", habitId: habits[0].id, targetCount: 40 }, linkedProjectIds: [marathon.id] });
  const thesisGoal = goal({ title: "Submit thesis draft", module: "activities", category: "Study", startDate: addDays(today, -40), targetDate: thesis.deadline, measure: { type: "milestones" }, linkedProjectIds: [thesis.id] });
  db.goals = [emergency, trip, protein, run, thesisGoal];
  const contributions: GoalContribution[] = [];
  for (let m = 5; m >= 1; m--) contributions.push({ id: id("gc"), createdAt: stamp, goalId: emergency.id, amount: 60000 + (m % 2) * 10000, date: addDays(startOfMonth(addMonths(today, -m + 1)), 17), note: "Monthly transfer" });
  contributions.unshift({ id: id("gc"), createdAt: stamp, goalId: emergency.id, amount: 420000, date: addMonths(today, -5), note: "Starting balance" });
  for (let m = 3; m >= 1; m--) contributions.push({ id: id("gc"), createdAt: stamp, goalId: trip.id, amount: 45000, date: addDays(startOfMonth(addMonths(today, -m + 1)), 1) });
  db.goalContributions = contributions.filter((c) => c.date <= today);
  const ms = (title: string, done: boolean, order: number, dueDate: ISODate | null): Milestone => ({ id: id("ms"), createdAt: stamp, goalId: thesisGoal.id, title, done, order, dueDate });
  db.milestones = [
    ms("Research question approved", true, 0, addDays(today, -30)),
    ms("Literature review complete", true, 1, addDays(today, -5)),
    ms("Data collection", false, 2, addDays(today, 14)),
    ms("Analysis chapter", false, 3, addDays(today, 40)),
    ms("Full draft to advisor", false, 4, thesis.deadline),
  ];

  return db;
}
