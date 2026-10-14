/**
 * Date utilities built on calendar-date strings ("YYYY-MM-DD").
 *
 * Everything the user records (transactions, food entries, habit check-ins,
 * due dates) belongs to a *local calendar day*, not an instant. Storing plain
 * date strings and doing arithmetic in UTC means DST changes and timezone
 * offsets can never shift a record onto a neighbouring day or break a streak.
 * "Today" is resolved once, in the user's configured timezone.
 */
export type ISODate = string; // YYYY-MM-DD
export type TimeOfDay = string; // HH:mm (24h)

const DAY_MS = 86_400_000;

export function isISODate(value: unknown): value is ISODate {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toUTCms(value));
}

export function toUTCms(iso: ISODate): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUTCms(ms: number): ISODate {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Calendar date for an instant, as seen in `timeZone`. */
export function isoInZone(instant: Date, timeZone: string): ISODate {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return fromUTCms(Date.UTC(instant.getFullYear(), instant.getMonth(), instant.getDate()));
  }
}

export function todayISO(timeZone: string, now: Date = new Date()): ISODate {
  return isoInZone(now, timeZone);
}

/** Current wall-clock time (HH:mm) in `timeZone`. */
export function nowTime(timeZone: string, now: Date = new Date()): TimeOfDay {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    return `${get("hour")}:${get("minute")}`;
  } catch {
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export const addDays = (iso: ISODate, n: number): ISODate => fromUTCms(toUTCms(iso) + n * DAY_MS);

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Adds months, clamping the day (Jan 31 + 1 month → Feb 28/29). */
export function addMonths(iso: ISODate, n: number, preferDay?: number): ISODate {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(preferDay ?? d, daysInMonth(ny, nm));
  return `${ny}-${String(nm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const addYears = (iso: ISODate, n: number, preferDay?: number) => addMonths(iso, n * 12, preferDay);

/** Whole days from a to b (positive when b is later). */
export const diffDays = (a: ISODate, b: ISODate): number => Math.round((toUTCms(b) - toUTCms(a)) / DAY_MS);

/** 0 = Sunday … 6 = Saturday */
export const weekday = (iso: ISODate): number => new Date(toUTCms(iso)).getUTCDay();

export function startOfWeek(iso: ISODate, weekStartsOn: 0 | 1 = 1): ISODate {
  const diff = (weekday(iso) - weekStartsOn + 7) % 7;
  return addDays(iso, -diff);
}
export const endOfWeek = (iso: ISODate, weekStartsOn: 0 | 1 = 1) => addDays(startOfWeek(iso, weekStartsOn), 6);
export const startOfMonth = (iso: ISODate): ISODate => `${iso.slice(0, 7)}-01`;
export function endOfMonth(iso: ISODate): ISODate {
  const [y, m] = iso.split("-").map(Number);
  return `${iso.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
}
export function startOfQuarter(iso: ISODate): ISODate {
  const [y, m] = iso.split("-").map(Number);
  const qm = Math.floor((m - 1) / 3) * 3 + 1;
  return `${y}-${String(qm).padStart(2, "0")}-01`;
}
export const endOfQuarter = (iso: ISODate) => endOfMonth(addMonths(startOfQuarter(iso), 2));
export const startOfYear = (iso: ISODate): ISODate => `${iso.slice(0, 4)}-01-01`;
export const endOfYear = (iso: ISODate): ISODate => `${iso.slice(0, 4)}-12-31`;
export const monthKey = (iso: ISODate) => iso.slice(0, 7);

export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const n = diffDays(start, end);
  for (let i = 0; i <= n && i < 3700; i++) out.push(addDays(start, i));
  return out;
}

export const inRange = (iso: ISODate, start: ISODate, end: ISODate) => iso >= start && iso <= end;
export const minDate = (a: ISODate, b: ISODate) => (a < b ? a : b);
export const maxDate = (a: ISODate, b: ISODate) => (a > b ? a : b);

// ───────────── Formatting (calendar dates are formatted in UTC so they never shift) ─────────────

export function formatDate(iso: ISODate, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }, locale?: string): string {
  if (!isISODate(iso)) return "—";
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(new Date(toUTCms(iso)));
}

