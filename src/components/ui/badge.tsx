import { cn } from "@/lib/cn";

type Tone = "neutral" | "positive" | "negative" | "warning" | "info" | "finance" | "nutrition" | "activities" | "outline";
const tones: Record<Tone, string> = {
  neutral: "bg-muted text-ink-2",
  positive: "bg-positive-soft text-positive",
  negative: "bg-negative-soft text-negative",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  finance: "bg-finance-soft text-finance",
  nutrition: "bg-nutrition-soft text-nutrition",
  activities: "bg-activities-soft text-activities",
  outline: "border border-line text-ink-2",
};

export function Badge({ tone = "neutral", className, children, icon }: { tone?: Tone; className?: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-caption font-medium [&_svg]:size-3", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color }} />;
}
