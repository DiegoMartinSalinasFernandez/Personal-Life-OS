"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Unplug, ExternalLink, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Select } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { useDb, useToday, actions } from "@/lib/hooks";
import { addDays, relativeDay } from "@/lib/domain/dates";
import { computeStatus, providerInfo, type ServerProviderState } from "@/lib/integrations/catalog";
import { api, ApiError } from "@/lib/integrations/client";
import type { CalendarProviderId, ExternalEvent } from "@/lib/domain/types";
import { ConsentDialog, ProviderCard } from "./provider-card";

interface Ctx {
  server: Record<string, ServerProviderState | undefined>;
  serverUnavailable: boolean;
  refresh: () => void;
}

const PAST_DAYS = 30;
const FUTURE_DAYS = 120;

export async function syncCalendar(provider: CalendarProviderId, tz: string, today: string, body: Record<string, unknown>): Promise<number> {
  const range = { start: addDays(today, -PAST_DAYS), end: addDays(today, FUTURE_DAYS) };
  try {
    const res = await api.sync<{ events: ExternalEvent[]; syncedAt: string }>(provider, { from: range.start, to: range.end, tz, ...body });
    actions().setExternalEvents(provider, range, res.events);
    actions().setCalendarSource(provider, { lastSyncAt: res.syncedAt, lastError: null, syncedRange: range });
    return res.events.length;
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : "Synchronization failed";
    actions().setCalendarSource(provider, { lastError: msg });
    throw new Error(msg);
  }
}

async function disconnectCalendar(provider: CalendarProviderId, name: string, refresh: () => void) {
  const ok = await confirm({ title: `Disconnect ${name}?`, description: `Access is revoked where the provider supports it and credentials are deleted from the server. Cached ${name} events disappear from your calendar; your own Life OS events are not affected.`, confirmLabel: "Disconnect" });
  if (!ok) return;
  try {
    const r = await api.disconnect(provider);
    actions().removeCalendarProvider(provider);
    toast(r.revoked ? `${name} disconnected and access revoked` : `${name} disconnected. Remove the app from your ${name} account settings to fully revoke access.`);
  } catch (e) {
    toast(e instanceof ApiError ? e.message : "Disconnect failed", { tone: "error" });
  }
  refresh();
}

