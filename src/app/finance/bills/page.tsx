"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { Plus, Pencil, CheckCircle2, Clock, AlertCircle, CalendarDays, Undo2, Repeat } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { Segmented } from "@/components/ui/tabs";
import { Field, Input, MoneyInput, Select, Switch } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { cn } from "@/lib/cn";
import { useForm } from "@/lib/hooks/use-form";
import { useDb, useMoney, useToday, actions } from "@/lib/hooks";
import { monthlyEquivalent, recurringOccurrences, type Occurrence } from "@/lib/calc/finance";
import { addDays, diffDays, formatDate, isISODate, relativeDay } from "@/lib/domain/dates";
import { describeRecurrence, nextOccurrence } from "@/lib/domain/recurrence";
import { centsToInput, currencyDigits, parseMoney } from "@/lib/domain/money";
import type { RecurringItem, RecurringKind } from "@/lib/domain/types";
import { AccountOptions, CategoryOptions } from "@/features/common/options";

const KIND_LABEL: Record<RecurringKind, string> = { bill: "Bill", subscription: "Subscription", income: "Income" };

function StatusBadge({ o }: { o: Occurrence }) {
  if (o.status === "paid") return <Badge tone="positive" icon={<CheckCircle2 />}>{o.item.kind === "income" ? "Received" : "Paid"}</Badge>;
  if (o.status === "overdue") return <Badge tone="negative" icon={<AlertCircle />}>Overdue</Badge>;
  if (o.status === "due") return <Badge tone="warning" icon={<Clock />}>Due soon</Badge>;
  return <Badge tone="outline" icon={<CalendarDays />}>Scheduled</Badge>;
}

