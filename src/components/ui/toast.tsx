"use client";

import { create } from "zustand";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}
const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));
let seq = 0;

export function toast(message: string, opts: { tone?: Tone; action?: Toast["action"]; duration?: number } = {}) {
  const id = ++seq;
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, tone: opts.tone ?? "success", action: opts.action }] }));
  setTimeout(() => dismissToast(id), opts.duration ?? (opts.action ? 6000 : 3200));
}
const dismissToast = (id: number) => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6">
      {toasts.map((t) => (
        <div key={t.id} role="status" className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-md border border-line bg-surface px-3.5 py-2.5 text-base shadow-pop animate-pop-in">
          {t.tone === "success" ? <CheckCircle2 className="size-4 shrink-0 text-positive" /> : t.tone === "error" ? <AlertTriangle className="size-4 shrink-0 text-negative" /> : <Info className="size-4 shrink-0 text-info" />}
          <p className="flex-1 text-ink">{t.message}</p>
          {t.action ? (
            <button
              className={cn("text-sm font-semibold text-activities hover:underline")}
              onClick={() => {
                t.action!.onClick();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          ) : null}
          <button onClick={() => dismissToast(t.id)} className="text-ink-3 hover:text-ink" aria-label="Dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
