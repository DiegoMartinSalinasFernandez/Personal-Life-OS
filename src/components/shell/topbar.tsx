"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Plus, Search, Settings, Target, LineChart, Moon, Sun, Monitor } from "lucide-react";
import { useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
import { openSheet } from "@/lib/store/ui";
import { useClock, useProfile, useHotkey, actions } from "@/lib/hooks";
import { formatLong } from "@/lib/domain/dates";
import { LogoMark } from "./logo";
import { SaveIndicator } from "./sidebar";
import { useInsights } from "./notifications";

export function Topbar() {
  const { today } = useClock();
  const profile = useProfile();
  const router = useRouter();
  const insights = useInsights();
  const pendingG = useRef(false);

  useHotkey("k", useCallback((e) => { e.preventDefault(); openSheet({ kind: "search" }); }, []), { meta: true, allowInInputs: true });
  useHotkey("/", useCallback((e) => { e.preventDefault(); openSheet({ kind: "search" }); }, []));
  useHotkey("n", useCallback((e) => { e.preventDefault(); openSheet({ kind: "quickadd" }); }, []));
  // "g" then o/f/n/a/s — quick navigation
  const goTo = useCallback(
    (dest: string) => (e: KeyboardEvent) => {
      if (!pendingG.current) return;
      e.preventDefault();
      pendingG.current = false;
      router.push(dest);
    },
    [router],
  );
  useHotkey("g", useCallback(() => { pendingG.current = true; setTimeout(() => (pendingG.current = false), 1200); }, []));
  useHotkey("o", goTo("/"));
  useHotkey("f", goTo("/finance"));
  useHotkey("e", goTo("/nutrition"));
  useHotkey("a", goTo("/activities"));
  useHotkey("s", goTo("/settings"));

  const initials = (profile.name || "You").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const themeIcon = profile.theme === "dark" ? <Moon /> : profile.theme === "light" ? <Sun /> : <Monitor />;
  const nextTheme = profile.theme === "system" ? "light" : profile.theme === "light" ? "dark" : "system";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-4 md:px-6 lg:px-8">
        <Link href="/" className="md:hidden" aria-label="Life OS home">
          <LogoMark />
        </Link>
        <p className="hidden text-base font-medium text-ink-2 md:block">
          <time dateTime={today}>{formatLong(today, profile.locale)}</time>
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => openSheet({ kind: "search" })} className="hidden h-9 w-64 items-center gap-2 rounded-md border border-line bg-surface px-3 text-base text-ink-3 transition hover:border-line-strong lg:flex" aria-label="Search">
            <Search className="size-4" aria-hidden />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="rounded border border-line bg-subtle px-1.5 text-micro font-medium">⌘K</kbd>
          </button>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => openSheet({ kind: "search" })} aria-label="Search">
            <Search />
          </Button>
          <Button variant="ghost" size="icon" className="relative" onClick={() => openSheet({ kind: "notifications" })} aria-label={`Reminders${insights.length ? ` (${insights.length})` : ""}`}>
            <Bell />
            {insights.length ? <span className="num absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-nutrition px-1 text-[10px] font-semibold text-white">{insights.length > 9 ? "9+" : insights.length}</span> : null}
          </Button>
          <Button variant="primary" className="hidden md:inline-flex" onClick={() => openSheet({ kind: "quickadd" })} title="Create (N)">
            <Plus /> New
          </Button>
          <Menu
            label="Account"
            trigger={(p) => (
              <button {...p} className="ml-1 grid size-8 place-items-center rounded-full bg-ink text-micro font-semibold text-canvas" aria-label="Open account menu">
                {initials}
              </button>
            )}
            items={[
              { label: "Goals", icon: <Target />, onSelect: () => router.push("/goals") },
              { label: "Insights", icon: <LineChart />, onSelect: () => router.push("/insights") },
              "separator",
              { label: `Theme: ${profile.theme}`, icon: themeIcon, onSelect: () => actions().setProfile({ theme: nextTheme }) },
              { label: "Settings", icon: <Settings />, onSelect: () => router.push("/settings"), hint: "G S" },
            ]}
          />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-line px-4 py-1 md:hidden">
        <time dateTime={today} className="text-caption font-medium text-ink-2">{formatLong(today, profile.locale)}</time>
        <SaveIndicator compact />
      </div>
    </header>
  );
}
