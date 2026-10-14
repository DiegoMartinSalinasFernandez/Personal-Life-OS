import { cn } from "@/lib/cn";

/** Standard page header used by every screen. */
export function PageHeader({ title, description, actions, eyebrow, accent, className, children }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string; accent?: "finance" | "nutrition" | "activities"; className?: string; children?: React.ReactNode }) {
  const accentCls = accent ? { finance: "text-finance", nutrition: "text-nutrition", activities: "text-activities" }[accent] : "text-ink-3";
  return (
    <div className={cn("mb-5 flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <p className={cn("eyebrow mb-1", accentCls)}>{eyebrow}</p> : null}
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {description ? <p className="mt-1 text-base text-ink-3">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
