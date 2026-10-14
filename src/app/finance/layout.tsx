"use client";

import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/page";
import { SubNav } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { openSheet } from "@/lib/store/ui";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        eyebrow="Finance"
        accent="finance"
        title="Money"
        description="Balances, cash flow, budgets and upcoming bills — from your own records."
        actions={
          <Button variant="primary" onClick={() => openSheet({ kind: "transaction" })}>
            <Plus /> Add transaction
          </Button>
        }
      >
        <SubNav
          accent="finance"
          items={[
            { href: "/finance", label: "Overview", exact: true },
            { href: "/finance/transactions", label: "Transactions" },
            { href: "/finance/accounts", label: "Accounts" },
            { href: "/finance/budgets", label: "Budgets" },
            { href: "/finance/bills", label: "Bills & recurring" },
            { href: "/finance/goals", label: "Savings goals" },
            { href: "/finance/imports", label: "Imports" },
          ]}
        />
      </PageHeader>
      {children}
    </>
  );
}
