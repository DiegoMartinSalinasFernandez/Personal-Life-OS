"use client";

import { useMemo, useState } from "react";
import { FileUp, AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Select, Switch } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { useDb, useMoney, actions } from "@/lib/hooks";
import { guessDateFormat, normalizeDate, parseCSV, type DateFormat } from "@/lib/data/csv";
import { currencyDigits, parseMoney } from "@/lib/domain/money";
import type { Transaction } from "@/lib/domain/types";
import { AccountOptions } from "@/features/common/options";

type Col = "date" | "description" | "amount" | "debit" | "credit" | "type" | "category" | "merchant" | "notes" | "tags";
const COLS: { key: Col; label: string; required?: boolean; aliases: string[] }[] = [
  { key: "date", label: "Date", required: true, aliases: ["date", "transaction date", "posted date", "booking date", "fecha"] },
  { key: "description", label: "Description", required: true, aliases: ["description", "memo", "details", "name", "payee", "concepto"] },
  { key: "amount", label: "Amount (signed)", aliases: ["amount", "value", "importe", "monto"] },
  { key: "debit", label: "Debit / money out", aliases: ["debit", "withdrawal", "out", "money out"] },
  { key: "credit", label: "Credit / money in", aliases: ["credit", "deposit", "in", "money in"] },
  { key: "type", label: "Type (income/expense)", aliases: ["type", "transaction type"] },
  { key: "category", label: "Category", aliases: ["category", "categoría", "categoria"] },
  { key: "merchant", label: "Merchant", aliases: ["merchant", "vendor", "counterparty"] },
  { key: "notes", label: "Notes", aliases: ["notes", "note", "comment"] },
  { key: "tags", label: "Tags", aliases: ["tags", "labels"] },
];