function BillsInner() {
  const db = useDb();
  const money = useMoney();
  const today = useToday();
  const params = useSearchParams();
  const router = useRouter();
  const [horizon, setHorizon] = useState<"30" | "60" | "90">("30");
  const [editing, setEditing] = useState<RecurringItem | "new" | null>(null);
  useEffect(() => {
    if (params.get("new")) {
      setEditing("new");
      router.replace("/finance/bills");
    }
  }, [params, router]);

  const occ = useMemo(() => recurringOccurrences(db.recurring, db.transactions, addDays(today, -30), addDays(today, Number(horizon)), today), [db.recurring, db.transactions, today, horizon]);
  const overdue = occ.filter((o) => o.status === "overdue");
  const upcoming = occ.filter((o) => o.date >= today && o.status !== "paid");
  const recentPaid = occ.filter((o) => o.status === "paid").reverse().slice(0, 8);
  const outgoing = db.recurring.filter((r) => r.active && r.kind !== "income");
  const monthlyOut = outgoing.reduce((s, r) => s + monthlyEquivalent(r), 0);
  const monthlySubs = outgoing.filter((r) => r.kind === "subscription").reduce((s, r) => s + monthlyEquivalent(r), 0);
  const monthlyIn = db.recurring.filter((r) => r.active && r.kind === "income").reduce((s, r) => s + monthlyEquivalent(r), 0);
  const upcomingTotal = upcoming.filter((o) => o.item.kind !== "income").reduce((s, o) => s + o.item.amount, 0);
  const accMap = new Map(db.accounts.map((a) => [a.id, a]));

  const settle = (o: Occurrence) => {
    const id = actions().settleOccurrence(o.item.id, o.date, { date: o.date <= today ? (o.status === "overdue" ? today : o.date) : today });
    if (id) toast(`${o.item.name} recorded as ${o.item.kind === "income" ? "received" : "paid"}`, { action: { label: "Undo", onClick: () => actions().remove("transactions", id) } });
  };

  const Row = ({ o }: { o: Occurrence }) => {
    const cur = accMap.get(o.item.accountId)?.currency ?? money.currency;
    const d = diffDays(today, o.date);
    return (
      <li className="flex flex-wrap items-center gap-3 py-2.5 sm:flex-nowrap">
        <div className="grid w-12 shrink-0 place-items-center rounded-md border border-line py-1 text-center leading-none">
          <span className="text-micro uppercase text-ink-3">{formatDate(o.date, { month: "short" })}</span>
          <span className="num text-md font-semibold">{Number(o.date.slice(8))}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-base font-medium">
            {o.item.name}
            <span className="text-caption font-normal text-ink-3">{KIND_LABEL[o.item.kind]}</span>
          </p>
          <p className="text-caption text-ink-3">
            {o.status === "overdue" ? `${-d} day${d === -1 ? "" : "s"} overdue` : relativeDay(o.date, today)} · {accMap.get(o.item.accountId)?.name}
          </p>
        </div>
        <StatusBadge o={o} />
        <span className={cn("num w-24 text-right text-base font-semibold", o.item.kind === "income" && "text-positive")}>
          {o.item.kind === "income" ? "+" : ""}
          {money(o.item.amount, {}, cur)}
        </span>
        {o.status === "paid" ? (
          <Button size="sm" variant="ghost" onClick={() => { actions().remove("transactions", o.paidTx!.id); toast("Payment record removed"); }} aria-label={`Undo payment for ${o.item.name}`}>
            <Undo2 />
          </Button>
        ) : (
          <Button size="sm" onClick={() => settle(o)}>{o.item.kind === "income" ? "Received" : "Mark paid"}</Button>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Recurring out / month", money(monthlyOut)],
          ["Subscriptions / month", money(monthlySubs)],
          ["Recurring income / month", money(monthlyIn)],
          [`Due next ${horizon} days`, money(upcomingTotal)],
        ].map(([l, v]) => (
          <div key={l} className="card p-4">
            <p className="text-sm text-ink-3">{l}</p>
            <p className="num mt-1 text-lg font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader title="Schedule" subtitle="Scheduled items only become transactions when you mark them paid." action={<Segmented size="sm" label="Horizon" value={horizon} onChange={setHorizon} options={[{ value: "30", label: "30d" }, { value: "60", label: "60d" }, { value: "90", label: "90d" }]} />} />
          <CardBody>
            {!db.recurring.length ? (
              <EmptyState icon={<Repeat />} title="No recurring items" description="Add rent, utilities, subscriptions or salary to see what's coming up." action={<Button variant="primary" onClick={() => setEditing("new")}>Add recurring item</Button>} />
            ) : (
              <>
                {overdue.length ? (
                  <>
                    <p className="eyebrow mb-1 text-negative">Overdue</p>
                    <ul className="mb-4 divide-y divide-line">{overdue.map((o) => <Row key={o.item.id + o.date} o={o} />)}</ul>
                  </>
                ) : null}
                <p className="eyebrow mb-1">Upcoming</p>
                {upcoming.length ? <ul className="divide-y divide-line">{upcoming.map((o) => <Row key={o.item.id + o.date} o={o} />)}</ul> : <p className="py-4 text-sm text-ink-3">Nothing scheduled in this window.</p>}
                {recentPaid.length ? (
                  <>
                    <p className="eyebrow mb-1 mt-5">Recently settled</p>
                    <ul className="divide-y divide-line opacity-80">{recentPaid.map((o) => <Row key={o.item.id + o.date} o={o} />)}</ul>
                  </>
                ) : null}
              </>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title="Recurring items" action={<Button size="sm" variant="primary" onClick={() => setEditing("new")}><Plus /> Add</Button>} />
          <CardBody>
            <ul className="divide-y divide-line">
              {[...db.recurring].sort((a, b) => Number(b.active) - Number(a.active) || a.kind.localeCompare(b.kind) || b.amount - a.amount).map((r) => {
                const next = r.active ? nextOccurrence(r.startDate, r.rule, today, true) : null;
                return (
                  <li key={r.id} className={cn("flex items-center gap-3 py-2.5", !r.active && "opacity-50")}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium">{r.name}</p>
                      <p className="truncate text-caption text-ink-3">
                        {KIND_LABEL[r.kind]} · {describeRecurrence(r.rule)}
                        {next ? ` · next ${formatDate(next)}` : r.active ? "" : " · paused"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="num text-base font-semibold">{money(r.amount, {}, accMap.get(r.accountId)?.currency)}</p>
                      {r.rule.freq !== "monthly" || r.rule.interval !== 1 ? <p className="num text-caption text-ink-3">≈ {money(monthlyEquivalent(r))}/mo</p> : null}
                    </div>
                    <Button size="icon-sm" variant="ghost" onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`}><Pencil /></Button>
                  </li>
                );
              })}
            </ul>
            {!db.recurring.length ? <p className="text-sm text-ink-3">None yet.</p> : null}
          </CardBody>
        </Card>
      </div>
      {editing ? <RecurringDialog item={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

type Values = { kind: RecurringKind; name: string; amount: string; accountId: string; categoryId: string; merchant: string; startDate: string; freq: "weekly" | "monthly" | "yearly"; interval: string; remind: string; active: boolean };
const schema = z.object({
  kind: z.enum(["bill", "subscription", "income"]),
  name: z.string().trim().min(1, "Give it a name").max(80),
  amount: z.string().refine((s) => (parseMoney(s) ?? 0) > 0, "Enter an amount above zero"),
  accountId: z.string().min(1, "Choose an account"),
  categoryId: z.string(),
  merchant: z.string().max(80),
  startDate: z.string().refine(isISODate, "Enter a valid date"),
  freq: z.enum(["weekly", "monthly", "yearly"]),
  interval: z.string().refine((s) => /^\d+$/.test(s) && Number(s) >= 1 && Number(s) <= 24, "1–24"),
  remind: z.string(),
  active: z.boolean(),
});

function RecurringDialog({ item, onClose }: { item?: RecurringItem; onClose: () => void }) {
  const db = useDb();
  const today = useToday();
  const acc = (id: string) => db.accounts.find((a) => a.id === id);
  const { values, set, errors, handleSubmit } = useForm<Values, z.infer<typeof schema>>(schema, {
    kind: item?.kind ?? "bill",
    name: item?.name ?? "",
    amount: item ? centsToInput(item.amount, currencyDigits(acc(item.accountId)?.currency ?? "USD")) : "",
    accountId: item?.accountId ?? db.accounts.find((a) => !a.archived)?.id ?? "",
    categoryId: item?.categoryId ?? "",
    merchant: item?.merchant ?? "",
    startDate: item?.startDate ?? today,
    freq: item?.rule.freq === "daily" ? "weekly" : item?.rule.freq ?? "monthly",
    interval: String(item?.rule.interval ?? 1),
    remind: String(item?.remindDaysBefore ?? 3),
    active: item?.active ?? true,
  });
  const currency = acc(values.accountId)?.currency ?? db.profile.currency;

  const submit = handleSubmit((v) => {
    const rec = { kind: v.kind, name: v.name, amount: parseMoney(v.amount, currencyDigits(currency))!, accountId: v.accountId, categoryId: v.categoryId || null, merchant: v.merchant || undefined, startDate: v.startDate, rule: { freq: v.freq, interval: Number(v.interval) }, remindDaysBefore: Number(v.remind), active: v.active };
    if (item) actions().update("recurring", item.id, rec);
    else actions().add("recurring", rec);
    toast(item ? "Recurring item updated" : "Recurring item added");
    onClose();
  });
  const del = async () => {
    if (!item) return;
    if (!(await confirm({ title: `Delete “${item.name}”?`, description: "Future occurrences disappear. Payments you already recorded stay in your transactions." }))) return;
    actions().deleteRecurring(item.id);
    toast("Recurring item deleted");
    onClose();
  };

  if (!db.accounts.length) return <Dialog open onClose={onClose} title="Add an account first" size="sm"><p className="text-base text-ink-2">Recurring items are paid from an account. Create one under Accounts.</p></Dialog>;

  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? "Edit recurring item" : "New recurring item"}
      footer={
        <>
          {item ? <Button variant="ghost" className="mr-auto text-negative hover:text-negative" onClick={del}>Delete</Button> : null}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="rec-form">Save</Button>
        </>
      }
    >
      <form id="rec-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <Segmented label="Kind" value={values.kind} onChange={(k) => { set("kind", k); set("categoryId", ""); }} options={[{ value: "bill", label: "Bill" }, { value: "subscription", label: "Subscription" }, { value: "income", label: "Income" }]} />
        </div>
        <Field label="Name" error={errors.name}>
          {(p) => <Input {...p} value={values.name} onChange={(e) => set("name", e.target.value)} placeholder={values.kind === "income" ? "Salary" : "Electricity"} autoFocus />}
        </Field>
        <Field label="Amount" error={errors.amount} hint="Use the typical amount; adjust when you mark it paid.">
          {(p) => <MoneyInput {...p} currency={currency} value={values.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" />}
        </Field>
        <Field label="Account" error={errors.accountId}>
          {(p) => <Select {...p} value={values.accountId} onChange={(e) => set("accountId", e.target.value)}><AccountOptions accounts={db.accounts} includeArchivedId={item?.accountId} /></Select>}
        </Field>
        <Field label="Category" optional>
          {(p) => (
            <Select {...p} value={values.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">Uncategorized</option>
              <CategoryOptions categories={db.categories} kind={values.kind === "income" ? "income" : "expense"} />
            </Select>
          )}
        </Field>
        <Field label="First date" error={errors.startDate}>
          {(p) => <Input {...p} type="date" value={values.startDate} onChange={(e) => set("startDate", e.target.value)} />}
        </Field>
        <Field label="Repeats" error={errors.interval}>
          {(p) => (
            <div className="flex gap-2">
              <span className="self-center text-sm text-ink-3">Every</span>
              <Input {...p} className="w-14 text-center" inputMode="numeric" value={values.interval} onChange={(e) => set("interval", e.target.value.replace(/\D/g, ""))} aria-label="Interval" />
              <Select value={values.freq} onChange={(e) => set("freq", e.target.value as Values["freq"])} aria-label="Frequency">
                <option value="weekly">week(s)</option>
                <option value="monthly">month(s)</option>
                <option value="yearly">year(s)</option>
              </Select>
            </div>
          )}
        </Field>
        <Field label="Merchant / payer" optional>
          {(p) => <Input {...p} value={values.merchant} onChange={(e) => set("merchant", e.target.value)} />}
        </Field>
        <Field label="Remind me" hint="In-app reminder">
          {(p) => (
            <Select {...p} value={values.remind} onChange={(e) => set("remind", e.target.value)}>
              {[0, 1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d === 0 ? "On the day" : `${d} day${d > 1 ? "s" : ""} before`}</option>)}
            </Select>
          )}
        </Field>
        <div className="sm:col-span-2"><Switch checked={values.active} onChange={(v) => set("active", v)} label="Active" description="Paused items don't generate upcoming occurrences." /></div>
      </form>
    </Dialog>
  );
}

export default function BillsPage() {
  return (
    <Suspense>
      <BillsInner />
    </Suspense>
  );
}
