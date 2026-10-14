"use client";

import { useState } from "react";
import Link from "next/link";
import { FileUp, RefreshCw, Unplug, Plus, Layers, ListChecks, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { useDb, useToday, actions } from "@/lib/hooks";
import { addDays, relativeDay } from "@/lib/domain/dates";
import { computeStatus, providerInfo, type ServerProviderState } from "@/lib/integrations/catalog";
import type { FinanceProviderId, IntegrationSource } from "@/lib/domain/types";
import type { RawRecord } from "@/lib/integrations/importer";
import { api, ApiError } from "@/lib/integrations/client";
import { ConsentDialog, ProviderCard } from "./provider-card";
import { ImportDialog } from "./import-dialog";

export interface FinanceCtx {
  server: Record<string, ServerProviderState | undefined>;
  serverUnavailable: boolean;
  activeCount: number;
  limitReached: boolean;
  refresh: () => void;
}

const when = (iso: string | null, today: string) => (iso ? `${relativeDay(iso.slice(0, 10), today)} ${iso.slice(11, 16)}` : "never");

/** Account link, review policy, import buttons and history for one active source. */
export function SourceSettings({ source, holdings }: { source: IntegrationSource; holdings?: boolean }) {
  const db = useDb();
  const [importing, setImporting] = useState<"transactions" | "holdings" | null>(null);
  const pending = db.importedRecords.filter((r) => r.sourceId === source.id && r.state === "pending").length;
  const runs = db.importRuns.filter((r) => r.sourceId === source.id).length;
  const accounts = db.accounts.filter((a) => !a.archived);
  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-3">
      <Field label="Imports go to account" hint={source.accountId ? undefined : "Required before imported rows can be accepted."}>
        {(p) => (
          <Select {...p} value={source.accountId ?? ""} onChange={(e) => actions().update("integrationSources", source.id, { accountId: e.target.value || null })}>
            <option value="">Choose an account…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
          </Select>
        )}
      </Field>
      {!accounts.length ? <p className="-mt-1 text-caption text-ink-3"><Link href="/finance/accounts?new=1" className="underline">Create an account</Link> first.</p> : null}
      <Switch checked={source.reviewAll} onChange={(v) => actions().update("integrationSources", source.id, { reviewAll: v })} label="Review every imported row" description="Off: clean, unambiguous rows are accepted automatically; anything unclear still waits for you." />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setImporting("transactions")}><FileUp /> Import statement CSV</Button>
        {holdings ? <Button size="sm" onClick={() => setImporting("holdings")} disabled={!source.accountId}><Layers /> Import holdings CSV</Button> : null}
        <Link href="/finance/imports"><Button size="sm" variant="ghost"><ListChecks /> Review{pending ? ` (${pending})` : ""} · {runs} imports</Button></Link>
      </div>
      {importing ? <ImportDialog source={source} mode={importing} onClose={() => setImporting(null)} /> : null}
    </div>
  );
}

function EnableCsvButton({ provider, name, ctx, label = "Enable CSV import" }: { provider: FinanceProviderId; name: string; ctx: FinanceCtx; label?: string }) {
  return (
    <Button
      size="sm"
      disabled={ctx.limitReached}
      onClick={() => {
        const r = actions().addSource({ provider, name, kind: "csv", accountId: null, reviewAll: false }, Object.entries(ctx.server).filter(([, s]) => s?.connection).map(([k]) => k));
        if (!r.ok) toast(r.reason, { tone: "error" });
        else toast(`${name} added — link an account and import a file`);
      }}
    >
      <FileUp /> {label}
    </Button>
  );
}

async function disconnectFlow(opts: { name: string; source: IntegrationSource | undefined; serverConnected: boolean; provider: string; revokeHint?: string; refresh: () => void }) {
  const ok = await confirm({
    title: `Disconnect ${opts.name}?`,
    description: (
      <div className="flex flex-col gap-2">
        <p>Transactions you already imported stay in your records and reports. Nothing is deleted from {opts.name}.</p>
        {opts.serverConnected ? <p>Stored access credentials are deleted from the server{opts.revokeHint ? "" : " and revoked at the provider"}.</p> : null}
        {opts.revokeHint ? <p>{opts.revokeHint}</p> : null}
        <p>The provider stops counting toward the 3-provider limit.</p>
      </div>
    ),
    confirmLabel: "Disconnect",
  });
  if (!ok) return;
  if (opts.serverConnected) {
    try {
      await api.disconnect(opts.provider);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Disconnect failed", { tone: "error" });
      return;
    }
  }
  if (opts.source) actions().disconnectSource(opts.source.id);
  toast(`${opts.name} disconnected — imported records kept`);
  opts.refresh();
}

