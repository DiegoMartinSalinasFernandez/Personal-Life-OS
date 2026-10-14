"use client";

import { useUI } from "@/lib/store/ui";
import { TransactionDialog } from "@/features/finance/transaction-form";
import { LogFoodDialog } from "@/features/nutrition/log-food-dialog";
import { TaskDialog } from "@/features/activities/task-form";
import { EventDialog } from "@/features/activities/event-form";
import { HabitDialog } from "@/features/activities/habit-form";
import { GoalDialog } from "@/features/goals/goal-form";
import { ExternalEventDialog } from "@/features/integrations/external-event-dialog";

/** Renders whichever create/edit form is currently open. Keyed so each open starts fresh. */
export function SheetHost() {
  const sheet = useUI((s) => s.sheet);
  if (!sheet) return null;
  const key = JSON.stringify(sheet);
  switch (sheet.kind) {
    case "transaction":
      return <TransactionDialog key={key} id={sheet.id} defaults={sheet.defaults} />;
    case "food":
      return <LogFoodDialog key={key} date={sheet.date} mealTypeId={sheet.mealTypeId} foodId={sheet.foodId} entryId={sheet.entryId} mode={sheet.mode} />;
    case "task":
      return <TaskDialog key={key} id={sheet.id} defaults={sheet.defaults} />;
    case "event":
      return <EventDialog key={key} id={sheet.id} defaults={sheet.defaults} occurrenceDate={sheet.occurrenceDate} />;
    case "habit":
      return <HabitDialog key={key} id={sheet.id} />;
    case "goal":
      return <GoalDialog key={key} id={sheet.id} module={sheet.module} />;
    case "external":
      return <ExternalEventDialog key={key} id={sheet.id} />;
    default:
      return null;
  }
}
