import { cn } from "@/lib/cn";

export function Card({ className, as: As = "section", ...rest }: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" }) {
  return <As className={cn("card", className)} {...rest} />;
}

export function CardHeader({ title, subtitle, action, icon, className }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-5 pt-4 pb-3", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon}
        <div className="min-w-0">
          <h2 className="truncate text-md font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 truncate text-sm text-ink-3">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="flex max-w-full shrink-0 items-center gap-1.5">{action}</div> : null}
    </header>
  );
}

export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...rest} />;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-line", className)} />;
}