export function MercadoPagoCard({ ctx }: { ctx: FinanceCtx }) {
  const db = useDb();
  const today = useToday();
  const info = providerInfo("mercadopago")!;
  const server = ctx.server.mercadopago;
  const local = db.integrationSources.find((s) => s.provider === "mercadopago" && s.status === "active");
  const conn = server?.connection ?? null;
  const status = computeStatus({ info, server, serverUnavailable: ctx.serverUnavailable, localCsvActive: !!local });
  const [consent, setConsent] = useState(false);
  const [range, setRange] = useState<"30" | "90" | "365">("90");
  const [busy, setBusy] = useState(false);
  const canConnect = !!server?.configured && !conn && (!ctx.limitReached || !!local);

  const sync = async () => {
    if (!local) return;
    setBusy(true);
    try {
      const res = await api.sync<{ records: RawRecord[] }>("mercadopago", { from: addDays(today, -Number(range)), to: today, tz: db.profile.timezone });
      const run = actions().stageImport(local.id, res.records, { kind: "api" });
      toast(run ? `Mercado Pago: ${run.added} new, ${run.accepted} accepted, ${run.needsReview} to review, ${run.duplicates} already imported` : "Nothing imported");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Synchronization failed";
      actions().update("integrationSources", local.id, { lastError: msg });
      toast(msg, { tone: "error" });
    } finally {
      setBusy(false);
      ctx.refresh();
    }
  };

  return (
    <ProviderCard
      info={info}
      status={status}
      meta={
        conn ? (
          <div className="flex flex-col gap-0.5">
            <span>Connected as <strong className="font-medium">{conn.accountLabel}</strong> · verified {when(conn.lastVerifiedAt, today)}</span>
            <span className="text-ink-3">Last sync: {when(conn.lastSyncAt, today)}{conn.lastError ? ` · last error: ${conn.lastError.message} (${when(conn.lastError.at, today)})` : ""}</span>
          </div>
        ) : local ? (
          <span className="text-ink-2">CSV import active{local.lastImportAt ? ` · last import ${when(local.lastImportAt, today)}` : ""}{local.lastError ? ` · ${local.lastError}` : ""}</span>
        ) : undefined
      }
    >
      <p className="flex items-start gap-2 text-caption text-ink-3"><Info className="mt-0.5 size-3.5 shrink-0" /> The API returns payments linked to your account (mainly money received as a seller). Personal wallet spending isn&apos;t available through a public API — import your account report CSV for that.</p>
      {conn ? (
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" label="Sync range" value={range} onChange={setRange} options={[{ value: "30", label: "30d" }, { value: "90", label: "90d" }, { value: "365", label: "1y" }]} />
          <Button size="sm" variant="primary" onClick={sync} loading={busy} disabled={!local}><RefreshCw /> Sync payments</Button>
          {conn.status === "expired" ? <Button size="sm" onClick={() => setConsent(true)}>Reconnect</Button> : null}
          <Button size="sm" variant="ghost" onClick={() => disconnectFlow({ name: "Mercado Pago", source: local, serverConnected: true, provider: "mercadopago", revokeHint: "Mercado Pago has no public revocation endpoint: also remove “Personal Life OS” from the connected applications in your Mercado Pago security settings.", refresh: ctx.refresh })}><Unplug /> Disconnect</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {server?.configured ? (
            <Button size="sm" variant="primary" disabled={!canConnect} onClick={() => setConsent(true)} title={!canConnect && ctx.limitReached ? "Limit reached" : undefined}>Connect with Mercado Pago</Button>
          ) : (
            <span className="text-caption text-ink-3">{ctx.serverUnavailable ? "Server API unavailable — automatic sync disabled." : `OAuth needs developer setup: ${(server?.missing ?? info.envKeys).join(", ")}.`}</span>
          )}
          {!local ? <EnableCsvButton provider="mercadopago" name="Mercado Pago" ctx={ctx} /> : !conn ? <Button size="sm" variant="ghost" onClick={() => disconnectFlow({ name: "Mercado Pago", source: local, serverConnected: false, provider: "mercadopago", refresh: ctx.refresh })}><Unplug /> Disconnect</Button> : null}
        </div>
      )}
      {local ? <SourceSettings source={local} /> : null}
      {consent ? <ConsentDialog info={info} onClose={() => setConsent(false)} onContinue={() => (window.location.href = api.connectUrl("mercadopago", ctx.activeCount - (local ? 1 : 0)))} /> : null}
    </ProviderCard>
  );
}