/** Imports a bank CSV with column mapping, preview and duplicate detection. */
export function CsvImportDialog({ onClose }: { onClose: () => void }) {
  const db = useDb();
  const money = useMoney();
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [map, setMap] = useState<Partial<Record<Col, number>>>({});
  const [accountId, setAccountId] = useState(db.accounts.find((a) => !a.archived)?.id ?? "");
  const [dateFormat, setDateFormat] = useState<DateFormat>("ymd");
  const [skipDupes, setSkipDupes] = useState(true);
  const [error, setError] = useState("");
  const account = db.accounts.find((a) => a.id === accountId);
  const digits = currencyDigits(account?.currency ?? money.currency);

  const onFile = async (file: File) => {
    setError("");
    if (file.size > 5_000_000) return setError("That file is larger than 5 MB.");
    const parsed = parseCSV(await file.text());
    if (parsed.length < 2) return setError("The file needs a header row and at least one transaction.");
    setFileName(file.name);
    setRows(parsed);
    const header = parsed[0].map((h) => h.trim().toLowerCase());
    const next: Partial<Record<Col, number>> = {};
    for (const c of COLS) {
      const i = header.findIndex((h) => c.aliases.includes(h));
      if (i >= 0) next[c.key] = i;
    }
    setMap(next);
    if (next.date != null) setDateFormat(guessDateFormat(parsed.slice(1, 30).map((r) => r[next.date!] ?? "")));
  };

  const preview = useMemo(() => {
    if (!rows) return null;
    const catByName = new Map(db.categories.map((c) => [c.name.toLowerCase(), c]));
    const existing = new Set(db.transactions.map((t) => `${t.accountId}|${t.date}|${t.amount}|${t.description.toLowerCase()}`));
    const ok: Omit<Transaction, "id" | "createdAt">[] = [];
    const bad: { line: number; reason: string }[] = [];
    let dupes = 0;
    rows.slice(1).forEach((r, idx) => {
      const get = (c: Col) => (map[c] != null ? (r[map[c]!] ?? "").trim() : "");
      const date = normalizeDate(get("date"), dateFormat);
      if (!date) return bad.push({ line: idx + 2, reason: `Unreadable date “${get("date")}”` });
      let signed: number | null = null;
      if (map.amount != null) signed = parseMoney(get("amount"), digits);
      else {
        const out = get("debit") ? parseMoney(get("debit"), digits) : 0;
        const inn = get("credit") ? parseMoney(get("credit"), digits) : 0;
        if (out == null || inn == null) signed = null;
        else signed = (inn ?? 0) - Math.abs(out ?? 0);
      }
      if (signed == null || signed === 0) return bad.push({ line: idx + 2, reason: `Unreadable amount` });
      const typeCol = get("type").toLowerCase();
      const type: "income" | "expense" = /income|credit|deposit|ingreso/.test(typeCol) ? "income" : /expense|debit|withdraw|gasto/.test(typeCol) ? "expense" : signed > 0 ? "income" : "expense";
      const description = get("description") || get("merchant") || "Imported transaction";
      const cat = catByName.get(get("category").toLowerCase());
      const amount = Math.abs(signed);
      const key = `${accountId}|${date}|${amount}|${description.toLowerCase()}`;
      if (existing.has(key)) {
        dupes++;
        if (skipDupes) return;
      }
      ok.push({ type, amount, accountId, toAccountId: null, categoryId: cat && cat.kind === type ? cat.id : null, date, description, merchant: get("merchant") || undefined, notes: get("notes") || undefined, tags: get("tags") ? get("tags").split(/[;|,]/).map((t) => t.trim()).filter(Boolean) : ["imported"] });
    });
    return { ok, bad, dupes };
  }, [rows, map, dateFormat, accountId, digits, skipDupes, db.categories, db.transactions]);

  const missing = !rows ? [] : COLS.filter((c) => c.required && map[c.key] == null).map((c) => c.label);
  const noAmount = rows && map.amount == null && map.debit == null && map.credit == null;
  const canImport = !!preview?.ok.length && !missing.length && !noAmount && !!accountId;

  const doImport = () => {
    if (!preview || !canImport) return;
    actions().addMany("transactions", preview.ok);
    toast(`Imported ${preview.ok.length} transactions into ${account?.name}`);
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Import transactions from CSV"
      description="Works with most bank exports. Nothing is uploaded — the file is read in your browser."
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={doImport} disabled={!canImport}>
            Import {preview?.ok.length ? preview.ok.length : ""} transactions
          </Button>
        </>
      }
    >
      {!rows ? (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line-strong px-6 py-10 text-center hover:bg-subtle">
          <FileUp className="size-6 text-ink-3" />
          <span className="text-base font-medium">Choose a .csv file</span>
          <span className="text-sm text-ink-3">Needs a header row with at least date, description and amount (or debit/credit) columns.</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          {error ? <span className="text-sm text-negative">{error}</span> : null}
        </label>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-2">
            <span className="font-medium">{fileName}</span> · {rows.length - 1} rows
            <button className="ml-2 text-ink-3 underline" onClick={() => setRows(null)}>Choose another</button>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Import into account">
              {(p) => (
                <Select {...p} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <AccountOptions accounts={db.accounts} />
                </Select>
              )}
            </Field>
            <Field label="Date format">
              {(p) => (
                <Select {...p} value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                  <option value="ymd">YYYY-MM-DD</option>
                  <option value="mdy">MM/DD/YYYY</option>
                  <option value="dmy">DD/MM/YYYY</option>
                </Select>
              )}
            </Field>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ink-2">Column mapping</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {COLS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm">
                  <span className="w-40 shrink-0 text-ink-2">
                    {c.label}
                    {c.required ? <span className="text-negative"> *</span> : null}
                  </span>
                  <Select className="h-8 text-sm" value={map[c.key] ?? ""} onChange={(e) => setMap({ ...map, [c.key]: e.target.value === "" ? undefined : Number(e.target.value) })} aria-label={c.label}>
                    <option value="">—</option>
                    {rows[0].map((h, i) => (
                      <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
            <p className="mt-2 text-caption text-ink-3">Positive amounts become income and negative amounts expenses, unless a type column says otherwise. Categories are matched by name.</p>
          </div>
          <Switch checked={skipDupes} onChange={setSkipDupes} label="Skip likely duplicates" description={`Same account, date, amount and description already recorded${preview?.dupes ? ` (${preview.dupes} found)` : ""}.`} />
          {missing.length || noAmount ? (
            <p className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
              <AlertTriangle className="size-4" /> Map {[...missing, ...(noAmount ? ["an amount column"] : [])].join(", ")} to continue.
            </p>
          ) : null}
          {preview ? (
            <div>
              <p className="mb-2 text-sm font-medium text-ink-2">
                Preview — {preview.ok.length} ready{preview.bad.length ? `, ${preview.bad.length} skipped` : ""}
              </p>
              <div className="max-h-56 overflow-auto rounded-md border border-line">
                <table className="w-full text-sm">
                  <tbody>
                    {preview.ok.slice(0, 8).map((t, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        <td className="num whitespace-nowrap px-3 py-1.5 text-ink-3">{t.date}</td>
                        <td className="max-w-[220px] truncate px-2 py-1.5">{t.description}</td>
                        <td className="px-2 py-1.5 text-ink-3">{db.categories.find((c) => c.id === t.categoryId)?.name ?? "—"}</td>
                        <td className={`num px-3 py-1.5 text-right font-medium ${t.type === "income" ? "text-positive" : ""}`}>{t.type === "income" ? "+" : "−"}{money(t.amount, {}, account?.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.bad.length ? <p className="mt-2 text-caption text-ink-3">Skipped: {preview.bad.slice(0, 4).map((b) => `line ${b.line} (${b.reason})`).join("; ")}{preview.bad.length > 4 ? "…" : ""}</p> : null}
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
