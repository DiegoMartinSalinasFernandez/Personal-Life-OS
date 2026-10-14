"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { openSheet } from "@/lib/store/ui";
import { PRIMARY_NAV, isActive } from "./nav";

const accentText = { finance: "text-finance", nutrition: "text-nutrition", activities: "text-activities" } as const;

/** Bottom tab bar for phones, with the quick-add action in the thumb zone. */
export function MobileNav() {
  const path = usePathname();
  const [overview, finance, nutrition, activities] = PRIMARY_NAV;
  const Item = ({ item }: { item: (typeof PRIMARY_NAV)[number] }) => {
    const active = isActive(path, item.href);
    return (
      <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? (item.accent ? accentText[item.accent] : "text-ink") : "text-ink-3")}>
        <item.icon className="size-5" aria-hidden />
        {item.label}
      </Link>
    );
  };
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="flex items-stretch">
        <Item item={overview} />
        <Item item={finance} />
        <div className="flex flex-1 items-center justify-center">
          <button onClick={() => openSheet({ kind: "quickadd" })} className="grid size-11 -translate-y-1 place-items-center rounded-full bg-primary text-primary-fg shadow-pop" aria-label="Create">
            <Plus className="size-5" />
          </button>
        </div>
        <Item item={nutrition} />
        <Item item={activities} />
      </div>
    </nav>
  );
}
