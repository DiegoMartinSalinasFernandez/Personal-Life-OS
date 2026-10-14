import { cn } from "@/lib/cn";

type Tone = "finance" | "nutrition" | "activities" | "positive" | "warning" | "negative" | "ink" | "info";
const bar: Record<Tone, string> = {
  finance: "bg-finance",
  nutrition: "bg-nutrition",
  activities: "bg-activities",
  positive: "bg-positive",
  warning: "bg-warning",
  negative: "bg-negative",
  ink: "bg-ink",
  info: "bg-info",
};

export function ProgressBar({ value, tone = "ink", className, label, size = "md", marker }: { value: number; tone?: Tone; className?: string; label?: string; size?: "sm" | "md" | "lg"; marker?: number }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
      className={cn("relative w-full overflow-hidden rounded-full bg-muted", size === "sm" ? "h-1.5" : size === "lg" ? "h-3" : "h-2", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", bar[tone])} style={{ width: `${pct * 100}%` }} />
      {marker != null && marker > 0 && marker < 1 ? <div className="absolute inset-y-0 w-px bg-ink/40" style={{ left: `${marker * 100}%` }} aria-hidden /> : null}
    </div>
  );
}

/** Circular progress. `value` may exceed 1 (overflow is drawn as a second lap in a darker tone). */
export function ProgressRing({ value, size = 160, stroke = 12, tone = "nutrition", children, label }: { value: number; size?: number; stroke?: number; tone?: Tone; children?: React.ReactNode; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Number.isFinite(value) ? value : 0);
  const first = Math.min(1, v);
  const over = Math.min(1, Math.max(0, v - 1));
  const color = `rgb(var(--${tone === "ink" ? "ink" : tone}))`;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--muted))" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - first)} style={{ transition: "stroke-dashoffset 600ms cubic-bezier(.2,.8,.2,1)" }} />
        {over > 0 ? <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - over)} style={{ filter: "brightness(0.7)" }} /> : null}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