export function CocosCard({ ctx }: { ctx: FinanceCtx }) {
  const db = useDb();
  const today = useToday();
  const info = providerInfo("cocos")!;
  const local = db.integrationSources.find((s) => s.provider === "cocos" && s.status === "active");
  const holdings = local ? db.holdings.filter((h) => h.sourceId === local.id).length : 0;
  return (
    <ProviderCard info={info} status={computeStatus({ info, localCsvActive: !!local })} meta={local ? <span className="text-ink-2">Import source active{local.lastImportAt ? ` · last import ${when(local.lastImportAt, today)}` : ""} · {holdings} imported holdings</span> : undefined}>
      <p className="flex items-start gap-2 text-caption text-ink-3"><Info className="mt-0.5 size-3.5 shrink-0" /> Never enter your Cocos password, 2FA codes or keys anywhere in this app. Prices shown come only from your files or manual entries.</p>
      {local ? (
        <>
          <SourceSettings source={local} holdings />
          <div className="flex flex-wrap gap-2">
            <Link href="/finance/accounts#holdings"><Button size="sm" variant="ghost"><Layers /> Manage holdings manually</Button></Link>
            <Button size="sm" variant="ghost" onClick={() => disconnectFlow({ name: "Cocos Capital", source: local, serverConnected: false, provider: "cocos", refresh: ctx.refresh })}><Unplug /> Disconnect</Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2"><EnableCsvButton provider="cocos" name="Cocos Capital" ctx={ctx} label="Set up CSV import & holdings" /></div>
      )}
    </ProviderCard>
  );
}

export function CustomSourceCards({ ctx }: { ctx: FinanceCtx }) {
  const db = useDb();
  const today = useToday();
  const info = providerInfo("custom")!;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const custom = db.integrationSources.filter((s) => s.provider === "custom" && s.status === "active");
  return (
    <>
      {custom.map((s) => (
        <ProviderCard key={s.id} info={info} title={s.name} status="manual_import" meta={s.lastImportAt ? <span className="text-ink-2">Last import {when(s.lastImportAt, today)}</span> : undefined}>
          <SourceSettings source={s} />
          <Button size="sm" variant="ghost" className="self-start" onClick={() => disconnectFlow({ name: s.name, source: s, serverConnected: false, provider: "custom", refresh: ctx.refresh })}><Unplug /> Disconnect</Button>
        </ProviderCard>
      ))}
      <ProviderCard info={info} status="manual_import">
        <p className="text-sm text-ink-2">Add a bank, wallet or broker that exports statements. Automatic sync can be added later once its official API is verified.</p>
        <Button size="sm" className="self-start" disabled={ctx.limitReached} onClick={() => setAdding(true)}><Plus /> Add provider</Button>
        {adding ? (
          <Dialog open onClose={() => setAdding(false)} title="Add a financial provider" size="sm" footer={<><Button onClick={() => setAdding(false)}>Cancel</Button><Button variant="primary" disabled={!name.trim()} onClick={() => { const r = actions().addSource({ provider: "custom", name: name.trim(), kind: "csv", accountId: null, reviewAll: true }, Object.entries(ctx.server).filter(([, s]) => s?.connection).map(([k]) => k)); if (!r.ok) toast(r.reason, { tone: "error" }); else { toast(`${name.trim()} added`); setAdding(false); setName(""); } }}>Add</Button></>}>
            <Field label="Provider name" hint="e.g. Banco Galicia, Wise, Brubank">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} />}</Field>
            <p className="mt-3 text-caption text-ink-3">New custom providers review every row by default.</p>
          </Dialog>
        ) : null}
      </ProviderCard>
    </>
  );
}
