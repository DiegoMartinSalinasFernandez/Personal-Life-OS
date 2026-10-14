"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useStore } from "../store";
import { nowTime, todayISO } from "../domain/dates";
import { formatMoney, currencyDigits, type MoneyFormatOptions } from "../domain/money";
import type { Database } from "../domain/types";

export const useDb = (): Database => useStore((s) => s.db);
export const useProfile = () => useStore((s) => s.db.profile);
export const actions = () => useStore.getState();

/** Ticks once a minute so "today" and "now" stay correct across midnight. */
function subscribeMinute(cb: () => void) {
  const id = setInterval(cb, 30_000);
  const vis = () => document.visibilityState === "visible" && cb();
  document.addEventListener("visibilitychange", vis);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", vis);
  };
}
const minuteSnapshot = () => Math.floor(Date.now() / 60_000);

export function useClock() {
  const tz = useStore((s) => s.db.profile.timezone);
  const minute = useSyncExternalStore(subscribeMinute, minuteSnapshot, () => 0);
  return useMemo(() => {
    const d = new Date(minute ? minute * 60_000 : Date.now());
    return { today: todayISO(tz, d), now: nowTime(tz, d) };
  }, [tz, minute]);
}
export const useToday = () => useClock().today;

export function useMoney() {
  const currency = useStore((s) => s.db.profile.currency);
  const locale = useStore((s) => s.db.profile.locale);
  return useMemo(() => {
    const fmt = (cents: number, opts: MoneyFormatOptions = {}, cur = currency) => formatMoney(cents, cur, { locale, ...opts });
    return Object.assign(fmt, { currency, locale, digits: currencyDigits(currency) });
  }, [currency, locale]);
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** Persists small UI preferences (filters, tabs) per key in session storage. */
export function useSessionState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = sessionStorage.getItem(`ui:${key}`);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(`ui:${key}`, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue];
}

export function useHotkey(key: string, handler: (e: KeyboardEvent) => void, opts: { meta?: boolean; allowInInputs?: boolean } = {}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (typing && !opts.allowInInputs) return;
      if (opts.meta ? !(e.metaKey || e.ctrlKey) : e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      if (document.querySelector("dialog[open]") && !opts.meta) return;
      handler(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, handler, opts.meta, opts.allowInInputs]);
}
