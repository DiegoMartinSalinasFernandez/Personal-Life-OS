"use client";

import { create } from "zustand";
import type { CollectionKey, Database, FoodEntry, Food, ID, MealItem, MealType, NutritionPrefs, Profile, Task, Transaction } from "../domain/types";
import { addDays, todayISO, type ISODate } from "../domain/dates";
import { createAdapter, type DataAdapter } from "../data/adapter";
import { emptyDatabase, defaultProfile, normalizeDatabase, nowStamp, uid } from "../data/defaults";
import { generateDemo } from "../data/seed";
import { sampleFoods } from "../data/sample-foods";
import { nextRecurringDue } from "../calc/productivity";

type Item<K extends CollectionKey> = Database[K][number];
type NewItem<K extends CollectionKey> = Omit<Item<K>, "id" | "createdAt"> & { id?: ID };

export type SaveState = "idle" | "saving" | "saved" | "error";

interface State {
  db: Database;
  hydrated: boolean;
  saveState: SaveState;
  adapter: DataAdapter | null;

  hydrate(): void;
  replace(db: Database): void;

  // Generic CRUD
  add<K extends CollectionKey>(key: K, item: NewItem<K>): ID;
  addMany<K extends CollectionKey>(key: K, items: NewItem<K>[]): ID[];
  update<K extends CollectionKey>(key: K, id: ID, patch: Partial<Item<K>>): void;
  remove<K extends CollectionKey>(key: K, id: ID): void;

  // Profile
  setProfile(patch: Partial<Profile>): void;
  setNutrition(patch: Partial<NutritionPrefs>): void;
  dismiss(key: string): void;

  // Finance
  deleteAccount(id: ID): void;
  deleteCategory(id: ID): void;
  settleOccurrence(recurringId: ID, date: ISODate, overrides?: Partial<Transaction>): ID | null;
  deleteRecurring(id: ID): void;
  deleteGoal(id: ID): void;

  // Nutrition
  logFood(food: Food, e: Omit<FoodEntry, "id" | "createdAt" | "foodId" | "foodName" | "baseUnit" | "per" | "portions">): ID;
  logItems(items: MealItem[], date: ISODate, mealTypeId: ID, time?: string): number;
  logPlannedMeal(plannedId: ID, time?: string): number;
  copyEntries(fromDate: ISODate, toDate: ISODate, mealTypeId?: ID): number;
  copyPlan(fromDate: ISODate, toDate: ISODate): number;
  addWater(date: ISODate, ml: number): void;
  deleteFood(id: ID): void;

  // Activities
  toggleTask(id: ID, today: ISODate): void;
  toggleSubtask(taskId: ID, subtaskId: ID): void;
  deleteTask(id: ID): void;
  bulkTasks(ids: ID[], action: "complete" | "delete" | "reopen", today: ISODate): void;
  toggleHabit(habitId: ID, date: ISODate): void;
  deleteHabit(id: ID): void;
  deleteProject(id: ID, withTasks: boolean): void;
  skipEventOccurrence(eventId: ID, date: ISODate): void;

  // Data management
  loadDemo(): void;
  startFresh(profile: Partial<Profile>): void;
  clearDemoData(): void;
  importJSON(json: string): void;
  wipe(): void;
  setMealTypes(fn: (m: MealType[]) => MealType[]): void;
}

const stampPatch = <T>(patch: T) => ({ ...patch, updatedAt: nowStamp() });

