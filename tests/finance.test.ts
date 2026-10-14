import { describe, expect, it } from "vitest";
import type { Account, Budget, Category, Goal, GoalContribution, RecurringItem, Transaction } from "@/lib/domain/types";
import { accountBalance, balanceSummary, budgetStatus, cashflowSeries, monthsInRange, moneyGoalProgress, periodTotals, recurringOccurrences, spendingByCategory } from "@/lib/calc/finance";

const now = "2026-01-01T00:00:00.000Z";
const acc = (id: string, type: Account["type"], opening: number, currency = "USD"): Account => ({ id, name: id, type, currency, openingBalance: opening, openingDate: "2026-01-01", color: "#000", archived: false, createdAt: now });
let n = 0;
const tx = (p: Partial<Transaction> & Pick<Transaction, "type" | "amount" | "accountId" | "date">): Transaction => ({ id: `t${n++}`, categoryId: null, description: "", tags: [], createdAt: now, ...p });

const cats: Category[] = [
  { id: "food", name: "Food", kind: "expense", parentId: null, color: "", icon: "", archived: false, createdAt: now },
  { id: "groceries", name: "Groceries", kind: "expense", parentId: "food", color: "", icon: "", archived: false, createdAt: now },
  { id: "rent", name: "Rent", kind: "expense", parentId: null, color: "", icon: "", archived: false, createdAt: now },
  { id: "salary", name: "Salary", kind: "income", parentId: null, color: "", icon: "", archived: false, createdAt: now },
];

const accounts = [acc("chk", "checking", 100000), acc("sav", "savings", 500000), acc("cc", "credit", -20000), acc("eur", "checking", 9999, "EUR")];
const txs: Transaction[] = [
  tx({ type: "income", amount: 300000, accountId: "chk", date: "2026-03-01", categoryId: "salary" }),
  tx({ type: "expense", amount: 120000, accountId: "chk", date: "2026-03-02", categoryId: "rent" }),
  tx({ type: "expense", amount: 8000, accountId: "cc", date: "2026-03-05", categoryId: "groceries" }),
  tx({ type: "expense", amount: 2000, accountId: "chk", date: "2026-03-06", categoryId: "food" }),
  tx({ type: "transfer", amount: 50000, accountId: "chk", toAccountId: "sav", date: "2026-03-10", categoryId: null }),
  tx({ type: "transfer", amount: 8000, accountId: "chk", toAccountId: "cc", date: "2026-03-20", categoryId: null }),
  tx({ type: "expense", amount: 1000, accountId: "chk", date: "2026-04-01", categoryId: "food" }),
];
const march = { start: "2026-03-01", end: "2026-03-31" };

describe("balances", () => {
  it("applies income, expenses and transfers per account", () => {
    expect(accountBalance(accounts[0], txs)).toBe(100000 + 300000 - 120000 - 2000 - 50000 - 8000 - 1000);
    expect(accountBalance(accounts[1], txs)).toBe(550000);
    expect(accountBalance(accounts[2], txs)).toBe(-20000 - 8000 + 8000);
    expect(accountBalance(accounts[0], txs, "2026-03-05")).toBe(100000 + 300000 - 120000);
  });
  it("separates assets from liabilities and excludes other currencies", () => {
    const s = balanceSummary(accounts, txs, "USD");
    expect(s.liabilities).toBe(20000);
    expect(s.assets).toBe(219000 + 550000);
    expect(s.net).toBe(s.assets - s.liabilities);
    expect(s.excluded.map((e) => e.account.id)).toEqual(["eur"]);
  });
  it("never counts transfers as income or spending", () => {
    const t = periodTotals(txs, march);
    expect(t.income).toBe(300000);
    expect(t.expenses).toBe(130000);
    expect(t.net).toBe(170000);
    expect(t.savingsRate).toBeCloseTo(170000 / 300000);
  });
});

describe("categories & budgets", () => {
  it("rolls subcategories up to their parent", () => {
    const s = spendingByCategory(txs, cats, march);
    expect(s[0]).toMatchObject({ categoryId: "rent", amount: 120000 });
    expect(s.find((x) => x.categoryId === "food")?.amount).toBe(10000);
  });
  it("evaluates budget state with thresholds", () => {
    const b: Budget = { id: "b", categoryId: "food", amount: 12000, warnAt: 0.8, createdAt: now };
    expect(budgetStatus(b, txs, cats, march)).toMatchObject({ spent: 10000, remaining: 2000, state: "warning" });
    expect(budgetStatus({ ...b, amount: 9000 }, txs, cats, march).state).toBe("over");
    expect(budgetStatus({ ...b, amount: 50000 }, txs, cats, march).state).toBe("ok");
  });
  it("prorates monthly budgets for other ranges", () => {
    expect(monthsInRange({ start: "2026-01-01", end: "2026-03-31" })).toBeCloseTo(3);
    expect(monthsInRange({ start: "2026-02-01", end: "2026-02-14" })).toBeCloseTo(0.5);
  });
  it("builds a cash-flow series that matches the totals", () => {
    const s = cashflowSeries(txs, march, "day");
    expect(s).toHaveLength(31);
    expect(s.reduce((a, p) => a + p.expenses, 0)).toBe(130000);
  });
});

describe("recurring", () => {
  const rent: RecurringItem = { id: "r", kind: "bill", name: "Rent", amount: 120000, accountId: "chk", categoryId: "rent", startDate: "2026-01-02", rule: { freq: "monthly", interval: 1 }, remindDaysBefore: 3, active: true, createdAt: now };
  it("marks occurrences paid only when a settling transaction exists", () => {
    const paid = tx({ type: "expense", amount: 120000, accountId: "chk", date: "2026-03-02", recurringId: "r", occurrenceDate: "2026-03-02" });
    const occ = recurringOccurrences([rent], [paid], "2026-02-01", "2026-05-31", "2026-04-01");
    expect(occ.map((o) => [o.date, o.status])).toEqual([
      ["2026-02-02", "overdue"],
      ["2026-03-02", "paid"],
      ["2026-04-02", "due"],
      ["2026-05-02", "scheduled"],
    ]);
  });
});

describe("savings goals", () => {
  const goal: Goal = { id: "g", title: "Trip", module: "finance", category: "Travel", targetDate: "2026-12-31", startDate: "2026-01-01", measure: { type: "money", targetAmount: 300000, currency: "USD" }, linkedProjectIds: [], archived: false, completedAt: null, createdAt: now };
  const c = (date: string, amount: number): GoalContribution => ({ id: date, goalId: "g", amount, date, createdAt: now });
  it("derives progress from recorded contributions only", () => {
    const p = moneyGoalProgress(goal, [c("2026-02-01", 30000), c("2026-03-01", 30000), c("2026-04-01", 30000), c("2027-01-01", 99999)], "2026-04-15")!;
    expect(p.saved).toBe(90000);
    expect(p.remaining).toBe(210000);
    expect(p.monthlyPace).toBe(30000);
    expect(p.estimatedDate! > "2026-04-15").toBe(true);
    expect(p.onTrack).toBe(true);
  });
});
