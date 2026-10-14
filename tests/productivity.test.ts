import { describe, expect, it } from "vitest";
import type { CalendarEvent, Goal, Habit, HabitCompletion, Milestone, Task } from "@/lib/domain/types";
import { bestStreak, eventOccurrences, goalProgress, habitRate, habitStreak, nextRecurringDue, todayTasks } from "@/lib/calc/productivity";

const now = "2026-01-01T00:00:00.000Z";
const task = (p: Partial<Task>): Task => ({ id: Math.random().toString(36), createdAt: now, title: "t", done: false, completedAt: null, completedOn: null, priority: "medium", focus: false, dueDate: null, startDate: null, startTime: null, endTime: null, projectId: null, tags: [], estimateMin: null, recurrence: null, subtasks: [], reminderMinBefore: null, ...p });

describe("tasks", () => {
  const today = "2026-10-14";
  it("separates overdue, due today and important", () => {
    const t = todayTasks([
      task({ dueDate: "2026-10-10" }),
      task({ dueDate: today }),
      task({ dueDate: today, done: true, completedOn: today }),
      task({ priority: "urgent", dueDate: "2026-10-16" }),
      task({ focus: true }),
      task({ priority: "high", dueDate: "2026-11-30" }),
    ], today);
    expect(t.overdue).toHaveLength(1);
    expect(t.dueToday).toHaveLength(1);
    expect(t.priorities).toHaveLength(2);
    expect(t.completionRate).toBeCloseTo(1 / 3);
  });
  it("advances recurring tasks once, from the due date or completion date", () => {
    const daily = task({ dueDate: "2026-10-14", recurrence: { freq: "daily", interval: 1 } });
    expect(nextRecurringDue(daily, "2026-10-14")).toBe("2026-10-15");
    expect(nextRecurringDue(daily, "2026-10-17")).toBe("2026-10-18");
    const monthly = task({ dueDate: "2026-10-31", recurrence: { freq: "monthly", interval: 1 } });
    expect(nextRecurringDue(monthly, "2026-10-20")).toBe("2026-11-30");
  });
});

describe("habits", () => {
  const habit: Habit = { id: "h", name: "Gym", icon: "", color: "", schedule: { type: "days", days: [1, 3, 5] }, startDate: "2026-09-01", reminderTime: null, archived: false, createdAt: now };
  const c = (date: string): HabitCompletion => ({ id: date, habitId: "h", date });
  const comps = ["2026-10-02", "2026-10-05", "2026-10-07", "2026-10-09", "2026-10-12"].map(c);
  it("counts scheduled days only and survives an unfinished today", () => {
    // 2026-10-14 is a Wednesday (scheduled) and not done yet → streak continues from Monday.
    expect(habitStreak(habit, comps, "2026-10-14")).toBe(5);
    expect(habitStreak(habit, [...comps, c("2026-10-14")], "2026-10-14")).toBe(6);
    // Missing Friday breaks it.
    expect(habitStreak(habit, comps.filter((x) => x.date !== "2026-10-09"), "2026-10-13")).toBe(1);
  });
  it("computes best streak and rate", () => {
    expect(bestStreak(habit, comps, "2026-10-14")).toBe(5);
    const r = habitRate(habit, comps, "2026-10-05", "2026-10-11");
    expect(r).toEqual({ scheduled: 3, done: 3, rate: 1 });
  });
});

describe("calendar", () => {
  it("expands recurring events with exceptions", () => {
    const e: CalendarEvent = { id: "e", createdAt: now, title: "Standup", date: "2026-10-12", allDay: false, startTime: "09:00", endTime: "09:15", color: "", recurrence: { freq: "weekly", interval: 1, byWeekday: [1, 2, 3, 4, 5] }, exDates: ["2026-10-14"], projectId: null };
    expect(eventOccurrences([e], "2026-10-12", "2026-10-18").map((o) => o.date)).toEqual(["2026-10-12", "2026-10-13", "2026-10-15", "2026-10-16"]);
  });
});

describe("goals", () => {
  const base = { id: "g", createdAt: now, title: "", module: "activities" as const, category: "", targetDate: null, startDate: "2026-10-01", linkedProjectIds: [], archived: false, completedAt: null };
  it("returns no percentage for milestone goals without milestones", () => {
    const g: Goal = { ...base, measure: { type: "milestones" } };
    expect(goalProgress(g, { today: "2026-10-14", milestones: [], habitCompletions: [], foodEntries: [], proteinTarget: 100 })).toMatchObject({ pct: null });
    const ms: Milestone[] = [{ id: "m1", goalId: "g", title: "", dueDate: null, done: true, order: 0, createdAt: now }, { id: "m2", goalId: "g", title: "", dueDate: null, done: false, order: 1, createdAt: now }];
    expect(goalProgress(g, { today: "2026-10-14", milestones: ms, habitCompletions: [], foodEntries: [], proteinTarget: 100 })).toMatchObject({ pct: 0.5 });
  });
});
