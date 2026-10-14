"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, ArrowRight, Plus } from "lucide-react";
import { useUI, closeSheet, openSheet, type Sheet } from "@/lib/store/ui";
import { useDb, useMoney } from "@/lib/hooks";
import { formatDate } from "@/lib/domain/dates";
import { cn } from "@/lib/cn";
import { PRIMARY_NAV, SECONDARY_NAV, SETTINGS_NAV } from "./nav";
import { QUICK_ADD } from "./quick-add";
import { Dialog } from "@/components/ui/dialog";

type Group = "Pages" | "Create" | "Transactions" | "Tasks" | "Projects" | "Events" | "Goals" | "Foods" | "Food log" | "Habits";
interface Result {
  id: string;
  group: Group;
  title: string;
  meta?: string;
  run: () => void;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const GROUP_TONE: Partial<Record<Group, string>> = {
  Transactions: "text-finance",
  Foods: "text-nutrition",
  "Food log": "text-nutrition",
  Tasks: "text-activities",
  Projects: "text-activities",
  Events: "text-activities",
  Habits: "text-activities",
};

export function CommandPalette() {
  const open = useUI((s) => s.sheet?.kind === "search");
  const db = useDb();
  const money = useMoney();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const query = norm(q.trim());
    const go = (href: string) => () => {
      closeSheet();
      router.push(href);
    };
    const pages: Result[] = [...PRIMARY_NAV, ...SECONDARY_NAV, SETTINGS_NAV, { href: "/finance/transactions", label: "Transactions" }, { href: "/finance/budgets", label: "Budgets" }, { href: "/finance/bills", label: "Bills & recurring" }, { href: "/finance/accounts", label: "Accounts" }, { href: "/nutrition/history", label: "Nutrition history" }, { href: "/nutrition/plan", label: "Meal planner" }, { href: "/nutrition/foods", label: "Food database" }, { href: "/activities/tasks", label: "Tasks" }, { href: "/activities/calendar", label: "Calendar" }, { href: "/activities/projects", label: "Projects" }, { href: "/activities/habits", label: "Habits" }, { href: "/settings/integrations", label: "Integrations & connections" }, { href: "/finance/imports", label: "Import review" }].map((p) => ({ id: `page:${p.href}`, group: "Pages" as const, title: p.label, meta: p.href, run: go(p.href) }));
    const create: Result[] = QUICK_ADD.map((c) => ({ id: `new:${c.kind}`, group: "Create" as const, title: `New ${c.label.toLowerCase()}`, meta: c.hint, run: () => openSheet({ kind: c.kind } as Sheet) }));
    if (!query) return [...create, ...pages.slice(0, 7)];

    const match = (...fields: (string | undefined | null)[]) => {
      const hay = norm(fields.filter(Boolean).join(" "));
      return query.split(/\s+/).every((t) => hay.includes(t));
    };
    const cap = <T,>(xs: T[], n = 6) => xs.slice(0, n);
    const out: Result[] = [];
    out.push(...cap(create.filter((c) => match(c.title, c.meta)), 3));
    out.push(...cap(pages.filter((p) => match(p.title)), 4));
    const accName = new Map(db.accounts.map((a) => [a.id, a.name]));
    const catName = new Map(db.categories.map((c) => [c.id, c.name]));
    out.push(
      ...cap(
        [...db.transactions]
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .filter((t) => match(t.description, t.merchant, t.notes, t.tags.join(" "), catName.get(t.categoryId ?? "")))
          .map((t) => ({ id: `tx:${t.id}`, group: "Transactions" as const, title: t.description || t.merchant || "Transaction", meta: `${t.type === "income" ? "+" : t.type === "expense" ? "−" : "⇄ "}${money(t.amount, {}, db.accounts.find((a) => a.id === t.accountId)?.currency)} · ${formatDate(t.date)} · ${accName.get(t.accountId) ?? ""}`, run: () => openSheet({ kind: "transaction", id: t.id }) })),
      ),
    );
    out.push(...cap(db.tasks.filter((t) => match(t.title, t.description, t.tags.join(" "), t.notes)).sort((a, b) => Number(a.done) - Number(b.done)).map((t) => ({ id: `task:${t.id}`, group: "Tasks" as const, title: t.title, meta: `${t.done ? "Completed" : t.dueDate ? `Due ${formatDate(t.dueDate)}` : "No date"} · ${t.priority}`, run: () => openSheet({ kind: "task", id: t.id }) }))));
    out.push(...cap(db.projects.filter((p) => match(p.name, p.area, p.description)).map((p) => ({ id: `prj:${p.id}`, group: "Projects" as const, title: p.name, meta: p.area, run: go(`/activities/projects?id=${p.id}`) }))));
    out.push(...cap(db.events.filter((e) => match(e.title, e.location, e.notes)).map((e) => ({ id: `ev:${e.id}`, group: "Events" as const, title: e.title, meta: `${formatDate(e.date)}${e.recurrence ? " · repeats" : ""}`, run: () => openSheet({ kind: "event", id: e.id }) }))));
    out.push(...cap(db.goals.filter((g) => match(g.title, g.category, g.description)).map((g) => ({ id: `goal:${g.id}`, group: "Goals" as const, title: g.title, meta: g.category, run: () => openSheet({ kind: "goal", id: g.id }) }))));
    out.push(...cap(db.habits.filter((h) => match(h.name)).map((h) => ({ id: `hab:${h.id}`, group: "Habits" as const, title: h.name, meta: "Habit", run: go("/activities/habits") }))));
    out.push(...cap(db.foods.filter((f) => !f.archived && match(f.name, f.brand)).map((f) => ({ id: `food:${f.id}`, group: "Foods" as const, title: f.name, meta: `${f.per.protein} g protein per ${f.baseUnit === "unit" ? "unit" : `100 ${f.baseUnit}`} · log it`, run: () => openSheet({ kind: "food", foodId: f.id }) }))));
    const seen = new Set<string>();
    out.push(
      ...cap(
        [...db.foodEntries]
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .filter((e) => match(e.foodName, e.notes) && !seen.has(e.date + e.foodName) && seen.add(e.date + e.foodName))
          .map((e) => ({ id: `fe:${e.id}`, group: "Food log" as const, title: e.foodName, meta: `Logged ${formatDate(e.date)}`, run: go(`/nutrition?date=${e.date}`) })),
        4,
      ),
    );
    return out;
  }, [q, db, money, router]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[active]?.run();
    }
  };

  let lastGroup: Group | null = null;
  return (
    <Dialog open={open} onClose={closeSheet} title="Search" size="lg" className="sm:mt-[10vh] sm:self-start">
      <div className="relative -mt-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Search transactions, foods, tasks, projects, goals…"
          className="h-11 w-full rounded-md border border-line bg-subtle pl-9 pr-3 text-md outline-none focus:border-activities focus:ring-2 focus:ring-activities/20"
          role="combobox"
          aria-expanded
          aria-controls="palette-results"
          aria-activedescendant={results[active] ? `res-${active}` : undefined}
        />
      </div>
      <div ref={listRef} id="palette-results" role="listbox" className="mt-3 min-h-[200px]">
        {results.length === 0 ? (
          <p className="py-10 text-center text-base text-ink-3">No results for “{q}”.</p>
        ) : (
          results.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <div key={r.id}>
                {header ? <p className={cn("eyebrow px-2 pb-1 pt-3", GROUP_TONE[header])}>{header}</p> : null}
                <button
                  id={`res-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={r.run}
                  className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left", i === active ? "bg-muted" : "")}
                >
                  {r.group === "Create" ? <Plus className="size-4 text-ink-3" aria-hidden /> : <ArrowRight className="size-4 text-ink-3" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base text-ink">{r.title}</span>
                    {r.meta ? <span className="num block truncate text-caption text-ink-3">{r.meta}</span> : null}
                  </span>
                  {i === active ? <CornerDownLeft className="size-3.5 text-ink-3" aria-hidden /> : null}
                </button>
              </div>
            );
          })
        )}
      </div>
    </Dialog>
  );
}
