"use client";

import { Plus, CalendarPlus } from "lucide-react";
import { PageHeader } from "@/components/shell/page";
import { SubNav } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { openSheet } from "@/lib/store/ui";

export default function ActivitiesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        eyebrow="Activities"
        accent="activities"
        title="Plan & do"
        description="Tasks, calendar, projects and habits — what matters today, and what's simply due."
        actions={
          <>
            <Button onClick={() => openSheet({ kind: "event" })}>
              <CalendarPlus /> Event
            </Button>
            <Button variant="primary" onClick={() => openSheet({ kind: "task" })}>
              <Plus /> Task
            </Button>
          </>
        }
      >
        <SubNav
          accent="activities"
          items={[
            { href: "/activities", label: "Today", exact: true },
            { href: "/activities/tasks", label: "Tasks" },
            { href: "/activities/calendar", label: "Calendar" },
            { href: "/activities/projects", label: "Projects" },
            { href: "/activities/habits", label: "Habits" },
          ]}
        />
      </PageHeader>
      {children}
    </>
  );
}
