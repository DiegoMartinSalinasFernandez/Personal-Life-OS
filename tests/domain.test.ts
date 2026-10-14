import { describe, expect, it } from "vitest";
import { addDays, addMonths, diffDays, endOfMonth, isoInZone, periodRange, previousRange, startOfWeek, weekday } from "@/lib/domain/dates";
import { centsToInput, formatMoney, parseMoney } from "@/lib/domain/money";
import { describeRecurrence, nextOccurrence, occurrencesBetween } from "@/lib/domain/recurrence";

describe("dates", () => {
  it("adds days across DST and year boundaries", () => {
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-03-01", "2026-04-01")).toBe(31);
  });
  it("clamps month-end when adding months", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
  });
  it("respects week start", () => {
    expect(weekday("2026-10-14")).toBe(3); // Wednesday
    expect(startOfWeek("2026-10-14", 1)).toBe("2026-10-12");
    expect(startOfWeek("2026-10-14", 0)).toBe("2026-10-11");
  });
  it("resolves the calendar day in the user's timezone", () => {
    const instant = new Date("2026-10-14T02:30:00Z");
    expect(isoInZone(instant, "UTC")).toBe("2026-10-14");
    expect(isoInZone(instant, "America/Los_Angeles")).toBe("2026-10-13");
    expect(isoInZone(instant, "Asia/Tokyo")).toBe("2026-10-14");
  });
  it("computes periods and previous periods", () => {
    expect(periodRange("quarter", "2026-08-20")).toEqual({ start: "2026-07-01", end: "2026-09-30" });
    expect(previousRange("month", { start: "2026-03-01", end: "2026-03-31" })).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(previousRange("custom", { start: "2026-03-10", end: "2026-03-19" })).toEqual({ start: "2026-02-28", end: "2026-03-09" });
  });
});

describe("money", () => {
  it("parses amounts without float drift", () => {
    expect(parseMoney("0.1")).toBe(10);
    expect(parseMoney("19.99")).toBe(1999);
    expect(parseMoney("1,234.56")).toBe(123456);
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("12,5")).toBe(1250);
    expect(parseMoney("1,234")).toBe(123400);
    expect(parseMoney("$ -42")).toBe(-4200);
    expect(parseMoney("1.005")).toBe(101);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("1-2")).toBeNull();
    expect(parseMoney("500", 0)).toBe(500);
  });
  it("round-trips cents to input strings", () => {
    expect(centsToInput(123456)).toBe("1234.56");
    expect(centsToInput(-5)).toBe("-0.05");
  });
  it("formats with explicit currency", () => {
    expect(formatMoney(123456, "USD", { locale: "en-US" })).toBe("$1,234.56");
    expect(formatMoney(500, "JPY", { locale: "en-US" })).toBe("¥500");
    expect(formatMoney(1000, "EUR", { locale: "en-US", signed: true })).toBe("+€10.00");
  });
});

describe("recurrence", () => {
  it("expands monthly rules with month-end clamping and no duplicates", () => {
    const r = occurrencesBetween("2026-01-31", { freq: "monthly", interval: 1 }, "2026-01-01", "2026-05-31");
    expect(r).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
    expect(new Set(r).size).toBe(r.length);
  });
  it("handles weekly rules on specific weekdays", () => {
    const r = occurrencesBetween("2026-10-12", { freq: "weekly", interval: 1, byWeekday: [1, 3, 5] }, "2026-10-12", "2026-10-25");
    expect(r).toEqual(["2026-10-12", "2026-10-14", "2026-10-16", "2026-10-19", "2026-10-21", "2026-10-23"]);
  });
  it("handles intervals, until and exceptions", () => {
    const r = occurrencesBetween("2026-01-01", { freq: "daily", interval: 3, until: "2026-01-12" }, "2026-01-05", "2026-02-01", ["2026-01-07"]);
    expect(r).toEqual(["2026-01-10"]);
    expect(occurrencesBetween("2026-06-01", { freq: "weekly", interval: 2 }, "2026-06-01", "2026-06-30")).toEqual(["2026-06-01", "2026-06-15", "2026-06-29"]);
  });
  it("finds the next occurrence", () => {
    expect(nextOccurrence("2024-02-29", { freq: "yearly", interval: 1 }, "2026-01-01")).toBe("2026-02-28");
    expect(nextOccurrence("2026-10-01", { freq: "monthly", interval: 1 }, "2026-10-01")).toBe("2026-11-01");
    expect(describeRecurrence({ freq: "weekly", interval: 1, byWeekday: [1, 2, 3, 4, 5] })).toBe("Weekdays");
  });
});

import { normalizeDate, parseCSV, toCSV, guessDateFormat } from "@/lib/data/csv";
import { parseQuickTask } from "@/features/activities/quick-parse";
describe("csv", () => {
  it("parses quoted fields, escaped quotes and semicolons", () => {
    expect(parseCSV('a,b\n"x, y","say ""hi"""\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
    expect(parseCSV("date;amount\r\n2026-01-02;-12,50")).toEqual([["date", "amount"], ["2026-01-02", "-12,50"]]);
    expect(parseCSV(toCSV(["n"], [["multi\nline"]]))).toEqual([["n"], ["multi\nline"]]);
  });
  it("normalises dates", () => {
    expect(normalizeDate("03/04/2026", "mdy")).toBe("2026-03-04");
    expect(normalizeDate("03/04/2026", "dmy")).toBe("2026-04-03");
    expect(normalizeDate("2026-02-30", "ymd")).toBeNull();
    expect(guessDateFormat(["25/01/2026"])).toBe("dmy");
  });
});
describe("quick task parsing", () => {
  it("extracts date, priority, project and tags", () => {
    const r = parseQuickTask("Call bank tomorrow !high #money +phone", "2026-10-14", [{ id: "p", name: "Money admin", area: "Finance", color: "", deadline: null, archived: false, createdAt: "" }]);
    expect(r).toEqual({ title: "Call bank", dueDate: "2026-10-15", priority: "high", projectId: "p", tags: ["phone"] });
    expect(parseQuickTask("Gym fri", "2026-10-14", []).dueDate).toBe("2026-10-16");
  });
});
