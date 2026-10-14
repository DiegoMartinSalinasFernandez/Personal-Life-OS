"use client";

import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/page";
import { SubNav } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { openSheet } from "@/lib/store/ui";

export default function NutritionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        eyebrow="Nutrition"
        accent="nutrition"
        title="Food & protein"
        description="Log meals in seconds and keep an eye on your daily protein target."
        actions={
          <Button variant="primary" onClick={() => openSheet({ kind: "food" })}>
            <Plus /> Add food
          </Button>
        }
      >
        <SubNav
          accent="nutrition"
          items={[
            { href: "/nutrition", label: "Today", exact: true },
            { href: "/nutrition/history", label: "History" },
            { href: "/nutrition/plan", label: "Meal plan" },
            { href: "/nutrition/foods", label: "Foods & meals" },
          ]}
        />
      </PageHeader>
      {children}
    </>
  );
}
