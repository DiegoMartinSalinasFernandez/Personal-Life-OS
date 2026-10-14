# Life OS — Finance, Nutrition & Productivity

A personal command center that brings money, food/protein tracking and day-to-day planning into one
application. Three connected modules share one design system, one navigation shell, one data model,
global search, quick-add and cross-module insights.

> **Status:** fully functional local-first app. Records are stored in the browser. An optional
> **Integrations Center** (Settings → Integrations) adds read-only Mercado Pago, Google Calendar and
> Notion connections through official OAuth (server-side, encrypted tokens) plus CSV/manual workflows
> for Cocos Capital and other providers — see [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

On first launch choose **Set up my workspace** (empty workspace + sample food list) or
**Explore demo data** (a realistic, clearly-labelled sample workspace generated relative to today).
Demo data can be cleared or reset at any time in **Settings → Data & privacy**.

| Script              | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Development server                             |
| `npm run build`     | Production build (pages prerender; `/api/integrations/*` run on Node) |
| `npm start`         | Serve the production build                     |
| `npm test`          | Unit tests for calculation logic (Vitest)      |
| `npm run typecheck` | Strict TypeScript check                        |
| `npm run lint`      | ESLint                                         |

**Environment variables:** none are required for the core app. OAuth integrations need the
server variables listed in `.env.example` (names only) — setup steps in
[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md). Integrations require running the Node server
(`npm run dev` / `npm start`), not static hosting.

Requirements: Node 20+.

---

## What's included

### Overview (home)
Greeting with a generated one-line summary of the day, configurable module cards (reorder/hide via
**Customize**), a unified **daily timeline** (events, scheduled tasks, planned meals, bills, habit
reminders, live "now" marker) and dismissible **insights** derived only from your data.

### Finance
- **Overview** — net balance with trend, assets vs liabilities, income / expenses / net cash flow /
  savings rate with previous-period deltas, cash-flow chart, spending by category, budgets, recent
  transactions, upcoming bills, savings goals. Period selector: week, month, quarter, year, custom —
  every card and chart follows it.
- **Transactions** — search, filters (type, account, category incl. subcategories, date range),
  sorting, totals for the filtered set, paginated table (desktop) / day-grouped list (mobile),
  add/edit/delete with undo, tags, notes, merchant, recurring flag. **CSV import** (column mapping,
  date-format detection, debit/credit columns, duplicate detection, preview) and **CSV export**.
- **Accounts** — cash, checking, savings, credit card, investment, loan, other; per-account currency;
  archive (keeps history) or delete (with a count of affected transactions).
- **Budgets** — monthly per-category limits (subcategories roll up), configurable warning threshold,
  distinct *On track / Approaching / Over* states with icons + labels (not colour alone), month
  navigation, 6-month history chart, "spending without a budget".
- **Bills & recurring** — bills, subscriptions and income with weekly/monthly/yearly rules; a schedule
  of overdue / due-soon / scheduled / paid occurrences. Scheduled items only become transactions when
  you **Mark paid**, and each occurrence can be settled once.
- **Savings goals** — target, contributions/withdrawals, pace from recorded contributions, amount
  needed per month for the target date. No returns are assumed or predicted.

### Nutrition (protein-first)
- **Today** — protein ring + large *remaining* number, meals logged, 7-day average, target streak;
  optional calories, carbs/fat and water. Meals (breakfast, lunch, snacks, dinner + custom types) with
  per-meal protein; planned food shown separately with **Log it**. Protein distribution across meals,
  7-day chart vs target, copy a meal/day from the previous day, save a meal as a template.
- **Add food** — search, recents, favourites, saved meals (one tap), quick-add (+) with the default
  portion, detail view with quantity + unit (g, ml, oz, fl oz, units, named portions) and a live
  nutrient preview, "plan instead of log" mode, custom food creation, avoid-list flags.
- **History** — 7/14/30-day ranges, average protein on logged days, days at target, logging
  consistency, stacked protein-by-meal chart with target line, daily table linking back to edit any day.
- **Meal plan** — weekly planner, copy a day to another date, log planned meals, **shopping list**
  aggregated from un-logged plans (copy / download).
- **Foods & meals** — local food database (sample + custom), favourites, edit/customise, saved-meal
  editor.

### Activities
- **Today** — next action, quick-add with natural shortcuts (`tomorrow`, `fri`, `!high`, `#project`,
  `+tag`), completion rate, top priorities (focus-flagged or urgent/high within 3 days — *important*
  is kept separate from *due*), overdue (bulk "move to today"), due today, agenda, habits, next 7 days.
- **Tasks** — Today / Upcoming / Overdue / No date / All / Completed views, search, project, priority
  and tag filters, sorting, bulk complete/reschedule/delete, subtasks, estimates, start date,
  time blocks, reminders, recurrence (next instance created exactly once; reopening removes it).
- **Calendar** — day, week, month and agenda views; recurring events with per-occurrence deletion;
  events (solid) vs scheduled tasks (outlined, checkable); click an empty slot to create an event.
- **Projects** — grouped by area, progress, overdue counts, deadlines, per-project task list,
  linked goals, archive/delete (tasks move to Inbox).
- **Habits** — daily or selected-day schedules, 7-day check-in grid, current/best streak,
  30-day rate, weekly consistency chart, 12-week heatmaps, reminders, archive.

### Integrations Center (Settings → Integrations & connections)
- **Finance (max 3 providers at a time):** Mercado Pago (official OAuth + PKCE, payments search,
  plus account-report CSV), Cocos Capital (no official API → CSV activity, holdings snapshots and
  manual balances), and a configurable provider slot (statement CSV).
- **Calendars (separate from the limit):** Google Calendar (read-only scopes, calendar selection,
  recurring instances, timezone conversion) and Notion (Notion Calendar has no public API → shared
  Google Calendar workflow, or official Notion API for dated database entries).
- **Truthful statuses:** available, connected, synchronization required, connection expired, error,
  manual import available, not supported, requires developer configuration.
- **Finance → Imports:** review queue, duplicate linking, transfer/income/expense decisions, import
  history; imported transactions carry source labels and never double-count manual ones.
- **Accounts → Investment holdings:** imported vs manual positions with valuation dates.

### Shared
- **Goals** — one goal system, each with its own unit: money (contributions), nutrition (days at
  protein target within a window), milestones, or habit check-ins. No artificial percentages when
  there's no underlying data.
- **Insights** — weekly review per module (never blended into one score) plus the attention list.
- **Global search** (`⌘K` / `Ctrl+K` / `/`) across transactions, tasks, projects, events, goals,
  habits, foods and the food log, plus page navigation and create commands.
- **Quick add** (`N`, or the + button) for transaction, food, task, event, habit or goal.
- **Reminders** (bell) — bills due/overdue, budgets, unlogged lunch, remaining protein, task and habit
  reminders, imminent events. In-app only.
- **Settings** — profile, currency, timezone, number/date format, week start, theme (light / dark /
  system), overview layout, nutrition targets & toggles, dietary preferences, foods to avoid, meal
  types, categories (with subcategories, icons, colours), JSON backup/restore, demo data controls,
  delete all.

Keyboard: `N` create · `/` or `⌘K` search · `G` then `O`/`F`/`E`/`A`/`S` → Overview, Finance,
Nutrition (Eat), Activities, Settings.

---

## Architecture

```
src/
  app/                    Next.js App Router pages (one folder per route; all client-rendered)
  components/
    ui/                   Design-system primitives (Button, Card, Dialog, Field, Menu, Toast, …)
    charts/               Recharts wrappers that enforce the chart conventions
    shell/                App shell: sidebar, top bar, mobile nav, command palette, quick add,
                          reminders, onboarding, sheet host
  features/               Module-specific components and forms (finance, nutrition, activities,
                          goals, overview, common)
  lib/
    domain/               Types, calendar-date utilities, money, recurrence rules (pure)
    calc/                 Business logic: finance, nutrition, productivity, insights (pure, tested)
    data/                 Persistence adapter, defaults, demo seed, sample foods, CSV, food provider
    store/                Zustand store (actions over the normalized database) + UI sheet store
    hooks/                Clock/today, money formatting, forms (Zod), hotkeys, media queries
tests/                    Vitest unit tests for the calculation layer
```

**Layering.** UI → store actions → normalized `Database` → `DataAdapter`. All numbers on screen come
from pure functions in `lib/calc` applied to source records — balances, budget usage, protein totals,
streaks and goal progress are never stored.

### Data model (normalized, `src/lib/domain/types.ts`)
Profile & preferences · Account · Category (with parent) · Transaction · Budget · RecurringItem ·
Food · MealType · FoodEntry · SavedMeal · PlannedMeal · WaterLog · Task (subtasks embedded) ·
Project · CalendarEvent · Habit · HabitCompletion · Goal (+ typed `measure`) · GoalContribution ·
Milestone · dismissed insight keys.

### Key business rules
- **Money** is stored as integer minor units with an explicit currency per account; input parsing is
  string-based (no float maths). Totals only include accounts in the base currency; other-currency
  accounts are listed separately — no exchange rates are invented.
- **Transfers** move money between accounts and never count as income or spending.
- **Liabilities** (credit cards, loans) carry negative balances and are reported separately from
  assets.
- **Budgets** are monthly, include subcategories, and are prorated for non-month periods.
- **Recurring items** expand deterministically; an occurrence is "paid" only when a transaction
  references `(recurringId, occurrenceDate)`, which makes settling idempotent.
- **Protein** is computed from each entry's quantity × the nutrient snapshot saved at logging time, so
  editing a food later never rewrites history, while editing/deleting an entry updates every total.
- **Planned meals** never count toward consumed totals until logged.
- **Dates** are calendar strings (`YYYY-MM-DD`) and arithmetic happens in UTC; "today" is resolved
  in the user's configured timezone. Streaks therefore can't break because of DST or travel.
- **Recurring tasks** spawn the next instance once on completion (`spawnedNextId` guards
  duplication); reopening removes an untouched spawned instance.

### Design system
Tokens live as CSS variables in `src/app/globals.css` (light + dark) and are mapped to semantic
Tailwind names in `tailwind.config.ts`: warm paper canvas, white surfaces, ink text, one accent per
module (Finance green, Nutrition terracotta, Activities indigo), reserved semantic colours
(positive/negative/warning/info). Inter variable with tabular numerals for figures. Chart series
colours (`--chart-1…5`) were validated for colour-vision-deficiency separation in both themes;
charts use one y-axis, recessive grids, legends for ≥ 2 series and hover tooltips. States are never
communicated by colour alone (icons + labels).

---

## Integrations & limitations

| Area                    | Today                                                    | Future                                                   |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| Persistence             | Browser `localStorage` via `LocalStorageAdapter`; syncs across tabs; JSON backup/restore | Implement `DataAdapter` against a hosted DB (e.g. Supabase/Postgres with row-level security and auth) |
| Banks & wallets         | Manual entry, CSV import with review; Mercado Pago payments via official OAuth (seller-side data) | More provider adapters once official APIs are verified |
| Investments             | Holdings via CSV or manual entry (no live prices)        | Broker API if one becomes officially available           |
| Food data               | Local **sample** database (approximate, labelled) + custom foods | Implement `FoodProvider` (`src/lib/data/food-provider.ts`) for a real nutrition API |
| Calendar                | Internal calendar + read-only Google Calendar / Notion database sync | Write-back (needs broader scopes), Outlook              |
| Notifications           | In-app reminders only                                    | Web push / email                                         |
| Multi-currency          | Per-account currency, no conversion                      | FX rates                                                 |
| Auth / multi-user       | Single local user                                        | Accounts with per-user data isolation                    |

Sample food values are rounded references, **not verified for any specific product** — the UI says
so wherever they appear. Nutrition targets are user-chosen; the app gives no medical advice.

### Adding a backend
1. Implement `DataAdapter` (`load`, `save`, `clear`, optional `subscribe`) in `src/lib/data/`.
2. Return it from `createAdapter()` (e.g. based on `NEXT_PUBLIC_DATA_BACKEND`).
3. For a relational backend, map each `Database` collection to a table keyed by `user_id`, enforce
   row-level security, and keep `lib/calc` as the single source of derived numbers.

---

## Testing

`npm test` runs 85 tests (42 of them for the Integrations Center — see docs/INTEGRATIONS.md §4) covering date arithmetic and timezone resolution, money parsing and
formatting, recurrence expansion (month-end clamping, weekdays, intervals, exceptions), balances,
transfers, liabilities, budgets and proration, cash-flow series, recurring settlement status, savings
goal pace, unit/portion conversion and protein scaling, daily/weekly nutrition stats and streaks,
planned-vs-consumed separation, shopping lists, task prioritisation, recurring task advancement,
habit streaks across schedules, goal progress, insights, CSV parsing, quick-add parsing, and demo
data integrity.
