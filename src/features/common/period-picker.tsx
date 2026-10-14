"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { describeRange, isISODate, periodRange, shiftAnchor, type DateRange, type ISODate, type PeriodKind } from "@/lib/domain/dates";

export interface PeriodState {
  kind: PeriodKind;
  anchor: ISODate;
  custom?: DateRange;
}

export function resolvePeriod(p: PeriodState, weekStartsOn: 0 | 1): DateRange {
  return periodRange(p.kind, p.anchor, weekStartsOn, p.custom);
}

export function PeriodPicker({ value, onChange, weekStartsOn, today, locale }: { value: PeriodState; onChange: (p: PeriodState) => void; weekStartsOn: 0 | 1; today: ISODate; locale?: string }) {
  const range = resolvePeriod(value, weekStartsOn);
  const isCurrent = value.kind !== "custom" && range.start <= today && range.end >= today;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        label="Period"
        size="sm"
        value={value.kind}
        onChange={(kind) => onChange({ kind, anchor: value.anchor, custom: kind === "custom" ? value.custom ?? range : value.custom })}
        options={[
          { value: "week", label: "Week" },
          { value: "month", label: "Month" },
          { value: "quarter", label: "Quarter" },
          { value: "year", label: "Year" },
          { value: "custom", label: "Custom" },
        ]}
      />
      {value.kind === "custom" ? (
        <div className="flex items-center gap-1.5">
          <Input type="date" aria-label="From" className="h-8 w-auto text-sm" value={value.custom?.start ?? range.start} max={value.custom?.end} onChange={(e) => isISODate(e.target.value) && onChange({ ...value, custom: { start: e.target.value, end: value.custom?.end ?? range.end } })} />
          <span className="text-ink-3">–</span>
          <Input type="date" aria-label="To" className="h-8 w-auto text-sm" value={value.custom?.end ?? range.end} min={value.custom?.start} onChange={(e) => isISODate(e.target.value) && onChange({ ...value, custom: { start: value.custom?.start ?? range.start, end: e.target.value } })} />
        </div>
      ) : (
        <div className="flex items-center gap-0.5">
          <Button size="icon-sm" variant="ghost" onClick={() => onChange({ ...value, anchor: shiftAnchor(value.kind, value.anchor, -1) })} aria-label="Previous period">
            <ChevronLeft />
          </Button>
          <span className="min-w-[120px] text-center text-sm font-medium text-ink">{describeRange(value.kind, range, locale)}</span>
          <Button size="icon-sm" variant="ghost" onClick={() => onChange({ ...value, anchor: shiftAnchor(value.kind, value.anchor, 1) })} aria-label="Next period">
            <ChevronRight />
          </Button>
          {!isCurrent ? (
            <Button size="sm" variant="ghost" onClick={() => onChange({ ...value, anchor: today })}>
              Today
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
