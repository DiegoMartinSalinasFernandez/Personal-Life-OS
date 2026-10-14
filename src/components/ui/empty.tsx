import { cn } from "@/lib/cn";

export function EmptyState({ icon, title, description, action, className, compact }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 py-6" : "gap-3 py-12", className)}>
      {icon ? <div className="grid size-10 place-items-center rounded-full bg-muted text-ink-3 [&_svg]:size-5">{icon}</div> : null}
      <div className="max-w-sm">
        <p className="text-md font-medium text-ink">{title}</p>
        {description ? <p className="mt-1 text-sm text-ink-3">{description}</p> : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} aria-hidden />;
}

export function ErrorState({ title = "Something went wrong", description, onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-md border border-negative/30 bg-negative-soft px-4 py-3 text-sm text-negative">
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-0.5 opacity-90">{description}</p> : null}
      {onRetry ? (
        <button onClick={onRetry} className="mt-2 font-medium underline underline-offset-2">
          Try again
        </button>
      ) : null}
    </div>
  );
}
