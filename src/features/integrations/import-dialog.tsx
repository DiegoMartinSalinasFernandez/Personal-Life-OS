"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Select } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { useDb, useMoney, useToday, actions } from "@/lib/hooks";
import { guessDateFormat, parseCSV, type DateFormat } from "@/lib/data/csv";
import { autoMap, detectPreset, HOLDING_FIELDS, rowsToHoldings, rowsToRaw, TX_FIELDS, type HoldingField, type Mapping, type TxField } from "@/lib/integrations/csv-presets";
import { currencyDigits } from "@/lib/domain/money";
import type { ImportRun, IntegrationSource } from "@/lib/domain/types";

/**
 * CSV import into the staging area (transactions) or a holdings snapshot.
 * Files are parsed in the browser; nothing is uploaded.
 */
export function ImportDialog({ source, mode, accountId, onClose }: { source: IntegrationSource | null; mode: "transactions" | "holdings"; accountId?: string | null; onClose: () => void }) {
  const db = useDb();
  const money = useMoney();
  const today = useToday();
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [txMap, setTxMap] = useState<Mapping<TxField>>({});
  const [hMap, setHMap] = useState<Mapping<HoldingField>>({});
  const [dateFormat, setDateFormat] = useState<DateFormat>("ymd");
  const [result, setResult] = useState<ImportRun | { holdings: number; errors: number } | null>(null);
  const targetAccountId = accountId ?? source?.accountId ?? null;
  const account = db.accounts.find((a) => a.id === targetAccountId);
  const digits = currencyDigits(account?.currency ?? money.currency);
  const preset = rows ? detectPreset(rows[0]) : null;

  const onFile = async (file: File) => {
    setError("");
    if (file.size > 5_000_000) return setError("That file is larger than 5 MB.");
    if (!/\.(csv|txt)$/i.test(file.name)) return setError("Choose a .csv file. Excel files must be saved as CSV first.");
    const parsed = parseCSV(await file.text());
    if (parsed.length < 2) return setError("The file needs a header row and at least one data row.");
    setRows(parsed);
    setFileName(file.name);
    if (mode === "transactions") setTxMap(autoMap(parsed[0], TX_FIELDS));
    else setHMap(autoMap(parsed[0], HOLDING_FIELDS));
    const dateCol = mode === "transactions" ? autoMap(parsed[0], TX_FIELDS).date : autoMap(parsed[0], HOLDING_FIELDS).date;
    if (dateCol != null) setDateFormat(guessDateFormat(parsed.slice(1, 40).map((r) => r[dateCol] ?? "")));
  };

  const parsedTx = useMemo(() => (rows && mode === "transactions" ? rowsToRaw(rows.slice(1), txMap, dateFormat, digits) : null), [rows, mode, txMap, dateFormat, digits]);
  const parsedH = useMemo(() => (rows && mode === "holdings" ? rowsToHoldings(rows.slice(1), hMap, dateFormat, digits) : null), [rows, mode, hMap, dateFormat, digits]);
  const missing = mode === "transactions" ? (txMap.date == null ? ["Date"] : []).concat(txMap.amount == null && txMap.credit == null && txMap.debit == null ? ["an amount (or credit/debit) column"] : []) : HOLDING_FIELDS.filter((f) => f.required && hMap[f.key] == null).map((f) => f.label);
  const ready = rows && !missing.length && (mode === "transactions" ? !!parsedTx?.raw.length : !!parsedH?.holdings.length) && (mode === "holdings" ? !!targetAccountId : !!source);

  const doImport = () => {
    if (!ready) return;
    if (mode === "transactions" && source && parsedTx) {
      const run = actions().stageImport(source.id, parsedTx.raw, { kind: "csv", fileName, errors: parsedTx.errors.slice(0, 20).map((e) => `Line ${e.line}: ${e.reason}`) });
      if (run) {
        setResult(run);
        toast(`Imported ${run.added} rows — ${run.accepted} accepted, ${run.needsReview} to review, ${run.duplicates} duplicates skipped`);
      }
    } else if (mode === "holdings" && parsedH && targetAccountId) {
      const n = actions().replaceHoldings(targetAccountId, source?.id ?? null, parsedH.holdings.map((h) => ({ symbol: h.symbol, name: h.name, quantity: h.quantity, currency: h.currency ?? account?.currency ?? money.currency, price: h.price, valuation: h.valuation, valuationDate: h.date ?? today })), source ? "imported" : "manual");
      setResult({ holdings: n, errors: parsedH.errors.length });
      toast(`Saved a snapshot of ${n} holdings`);
    }
  };

  const fields = mode === "transactions" ? TX_FIELDS : HOLDING_FIELDS;
  const map = (mode === "transactions" ? txMap : hMap) as Record<string, number | undefined>;
  const setMap = (k: string, v: number | undefined) => (mode === "transactions" ? setTxMap({ ...txMap, [k]: v }) : setHMap({ ...hMap, [k]: v }));

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={mode === "transactions" ? `Import ${source?.name ?? ""} statement` : "Import holdings snapshot"}
      description="The file is read in your browser and never uploaded. Imported rows wait in review until they're clean or you accept them."
      footer={
        result ? (
          <>
            {"id" in result ? <Link href="/finance/imports" onClick={onClose}><Button>Open review queue</Button></Link> : null}
            <Button variant="primary" onClick={onClose}>Done</Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={doImport} disabled={!ready}>Import</Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-md font-medium"><CheckCircle2 className="size-5 text-positive" /> Import finished</p>
          {"id" in result ? (
            <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {[["New rows", result.added], ["Accepted", result.accepted], ["Need review", result.needsReview], ["Duplicates skipped", result.duplicates]].map(([k, v]) => (
                <li key={k as string} className="rounded-md bg-subtle p-3"><p className="num text-lg font-semibold">{v}</p><p className="text-caption text-ink-3">{k}</p></li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">{result.holdings} holdings saved{result.errors ? `, ${result.errors} rows skipped` : ""}. Valuations are exactly as in your file — no prices were fetched.</p>
          )}
          {"errors" in result && Array.isArray(result.errors) && result.errors.length ? <p className="text-caption text-ink-3">Skipped: {result.errors.slice(0, 3).join("; ")}{result.errors.length > 3 ? "…" : ""}</p> : null}
        </div>
      ) : !rows ? (
        <div className="flex flex-col gap-3">
          {mode === "transactions" && !source?.accountId ? <p className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning"><AlertTriangle className="size-4" /> This source isn&apos;t linked to an account yet. Rows will be staged, but you&apos;ll need to link an account before accepting them.</p> : null}
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line-strong px-6 py-10 text-center hover:bg-subtle">
            <FileUp className="size-6 text-ink-3" />
            <span className="text-base font-medium">Choose a .csv file</span>
            <span className="text-sm text-ink-3">{mode === "transactions" ? "Statement/activity export with a header row: date, description and an amount (or credit/debit) column." : "Holdings export: asset/ticker and quantity at minimum; price, valuation, currency and date when available."}</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          {error ? <p className="text-sm text-negative" role="alert">{error}</p> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{fileName}</span>
            <span className="text-ink-3">{rows.length - 1} rows</span>
            {preset && mode === "transactions" ? <Badge tone={preset.id === "generic" ? "neutral" : "info"}>{preset.label}</Badge> : null}
            <button className="text-ink-3 underline" onClick={() => setRows(null)}>Choose another</button>
          </div>
          {preset && mode === "transactions" ? <p className="-mt-2 text-caption text-ink-3">{preset.note}</p> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <span className="w-36 shrink-0 text-ink-2">{f.label}</span>
                <Select className="h-8 text-sm" value={map[f.key] ?? ""} onChange={(e) => setMap(f.key, e.target.value === "" ? undefined : Number(e.target.value))} aria-label={f.label}>
                  <option value="">—</option>
                  {rows[0].map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </Select>
              </label>
            ))}
            <Field label="Date format">
              {(p) => (
                <Select {...p} className="h-8 text-sm" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                  <option value="ymd">YYYY-MM-DD</option>
                  <option value="dmy">DD/MM/YYYY</option>
                  <option value="mdy">MM/DD/YYYY</option>
                </Select>
              )}
            </Field>
          </div>
          {missing.length ? <p className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning"><AlertTriangle className="size-4" /> Map {missing.join(", ")} to continue.</p> : null}
          {mode === "holdings" && !targetAccountId ? <p className="text-sm text-negative">Choose an investment account for this snapshot first.</p> : null}
          {parsedTx ? (
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-2">Preview — {parsedTx.raw.length} readable{parsedTx.errors.length ? `, ${parsedTx.errors.length} skipped` : ""}</p>
              <div className="max-h-52 overflow-auto rounded-md border border-line">
                <table className="w-full text-sm">
                  <tbody>
                    {parsedTx.raw.slice(0, 8).map((r, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        <td className="num whitespace-nowrap px-3 py-1.5 text-ink-3">{r.date}</td>
                        <td className="max-w-[240px] truncate px-2 py-1.5">{r.description || <span className="text-ink-3">(no description)</span>}</td>
                        <td className="px-2 py-1.5 text-caption text-ink-3">{r.externalId ?? "no id"}</td>
                        <td className="num px-3 py-1.5 text-right font-medium">{r.signedAmount == null ? "?" : `${r.signedAmount >= 0 ? "+" : "−"}${money(Math.abs(r.signedAmount), {}, r.currency ?? account?.currency)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedTx.errors.length ? <p className="mt-1.5 text-caption text-ink-3">Skipped: {parsedTx.errors.slice(0, 3).map((e) => `line ${e.line} (${e.reason})`).join("; ")}</p> : null}
            </div>
          ) : null}
          {parsedH ? (
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-2">Preview — {parsedH.holdings.length} holdings{parsedH.errors.length ? `, ${parsedH.errors.length} skipped` : ""}</p>
              <ul className="max-h-48 divide-y divide-line overflow-auto rounded-md border border-line text-sm">
                {parsedH.holdings.slice(0, 8).map((h, i) => (
                  <li key={i} className="flex justify-between gap-2 px-3 py-1.5"><span className="font-medium">{h.symbol}</span><span className="num text-ink-2">{h.quantity} {h.valuation != null ? `· ${money(h.valuation, {}, h.currency ?? account?.currency)}` : ""}</span></li>
                ))}
              </ul>
              <p className="mt-1.5 text-caption text-ink-3">This replaces the previous {source ? "imported" : "manual"} snapshot for this account.</p>
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
