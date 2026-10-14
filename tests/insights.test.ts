import { describe, expect, it } from "vitest";
import { computeInsights } from "@/lib/calc/insights";
import { emptyDatabase } from "@/lib/data/defaults";
import { generateDemo } from "@/lib/data/seed";
import { balanceSummary, periodTotals } from "@/lib/calc/finance";

const today = "2026-10-14";

describe("insights", () => {
  it("produces nothing for an empty workspace", () => {
    expect(computeInsights(emptyDatabase(), today, "15:00")).toEqual([]);
  });
  it("flags bills due soon and hides dismissed ones", () => {
    const db = emptyDatabase();
    db.accounts.push({ id: "a", name: "A", type: "checking", currency: "USD", openingBalance: 0, openingDate: "2026-01-01", color: "", archived: false, createdAt: "" });
    db.recurring.push({ id: "r", kind: "bill", name: "Internet", amount: 5500, accountId: "a", categoryId: null, startDate: "2026-01-16", rule: { freq: "monthly", interval: 1 }, remindDaysBefore: 3, active: true, createdAt: "" });
    db.transactions.push(...Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, type: "expense" as const, amount: 5500, accountId: "a", categoryId: null, date: `2026-${String(i + 1).padStart(2, "0")}-16`, description: "Internet", tags: [], recurringId: "r", occurrenceDate: `2026-${String(i + 1).padStart(2, "0")}-16`, createdAt: "" })));
    const ins = computeInsights(db, today, "10:00");
    expect(ins.map((i) => i.key)).toEqual(["bill-due:r:2026-10-16"]);
    db.dismissed.push("bill-due:r:2026-10-16");
    expect(computeInsights(db, today, "10:00")).toEqual([]);
  });
});

describe("demo seed", () => {
  it("is internally consistent", () => {
    const db = generateDemo(today, { ...emptyDatabase().profile, timezone: "UTC" });
    expect(db.profile.demo).toBe(true);
    expect(db.transactions.every((t) => t.date <= today)).toBe(true);
    const ids = new Set(db.accounts.map((a) => a.id));
    expect(db.transactions.every((t) => ids.has(t.accountId) && (!t.toAccountId || ids.has(t.toAccountId)))).toBe(true);
    // No occurrence of a recurring item is settled twice.
    const keys = db.transactions.filter((t) => t.recurringId).map((t) => `${t.recurringId}|${t.occurrenceDate}`);
    expect(new Set(keys).size).toBe(keys.length);
    const bal = balanceSummary(db.accounts, db.transactions, db.profile.currency);
    expect(bal.net).toBeGreaterThan(0);
    expect(periodTotals(db.transactions, { start: "2026-10-01", end: today }).income).toBeGreaterThan(0);
  });
});
