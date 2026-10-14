"use client";

import { useEffect } from "react";
import { useStore, startPersistence } from "@/lib/store";
import { Toaster } from "@/components/ui/toast";
import { ConfirmHost } from "@/components/ui/confirm";
import { Skeleton } from "@/components/ui/empty";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileNav } from "./mobile-nav";
import { QuickAddDialog } from "./quick-add";
import { CommandPalette } from "./command-palette";
import { NotificationsDialog } from "./notifications";
import { SheetHost } from "./sheet-host";
import { Onboarding } from "./onboarding";

function useTheme() {
  const theme = useStore((s) => s.db.profile.theme);
  const hydrated = useStore((s) => s.hydrated);
  useEffect(() => {
    if (!hydrated) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    try {
      localStorage.setItem("life-os:theme", theme);
    } catch {}
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme, hydrated]);
}

function LoadingShell() {
  return (
    <div className="flex min-h-dvh" aria-busy="true" aria-label="Loading your workspace">
      <div className="hidden w-[240px] border-r border-line p-4 xl:block">
        <Skeleton className="mb-8 h-7 w-28" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="mb-2 h-8" />
        ))}
      </div>
      <div className="flex-1 p-8">
        <Skeleton className="mb-6 h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const hydrated = useStore((s) => s.hydrated);
  const onboarded = useStore((s) => s.db.profile.onboarded);

  useEffect(() => {
    useStore.getState().hydrate();
    return startPersistence();
  }, []);
  useTheme();

  if (!hydrated) return <LoadingShell />;
  if (!onboarded) return <Onboarding />;

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-28 pt-5 md:px-6 md:pb-10 lg:px-8 lg:pt-7">
            {children}
          </main>
        </div>
      </div>
      <MobileNav />
      <QuickAddDialog />
      <CommandPalette />
      <NotificationsDialog />
      <SheetHost />
      <ConfirmHost />
      <Toaster />
    </>
  );
}
