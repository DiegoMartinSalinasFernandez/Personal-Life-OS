import { addDays, addMonths, addYears, diffDays, startOfWeek, weekday, type ISODate } from "./dates";

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export interface Recurrence {
  freq: Frequency;
  /** Every N units (≥1). */
  interval: number;
  /** For weekly rules: weekdays (0=Sun…6=Sat). Empty/undefined → same weekday as start. */
  byWeekday?: number[];
  /** Last date (inclusive) an occurrence may fall on. */
  until?: ISODate;
}

const MAX_ITER = 5000;

/**
 * Expands a recurrence into concrete calendar dates within [from, to].
 * Pure and deterministic: the same rule always yields the same dates,
 * which is what prevents duplicated occurrences.
 */
export function occurrencesBetween(start: ISODate, rule: Recurrence, from: ISODate, to: ISODate, exDates: ISODate[] = []): ISODate[] {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  const end = rule.until && rule.until < to ? rule.until : to;
  const lo = from > start ? from : start;
  if (lo > end) return [];
  const ex = new Set(exDates);
  const out: ISODate[] = [];
  const push = (d: ISODate) => {
    if (d >= lo && d <= end && !ex.has(d)) out.push(d);
  };

  switch (rule.freq) {
    case "daily": {
      const offset = Math.max(0, Math.ceil(diffDays(start, lo) / interval));
      for (let i = offset, n = 0; n < MAX_ITER; i++, n++) {
        const d = addDays(start, i * interval);
        if (d > end) break;
        push(d);
      }
      break;
    }
    case "weekly": {
      const days = rule.byWeekday && rule.byWeekday.length ? [...new Set(rule.byWeekday)].sort() : [weekday(start)];
      const week0 = startOfWeek(start, 0);
      const firstWeek = Math.max(0, Math.floor(diffDays(week0, startOfWeek(lo, 0)) / 7 / interval));
      for (let w = firstWeek, n = 0; n < MAX_ITER; w++, n++) {
        const ws = addDays(week0, w * 7 * interval);
        if (ws > end) break;
        for (const wd of days) {
          const d = addDays(ws, wd);
          if (d >= start) push(d);
        }
      }
      break;
    }
    case "monthly":
    case "yearly": {
      const step = rule.freq === "monthly" ? interval : interval * 12;
      const preferDay = Number(start.slice(8, 10));
      const monthsBetween = (Number(lo.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + (Number(lo.slice(5, 7)) - Number(start.slice(5, 7)));
      const firstK = Math.max(0, Math.floor(monthsBetween / step) - 1);
      for (let k = firstK, n = 0; n < MAX_ITER; k++, n++) {
        const d = addMonths(start, k * step, preferDay);
        if (d > end) break;
        push(d);
      }
      break;
    }
  }
  return out;
}

/** First occurrence strictly after `after` (or on/after when inclusive). */
export function nextOccurrence(start: ISODate, rule: Recurrence, after: ISODate, inclusive = false): ISODate | null {
  const from = inclusive ? after : addDays(after, 1);
  const horizon = rule.freq === "yearly" ? addYears(from, rule.interval * 2 + 1) : rule.freq === "monthly" ? addMonths(from, rule.interval * 2 + 1) : addDays(from, 7 * (rule.interval + 1) + 7);
  const list = occurrencesBetween(start, rule, from, horizon);
  return list[0] ?? null;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function describeRecurrence(rule: Recurrence): string {
  const n = Math.max(1, rule.interval);
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[rule.freq];
  let base = n === 1 ? (rule.freq === "daily" ? "Daily" : rule.freq === "weekly" ? "Weekly" : rule.freq === "monthly" ? "Monthly" : "Yearly") : `Every ${n} ${unit}s`;
  if (rule.freq === "weekly" && rule.byWeekday?.length) {
    const sorted = [...rule.byWeekday].sort();
    if (sorted.join() === "1,2,3,4,5") base = n === 1 ? "Weekdays" : `${base} on weekdays`;
    else base = `${base} on ${sorted.map((d) => WD[d]).join(", ")}`;
  }
  return base;
}
