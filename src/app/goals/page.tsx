"use client";

import { PageHeader } from "@/components/shell/page";
import { GoalsBoard } from "@/features/goals/goals-board";

export default function GoalsPage() {
  return (
    <>
      <PageHeader title="Goals" description="Medium- and long-term goals across money, nutrition and your projects — each measured in its own terms." />
      <GoalsBoard allowModuleFilter />
    </>
  );
}