export const useStore = create<State>()((set, get) => {
  const mutate = (fn: (db: Database) => Database) => set((s) => ({ db: fn(s.db) }));

  return {
    db: emptyDatabase(),
    hydrated: false,
    saveState: "idle",
    adapter: null,

    hydrate() {
      if (get().hydrated) return;
      const adapter = createAdapter();
      const loaded = adapter.load();
      set({ adapter, db: loaded ?? emptyDatabase(), hydrated: true });
    },
    replace(db) {
      set({ db: normalizeDatabase(db) });
    },

    add(key, item) {
      const id = item.id ?? uid();
      mutate((db) => ({ ...db, [key]: [...(db[key] as unknown[]), { ...item, id, createdAt: nowStamp() }] }));
      return id;
    },
    addMany(key, items) {
      const withIds = items.map((i) => ({ ...i, id: i.id ?? uid(), createdAt: nowStamp() }));
      mutate((db) => ({ ...db, [key]: [...(db[key] as unknown[]), ...withIds] }));
      return withIds.map((i) => i.id);
    },
    update(key, id, patch) {
      mutate((db) => ({ ...db, [key]: (db[key] as { id: ID }[]).map((x) => (x.id === id ? { ...x, ...stampPatch(patch) } : x)) }));
    },
    remove(key, id) {
      mutate((db) => ({ ...db, [key]: (db[key] as { id: ID }[]).filter((x) => x.id !== id) }));
    },

    setProfile(patch) {
      mutate((db) => ({ ...db, profile: { ...db.profile, ...patch } }));
    },
    setNutrition(patch) {
      mutate((db) => ({ ...db, profile: { ...db.profile, nutrition: { ...db.profile.nutrition, ...patch } } }));
    },
    dismiss(key) {
      mutate((db) => (db.dismissed.includes(key) ? db : { ...db, dismissed: [...db.dismissed.slice(-300), key] }));
    },

    // ───────────── Finance ─────────────
    deleteAccount(id) {
      mutate((db) => {
        const recurringIds = new Set(db.recurring.filter((r) => r.accountId === id).map((r) => r.id));
        return {
          ...db,
          accounts: db.accounts.filter((a) => a.id !== id),
          transactions: db.transactions.filter((t) => t.accountId !== id && t.toAccountId !== id),
          recurring: db.recurring.filter((r) => !recurringIds.has(r.id)),
        };
      });
    },
    deleteCategory(id) {
      mutate((db) => {
        const cat = db.categories.find((c) => c.id === id);
        const parent = cat?.parentId ?? null;
        return {
          ...db,
          categories: db.categories.filter((c) => c.id !== id).map((c) => (c.parentId === id ? { ...c, parentId: null } : c)),
          // Transactions keep their history; they move to the parent (or Uncategorised).
          transactions: db.transactions.map((t) => (t.categoryId === id ? { ...t, categoryId: parent } : t)),
          recurring: db.recurring.map((r) => (r.categoryId === id ? { ...r, categoryId: parent } : r)),
          budgets: db.budgets.filter((b) => b.categoryId !== id),
        };
      });
    },
    settleOccurrence(recurringId, date, overrides = {}) {
      const { db } = get();
      const item = db.recurring.find((r) => r.id === recurringId);
      if (!item) return null;
      // Idempotent: an occurrence can only be settled once.
      if (db.transactions.some((t) => t.recurringId === recurringId && t.occurrenceDate === date)) return null;
      return get().add("transactions", {
        type: item.kind === "income" ? "income" : "expense",
        amount: item.amount,
        accountId: item.accountId,
        toAccountId: null,
        categoryId: item.categoryId,
        date,
        description: item.name,
        merchant: item.merchant,
        tags: [],
        recurringId,
        occurrenceDate: date,
        ...overrides,
      });
    },
    deleteRecurring(id) {
      // Past settled transactions stay (they happened); they just lose the link.
      mutate((db) => ({
        ...db,
        recurring: db.recurring.filter((r) => r.id !== id),
        transactions: db.transactions.map((t) => (t.recurringId === id ? { ...t, recurringId: null } : t)),
      }));
    },
    deleteGoal(id) {
      mutate((db) => ({
        ...db,
        goals: db.goals.filter((g) => g.id !== id),
        goalContributions: db.goalContributions.filter((c) => c.goalId !== id),
        milestones: db.milestones.filter((m) => m.goalId !== id),
      }));
    },

    // ───────────── Nutrition ─────────────
    logFood(food, e) {
      return get().add("foodEntries", { ...e, foodId: food.id, foodName: food.name, baseUnit: food.baseUnit, per: food.per, portions: food.portions });
    },
    logItems(items, date, mealTypeId, time) {
      const foods = new Map(get().db.foods.map((f) => [f.id, f]));
      const entries = items
        .map((it) => {
          const f = foods.get(it.foodId);
          if (!f) return null;
          return { date, time, mealTypeId, quantity: it.quantity, unit: it.unit, foodId: f.id, foodName: f.name, baseUnit: f.baseUnit, per: f.per, portions: f.portions };
        })
        .filter(Boolean) as NewItem<"foodEntries">[];
      get().addMany("foodEntries", entries);
      return entries.length;
    },
    logPlannedMeal(plannedId, time) {
      const pm = get().db.plannedMeals.find((p) => p.id === plannedId);
      if (!pm || pm.loggedAt) return 0;
      const n = get().logItems(pm.items, pm.date, pm.mealTypeId, time);
      get().update("plannedMeals", plannedId, { loggedAt: nowStamp() });
      return n;
    },
    copyEntries(fromDate, toDate, mealTypeId) {
      const src = get().db.foodEntries.filter((e) => e.date === fromDate && (!mealTypeId || e.mealTypeId === mealTypeId));
      get().addMany("foodEntries", src.map(({ id: _id, createdAt: _c, updatedAt: _u, ...rest }) => ({ ...rest, date: toDate })));
      return src.length;
    },
    copyPlan(fromDate, toDate) {
      const src = get().db.plannedMeals.filter((p) => p.date === fromDate);
      get().addMany("plannedMeals", src.map((p) => ({ date: toDate, mealTypeId: p.mealTypeId, items: p.items, note: p.note, loggedAt: null })));
      return src.length;
    },
    addWater(date, ml) {
      if (!ml) return;
      get().add("waterLogs", { date, ml });
    },
    deleteFood(id) {
      // Logged entries keep their nutrient snapshot; plans/saved meals drop the item.
      mutate((db) => ({
        ...db,
        foods: db.foods.filter((f) => f.id !== id),
        foodEntries: db.foodEntries.map((e) => (e.foodId === id ? { ...e, foodId: null } : e)),
        savedMeals: db.savedMeals.map((m) => ({ ...m, items: m.items.filter((i) => i.foodId !== id) })),
        plannedMeals: db.plannedMeals.map((m) => ({ ...m, items: m.items.filter((i) => i.foodId !== id) })),
      }));
    },

    // ───────────── Activities ─────────────
    toggleTask(id, today) {
      const task = get().db.tasks.find((t) => t.id === id);
      if (!task) return;
      if (task.done) {
        // Reopen. Remove an untouched auto-spawned next instance so recurrence never duplicates.
        const next = task.spawnedNextId ? get().db.tasks.find((t) => t.id === task.spawnedNextId) : null;
        if (next && !next.done) get().remove("tasks", next.id);
        get().update("tasks", id, { done: false, completedAt: null, completedOn: null, spawnedNextId: null });
        return;
      }
      let spawnedNextId: ID | null = null;
      if (task.recurrence && !task.spawnedNextId) {
        const due = nextRecurringDue(task, today);
        if (due && (!task.recurrence.until || due <= task.recurrence.until)) {
          const shift = task.dueDate && task.startDate ? Math.round((Date.parse(due) - Date.parse(task.dueDate)) / 86400000) : 0;
          const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = task;
          spawnedNextId = get().add("tasks", {
            ...rest,
            done: false,
            completedAt: null,
            completedOn: null,
            spawnedNextId: null,
            dueDate: due,
            startDate: task.startDate ? addDays(task.startDate, shift) : null,
            subtasks: task.subtasks.map((s) => ({ ...s, id: uid(), done: false })),
          } as NewItem<"tasks">);
        }
      }
      get().update("tasks", id, { done: true, completedAt: nowStamp(), completedOn: today, spawnedNextId: spawnedNextId ?? task.spawnedNextId ?? null });
    },
    toggleSubtask(taskId, subtaskId) {
      const t = get().db.tasks.find((x) => x.id === taskId);
      if (!t) return;
      get().update("tasks", taskId, { subtasks: t.subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s)) });
    },
    deleteTask(id) {
      mutate((db) => ({ ...db, tasks: db.tasks.filter((t) => t.id !== id).map((t) => (t.spawnedNextId === id ? { ...t, spawnedNextId: null } : t)) }));
    },
    bulkTasks(ids, action, today) {
      if (action === "delete") {
        const set_ = new Set(ids);
        mutate((db) => ({ ...db, tasks: db.tasks.filter((t) => !set_.has(t.id)) }));
        return;
      }
      for (const id of ids) {
        const t = get().db.tasks.find((x) => x.id === id);
        if (t && (action === "complete" ? !t.done : t.done)) get().toggleTask(id, today);
      }
    },
    toggleHabit(habitId, date) {
      const existing = get().db.habitCompletions.find((c) => c.habitId === habitId && c.date === date);
      if (existing) get().remove("habitCompletions", existing.id);
      else mutate((db) => ({ ...db, habitCompletions: [...db.habitCompletions, { id: uid(), habitId, date }] }));
    },
    deleteHabit(id) {
      mutate((db) => ({
        ...db,
        habits: db.habits.filter((h) => h.id !== id),
        habitCompletions: db.habitCompletions.filter((c) => c.habitId !== id),
        goals: db.goals.map((g) => (g.measure.type === "habit" && g.measure.habitId === id ? { ...g, measure: { type: "milestones" } } : g)),
      }));
    },
    deleteProject(id, withTasks) {
      mutate((db) => ({
        ...db,
        projects: db.projects.filter((p) => p.id !== id),
        tasks: withTasks ? db.tasks.filter((t) => t.projectId !== id) : db.tasks.map((t) => (t.projectId === id ? { ...t, projectId: null } : t)),
        events: db.events.map((e) => (e.projectId === id ? { ...e, projectId: null } : e)),
        goals: db.goals.map((g) => ({ ...g, linkedProjectIds: g.linkedProjectIds.filter((p) => p !== id) })),
      }));
    },
    skipEventOccurrence(eventId, date) {
      const ev = get().db.events.find((e) => e.id === eventId);
      if (!ev) return;
      if (!ev.recurrence) get().remove("events", eventId);
      else get().update("events", eventId, { exDates: [...ev.exDates, date] });
    },

    // ───────────── Data management ─────────────
    loadDemo() {
      const profile = get().db.profile;
      set({ db: generateDemo(todayISO(profile.timezone), { ...defaultProfile(), ...profile, demo: true }) });
    },
    startFresh(patch) {
      const base = { ...defaultProfile(), ...get().db.profile, ...patch, onboarded: true, demo: false };
      const db = emptyDatabase(base);
      db.foods = sampleFoods(nowStamp());
      set({ db });
    },
    clearDemoData() {
      const { profile } = get().db;
      const db = emptyDatabase({ ...profile, demo: false, onboarded: true });
      db.foods = sampleFoods(nowStamp());
      set({ db });
    },
    importJSON(json) {
      const parsed = JSON.parse(json);
      if (!parsed || typeof parsed !== "object" || !("profile" in parsed)) throw new Error("This file is not a Life OS export.");
      set({ db: normalizeDatabase(parsed) });
    },
    wipe() {
      get().adapter?.clear();
      set({ db: emptyDatabase() });
    },
    setMealTypes(fn) {
      mutate((db) => ({ ...db, mealTypes: fn(db.mealTypes) }));
    },
  };
});

/** Wires persistence: saves after changes (debounced) and syncs other tabs. */
export function startPersistence(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let applyingRemote = false;
  const unsub = useStore.subscribe((s, prev) => {
    if (!s.hydrated || s.db === prev.db || applyingRemote) return;
    if (timer) clearTimeout(timer);
    useStore.setState({ saveState: "saving" });
    timer = setTimeout(() => {
      try {
        useStore.getState().adapter?.save(useStore.getState().db);
        useStore.setState({ saveState: "saved" });
      } catch {
        useStore.setState({ saveState: "error" });
      }
    }, 250);
  });
  const remoteUnsub = useStore.getState().adapter?.subscribe?.((db) => {
    applyingRemote = true;
    useStore.setState({ db });
    applyingRemote = false;
  });
  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      try { useStore.getState().adapter?.save(useStore.getState().db); } catch {}
    }
  };
  window.addEventListener("beforeunload", flush);
  return () => {
    unsub();
    remoteUnsub?.();
    window.removeEventListener("beforeunload", flush);
  };
}

export type { Task };
