"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Segmented control for in-page state (period selectors, views). */
export function Segmented<T extends string>({ value, onChange, options, size = "md", className, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; size?: "sm" | "md"; className?: string; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-md bg-muted p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "whitespace-nowrap rounded-[7px] font-medium transition-all",
            size === "sm" ? "h-7 px-2.5 text-sm" : "h-8 px-3 text-sm",
            value === o.value ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Route-based sub navigation for a module. */
export function SubNav({ items, accent }: { items: { href: string; label: string; exact?: boolean }[]; accent: "finance" | "nutrition" | "activities" | "ink" }) {
  const path = usePathname();
  const bar = { finance: "after:bg-finance", nutrition: "after:bg-nutrition", activities: "after:bg-activities", ink: "after:bg-ink" }[accent];
  return (
    <nav aria-label="Section" className="scrollbar-thin -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {items.map((it) => {
          const active = it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/");
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative block px-3 pb-2.5 pt-1 text-base font-medium transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full",
                  active ? cn("text-ink", bar) : "text-ink-3 hover:text-ink after:bg-transparent",
                )}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
