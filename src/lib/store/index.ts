"use client";

import { create } from "zustand";
import type { CalendarProviderId, CalendarSourceConfig, CollectionKey, Database, ExternalEvent, FoodEntry, Food, Holding, ID, ImportRun, IntegrationSource, MealItem, MealType, NutritionPrefs, Profile, Task, Transaction } from "../domain/types";
import { defaultResolution, recordToTransactions, stageRecords, type RawRecord, type Resolution } from "../integrations/importer";
import { activeFinanceCount, canAddFinanceConnection } from "../integrations/catalog";
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

  // Integrations
  addSource(src: Omit<IntegrationSource, "id" | "createdAt" | "status" | "connectedAt" | "disconnectedAt" | "lastImportAt" | "lastError">, serverConnected?: string[]): { ok: true; id: ID } | { ok: false; reason: string };
  disconnectSource(id: ID): void;
  stageImport(sourceId: ID, rows: RawRecord[], meta: { kind: ImportRun["kind"]; fileName?: string; errors?: string[] }): ImportRun | null;
  resolveRecord(recordId: ID, res: Resolution): { ok: boolean; reason?: string };
  replaceHoldings(accountId: ID, sourceId: ID | null, holdings: Omit<Holding, "id" | "createdAt" | "accountId" | "sourceId" | "origin">[], origin: Holding["origin"]): number;
  setExternalEvents(provider: CalendarProviderId, range: { start: string; end: string }, events: ExternalEvent[]): void;
  setCalendarSource(id: CalendarProviderId, patch: Partial<CalendarSourceConfig>): void;
  removeCalendarProvider(id: CalendarProviderId): void;
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

    // ───────────── Integrations ─────────────
    addSource(src, serverConnected = []) {
      const { db } = get();
      const active = db.integrationSources.filter((x) => x.status === "active");
      const already = src.provider !== "custom" && active.some((x) => x.provider === src.provider);
      if (already) return { ok: false, reason: "This provider is already connected." };
      const count = activeFinanceCount({ localActiveProviders: active.map((x) => x.provider), serverConnected: serverConnected.filter((p) => p !== src.provider) });
      const check = canAddFinanceConnection(count);
      if (!check.ok) return { ok: false, reason: check.reason! };
      const id = get().add("integrationSources", { ...src, status: "active", connectedAt: nowStamp(), disconnectedAt: null, lastImportAt: null, lastError: null });
      return { ok: true, id };
    },
    disconnectSource(id) {
      // Imported transactions and the import history are kept; only the source stops counting as connected.
      get().update("integrationSources", id, { status: "disconnected", disconnectedAt: nowStamp() });
    },
    stageImport(sourceId, rows, meta) {
      const { db } = get();
      const source = db.integrationSources.find((x) => x.id === sourceId);
      if (!source) return null;
      const account = source.accountId ? db.accounts.find((a) => a.id === source.accountId) ?? null : null;
      const runId = uid();
      const res = stageRecords(rows, { provider: source.provider === "custom" ? `custom:${source.id}` : source.provider, sourceId, runId, account, reviewAll: source.reviewAll, transactions: db.transactions, existing: db.importedRecords });
      const stamp = nowStamp();
      const staged = res.records.map((r) => ({ ...r, id: uid(), createdAt: stamp }));
      // Auto-accept only clean, unambiguous records — and only when the user hasn't asked to review everything.
      const newTx: Transaction[] = [];
      let accepted = 0;
      if (account && !source.reviewAll) {
        for (const r of staged) {
          const def = r.state === "pending" ? defaultResolution(r) : null;
          if (!def) continue;
          const txs = recordToTransactions(r, account.id, def).map((t) => ({ ...t, id: uid(), createdAt: stamp }));
          newTx.push(...txs);
          r.state = "accepted";
          r.transactionIds = txs.map((t) => t.id);
          accepted++;
        }
      }
      const run: ImportRun = { id: runId, createdAt: stamp, sourceId, kind: meta.kind, fileName: meta.fileName, added: res.counts.added, accepted, duplicates: res.counts.duplicates, needsReview: staged.filter((r) => r.state === "pending").length, ignored: res.counts.ignored, errors: meta.errors ?? [] };
      mutate((d) => ({
        ...d,
        importRuns: [...d.importRuns, run],
        importedRecords: [...d.importedRecords, ...staged],
        transactions: [...d.transactions, ...newTx],
        integrationSources: d.integrationSources.map((x) => (x.id === sourceId ? { ...x, lastImportAt: stamp, lastError: null } : x)),
      }));
      return run;
    },
    resolveRecord(recordId, res) {
      const { db } = get();
      const rec = db.importedRecords.find((r) => r.id === recordId);
      if (!rec || rec.state === "accepted") return { ok: false, reason: "Already handled." };
      if (res.as === "reject") {
        get().update("importedRecords", recordId, { state: "rejected" });
        return { ok: true };
      }
      if (res.as === "link") {
        // The manual transaction already represents this movement: mark it as matched, create nothing new.
        const tx = db.transactions.find((t) => t.id === res.transactionId);
        if (!tx) return { ok: false, reason: "Transaction not found." };
        mutate((d) => ({
          ...d,
          transactions: d.transactions.map((t) => (t.id === tx.id ? { ...t, source: { sourceId: rec.sourceId, provider: rec.provider, externalId: rec.externalId, runId: rec.runId } } : t)),
          importedRecords: d.importedRecords.map((r) => (r.id === recordId ? { ...r, state: "duplicate", transactionIds: [tx.id] } : r)),
        }));
        return { ok: true };
      }
      const source = db.integrationSources.find((x) => x.id === rec.sourceId);
      if (!source?.accountId) return { ok: false, reason: "Link this source to an account first." };
      const stamp = nowStamp();
      const txs = recordToTransactions(rec, source.accountId, res).map((t) => ({ ...t, id: uid(), createdAt: stamp }));
      mutate((d) => ({
        ...d,
        transactions: [...d.transactions, ...txs],
        importedRecords: d.importedRecords.map((r) => (r.id === recordId ? { ...r, state: "accepted", transactionIds: txs.map((t) => t.id) } : r)),
      }));
      return { ok: true };
    },
    replaceHoldings(accountId, sourceId, holdings, origin) {
      const stamp = nowStamp();
      // A new snapshot replaces the previous one from the same origin/source; manual and imported never overwrite each other.
      mutate((d) => ({
        ...d,
        holdings: [...d.holdings.filter((h) => !(h.accountId === accountId && h.origin === origin && h.sourceId === sourceId)), ...holdings.map((h) => ({ ...h, id: uid(), createdAt: stamp, accountId, sourceId, origin }))],
      }));
      return holdings.length;
    },
    setExternalEvents(provider, range, events) {
      mutate((d) => ({
        ...d,
        externalEvents: [...d.externalEvents.filter((e) => e.provider !== provider || e.endDate < range.start || e.date > range.end), ...events],
      }));
    },
    setCalendarSource(id, patch) {
      mutate((d) => {
        const cur = d.calendarSources.find((c) => c.id === id) ?? { id, available: [], selected: [], lastSyncAt: null, lastError: null, syncedRange: null };
        return { ...d, calendarSources: [...d.calendarSources.filter((c) => c.id !== id), { ...cur, ...patch }] };
      });
    },
    removeCalendarProvider(id) {
      // Cached copies of external events are removed; local events are untouched.
      mutate((d) => ({ ...d, externalEvents: d.externalEvents.filter((e) => e.provider !== id), calendarSources: d.calendarSources.filter((c) => c.id !== id) }));
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
