"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCheck, Inbox, Link2, X, ArrowLeftRight, PlugZap } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useDb, useMoney, actions } from "@/lib/hooks";
import { formatDate } from "@/lib/domain/dates";
import type { ImportedRecord } from "@/lib/domain/types";
import { AccountOptions } from "@/features/common/options";

const STATE_TONE = { pending: "warning", accepted: "positive", rejected: "neutral", duplicate: "info", ignored: "outline" } as const;
const STATE_LABEL = { pending: "Needs review", accepted: "Accepted", rejected: "Rejected", duplicate: "Matched existing", ignored: "Ignored" } as const;

export default function ImportsPage() {
  const db = useDb();
  const money = useMoney();
  const [tab, setTab] = useState<"review" | "all" | "history">("review");
  const [transfer, setTransfer] = useState<ImportedRecord | null>(null);
  const sources = new Map(db.integrationSources.map((s) => [s.id, s]));
  const pending = useMemo(() => db.importedRecords.filter((r) => r.state === "pending").sort((a, b) => (a.date < b.date ? 1 : -1)), [db.importedRecords]);
  const all = useMemo(() => [...db.importedRecords].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 300), [db.importedRecords]);
  const runs = useMemo(() => [...db.importRuns].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.importRuns]);
  const txById = new Map(db.transactions.map((t) => [t.id, t]));
  const clean = pending.filter((r) => !r.issues.length && (r.kindGuess === "income" || r.kindGuess === "expense") && sources.get(r.sourceId)?.accountId);

  const resolve = (r: ImportedRecord, res: Parameters<ReturnType<typeof actions>["resolveRecord"]>[1], msg: string) => {
    const out = actions().resolveRecord(r.id, res);
    if (!out.ok) toast(out.reason ?? "Couldn't apply", { tone: "error" });
    else toast(msg);
  };

  const Row = ({ r, review }: { r: ImportedRecord; review: boolean }) => {
    const src = sources.get(r.sourceId);
    const dup = r.duplicateOfId ? txById.get(r.duplicateOfId) : null;
    const sign = r.direction === "in" ? "+" : r.direction === "out" ? "−" : "±";
    return (
      <li className="flex flex-col gap-2 border-b border-line py-3 last:border-0 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-base font-medium">{r.description || "(no description)"}</span>
            <Badge tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</Badge>
            <Badge tone="outline">{src?.name ?? r.provider}</Badge>
          </div>
          <p className="num mt-0.5 text-caption text-ink-3">
            {formatDate(r.date, { month: "short", day: "numeric", year: "numeric" })}
            {r.counterparty ? ` · ${r.counterparty}` : ""}
            {r.providerStatus ? ` · status ${r.providerStatus}` : ""}
            {r.fee ? ` · fee ${money(r.fee, {}, r.currency || undefined)}` : ""}
            {r.externalId && !r.externalId.startsWith("fp:") ? ` · id ${r.externalId}` : ""}
          </p>
          {r.issues.length ? (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {r.issues.map((i) => <li key={i} className="flex items-start gap-1.5 text-caption text-warning"><AlertTriangle className="mt-0.5 size-3 shrink-0" />{i}</li>)}
            </ul>
          ) : null}
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span className={cn("num text-base font-semibold", r.direction === "in" && "text-positive")}>{sign}{money(r.amount, {}, r.currency || undefined)}</span>
          {review ? (
            <div className="flex flex-wrap gap-1.5 sm:justify-end">
              <Button size="sm" onClick={() => resolve(r, { as: "income" }, "Accepted as income")}>Income</Button>
              <Button size="sm" onClick={() => resolve(r, { as: "expense" }, "Accepted as expense")}>Expense</Button>
              <Button size="sm" onClick={() => setTransfer(r)}><ArrowLeftRight /> Transfer</Button>
              {dup ? <Button size="sm" variant="subtle" onClick={() => resolve(r, { as: "link", transactionId: dup.id }, "Matched to existing transaction — nothing double-counted")}><Link2 /> Same as “{dup.description.slice(0, 18)}”</Button> : null}
              <Button size="sm" variant="ghost" onClick={() => resolve(r, { as: "reject" }, "Rejected — it won't affect your finances")} aria-label="Reject"><X /> Reject</Button>
            </div>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented label="View" value={tab} onChange={setTab} options={[{ value: "review", label: <span>Needs review <span className="num text-caption text-ink-3">{pending.length}</span></span> }, { value: "all", label: "All imported" }, { value: "history", label: "Import history" }]} />
        <Link href="/settings/integrations"><Button size="sm"><PlugZap /> Integrations</Button></Link>
      </div>
      <p className="text-caption text-ink-3">Imported rows only affect balances and reports once accepted. Rows already imported (same provider id or identical file row) are skipped automatically; rows resembling a manual transaction are flagged so nothing is counted twice.</p>

      {tab === "review" ? (
        <Card>
          <CardHeader title="Review queue" subtitle="Ambiguous or incomplete rows, possible duplicates, and everything from sources set to “review every row”." action={clean.length ? <Button size="sm" variant="primary" onClick={() => { clean.forEach((r) => actions().resolveRecord(r.id, { as: r.kindGuess as "income" | "expense" })); toast(`Accepted ${clean.length} clean rows`); }}><CheckCheck /> Accept {clean.length} clean</Button> : undefined} />
          <CardBody>
            {pending.length ? <ul>{pending.map((r) => <Row key={r.id} r={r} review />)}</ul> : <EmptyState icon={<Inbox />} title="Nothing to review" description="Imported rows that need a decision will appear here." compact />}
          </CardBody>
        </Card>
      ) : null}

      {tab === "all" ? (
        <Card>
          <CardBody className="pt-3">
            {all.length ? <ul>{all.map((r) => <Row key={r.id} r={r} review={r.state === "pending"} />)}</ul> : <EmptyState icon={<Inbox />} title="No imports yet" description="Connect or set up a provider under Settings → Integrations." compact />}
          </CardBody>
        </Card>
      ) : null}

      {tab === "history" ? (
        <Card>
          {runs.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-caption uppercase tracking-wide text-ink-3">
                    <th className="px-4 py-2.5 font-medium">When</th><th className="px-2 font-medium">Source</th><th className="px-2 font-medium">Method</th>
                    <th className="px-2 text-right font-medium">New</th><th className="px-2 text-right font-medium">Accepted</th><th className="px-2 text-right font-medium">Review</th><th className="px-2 text-right font-medium">Duplicates</th><th className="px-4 font-medium">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b border-line/70 last:border-0">
                      <td className="num whitespace-nowrap px-4 py-2 text-ink-2">{formatDate(r.createdAt.slice(0, 10), { month: "short", day: "numeric" })} {r.createdAt.slice(11, 16)}</td>
                      <td className="px-2">{sources.get(r.sourceId)?.name ?? "—"}{sources.get(r.sourceId)?.status === "disconnected" ? <span className="text-caption text-ink-3"> (disconnected)</span> : null}</td>
                      <td className="px-2 text-ink-2">{r.kind === "api" ? "API sync" : r.kind === "holdings" ? "Holdings" : `CSV${r.fileName ? ` · ${r.fileName}` : ""}`}</td>
                      <td className="num px-2 text-right">{r.added}</td><td className="num px-2 text-right">{r.accepted}</td><td className="num px-2 text-right">{r.needsReview}</td><td className="num px-2 text-right">{r.duplicates}</td>
                      <td className="max-w-[220px] truncate px-4 text-caption text-ink-3" title={r.errors.join("\n")}>{r.errors.length ? `${r.errors.length} skipped` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon={<Inbox />} title="No imports yet" compact />}
        </Card>
      ) : null}
      {transfer ? <TransferDialog rec={transfer} onClose={() => setTransfer(null)} /> : null}
    </div>
  );
}

function TransferDialog({ rec, onClose }: { rec: ImportedRecord; onClose: () => void }) {
  const db = useDb();
  const src = db.integrationSources.find((s) => s.id === rec.sourceId);
  const [other, setOther] = useState("");
  const [direction, setDirection] = useState<"in" | "out">(rec.direction === "in" ? "in" : "out");
  const save = () => {
    const r = actions().resolveRecord(rec.id, { as: "transfer", toAccountId: other, direction });
    if (!r.ok) toast(r.reason ?? "Couldn't apply", { tone: "error" });
    else toast("Recorded as a transfer between your accounts — not counted as income or spending");
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title="Record as transfer" description="Use this only for money moving between your own accounts." size="sm" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!other} onClick={save}>Save transfer</Button></>}>
      <div className="flex flex-col gap-4">
        <Segmented label="Direction" value={direction} onChange={setDirection} options={[{ value: "out", label: "Money left this account" }, { value: "in", label: "Money arrived here" }]} />
        <Field label={direction === "out" ? "Sent to" : "Came from"}>
          {(p) => (
            <Select {...p} value={other} onChange={(e) => setOther(e.target.value)}>
              <option value="">Choose your other account…</option>
              <AccountOptions accounts={db.accounts.filter((a) => a.id !== src?.accountId)} />
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  );
}