export function GoogleCalendarCard({ ctx, autoSync }: { ctx: Ctx; autoSync: boolean }) {
  const db = useDb();
  const today = useToday();
  const info = providerInfo("google")!;
  const server = ctx.server.google;
  const conn = server?.connection ?? null;
  const cfg = db.calendarSources.find((c) => c.id === "google");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const cached = db.externalEvents.filter((e) => e.provider === "google").length;

  const loadCalendars = useCallback(async () => {
    try {
      const r = await api.resources<{ id: string; name: string; color: string; primary: boolean }>("google");
      const current = db.calendarSources.find((c) => c.id === "google");
      actions().setCalendarSource("google", { available: r.items, selected: current?.selected.length ? current.selected.filter((id) => r.items.some((c) => c.id === id)) : r.items.filter((c) => c.primary).map((c) => c.id) });
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't load calendars", { tone: "error" });
      ctx.refresh();
      return false;
    }
  }, [db.calendarSources, ctx]);

  const sync = useCallback(async () => {
    const selected = db.calendarSources.find((c) => c.id === "google")?.selected ?? [];
    setBusy(true);
    try {
      const n = await syncCalendar("google", db.profile.timezone, today, { calendarIds: selected });
      toast(`Google Calendar synced — ${n} events`);
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(false);
      ctx.refresh();
    }
  }, [db.calendarSources, db.profile.timezone, today, ctx]);

  // Right after returning from Google: load calendars and run a first sync.
  useEffect(() => {
    if (!autoSync || conn?.status !== "connected") return;
    (async () => {
      if (await loadCalendars()) await sync();
    })();
  }, [autoSync]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = computeStatus({ info, server, serverUnavailable: ctx.serverUnavailable });
  return (
    <ProviderCard
      info={info}
      status={status}
      meta={
        conn ? (
          <div className="flex flex-col gap-0.5">
            <span>Connected as <strong className="font-medium">{conn.accountLabel}</strong></span>
            <span className="text-ink-3">Last sync: {cfg?.lastSyncAt ? `${relativeDay(cfg.lastSyncAt.slice(0, 10), today)} ${cfg.lastSyncAt.slice(11, 16)}` : "never"} · {cached} events cached{cfg?.lastError ? ` · ${cfg.lastError}` : ""}</span>
          </div>
        ) : undefined
      }
    >
      {conn ? (
        <>
          {cfg?.available.length ? (
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-2">Calendars to show</p>
              <ul className="flex flex-col gap-1">
                {cfg.available.map((c) => {
                  const on = cfg.selected.includes(c.id);
                  return (
                    <li key={c.id} className="flex items-center gap-2.5 text-sm">
                      <Checkbox size="sm" tone="ink" checked={on} label={c.name} onChange={(v) => actions().setCalendarSource("google", { selected: v ? [...cfg.selected, c.id] : cfg.selected.filter((x) => x !== c.id) })} />
                      <span className="size-2.5 rounded-sm" style={{ background: c.color }} />
                      <span className="truncate">{c.name}</span>
                      {c.primary ? <span className="text-caption text-ink-3">primary</span> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <Button size="sm" className="self-start" onClick={loadCalendars}><CalendarRange /> Load my calendars</Button>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={sync} loading={busy} disabled={!cfg?.selected.length || conn.status === "expired"}><RefreshCw /> Sync now</Button>
            {conn.status === "expired" ? <Button size="sm" onClick={() => setConsent(true)}>Reconnect</Button> : null}
            <Button size="sm" variant="ghost" onClick={() => disconnectCalendar("google", "Google Calendar", ctx.refresh)}><Unplug /> Disconnect</Button>
          </div>
          <p className="text-caption text-ink-3">Read-only: Google events appear in Activities with a “G” marker and can&apos;t be edited here. Syncs {PAST_DAYS} days back and {FUTURE_DAYS} days ahead.</p>
        </>
      ) : server?.configured ? (
        <Button size="sm" variant="primary" className="self-start" onClick={() => setConsent(true)}>Connect Google Calendar</Button>
      ) : (
        <p className="text-caption text-ink-3">{ctx.serverUnavailable ? "Server API unavailable on this deployment." : `Requires developer setup: ${(server?.missing ?? info.envKeys).join(", ")}.`}</p>
      )}
      {consent ? <ConsentDialog info={info} onClose={() => setConsent(false)} onContinue={() => (window.location.href = api.connectUrl("google"))} /> : null}
    </ProviderCard>
  );
}

export function NotionCard({ ctx }: { ctx: Ctx }) {
  const db = useDb();
  const today = useToday();
  const info = providerInfo("notion")!;
  const server = ctx.server.notion;
  const conn = server?.connection ?? null;
  const cfg = db.calendarSources.find((c) => c.id === "notion");
  const google = ctx.server.google?.connection;
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dbs, setDbs] = useState<{ id: string; name: string; dateProperties: string[] }[] | null>(null);
  const selected = cfg?.available.find((a) => cfg.selected.includes(a.id));

  const load = async () => {
    try {
      const r = await api.resources<{ id: string; name: string; dateProperties: string[] }>("notion");
      setDbs(r.items);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't load databases", { tone: "error" });
      ctx.refresh();
    }
  };
  const choose = (id: string, dateProperty: string) => {
    const d = dbs?.find((x) => x.id === id);
    if (!d) return;
    actions().setCalendarSource("notion", { available: [{ id: d.id, name: d.name, color: "#6B6B76", dateProperty }], selected: [d.id] });
  };
  const sync = async () => {
    if (!selected?.dateProperty) return;
    setBusy(true);
    try {
      const n = await syncCalendar("notion", db.profile.timezone, today, { databases: [{ id: selected.id, name: selected.name, dateProperty: selected.dateProperty }] });
      toast(`Notion synced — ${n} dated entries`);
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(false);
      ctx.refresh();
    }
  };

  return (
    <ProviderCard info={info} status={conn ? computeStatus({ info, server, serverUnavailable: ctx.serverUnavailable }) : "manual_import"} title="Notion & Notion Calendar">
      <div className="rounded-md border border-line p-3 text-sm">
        <p className="font-medium">Workflow A · Same Google Calendar in both apps (recommended)</p>
        <ol className="mt-1 list-decimal pl-5 text-ink-2">
          <li>Connect Google Calendar on this page{google ? " ✓" : ""}.</li>
          <li>In Notion Calendar, add the same Google account (Settings → Calendars).</li>
          <li>Events then appear in both apps; nothing is copied between them.</li>
        </ol>
        <a href="https://calendar.notion.so" target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 font-medium text-info hover:underline">Open Notion Calendar <ExternalLink className="size-3" /></a>
      </div>
      <div className="rounded-md border border-line p-3 text-sm">
        <p className="font-medium">Workflow B · Show a Notion database with dates (official Notion API)</p>
        {conn ? (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-ink-3">Connected to <strong className="font-medium text-ink">{conn.accountLabel}</strong>. Only pages you shared with the integration are visible.</p>
            {dbs ? (
              dbs.length ? (
                <Select aria-label="Database and date property" value={selected ? `${selected.id}|${selected.dateProperty}` : ""} onChange={(e) => { const [id, prop] = e.target.value.split("|"); choose(id, prop); }}>
                  <option value="">Choose database & date property…</option>
                  {dbs.flatMap((d) => d.dateProperties.map((p) => <option key={`${d.id}|${p}`} value={`${d.id}|${p}`}>{d.name} — {p}</option>))}
                </Select>
              ) : <p className="text-ink-3">No shared databases with a date property were found.</p>
            ) : <Button size="sm" className="self-start" onClick={load}>Load shared databases</Button>}
            {selected ? <p className="text-caption text-ink-3">Showing “{selected.name}” by “{selected.dateProperty}”.{cfg?.lastSyncAt ? ` Last sync ${relativeDay(cfg.lastSyncAt.slice(0, 10), today)}.` : ""}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" disabled={!selected} loading={busy} onClick={sync}><RefreshCw /> Sync now</Button>
              <Button size="sm" variant="ghost" onClick={() => disconnectCalendar("notion", "Notion", ctx.refresh)}><Unplug /> Disconnect</Button>
            </div>
          </div>
        ) : server?.configured ? (
          <Button size="sm" className="mt-2" onClick={() => setConsent(true)}>Connect Notion workspace</Button>
        ) : (
          <p className="mt-1 text-caption text-ink-3">{ctx.serverUnavailable ? "Server API unavailable on this deployment." : `Requires developer setup: ${(server?.missing ?? info.envKeys).join(", ")}.`}</p>
        )}
      </div>
      {consent ? <ConsentDialog info={info} onClose={() => setConsent(false)} onContinue={() => (window.location.href = api.connectUrl("notion"))} /> : null}
    </ProviderCard>
  );
}
