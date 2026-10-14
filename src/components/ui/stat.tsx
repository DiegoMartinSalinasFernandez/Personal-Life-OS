import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

/** Change indicator. `goodWhen` decides colour; the arrow + sign carry meaning without colour. */
export function Delta({ value, goodWhen = "up", suffix = "vs prev.", className }: { value: number | null; goodWhen?: "up" | "down" | "neutral"; suffix?: string; className?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className={cn("text-caption text-ink-3", className)}>No comparison</span>;
  const flat = Math.abs(value) < 0.005;
  const up = value > 0;
  const good = goodWhen === "neutral" || flat ? null : (goodWhen === "up") === up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-1 text-caption", className)}>
      <span className={cn("num inline-flex items-center gap-0.5 rounded-sm px-1 py-px font-semibold", good == null ? "bg-muted text-ink-2" : good ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative")}>
        <Icon className="size-3" aria-hidden />
        {flat ? "0%" : `${up ? "+" : "−"}${Math.abs(value * 100).toFixed(Math.abs(value) < 0.1 ? 1 : 0)}%`}
      </span>
      <span className="text-ink-3">{suffix}</span>
    </span>
  );
}

export function Stat({ label, value, sub, icon, className, accent }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; className?: string; accent?: "finance" | "nutrition" | "activities" }) {
  const accentCls = accent ? { finance: "bg-finance-soft text-finance", nutrition: "bg-nutrition-soft text-nutrition", activities: "bg-activities-soft text-activities" }[accent] : "bg-muted text-ink-2";
  return (
    <div className={cn("card flex flex-col gap-2 p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink-3">{label}</p>
        {icon ? <span className={cn("grid size-7 place-items-center rounded-md [&_svg]:size-3.5", accentCls)}>{icon}</span> : null}
      </div>
      <div className="num text-xl font-semibold tracking-tight text-ink">{value}</div>
      {sub ? <div className="min-h-[18px]">{sub}</div> : null}
    </div>
  );
}
