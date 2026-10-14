/**
 * Pure mappers from documented provider payloads to app shapes.
 * Used server-side by the sync routes; exported for unit tests.
 */
import type { ExternalEvent } from "../domain/types";
import { addDays, isISODate, isoInZone, nowTime, diffDays } from "../domain/dates";
import { parseMoney } from "../domain/money";
import type { RawRecord } from "./importer";

// ───────────────────────── Google Calendar ─────────────────────────

export interface GoogleEventTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}
export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  iCalUID?: string;
  recurringEventId?: string;
  start: GoogleEventTime;
  end: GoogleEventTime;
}

/** Instant → calendar date + wall time in the user's zone. */
function inZone(dateTime: string, tz: string) {
  const d = new Date(dateTime);
  if (Number.isNaN(d.getTime())) return null;
  return { date: isoInZone(d, tz), time: nowTime(tz, d) };
}

/**
 * Maps Google events (fetched with singleEvents=true, so recurring series
 * arrive as individual instances with their own ids) into ExternalEvents in
 * the user's timezone. Multi-day all-day events are expanded per day (max 31).
 * Duplicates across selected calendars (same iCalUID + start) are dropped.
 */
export function normalizeGoogleEvents(items: GoogleEvent[], cal: { id: string; name: string; color: string }, tz: string, seen = new Set<string>()): ExternalEvent[] {
  const out: ExternalEvent[] = [];
  for (const e of items) {
    if (e.status === "cancelled" || !e.start) continue;
    const dedupeKey = `${e.iCalUID ?? e.id}|${e.start.dateTime ?? e.start.date}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const base = { provider: "google" as const, calendarId: cal.id, calendarName: cal.name, externalId: e.id, title: e.summary?.trim() || "(No title)", location: e.location, url: e.htmlLink, color: cal.color, recurring: !!e.recurringEventId };
    if (e.start.date && isISODate(e.start.date)) {
      // All-day: end.date is exclusive.
      const lastDay = e.end?.date && isISODate(e.end.date) ? addDays(e.end.date, -1) : e.start.date;
      const span = Math.min(30, Math.max(0, diffDays(e.start.date, lastDay)));
      for (let i = 0; i <= span; i++) {
        const date = addDays(e.start.date, i);
        out.push({ ...base, id: `google:${cal.id}:${e.id}:${date}`, date, endDate: date, startTime: null, endTime: null, allDay: true });
      }
      continue;
    }
    if (!e.start.dateTime) continue;
    const s = inZone(e.start.dateTime, tz);
    const en = e.end?.dateTime ? inZone(e.end.dateTime, tz) : null;
    if (!s) continue;
    out.push({ ...base, id: `google:${cal.id}:${e.id}`, date: s.date, endDate: en?.date ?? s.date, startTime: s.time, endTime: en ? en.time : null, allDay: false });
  }
  return out;
}

// ───────────────────────── Mercado Pago ─────────────────────────

export interface MPPayment {
  id: number | string;
  date_created?: string;
  date_approved?: string | null;
  transaction_amount?: number;
  currency_id?: string;
  description?: string | null;
  status?: string;
  status_detail?: string;
  operation_type?: string;
  collector_id?: number | string | null;
  payer?: { id?: number | string | null; email?: string | null } | null;
  fee_details?: { amount?: number; type?: string }[];
  transaction_details?: { net_received_amount?: number | null } | null;
}

/**
 * Direction is only known when the authorized user is the collector (money in)
 * or the payer (money out). Otherwise it is left "unknown" for review.
 */
export function normalizeMPPayments(items: MPPayment[], userId: string, tz: string): RawRecord[] {
  return items.map((p) => {
    const when = p.date_approved || p.date_created || "";
    const d = when ? new Date(when) : null;
    const date = d && !Number.isNaN(d.getTime()) ? isoInZone(d, tz) : "";
    const amount = typeof p.transaction_amount === "number" ? parseMoney(p.transaction_amount) : null;
    const isCollector = p.collector_id != null && String(p.collector_id) === userId;
    const isPayer = p.payer?.id != null && String(p.payer.id) === userId;
    const signed = amount == null ? null : isCollector && !isPayer ? amount : isPayer && !isCollector ? -amount : null;
    const fee = (p.fee_details ?? []).reduce((s, f) => s + (typeof f.amount === "number" ? parseMoney(f.amount) ?? 0 : 0), 0);
    return {
      externalId: `mp:${p.id}`,
      date,
      signedAmount: signed,
      absAmount: amount ?? undefined,
      currency: p.currency_id ?? null,
      description: p.description?.trim() || (p.operation_type ? p.operation_type.replace(/_/g, " ") : "Mercado Pago payment"),
      counterparty: isCollector ? p.payer?.email ?? undefined : undefined,
      providerStatus: p.status,
      fee: isCollector && fee > 0 ? fee : null,
      typeHint: p.operation_type,
    } satisfies RawRecord;
  }).filter((r) => isISODate(r.date));
}

// ───────────────────────── Notion ─────────────────────────

interface NotionRichText { plain_text?: string }
interface NotionProperty { type: string; title?: NotionRichText[]; date?: { start: string; end?: string | null } | null }
export interface NotionPage { id: string; url?: string; archived?: boolean; in_trash?: boolean; properties: Record<string, NotionProperty> }

export function normalizeNotionPages(pages: NotionPage[], db: { id: string; name: string; dateProperty: string }, tz: string): ExternalEvent[] {
  const out: ExternalEvent[] = [];
  for (const p of pages) {
    if (p.archived || p.in_trash) continue;
    const dateProp = p.properties[db.dateProperty];
    const start = dateProp?.type === "date" ? dateProp.date?.start : null;
    if (!start) continue;
    const titleProp = Object.values(p.properties).find((x) => x.type === "title");
    const title = titleProp?.title?.map((t) => t.plain_text ?? "").join("").trim() || "(Untitled)";
    const end = dateProp.date?.end ?? null;
    const base = { provider: "notion" as const, calendarId: db.id, calendarName: db.name, externalId: p.id, title, url: p.url, color: "#6B6B76", recurring: false };
    if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      out.push({ ...base, id: `notion:${db.id}:${p.id}`, date: start, endDate: end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : start, startTime: null, endTime: null, allDay: true });
    } else {
      const s = inZone(start, tz);
      const e = end ? inZone(end, tz) : null;
      if (!s) continue;
      out.push({ ...base, id: `notion:${db.id}:${p.id}`, date: s.date, endDate: e?.date ?? s.date, startTime: s.time, endTime: e?.time ?? null, allDay: false });
    }
  }
  return out;
}
