"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

/** Lightweight accessible dropdown menu (click/Enter to open, arrows to move, Escape to close). */
export function Menu({ trigger, items, align = "end", label, className }: { trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu" }) => React.ReactNode; items: (MenuItem | "separator")[]; align?: "start" | "end"; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const btns = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        btns[(i + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length]?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-haspopup": "menu" })}
      {open ? (
        <div ref={listRef} role="menu" aria-label={label} className={cn("absolute top-full z-50 mt-1.5 min-w-[200px] rounded-md border border-line bg-surface p-1 shadow-pop animate-pop-in", align === "end" ? "right-0" : "left-0")}>
          {items.map((it, i) =>
            it === "separator" ? (
              <div key={i} className="my-1 h-px bg-line" role="separator" />
            ) : (
              <button
                key={i}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={cn("flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-base outline-none hover:bg-muted focus:bg-muted disabled:opacity-40 [&_svg]:size-4 [&_svg]:text-ink-3", it.danger ? "text-negative [&_svg]:text-negative" : "text-ink")}
              >
                {it.icon}
                <span className="flex-1">{it.label}</span>
                {it.hint ? <kbd className="text-caption text-ink-3">{it.hint}</kbd> : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
