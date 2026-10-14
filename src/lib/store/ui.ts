"use client";

import { create } from "zustand";
import type { ID, GoalModule, Transaction, Task, CalendarEvent } from "../domain/types";
import type { ISODate } from "../domain/dates";

export type Sheet =
  | { kind: "quickadd" }
  | { kind: "search" }
  | { kind: "notifications" }
  | { kind: "transaction"; id?: ID; defaults?: Partial<Transaction> }
  | { kind: "food"; date?: ISODate; mealTypeId?: ID; foodId?: ID; entryId?: ID; mode?: "log" | "plan" }
  | { kind: "task"; id?: ID; defaults?: Partial<Task> }
  | { kind: "event"; id?: ID; defaults?: Partial<CalendarEvent>; occurrenceDate?: ISODate }
  | { kind: "habit"; id?: ID }
  | { kind: "goal"; id?: ID; module?: GoalModule };

interface UIState {
  sheet: Sheet | null;
  open(sheet: Sheet): void;
  close(): void;
}

export const useUI = create<UIState>((set) => ({
  sheet: null,
  open: (sheet) => set({ sheet }),
  close: () => set({ sheet: null }),
}));

export const openSheet = (sheet: Sheet) => useUI.getState().open(sheet);
export const closeSheet = () => useUI.getState().close();
