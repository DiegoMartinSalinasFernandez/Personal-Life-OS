"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { z } from "zod";
import { Plus, MoreHorizontal, Pencil, Archive, Trash2, Wallet, Landmark, CreditCard, PiggyBank, Banknote, LineChart, CircleDollarSign, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Menu } from "@/components/ui/menu";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { Field, Input, MoneyInput, Select } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { cn } from "@/lib/cn";
import { useForm } from "@/lib/hooks/use-form";
import { useDb, useMoney, useToday, actions } from "@/lib/hooks";
import { accountBalance, balanceSummary, isLiability } from "@/lib/calc/finance";
import { CURRENCIES, centsToInput, currencyDigits, parseMoney } from "@/lib/domain/money";
import { isISODate, formatDate } from "@/lib/domain/dates";
import type { Account, AccountType } from "@/lib/domain/types";
import { PALETTE } from "@/lib/data/defaults";
import { ACCOUNT_TYPE_LABEL } from "@/features/finance/shared";

const TYPE_ICON: Record<AccountType, typeof Wallet> = { cash: Banknote, checking: Landmark, savings: PiggyBank, credit: CreditCard, investment: LineChart, loan: CircleDollarSign, other: Wallet };

function AccountsInner() {
  const db = useDb();
  const money = useMoney();
  const params = useSearchParams();
  const router = useRouter();
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  useEffect(() => {
    if (params.get("new")) {
      setEditing("new");
      router.replace("/finance/accounts");
    }
  }, [params, router]);

  const summary = useMemo(() => balanceSummary(db.accounts, db.transactions, money.currency), [db.accounts, db.transactions, money.currency]);
  const rows = useMemo(
    () =>
      db.accounts
        .filter((a) => showArchived || !a.archived)
        .map((a) => ({ a, balance: accountBalance(a, db.transactions), count: db.transactions.filter((t) => t.accountId === a.id || t.toAccountId === a.id).length })),
    [db.accounts, db.transactions, showArchived],
  );
  const assets = rows.filter((r) => !isLiability(r.a));
  const liabilities = rows.filter((r) => isLiability(r.a));

  const del = async (a: Account, count: number) => {
    const ok = await confirm({
      title: `Delete “${a.name}”?`,
      description: count ? (
        <>This permanently deletes the account and its <strong>{count} transactions</strong> (including transfers to or from it), plus its recurring items. Consider archiving instead — archived accounts keep their history.</>
      ) : (
        "This account has no transactions."
      ),
      confirmLabel: count ? `Delete account and ${count} transactions` : "Delete account",
    });
    if (!ok) return;
    actions().deleteAccount(a.id);
    toast("Account deleted");
  };

  const Section = ({ title, items, total }: { title: string; items: typeof rows; total: string }) => (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-md font-semibold">{title}</h2>
        <span className="num text-base font-semibold text-ink-2">{total}</span>
      </div>
      {items.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(({ a, balance, count }) => {
            const Icon = TYPE_ICON[a.type];
            return (
              <article key={a.id} className={cn("card flex flex-col gap-4 p-4", a.archived && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <span className="grid size-9 place-items-center rounded-md" style={{ background: `${a.color}1f`, color: a.color }}>
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold">{a.name}</h3>
                    <p className="truncate text-caption text-ink-3">
                      {ACCOUNT_TYPE_LABEL[a.type]}
                      {a.institution ? ` · ${a.institution}` : ""}
                    </p>
                  </div>
                  <Menu
                    label="Account actions"
                    trigger={(p) => (
                      <Button {...p} size="icon-sm" variant="ghost" aria-label={`Actions for ${a.name}`}>
                        <MoreHorizontal />
                      </Button>
                    )}
                    items={[
                      { label: "Edit", icon: <Pencil />, onSelect: () => setEditing(a) },
                      { label: a.archived ? "Unarchive" : "Archive", icon: <Archive />, onSelect: () => { actions().update("accounts", a.id, { archived: !a.archived }); toast(a.archived ? "Account restored" : "Account archived — history kept"); } },
                      "separator",
                      { label: "Delete…", icon: <Trash2 />, danger: true, onSelect: () => del(a, count) },
                    ]}
                  />
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className={cn("num text-xl font-semibold tracking-tight", balance < 0 && "text-negative")}>{money(balance, {}, a.currency)}</p>
                    <p className="text-caption text-ink-3">{isLiability(a) ? (balance < 0 ? "owed" : "credit balance") : "current balance"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {a.currency !== money.currency ? <Badge tone="info">{a.currency} · not in totals</Badge> : null}
                    {a.archived ? <Badge>Archived</Badge> : null}
                    <Link href={`/finance/transactions?account=${a.id}`} className="text-caption font-medium text-ink-2 hover:text-ink">
                      {count} transactions →
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-line p-4 text-sm text-ink-3">None yet.</p>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Assets", money(summary.assets)],
          ["Liabilities", summary.liabilities ? `−${money(summary.liabilities)}` : money(0)],
          ["Net worth", money(summary.net)],
        ].map(([l, v]) => (
          <div key={l} className="card p-4">
            <p className="text-sm text-ink-3">{l}</p>
            <p className="num mt-1 text-xl font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-caption text-ink-3">
          <Info className="size-3.5" /> Balances = opening balance + recorded transactions. Bank sync isn&apos;t connected.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowArchived((s) => !s)}>
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
          <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
            <Plus /> Add account
          </Button>
        </div>
      </div>
      {db.accounts.length ? (
        <>
          <Section title="Assets" items={assets} total={money(assets.filter((r) => r.a.currency === money.currency && !r.a.archived).reduce((s, r) => s + r.balance, 0))} />
          <Section title="Liabilities" items={liabilities} total={money(liabilities.filter((r) => r.a.currency === money.currency && !r.a.archived).reduce((s, r) => s + r.balance, 0))} />
        </>
      ) : (
        <Card>
          <EmptyState icon={<Wallet />} title="No accounts yet" description="Add checking, savings, cash, credit cards or any custom account." action={<Button variant="primary" onClick={() => setEditing("new")}>Add account</Button>} />
        </Card>
      )}
      {editing ? <AccountDialog account={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

type Values = { name: string; type: AccountType; currency: string; opening: string; openingDate: string; institution: string; color: string };
const schema = z.object({
  name: z.string().trim().min(1, "Name the account").max(60),
  type: z.enum(["cash", "checking", "savings", "credit", "investment", "loan", "other"]),
  currency: z.string().length(3),
  opening: z.string().refine((s) => s.trim() === "" || parseMoney(s) != null, "Enter a valid amount"),
  openingDate: z.string().refine(isISODate, "Enter a valid date"),
  institution: z.string().max(60),
  color: z.string(),
});

function AccountDialog({ account, onClose }: { account?: Account; onClose: () => void }) {
  const today = useToday();
  const db = useDb();
  const { values, set, errors, handleSubmit } = useForm<Values, z.infer<typeof schema>>(schema, {
    name: account?.name ?? "",
    type: account?.type ?? "checking",
    currency: account?.currency ?? db.profile.currency,
    opening: account ? centsToInput(isLiability(account) ? -account.openingBalance : account.openingBalance, currencyDigits(account.currency)) : "",
    openingDate: account?.openingDate ?? today,
    institution: account?.institution ?? "",
    color: account?.color ?? PALETTE[db.accounts.length % PALETTE.length],
  });
  const liability = values.type === "credit" || values.type === "loan";
  const hasTx = account ? db.transactions.some((t) => t.accountId === account.id || t.toAccountId === account.id) : false;

  const submit = handleSubmit((v) => {
    const raw = v.opening.trim() ? parseMoney(v.opening, currencyDigits(v.currency))! : 0;
    // Liabilities are entered as the amount owed (positive) and stored negative.
    const openingBalance = liability ? -Math.abs(raw) : raw;
    const rec = { name: v.name, type: v.type, currency: v.currency, openingBalance, openingDate: v.openingDate, institution: v.institution || undefined, color: v.color };
    if (account) actions().update("accounts", account.id, rec);
    else actions().add("accounts", { ...rec, archived: false });
    toast(account ? "Account updated" : "Account added");
    onClose();
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={account ? "Edit account" : "Add account"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="acc-form">
            {account ? "Save" : "Add account"}
          </Button>
        </>
      }
    >
      <form id="acc-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Account name" error={errors.name} className="sm:col-span-2">
          {(p) => <Input {...p} value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Everyday checking" autoFocus />}
        </Field>
        <Field label="Type">
          {(p) => (
            <Select {...p} value={values.type} onChange={(e) => set("type", e.target.value as AccountType)}>
              {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => (
                <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Currency" hint={hasTx ? "Changing currency doesn't convert existing amounts." : undefined}>
          {(p) => (
            <Select {...p} value={values.currency} onChange={(e) => set("currency", e.target.value)}>
              {[...new Set([values.currency, ...CURRENCIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={liability ? "Amount owed at start" : "Opening balance"} error={errors.opening} hint={liability ? "Enter what you owe as a positive number." : "Balance before the first transaction you'll record."}>
          {(p) => <MoneyInput {...p} currency={values.currency} value={values.opening} onChange={(e) => set("opening", e.target.value)} placeholder="0.00" />}
        </Field>
        <Field label="As of" error={errors.openingDate}>
          {(p) => <Input {...p} type="date" value={values.openingDate} onChange={(e) => set("openingDate", e.target.value)} />}
        </Field>
        <Field label="Institution" optional className="sm:col-span-2">
          {(p) => <Input {...p} value={values.institution} onChange={(e) => set("institution", e.target.value)} placeholder="Bank or provider" />}
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-medium text-ink-2">Colour</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colour">
            {PALETTE.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={values.color === c} aria-label={c} onClick={() => set("color", c)} className={cn("size-6 rounded-full ring-offset-2 ring-offset-surface", values.color === c && "ring-2 ring-ink")} style={{ background: c }} />
            ))}
          </div>
        </div>
        {account ? <p className="text-caption text-ink-3 sm:col-span-2">Created {formatDate(account.createdAt.slice(0, 10), { month: "short", day: "numeric", year: "numeric" })}</p> : null}
      </form>
    </Dialog>
  );
}

export default function AccountsPage() {
  return (
    <Suspense>
      <AccountsInner />
    </Suspense>
  );
}
