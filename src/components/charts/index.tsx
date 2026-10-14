"use client";

/**
 * Chart conventions
 * - One y-axis per chart; recessive grid (horizontal only) and axes.
 * - Categorical series use --chart-1…5 in fixed order (validated for CVD);
 *   single-series charts use the owning module's accent.
 * - ≥2 series always get a legend; every chart has a hover tooltip.
 * - Bars: thin, 4px rounded data-ends, 2px gaps; lines 2px.
 */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { cn } from "@/lib/cn";

export const SERIES = ["rgb(var(--chart-1))", "rgb(var(--chart-2))", "rgb(var(--chart-3))", "rgb(var(--chart-4))", "rgb(var(--chart-5))"];
export const ACCENT = { finance: "rgb(var(--finance))", nutrition: "rgb(var(--nutrition))", activities: "rgb(var(--activities))", ink: "rgb(var(--ink-3))" };

const axisProps = { tickLine: false, axisLine: false, tick: { fill: "rgb(var(--ink-3))", fontSize: 11 }, tickMargin: 8 } as const;
const grid = <CartesianGrid vertical={false} stroke="rgb(var(--grid))" strokeDasharray="0" />;

export function Legend({ items, className }: { items: { label: string; color: string; dashed?: boolean }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-2", className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.dashed ? <span className="h-0 w-3.5 border-t-2 border-dashed" style={{ borderColor: i.color }} aria-hidden /> : <span className="size-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

type Fmt = (v: number) => string;

function TooltipCard({ active, payload, label, labelFormatter, valueFormatter, extra }: Partial<TooltipContentProps<number, string>> & { labelFormatter?: (l: string) => string; valueFormatter: Fmt; extra?: (p: Record<string, unknown>) => React.ReactNode }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Record<string, unknown>;
  return (
    <div className="min-w-[150px] rounded-md border border-line bg-surface px-3 py-2 text-sm shadow-pop">
      <p className="mb-1 font-medium text-ink">{labelFormatter ? labelFormatter(String(label)) : String(label)}</p>
      <ul className="space-y-0.5">
        {payload
          .filter((p) => p.value != null)
          .map((p) => (
            <li key={String(p.dataKey)} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-ink-2">
                <span className="size-2 rounded-sm" style={{ background: (p.color as string) ?? (p.fill as string) }} aria-hidden />
                {p.name}
              </span>
              <span className="num font-medium text-ink">{valueFormatter(Number(p.value))}</span>
            </li>
          ))}
      </ul>
      {extra ? extra(row) : null}
    </div>
  );
}

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

/** Grouped bars over time (e.g. income vs expenses). */
export function GroupedBars({ data, xKey, series, height = 240, valueFormatter, axisFormatter, labelFormatter, tickFormatter, ariaLabel }: { data: Record<string, unknown>[]; xKey: string; series: SeriesDef[]; height?: number; valueFormatter: Fmt; axisFormatter?: Fmt; labelFormatter?: (l: string) => string; tickFormatter?: (l: string) => string; ariaLabel: string }) {
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
          {grid}
          <XAxis dataKey={xKey} {...axisProps} tickFormatter={tickFormatter} interval="preserveStartEnd" minTickGap={14} />
          <YAxis {...axisProps} tickFormatter={axisFormatter ?? valueFormatter} width={56} />
          <Tooltip cursor={{ fill: "rgb(var(--muted))", opacity: 0.6 }} content={(p) => <TooltipCard {...(p as TooltipContentProps<number, string>)} valueFormatter={valueFormatter} labelFormatter={labelFormatter} />} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={18} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Stacked bars (e.g. protein per meal per day) with optional target line. */
export function StackedBars({ data, xKey, series, height = 240, valueFormatter, labelFormatter, tickFormatter, target, targetLabel, ariaLabel }: { data: Record<string, unknown>[]; xKey: string; series: SeriesDef[]; height?: number; valueFormatter: Fmt; labelFormatter?: (l: string) => string; tickFormatter?: (l: string) => string; target?: number; targetLabel?: string; ariaLabel: string }) {
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="26%" margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          {grid}
          <XAxis dataKey={xKey} {...axisProps} tickFormatter={tickFormatter} interval="preserveStartEnd" minTickGap={10} />
          <YAxis {...axisProps} tickFormatter={valueFormatter} width={48} />
          <Tooltip
            cursor={{ fill: "rgb(var(--muted))", opacity: 0.6 }}
            content={(p) => (
              <TooltipCard
                {...(p as TooltipContentProps<number, string>)}
                valueFormatter={valueFormatter}
                labelFormatter={labelFormatter}
                extra={(row) => {
                  const total = series.reduce((s, x) => s + (Number(row[x.key]) || 0), 0);
                  return (
                    <p className="mt-1 flex justify-between gap-4 border-t border-line pt-1 text-ink">
                      <span>Total</span>
                      <span className="num font-semibold">{valueFormatter(total)}</span>
                    </p>
                  );
                }}
              />
            )}
          />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} stroke="rgb(var(--surface))" strokeWidth={1} radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} maxBarSize={28} />
          ))}
          {target ? <ReferenceLine y={target} stroke="rgb(var(--ink-2))" strokeDasharray="4 4" strokeWidth={1.5} label={targetLabel ? { value: targetLabel, position: "insideTopRight", fill: "rgb(var(--ink-2))", fontSize: 11 } : undefined} /> : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Single-series bars, optionally highlighting bars that meet a target. */
export function SimpleBars({ data, xKey, yKey, label, color, height = 200, valueFormatter, labelFormatter, tickFormatter, target, targetLabel, dimWhen, ariaLabel }: { data: Record<string, unknown>[]; xKey: string; yKey: string; label: string; color: string; height?: number; valueFormatter: Fmt; labelFormatter?: (l: string) => string; tickFormatter?: (l: string) => string; target?: number; targetLabel?: string; dimWhen?: (row: Record<string, unknown>) => boolean; ariaLabel: string }) {
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="24%" margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          {grid}
          <XAxis dataKey={xKey} {...axisProps} tickFormatter={tickFormatter} interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...axisProps} tickFormatter={valueFormatter} width={48} allowDecimals={false} />
          <Tooltip cursor={{ fill: "rgb(var(--muted))", opacity: 0.6 }} content={(p) => <TooltipCard {...(p as TooltipContentProps<number, string>)} valueFormatter={valueFormatter} labelFormatter={labelFormatter} />} />
          <Bar dataKey={yKey} name={label} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28}>
            {dimWhen ? data.map((row, i) => <Cell key={i} fill={color} fillOpacity={dimWhen(row) ? 0.35 : 1} />) : null}
          </Bar>
          {target ? <ReferenceLine y={target} stroke="rgb(var(--ink-2))" strokeDasharray="4 4" strokeWidth={1.5} label={targetLabel ? { value: targetLabel, position: "insideTopRight", fill: "rgb(var(--ink-2))", fontSize: 11 } : undefined} /> : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Single-series area/line trend (e.g. total balance). */
export function TrendArea({ data, xKey, yKey, label, color, height = 180, valueFormatter, axisFormatter, labelFormatter, tickFormatter, ariaLabel, showAxis = true }: { data: Record<string, unknown>[]; xKey: string; yKey: string; label: string; color: string; height?: number; valueFormatter: Fmt; axisFormatter?: Fmt; labelFormatter?: (l: string) => string; tickFormatter?: (l: string) => string; ariaLabel: string; showAxis?: boolean }) {
  const id = `g-${yKey}-${label.replace(/\W/g, "")}`;
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: showAxis ? -8 : 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {showAxis ? grid : null}
          <XAxis dataKey={xKey} {...axisProps} hide={!showAxis} tickFormatter={tickFormatter} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axisProps} hide={!showAxis} tickFormatter={axisFormatter ?? valueFormatter} width={60} domain={["auto", "auto"]} />
          <Tooltip cursor={{ stroke: "rgb(var(--line-strong))", strokeWidth: 1 }} content={(p) => <TooltipCard {...(p as TooltipContentProps<number, string>)} valueFormatter={valueFormatter} labelFormatter={labelFormatter} />} />
          <Area type="monotone" dataKey={yKey} name={label} stroke={color} strokeWidth={2} fill={`url(#${id})`} dot={false} activeDot={{ r: 4, stroke: "rgb(var(--surface))", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranked horizontal bars in HTML — used for category breakdowns (better than a pie for comparing). */
export function BarList({ items, valueFormatter, color = ACCENT.finance, max, onSelect }: { items: { key: string; label: React.ReactNode; value: number; sub?: React.ReactNode; dot?: string }[]; valueFormatter: Fmt; color?: string; max?: number; onSelect?: (key: string) => void }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((i) => {
        const Row = onSelect ? "button" : "div";
        return (
          <li key={i.key}>
            <Row onClick={onSelect ? () => onSelect(i.key) : undefined} className={cn("block w-full text-left", onSelect && "rounded-md hover:bg-subtle")}>
              <div className="mb-1 flex items-center justify-between gap-3 text-base">
                <span className="flex min-w-0 items-center gap-2">
                  {i.dot ? <span className="size-2 shrink-0 rounded-full" style={{ background: i.dot }} aria-hidden /> : null}
                  <span className="truncate text-ink">{i.label}</span>
                </span>
                <span className="num shrink-0 font-medium text-ink">
                  {valueFormatter(i.value)}
                  {i.sub ? <span className="ml-1.5 font-normal text-ink-3">{i.sub}</span> : null}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, (i.value / top) * 100)}%`, background: color }} />
              </div>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}
