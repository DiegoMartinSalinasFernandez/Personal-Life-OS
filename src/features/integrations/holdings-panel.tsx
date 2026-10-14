"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, FileUp, LineChart, Info } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Select } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { useDb, useMoney, useToday, actions } from "@/lib/hooks";
import { formatDate, isISODate } from "@/lib/domain/dates";
import { centsToInput, CURRENCIES, currencyDigits, parseMoney } from "@/lib/domain/money";
import type { Account, Holding } from "@/lib/domain/types";
import { ImportDialog } from "./import-dialog";

/**
 * Investment positions are kept apart from cash balances: valuations come
 * only from imported files or manual entries, always with their date.
 */
export function HoldingsPanel() {
  const db = useDb();
  const money = useMoney();
  const [editing, setEditing] = useState<{ account: Account; holding?: Holding } | null>(null);
  const [importFor, setImportFor] = useState<Account | null>(null);
  const accounts = db.accounts.filter((a) => !a.archived && (a.type === "investment" || db.holdings.some((h) => h.accountId === a.id)));
  const sourceName = (id: string | null) => db.integrationSources.find((s) => s.id === id)?.name ?? "import";

  return (
    <Card id="holdings" className="scroll-mt-20">
      <CardHeader title="Investment holdings" subtitle="Valuations as of the date provided — not live prices, and not part of cash balances or income/expenses." icon={<LineChart className="size-4 text-ink-3" />} />
      <CardBody className="flex flex-col gap-5">
        {!accounts.length ? <p className="text-sm text-ink-3">Add an account of type “Investment” to track positions.</p> : null}
        {accounts.map((a) => {
          const hs = db.holdings.filter((h) => h.accountId === a.id).sort((x, y) => x.symbol.localeCompare(y.symbol));
          const byCur = new Map<string, number>();
          for (const h of hs) if (h.valuation != null) byCur.set(h.currency, (byCur.get(h.currency) ?? 0) + h.valuation);
          const latest = hs.reduce((d, h) => (h.valuationDate > d ? h.valuationDate : d), "");
          return (
            <section key={a.id}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{a.name}</h3>
                  <p className="num text-caption text-ink-3">
                    {byCur.size ? [...byCur].map(([c, v]) => money(v, {}, c)).join(" + ") : "No valuation recorded"}
                    {latest ? ` · latest valuation date ${formatDate(latest, { month: "short", day: "numeric", year: "numeric" })}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setEditing({ account: a })}><Plus /> Add holding</Button>
                  <Button size="sm" variant="ghost" onClick={() => setImportFor(a)}><FileUp /> Import CSV</Button>
                </div>
              </div>
              {hs.length ? (
                <div className="overflow-x-auto rounded-md border border-line">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-caption uppercase tracking-wide text-ink-3">
                        <th className="px-3 py-2 font-medium">Asset</th><th className="px-2 text-right font-medium">Quantity</th><th className="px-2 text-right font-medium">Unit price</th><th className="px-2 text-right font-medium">Valuation</th><th className="px-2 font-medium">As of</th><th className="px-2 font-medium">Origin</th><th className="px-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {hs.map((h) => (
                        <tr key={h.id} className="border-b border-line/70 last:border-0">
                          <td className="px-3 py-2"><span className="font-medium">{h.symbol}</span>{h.name ? <span className="block text-caption text-ink-3">{h.name}</span> : null}</td>
                          <td className="num px-2 text-right">{h.quantity.toLocaleString(db.profile.locale, { maximumFractionDigits: 6 })}</td>
                          <td className="num px-2 text-right text-ink-2">{h.price != null ? money(h.price, {}, h.currency) : "—"}</td>
                          <td className="num px-2 text-right font-medium">{h.valuation != null ? money(h.valuation, {}, h.currency) : "—"}</td>
                          <td className="num px-2 text-ink-2">{formatDate(h.valuationDate, { month: "short", day: "numeric", year: "2-digit" })}</td>
                          <td className="px-2">{h.origin === "imported" ? <Badge tone="info">Imported · {sourceName(h.sourceId)}</Badge> : <Badge>Manual</Badge>}</td>
                          <td className="whitespace-nowrap px-3 text-right">
                            {h.origin === "manual" ? (
                              <>
                                <Button size="icon-sm" variant="ghost" onClick={() => setEditing({ account: a, holding: h })} aria-label={`Edit ${h.symbol}`}><Pencil /></Button>
                                <Button size="icon-sm" variant="ghost" onClick={async () => { if (await confirm({ title: `Remove ${h.symbol}?` })) actions().remove("holdings", h.id); }} aria-label={`Remove ${h.symbol}`}><Trash2 /></Button>
                              </>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-ink-3">No holdings yet.</p>}
            </section>
          );
        })}
        <p className="flex items-start gap-2 text-caption text-ink-3"><Info className="mt-0.5 size-3.5 shrink-0" /> The account balance above reflects recorded cash movements. Holdings valuations are shown separately and are only as current as their “as of” date.</p>
      </CardBody>
      {editing ? <HoldingDialog account={editing.account} holding={editing.holding} onClose={() => setEditing(null)} /> : null}
      {importFor ? <ImportDialog source={db.integrationSources.find((s) => s.accountId === importFor.id && s.status === "active") ?? null} mode="holdings" accountId={importFor.id} onClose={() => setImportFor(null)} /> : null}
    </Card>
  );
}

function HoldingDialog({ account, holding, onClose }: { account: Account; holding?: Holding; onClose: () => void }) {
  const today = useToday();
  const [symbol, setSymbol] = useState(holding?.symbol ?? "");
  const [name, setName] = useState(holding?.name ?? "");
  const [qty, setQty] = useState(holding ? String(holding.quantity) : "");
  const [currency, setCurrency] = useState(holding?.currency ?? account.currency);
  const digits = currencyDigits(currency);
  const [price, setPrice] = useState(holding?.price != null ? centsToInput(holding.price, digits) : "");
  const [valuation, setValuation] = useState(holding?.valuation != null ? centsToInput(holding.valuation, digits) : "");
  const [date, setDate] = useState(holding?.valuationDate ?? today);
  const q = Number(qty.replace(",", "."));
  const p = price ? parseMoney(price, digits) : null;
  const v = valuation ? parseMoney(valuation, digits) : null;
  const valid = symbol.trim() && Number.isFinite(q) && q > 0 && isISODate(date) && (!price || p != null) && (!valuation || v != null);
  const save = () => {
    if (!valid) return;
    const rec = { symbol: symbol.trim().toUpperCase(), name: name.trim() || undefined, quantity: q, currency, price: p, valuation: v ?? (p != null ? Math.round(p * q) : null), valuationDate: date };
    if (holding) actions().update("holdings", holding.id, rec);
    else actions().add("holdings", { ...rec, accountId: account.id, sourceId: null, origin: "manual" });
    toast("Holding saved");
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={holding ? `Edit ${holding.symbol}` : `Add holding · ${account.name}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} onClick={save}>Save</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Asset / ticker">{(f) => <Input {...f} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. AL30, SPY, FCI name" autoFocus />}</Field>
        <Field label="Name" optional>{(f) => <Input {...f} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Quantity" error={qty && !(q > 0) ? "Enter a positive number" : undefined}>{(f) => <Input {...f} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />}</Field>
        <Field label="Currency">{(f) => <Select {...f} value={currency} onChange={(e) => setCurrency(e.target.value)}>{[...new Set([currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
        <Field label="Unit price" optional hint="From your broker statement">{(f) => <MoneyInput {...f} currency={currency} value={price} onChange={(e) => setPrice(e.target.value)} />}</Field>
        <Field label="Total valuation" optional hint="Leave empty to use price × quantity">{(f) => <MoneyInput {...f} currency={currency} value={valuation} onChange={(e) => setValuation(e.target.value)} />}</Field>
        <Field label="Valuation date">{(f) => <Input {...f} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      </form>
    </Dialog>
  );
}
