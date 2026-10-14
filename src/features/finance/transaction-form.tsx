"use client";

import { useMemo } from "react";
import { z } from "zod";
import { Trash2, Repeat } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Switch, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { useForm } from "@/lib/hooks/use-form";
import { useDb, useToday, actions } from "@/lib/hooks";
import { centsToInput, currencyDigits, parseMoney } from "@/lib/domain/money";
import { isISODate } from "@/lib/domain/dates";
import type { Transaction, TxType } from "@/lib/domain/types";
import { closeSheet } from "@/lib/store/ui";
import { AccountOptions, CategoryOptions, parseTags } from "@/features/common/options";
import Link from "next/link";
import { Wallet } from "lucide-react";

type Values = {
  type: TxType;
  amount: string;
  description: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  date: string;
  merchant: string;
  tags: string;
  notes: string;
  recurring: boolean;
  frequency: "weekly" | "monthly" | "yearly";
  digits: number;
};

const schema = z
  .object({
    type: z.enum(["income", "expense", "transfer"]),
    amount: z.string(),
    description: z.string().trim().max(120, "Keep it under 120 characters"),
    accountId: z.string().min(1, "Choose an account"),
    toAccountId: z.string(),
    categoryId: z.string(),
    date: z.string().refine(isISODate, "Enter a valid date"),
    merchant: z.string().trim().max(80),
    tags: z.string(),
    notes: z.string().max(1000),
    recurring: z.boolean(),
    frequency: z.enum(["weekly", "monthly", "yearly"]),
    digits: z.number(),
  })
  .superRefine((v, ctx) => {
    const cents = parseMoney(v.amount, v.digits);
    if (cents == null) ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter an amount, e.g. 24.90" });
    else if (cents <= 0) ctx.addIssue({ code: "custom", path: ["amount"], message: "Amount must be greater than zero" });
    if (!v.description && !v.merchant) ctx.addIssue({ code: "custom", path: ["description"], message: "Add a description" });
    if (v.type === "transfer") {
      if (!v.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose a destination account" });
      else if (v.toAccountId === v.accountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Pick a different account" });
    }
  });

export function TransactionDialog({ id, defaults }: { id?: string; defaults?: Partial<Transaction> }) {
  const db = useDb();
  const today = useToday();
  const existing = id ? db.transactions.find((t) => t.id === id) : undefined;
  const activeAccounts = db.accounts.filter((a) => !a.archived);
  const src = { ...defaults, ...existing };
  const firstAccount = src.accountId ?? activeAccounts[0]?.id ?? "";
  const accCurrency = (accId: string) => db.accounts.find((a) => a.id === accId)?.currency ?? db.profile.currency;

  const { values, set, errors, handleSubmit } = useForm<Values, z.infer<typeof schema>>(schema, {
    type: src.type ?? "expense",
    amount: src.amount ? centsToInput(src.amount, currencyDigits(accCurrency(firstAccount))) : "",
    description: src.description ?? "",
    accountId: firstAccount,
    toAccountId: src.toAccountId ?? "",
    categoryId: src.categoryId ?? "",
    date: src.date ?? today,
    merchant: src.merchant ?? "",
    tags: (src.tags ?? []).join(", "),
    notes: src.notes ?? "",
    recurring: false,
    frequency: "monthly",
    digits: currencyDigits(accCurrency(firstAccount)),
  });
  const currency = accCurrency(values.accountId);
  const recurringItem = existing?.recurringId ? db.recurring.find((r) => r.id === existing.recurringId) : null;
  const fromCur = accCurrency(values.accountId);
  const toCur = values.toAccountId ? accCurrency(values.toAccountId) : fromCur;
  const categoryKind = values.type === "income" ? "income" : "expense";
  const categoryValid = useMemo(() => !values.categoryId || db.categories.some((c) => c.id === values.categoryId && c.kind === categoryKind), [values.categoryId, db.categories, categoryKind]);

  const onSubmit = handleSubmit((v) => {
    const amount = parseMoney(v.amount, v.digits)!;
    const record = {
      type: v.type,
      amount,
      description: v.description || v.merchant,
      accountId: v.accountId,
      toAccountId: v.type === "transfer" ? v.toAccountId : null,
      categoryId: v.type === "transfer" || !categoryValid ? null : v.categoryId || null,
      date: v.date,
      merchant: v.merchant || undefined,
      tags: parseTags(v.tags),
      notes: v.notes || undefined,
    };
    const s = actions();
    if (existing) {
      s.update("transactions", existing.id, record);
      toast("Transaction updated");
    } else {
      let recurringId: string | null = null;
      if (v.recurring && v.type !== "transfer") {
        recurringId = s.add("recurring", {
          kind: v.type === "income" ? "income" : "bill",
          name: record.description,
          amount,
          accountId: v.accountId,
          categoryId: record.categoryId,
          merchant: record.merchant,
          startDate: v.date,
          rule: { freq: v.frequency, interval: 1 },
          remindDaysBefore: 3,
          active: true,
        });
      }
      s.add("transactions", { ...record, recurringId, occurrenceDate: recurringId ? v.date : null });
      toast(recurringId ? "Transaction added and scheduled to repeat" : "Transaction added");
    }
    closeSheet();
  });

  const onDelete = async () => {
    if (!existing) return;
    if (!(await confirm({ title: "Delete this transaction?", description: "Balances, budgets and reports will be recalculated. This can't be undone." }))) return;
    actions().remove("transactions", existing.id);
    toast("Transaction deleted", {
      action: { label: "Undo", onClick: () => actions().add("transactions", existing) },
    });
    closeSheet();
  };

  if (!activeAccounts.length && !existing) {
    return (
      <Dialog open onClose={closeSheet} title="Add a transaction" size="sm">
        <EmptyState icon={<Wallet />} title="Create an account first" description="Transactions belong to an account such as checking, cash or a credit card." action={<Link href="/finance/accounts?new=1" onClick={closeSheet}><Button variant="primary">Add account</Button></Link>} compact />
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={closeSheet}
      title={existing ? "Edit transaction" : "Add transaction"}
      description={recurringItem ? <span className="inline-flex items-center gap-1.5"><Repeat className="size-3.5" /> Settles “{recurringItem.name}”</span> : undefined}
      footer={
        <>
          {existing ? (
            <Button variant="ghost" className="mr-auto text-negative hover:text-negative" onClick={onDelete}>
              <Trash2 /> Delete
            </Button>
          ) : null}
          <Button onClick={closeSheet}>Cancel</Button>
          <Button variant="primary" type="submit" form="tx-form">
            {existing ? "Save changes" : "Add transaction"}
          </Button>
        </>
      }
    >
      <form id="tx-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <Segmented
            label="Transaction type"
            value={values.type}
            onChange={(t) => set("type", t)}
            options={[
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
              { value: "transfer", label: "Transfer" },
            ]}
          />
        </div>
        <Field label="Amount" error={errors.amount}>
          {(p) => (
            <MoneyInput
              {...p}
              currency={currency}
              value={values.amount}
              onChange={(e) => set("amount", e.target.value)}
              placeholder="0.00"
              autoFocus={!existing}
              onBlur={() => set("digits", currencyDigits(currency))}
            />
          )}
        </Field>
        <Field label="Date" error={errors.date}>
          {(p) => <Input {...p} type="date" value={values.date} onChange={(e) => set("date", e.target.value)} />}
        </Field>
        <Field label="Description" error={errors.description} className="sm:col-span-2">
          {(p) => <Input {...p} value={values.description} onChange={(e) => set("description", e.target.value)} placeholder={values.type === "transfer" ? "e.g. Move to savings" : "e.g. Weekly groceries"} />}
        </Field>
        <Field label={values.type === "transfer" ? "From account" : "Account"} error={errors.accountId}>
          {(p) => (
            <Select
              {...p}
              value={values.accountId}
              onChange={(e) => {
                set("accountId", e.target.value);
                set("digits", currencyDigits(accCurrency(e.target.value)));
              }}
            >
              <AccountOptions accounts={db.accounts} includeArchivedId={existing?.accountId} />
            </Select>
          )}
        </Field>
        {values.type === "transfer" ? (
          <Field label="To account" error={errors.toAccountId} hint={fromCur !== toCur ? "Different currencies: the same amount is moved; no exchange rate is applied." : "Transfers don't count as income or spending."}>
            {(p) => (
              <Select {...p} value={values.toAccountId} onChange={(e) => set("toAccountId", e.target.value)}>
                <option value="">Choose…</option>
                <AccountOptions accounts={db.accounts.filter((a) => a.id !== values.accountId)} includeArchivedId={existing?.toAccountId ?? undefined} />
              </Select>
            )}
          </Field>
        ) : (
          <Field label="Category" optional>
            {(p) => (
              <Select {...p} value={categoryValid ? values.categoryId : ""} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">Uncategorized</option>
                <CategoryOptions categories={db.categories} kind={categoryKind} />
              </Select>
            )}
          </Field>
        )}
        {values.type !== "transfer" ? (
          <Field label={values.type === "income" ? "Payer" : "Merchant"} optional>
            {(p) => <Input {...p} value={values.merchant} onChange={(e) => set("merchant", e.target.value)} placeholder={values.type === "income" ? "e.g. Employer" : "e.g. Green Market"} />}
          </Field>
        ) : null}
        <Field label="Tags" optional hint="Separate with commas" className={values.type === "transfer" ? "sm:col-span-2" : ""}>
          {(p) => <Input {...p} value={values.tags} onChange={(e) => set("tags", e.target.value)} placeholder="trip, work" />}
        </Field>
        <Field label="Notes" optional className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} />}
        </Field>
        {!existing && values.type !== "transfer" ? (
          <div className="rounded-md border border-line bg-subtle px-3 py-2 sm:col-span-2">
            <Switch checked={values.recurring} onChange={(v) => set("recurring", v)} label="Repeats" description="Creates a recurring item; future occurrences appear under Bills & recurring until you mark them paid." />
            {values.recurring ? (
              <div className="mt-2 pb-1">
                <Segmented size="sm" label="Frequency" value={values.frequency} onChange={(f) => set("frequency", f)} options={[{ value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }]} />
              </div>
            ) : null}
          </div>
        ) : null}
        {existing?.recurringId && existing.occurrenceDate ? (
          <p className="text-caption text-ink-3 sm:col-span-2">
            <Badge tone="finance">Recurring</Badge> Recorded for the occurrence scheduled on {existing.occurrenceDate}.
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
