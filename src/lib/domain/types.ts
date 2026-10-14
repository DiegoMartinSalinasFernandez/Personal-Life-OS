/**
 * Core data model. Collections are normalized (records reference each other
 * by id) and never store derived totals: balances, budget usage, protein
 * totals, streaks and goal progress are always computed from source records
 * by the functions in `src/lib/calc`.
 */
import type { Cents } from "./money";
import type { ISODate, TimeOfDay } from "./dates";
import type { Recurrence } from "./recurrence";

export type ID = string;
export type Timestamp = string; // ISO 8601 instant (createdAt/updatedAt only)

interface Base {
  id: ID;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// ───────────────────────── Profile & preferences ─────────────────────────

export type ThemePref = "light" | "dark" | "system";
export type ModuleKey = "finance" | "nutrition" | "activities";
export type UnitSystem = "metric" | "imperial";

export interface NutritionPrefs {
  proteinTarget: number; // grams per day (user-defined)
  calorieTracking: boolean;
  calorieTarget: number | null;
  macroTracking: boolean; // carbs + fat
  carbTarget: number | null;
  fatTarget: number | null;
  waterTracking: boolean;
  waterTargetMl: number | null;
  units: UnitSystem;
  dietaryPreferences: string[];
  avoidFoods: string[];
  /** Local time after which an un-logged lunch becomes an insight; null = off. */
  mealReminderTime: TimeOfDay | null;
}

export interface Profile {
  name: string;
  currency: string; // base currency for totals
  timezone: string; // IANA
  locale: string;
  weekStartsOn: 0 | 1;
  hour12: boolean;
  theme: ThemePref;
  /** Home dashboard ordering & visibility. */
  home: { order: ModuleKey[]; hidden: ModuleKey[]; showTimeline: boolean; showInsights: boolean };
  nutrition: NutritionPrefs;
  onboarded: boolean;
  /** True while the workspace contains generated sample records. */
  demo: boolean;
}

// ───────────────────────── Finance ─────────────────────────

export type AccountType = "cash" | "checking" | "savings" | "credit" | "investment" | "loan" | "other";
export const LIABILITY_TYPES: AccountType[] = ["credit", "loan"];

export interface Account extends Base {
  name: string;
  type: AccountType;
  currency: string;
  /** Balance on `openingDate`, before any recorded transaction. Liabilities are negative. */
  openingBalance: Cents;
  openingDate: ISODate;
  institution?: string;
  color: string;
  archived: boolean;
}

export type CategoryKind = "income" | "expense";
export interface Category extends Base {
  name: string;
  kind: CategoryKind;
  parentId: ID | null;
  color: string;
  icon: string; // lucide icon key
  archived: boolean;
}

export type TxType = "income" | "expense" | "transfer";
export interface Transaction extends Base {
  type: TxType;
  /** Always positive; direction comes from `type`. */
  amount: Cents;
  accountId: ID;
  /** Destination for transfers. */
  toAccountId?: ID | null;
  categoryId: ID | null;
  date: ISODate;
  description: string;
  merchant?: string;
  notes?: string;
  tags: string[];
  /** Set when the transaction settles an occurrence of a recurring item. */
  recurringId?: ID | null;
  occurrenceDate?: ISODate | null;
  /** Set when the transaction came from an integration/import (never for manual entries). */
  source?: TxSource | null;
}

export interface TxSource {
  sourceId: ID;
  provider: string;
  /** Provider record id, or a content fingerprint for files without ids. */
  externalId: string | null;
  runId: ID | null;
}

export interface Budget extends Base {
  categoryId: ID; // includes its subcategories
  amount: Cents; // per month
  /** Fraction (0–1) at which the budget is flagged as approaching its limit. */
  warnAt: number;
}

export type RecurringKind = "bill" | "subscription" | "income";
export interface RecurringItem extends Base {
  kind: RecurringKind;
  name: string;
  amount: Cents;
  accountId: ID;
  categoryId: ID | null;
  merchant?: string;
  startDate: ISODate;
  rule: Recurrence;
  remindDaysBefore: number;
  active: boolean;
}

// ───────────────────────── Nutrition ─────────────────────────

export type BaseUnit = "g" | "ml" | "unit";
export interface Nutrients {
  protein: number;
  calories: number | null;
  carbs: number | null;
  fat: number | null;
}
export interface Portion {
  id: ID;
  label: string; // "1 slice", "1 cup"
  amount: number; // in base units
}

export type FoodSource = "sample" | "custom" | "api";
export interface Food extends Base {
  name: string;
  brand?: string;
  baseUnit: BaseUnit;
  /** Nutrients per 100 g / 100 ml, or per 1 unit when baseUnit = "unit". */
  per: Nutrients;
  portions: Portion[];
  source: FoodSource;
  favorite: boolean;
  archived: boolean;
}

/** Quantity unit chosen when logging: a base unit, ounces, or a portion id. */
export type QuantityUnit = "g" | "ml" | "unit" | "oz" | "floz" | `portion:${string}`;

export interface MealType {
  id: ID;
  name: string;
  order: number;
  time: TimeOfDay; // typical time, used for the daily timeline
}

export interface FoodEntry extends Base {
  date: ISODate;
  time?: TimeOfDay;
  mealTypeId: ID;
  foodId: ID | null;
  /** Snapshot at logging time so later edits to the food never rewrite history. */
  foodName: string;
  baseUnit: BaseUnit;
  per: Nutrients;
  portions: Portion[];
  quantity: number;
  unit: QuantityUnit;
  notes?: string;
}

export interface MealItem {
  foodId: ID;
  quantity: number;
  unit: QuantityUnit;
}

export interface SavedMeal extends Base {
  name: string;
  mealTypeId: ID | null;
  items: MealItem[];
  favorite: boolean;
}

/** Planned food never counts toward consumed totals until logged. */
export interface PlannedMeal extends Base {
  date: ISODate;
  mealTypeId: ID;
  items: MealItem[];
  note?: string;
  loggedAt?: Timestamp | null;
}

export interface WaterLog extends Base {
  date: ISODate;
  ml: number;
}

// ───────────────────────── Activities ─────────────────────────

export type Priority = "low" | "medium" | "high" | "urgent";
export interface Subtask {
  id: ID;
  title: string;
  done: boolean;
}

export interface Task extends Base {
  title: string;
  description?: string;
  done: boolean;
  completedAt: Timestamp | null;
  completedOn: ISODate | null;
  priority: Priority;
  /** "Focus" = deliberately chosen as important, independent of the due date. */
  focus: boolean;
  dueDate: ISODate | null;
  startDate: ISODate | null;
  startTime: TimeOfDay | null;
  endTime: TimeOfDay | null;
  projectId: ID | null;
  tags: string[];
  estimateMin: number | null;
  recurrence: Recurrence | null;
  /** id of the next instance already spawned by completing this one. */
  spawnedNextId?: ID | null;
  subtasks: Subtask[];
  notes?: string;
  reminderMinBefore: number | null;
}

export interface Project extends Base {
  name: string;
  area: string; // Work, Personal, Study, Fitness, Finance, Health, Side projects…
  color: string;
  description?: string;
  deadline: ISODate | null;
  archived: boolean;
}

export interface CalendarEvent extends Base {
  title: string;
  date: ISODate;
  allDay: boolean;
  startTime: TimeOfDay | null;
  endTime: TimeOfDay | null;
  location?: string;
  notes?: string;
  color: string;
  recurrence: Recurrence | null;
  exDates: ISODate[];
  projectId: ID | null;
}

export type HabitSchedule = { type: "daily" } | { type: "days"; days: number[] };
export interface Habit extends Base {
  name: string;
  icon: string;
  color: string;
  schedule: HabitSchedule;
  startDate: ISODate;
  reminderTime: TimeOfDay | null;
  archived: boolean;
}
export interface HabitCompletion {
  id: ID;
  habitId: ID;
  date: ISODate;
}

// ───────────────────────── Shared goals ─────────────────────────

export type GoalModule = "finance" | "nutrition" | "activities";

/** Each goal keeps the measurement model of its module — they are never blended. */
export type GoalMeasure =
  | { type: "money"; targetAmount: Cents; currency: string }
  | { type: "protein_days"; windowDays: number; targetDays: number }
  | { type: "habit"; habitId: ID; targetCount: number }
  | { type: "milestones" };

export interface Goal extends Base {
  title: string;
  description?: string;
  module: GoalModule;
  category: string;
  targetDate: ISODate | null;
  startDate: ISODate;
  measure: GoalMeasure;
  linkedProjectIds: ID[];
  notes?: string;
  archived: boolean;
  completedAt: Timestamp | null;
}

export interface GoalContribution extends Base {
  goalId: ID;
  amount: Cents; // may be negative for withdrawals
  date: ISODate;
  note?: string;
}

export interface Milestone extends Base {
  goalId: ID;
  title: string;
  dueDate: ISODate | null;
  done: boolean;
  order: number;
}

// ───────────────────────── Integrations (client-side records) ─────────────────────────
// Credentials never live here: OAuth tokens are stored encrypted on the server.

export type FinanceProviderId = "mercadopago" | "cocos" | "custom";

/** A financial data source the user activated (counts toward the 3-provider limit while active). */
export interface IntegrationSource extends Base {
  provider: FinanceProviderId;
  name: string;
  /** "oauth" = backed by a verified server-side connection; "csv" = file imports only. */
  kind: "oauth" | "csv";
  status: "active" | "disconnected";
  accountId: ID | null;
  /** When true every imported record waits for review, even when unambiguous. */
  reviewAll: boolean;
  connectedAt: Timestamp;
  disconnectedAt: Timestamp | null;
  lastImportAt: Timestamp | null;
  lastError: string | null;
}

export interface ImportRun extends Base {
  sourceId: ID;
  kind: "api" | "csv" | "holdings";
  fileName?: string;
  added: number;
  accepted: number;
  duplicates: number;
  needsReview: number;
  ignored: number;
  errors: string[];
}

export type ImportedRecordState = "pending" | "accepted" | "rejected" | "duplicate" | "ignored";
export type ImportedKind = "income" | "expense" | "transfer" | "investment" | "unknown";

/** Staging area: imported rows never affect summaries until accepted. */
export interface ImportedRecord extends Base {
  sourceId: ID;
  runId: ID;
  provider: string;
  externalId: string | null;
  date: ISODate;
  /** Always positive; direction gives the sign. */
  amount: Cents;
  direction: "in" | "out" | "unknown";
  currency: string;
  description: string;
  counterparty?: string;
  providerStatus?: string;
  fee?: Cents | null;
  kindGuess: ImportedKind;
  issues: string[];
  state: ImportedRecordState;
  transactionIds: ID[];
  duplicateOfId?: ID | null;
}

export interface Holding extends Base {
  accountId: ID;
  sourceId: ID | null;
  origin: "imported" | "manual";
  symbol: string;
  name?: string;
  quantity: number;
  currency: string;
  /** Unit price as provided by the source/user — never fetched or invented. */
  price: Cents | null;
  valuation: Cents | null;
  valuationDate: ISODate;
}

export type CalendarProviderId = "google" | "notion";

/** Read-only copy of an event from an external calendar (cached locally for display). */
export interface ExternalEvent {
  id: string; // provider:calendarId:externalId[:date]
  provider: CalendarProviderId;
  calendarId: string;
  calendarName: string;
  externalId: string;
  title: string;
  date: ISODate;
  endDate: ISODate;
  startTime: TimeOfDay | null;
  endTime: TimeOfDay | null;
  allDay: boolean;
  location?: string;
  url?: string;
  color: string;
  recurring: boolean;
}

export interface CalendarSourceConfig {
  id: CalendarProviderId;
  available: { id: string; name: string; color: string; primary?: boolean; dateProperty?: string }[];
  selected: string[];
  lastSyncAt: Timestamp | null;
  lastError: string | null;
  syncedRange: { start: ISODate; end: ISODate } | null;
}

// ───────────────────────── Database ─────────────────────────

export interface Database {
  version: number;
  profile: Profile;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurring: RecurringItem[];
  foods: Food[];
  mealTypes: MealType[];
  foodEntries: FoodEntry[];
  savedMeals: SavedMeal[];
  plannedMeals: PlannedMeal[];
  waterLogs: WaterLog[];
  tasks: Task[];
  projects: Project[];
  events: CalendarEvent[];
  habits: Habit[];
  habitCompletions: HabitCompletion[];
  goals: Goal[];
  goalContributions: GoalContribution[];
  milestones: Milestone[];
  integrationSources: IntegrationSource[];
  importRuns: ImportRun[];
  importedRecords: ImportedRecord[];
  holdings: Holding[];
  externalEvents: ExternalEvent[];
  calendarSources: CalendarSourceConfig[];
  /** Keys of insights/notifications the user dismissed. */
  dismissed: string[];
}

export type CollectionKey = { [K in keyof Database]: Database[K] extends Array<{ id: ID }> ? K : never }[keyof Database];
