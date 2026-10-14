"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Modal built on the native <dialog> element: focus trapping, Escape to close
 * and inert background come from the platform. Renders as a bottom sheet on
 * small screens.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = "md", className }: { open: boolean; onClose: () => void; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && d.open) d.close();
    return () => {
      if (!document.querySelector("dialog[open]")) document.documentElement.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    d.addEventListener("cancel", onCancel);
    return () => d.removeEventListener("cancel", onCancel);
  }, [open]);

  if (!open) return null;
  const width = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" }[size];

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-0 mt-auto w-full max-w-none bg-transparent p-0 text-ink backdrop:animate-fade-in",
        "sm:m-auto sm:w-[calc(100%-2rem)]",
        width,
      )}
    >
      <div className={cn("flex max-h-[92dvh] flex-col rounded-t-xl border border-line bg-surface shadow-pop animate-sheet-in sm:max-h-[86dvh] sm:rounded-lg sm:animate-pop-in", className)}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
        <header className="flex items-start justify-between gap-4 px-5 pb-3 pt-4">
          <div>
            <h2 id="dialog-title" className="text-lg font-semibold">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-sm text-ink-3">{description}</p> : null}
          </div>
          <button onClick={onClose} className="-mr-1.5 grid size-8 place-items-center rounded-md text-ink-3 hover:bg-muted hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </button>
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer ? <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
