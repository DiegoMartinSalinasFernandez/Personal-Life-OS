"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cloud, CloudOff, FlaskConical, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { Logo, LogoMark } from "./logo";
import { PRIMARY_NAV, SECONDARY_NAV, SETTINGS_NAV, isActive, type NavItem } from "./nav";

const accentDot = { finance: "bg-finance", nutrition: "bg-nutrition", activities: "bg-activities" } as const;

function NavLink({ item, rail }: { item: NavItem; rail: boolean }) {
  const path = usePathname();
  const active = isActive(path, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={rail ? item.label : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-md text-base font-medium transition-colors",
        rail ? "justify-center px-0 xl:justify-start xl:px-2.5" : "px-2.5",
        active ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-ink-2 hover:bg-muted hover:text-ink",
      )}
    >
      <Icon className={cn("size-[18px] shrink-0", active ? "text-ink" : "text-ink-3 group-hover:text-ink-2")} aria-hidden />
      <span className={cn(rail && "sr-only xl:not-sr-only")}>{item.label}</span>
      {item.accent ? <span className={cn("ml-auto size-1.5 rounded-full", accentDot[item.accent], rail && "hidden xl:block", !active && "opacity-60")} aria-hidden /> : null}
    </Link>
  );
}

export function SaveIndicator({ compact }: { compact?: boolean }) {
  const state = useStore((s) => s.saveState);
  const label = state === "error" ? "Not saved — storage full or blocked" : state === "saving" ? "Saving…" : "Saved on this device";
  const Icon = state === "error" ? CloudOff : state === "saving" ? Loader2 : Cloud;
  return (
    <span className={cn("flex items-center gap-1.5 text-caption", state === "error" ? "text-negative" : "text-ink-3")} title={label} role="status">
      <Icon className={cn("size-3.5", state === "saving" && "animate-spin")} aria-hidden />
      <span className={cn(compact && "sr-only")}>{label}</span>
    </span>
  );
}

/** Desktop: full sidebar (xl) or icon rail (md–lg). Hidden on mobile. */
export function Sidebar() {
  const demo = useStore((s) => s.db.profile.demo);
  return (
    <aside className="sticky top-0 hidden h-dvh w-[68px] shrink-0 flex-col border-r border-line bg-canvas px-3 py-4 md:flex xl:w-[240px]">
      <Link href="/" className="mb-6 flex items-center justify-center px-1 xl:justify-start xl:px-2" aria-label="Life OS home">
        <span className="hidden xl:block">
          <Logo />
        </span>
        <span className="xl:hidden">
          <LogoMark />
        </span>
      </Link>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-6">
        <div className="flex flex-col gap-0.5">
          <p className="eyebrow mb-1.5 hidden px-2.5 xl:block">Workspace</p>
          {PRIMARY_NAV.map((i) => (
            <NavLink key={i.href} item={i} rail />
          ))}
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="eyebrow mb-1.5 hidden px-2.5 xl:block">Plan & review</p>
          {SECONDARY_NAV.map((i) => (
            <NavLink key={i.href} item={i} rail />
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-3">
          {demo ? (
            <Link href="/settings#data" className="hidden rounded-md border border-dashed border-warning/40 bg-warning-soft/60 p-3 text-sm xl:block">
              <span className="flex items-center gap-1.5 font-medium text-warning">
                <FlaskConical className="size-3.5" aria-hidden /> Demo data
              </span>
              <span className="mt-0.5 block text-caption text-ink-2">Sample records are loaded. Reset or start fresh in Settings.</span>
            </Link>
          ) : null}
          <NavLink item={SETTINGS_NAV} rail />
          <div className="hidden px-2.5 xl:block">
            <SaveIndicator />
          </div>
        </div>
      </nav>
    </aside>
  );
}
