"use client";

import { useState } from "react";
import { Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Segmented } from "@/components/ui/tabs";
import { useDb } from "@/lib/hooks";
import { openSheet } from "@/lib/store/ui";
import type { GoalModule } from "@/lib/domain/types";
import { GoalCard } from "./goal-card";

export function GoalsBoard({ module, allowModuleFilter }: { module?: GoalModule; allowModuleFilter?: boolean }) {
  const db = useDb();
  const [status, setStatus] = useState<"active" | "completed" | "archived">("active");
  const [mod, setMod] = useState<"all" | GoalModule>(module ?? "all");
  const goals = db.goals
    .filter((g) => (mod === "all" || g.module === mod) && (status === "archived" ? g.archived : !g.archived && (status === "completed" ? !!g.completedAt : !g.completedAt)))
    .sort((a, b) => (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999"));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Segmented size="sm" label="Status" value={status} onChange={setStatus} options={[{ value: "active", label: "Active" }, { value: "completed", label: "Completed" }, { value: "archived", label: "Archived" }]} />
          {allowModuleFilter ? <Segmented size="sm" label="Module" value={mod} onChange={setMod} options={[{ value: "all", label: "All" }, { value: "finance", label: "Savings" }, { value: "nutrition", label: "Nutrition" }, { value: "activities", label: "Activities" }]} /> : null}
        </div>
        <Button variant="primary" size="sm" onClick={() => openSheet({ kind: "goal", module: mod === "all" ? undefined : mod })}>
          <Plus /> New goal
        </Button>
      </div>
      {goals.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<Target />}
            title={status === "active" ? "No active goals" : status === "completed" ? "No completed goals yet" : "Nothing archived"}
            description={status === "active" ? "Goals keep their own units: money for savings, days for nutrition consistency, milestones or check-ins for projects and habits." : undefined}
            action={status === "active" ? <Button variant="primary" onClick={() => openSheet({ kind: "goal", module: mod === "all" ? undefined : mod })}>Create a goal</Button> : undefined}
          />
        </Card>
      )}
    </div>
  );
}