export const formatLong = (iso: ISODate, locale?: string) =>
  formatDate(iso, { weekday: "long", month: "long", day: "numeric", year: "numeric" }, locale);

/** "Today", "Tomorrow", "Yesterday", weekday within a week, or "Mar 4". */
export function relativeDay(iso: ISODate, today: ISODate, locale?: string): string {
  const d = diffDays(today, iso);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d > 1 && d < 7) return formatDate(iso, { weekday: "long" }, locale);
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  return formatDate(iso, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }, locale);
}

export function formatTime(t: TimeOfDay | undefined, hour12 = false): string {
  if (!t) return "";
  if (!hour12) return t;
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hh}${suffix}` : `${hh}:${String(m).padStart(2, "0")}${suffix}`;
}

export const timeToMinutes = (t: TimeOfDay) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const minutesToTime = (mins: number): TimeOfDay => {
  const c = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
};

// ───────────── Periods ─────────────

export type PeriodKind = "week" | "month" | "quarter" | "year" | "custom";
export interface DateRange {
  start: ISODate;
  end: ISODate;
}

export function periodRange(kind: PeriodKind, anchor: ISODate, weekStartsOn: 0 | 1 = 1, custom?: DateRange): DateRange {
  switch (kind) {
    case "week":
      return { start: startOfWeek(anchor, weekStartsOn), end: endOfWeek(anchor, weekStartsOn) };
    case "month":
      return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    case "quarter":
      return { start: startOfQuarter(anchor), end: endOfQuarter(anchor) };
    case "year":
      return { start: startOfYear(anchor), end: endOfYear(anchor) };
    case "custom":
      return custom && custom.start <= custom.end ? custom : { start: startOfMonth(anchor), end: endOfMonth(anchor) };
  }
}

/** The equivalent immediately preceding period (used for comparisons). */
export function previousRange(kind: PeriodKind, range: DateRange, weekStartsOn: 0 | 1 = 1): DateRange {
  switch (kind) {
    case "week":
      return periodRange("week", addDays(range.start, -7), weekStartsOn);
    case "month":
      return periodRange("month", addMonths(range.start, -1));
    case "quarter":
      return periodRange("quarter", addMonths(range.start, -3));
    case "year":
      return periodRange("year", addYears(range.start, -1));
    case "custom": {
      const len = diffDays(range.start, range.end) + 1;
      return { start: addDays(range.start, -len), end: addDays(range.start, -1) };
    }
  }
}

export function shiftAnchor(kind: PeriodKind, anchor: ISODate, dir: -1 | 1): ISODate {
  switch (kind) {
    case "week":
      return addDays(anchor, 7 * dir);
    case "month":
      return addMonths(anchor, dir);
    case "quarter":
      return addMonths(anchor, 3 * dir);
    case "year":
      return addYears(anchor, dir);
    default:
      return anchor;
  }
}

export function describeRange(kind: PeriodKind, r: DateRange, locale?: string): string {
  switch (kind) {
    case "month":
      return formatDate(r.start, { month: "long", year: "numeric" }, locale);
    case "quarter":
      return `Q${Math.floor((Number(r.start.slice(5, 7)) - 1) / 3) + 1} ${r.start.slice(0, 4)}`;
    case "year":
      return r.start.slice(0, 4);
    default: {
      const sameYear = r.start.slice(0, 4) === r.end.slice(0, 4);
      const a = formatDate(r.start, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }, locale);
      const b = formatDate(r.end, { month: "short", day: "numeric", year: "numeric" }, locale);
      return `${a} – ${b}`;
    }
  }
}
