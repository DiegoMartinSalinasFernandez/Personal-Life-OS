"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Check, Trash2, Copy, ShoppingCart, ClipboardCopy, Download, MoreHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Menu } from "@/components/ui/menu";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useDb, useToday, actions } from "@/lib/hooks";
import { openSheet } from "@/lib/store/ui";
import { addDays, eachDay, endOfWeek, formatDate, isISODate, startOfWeek, describeRange, type ISODate } from "@/lib/domain/dates";
import { itemNutrients, plannedTotals, shoppingList, OZ_TO_G } from "@/lib/calc/nutrition";
import { downloadText } from "@/lib/data/csv";

export default function MealPlanPage() {
  const db = useDb();
  const today = useToday();
  const ws = db.profile.weekStartsOn;
  const [anchor, setAnchor] = useState(today);
  const [shopping, setShopping] = useState(false);
  const [copyFrom, setCopyFrom] = useState<ISODate | null>(null);
  const start = startOfWeek(anchor, ws);
  const end = endOfWeek(anchor, ws);
  const days = eachDay(start, end);
  const meals = [...db.mealTypes].sort((a, b) => a.order - b.order);
  const foods = useMemo(() => new Map(db.foods.map((f) => [f.id, f])), [db.foods]);
  const plans = db.plannedMeals.filter((p) => p.date >= start && p.date <= end);
  const target = db.profile.nutrition.proteinTarget;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Previous week"><ChevronLeft /></Button>
          <span className="min-w-[170px] text-center text-base font-medium">{describeRange("week", { start, end })}</span>
          <Button size="icon-sm" variant="ghost" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Next week"><ChevronRight /></Button>
          {!(today >= start && today <= end) ? <Button size="sm" variant="ghost" onClick={() => setAnchor(today)}>This week</Button> : null}
        </div>
        <Button size="sm" onClick={() => setShopping(true)} disabled={!plans.some((p) => !p.loggedAt)}>
          <ShoppingCart /> Shopping list
        </Button>
      </div>
      <p className="text-caption text-ink-3">Planned food is separate from what you ate: it never counts toward consumed protein until you press “Log”.</p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {days.map((d) => {
          const dayPlans = plans.filter((p) => p.date === d);
          const pt = plannedTotals(db.plannedMeals, db.foods, d).protein;
          const isPast = d < today;
          return (
            <Card key={d} className={cn("flex flex-col", d === today && "ring-1 ring-nutrition/50")}>
              <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
                <div>
                  <p className={cn("text-sm font-semibold", d === today ? "text-nutrition" : "text-ink")}>{formatDate(d, { weekday: "short", month: "short", day: "numeric" })}</p>
                  <p className="num text-caption text-ink-3">{pt ? `${Math.round(pt)} g planned${target ? ` · ${Math.round((pt / target) * 100)}%` : ""}` : "Nothing planned"}</p>
                </div>
                <Menu
                  label="Day actions"
                  trigger={(p) => <Button {...p} size="icon-sm" variant="ghost" aria-label={`Actions for ${d}`}><MoreHorizontal /></Button>}
                  items={[
                    { label: "Copy this day to…", icon: <Copy />, disabled: !dayPlans.length, onSelect: () => setCopyFrom(d) },
                    { label: "Clear day", icon: <Trash2 />, danger: true, disabled: !dayPlans.length, onSelect: () => { dayPlans.forEach((p) => actions().remove("plannedMeals", p.id)); toast("Day cleared"); } },
                  ]}
                />
              </header>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {meals.map((m) => {
                  const mp = dayPlans.filter((p) => p.mealTypeId === m.id);
                  return (
                    <div key={m.id} className="rounded-md bg-subtle/70 px-2 py-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-caption font-medium text-ink-2">{m.name}</p>
                        <button onClick={() => openSheet({ kind: "food", date: d, mealTypeId: m.id, mode: "plan" })} className="grid size-6 place-items-center rounded text-ink-3 hover:bg-muted hover:text-ink" aria-label={`Plan ${m.name} on ${d}`}>
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      {mp.map((p) => (
                        <div key={p.id} className={cn("mt-1 rounded border border-line bg-surface p-1.5", p.loggedAt && "opacity-60")}>
                          {p.note ? <p className="mb-0.5 text-caption font-medium text-ink-2">{p.note}</p> : null}
                          <ul className="text-caption text-ink-2">
                            {p.items.map((it, i) => {
                              const f = foods.get(it.foodId);
                              return (
                                <li key={i} className="flex justify-between gap-2">
                                  <span className="truncate">{f?.name ?? "Removed food"}</span>
                                  <span className="num shrink-0 text-ink-3">{Math.round(itemNutrients(it, f).protein)} g</span>
                                </li>
                              );
                            })}
                          </ul>
                          <div className="mt-1 flex items-center justify-end gap-1">
                            {p.loggedAt ? (
                              <span className="inline-flex items-center gap-1 text-caption text-positive"><Check className="size-3" /> Logged</span>
                            ) : (
                              <>
                                <button className="rounded p-1 text-ink-3 hover:bg-muted hover:text-negative" onClick={() => actions().remove("plannedMeals", p.id)} aria-label="Remove planned meal"><Trash2 className="size-3" /></button>
                                {!(d > today) ? (
                                  <button className="rounded px-1.5 py-0.5 text-caption font-medium text-nutrition hover:bg-nutrition-soft" onClick={() => { const n = actions().logPlannedMeal(p.id, d === today ? undefined : m.time); toast(`Logged ${n} item${n === 1 ? "" : "s"} as eaten`); }}>
                                    Log
                                  </button>
                                ) : null}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {isPast && !dayPlans.length ? <p className="px-1 text-caption text-ink-3">Past day</p> : null}
              </div>
            </Card>
          );
        })}
      </div>
      {shopping ? <ShoppingDialog start={start < today ? today : start} end={end} onClose={() => setShopping(false)} /> : null}
      {copyFrom ? <CopyDayDialog from={copyFrom} onClose={() => setCopyFrom(null)} /> : null}
    </div>
  );
}

function CopyDayDialog({ from, onClose }: { from: ISODate; onClose: () => void }) {
  const [to, setTo] = useState(addDays(from, 1));
  const valid = isISODate(to) && to !== from;
  return (
    <Dialog open onClose={onClose} title={`Copy ${formatDate(from, { weekday: "long" })}'s plan`} size="sm" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} onClick={() => { const n = actions().copyPlan(from, to); toast(`Copied ${n} planned meal${n === 1 ? "" : "s"} to ${formatDate(to)}`); onClose(); }}>Copy</Button></>}>
      <Field label="Copy to date">{(p) => <Input {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
    </Dialog>
  );
}

function ShoppingDialog({ start, end, onClose }: { start: ISODate; end: ISODate; onClose: () => void }) {
  const db = useDb();
  const imperial = db.profile.nutrition.units === "imperial";
  const list = shoppingList(db.plannedMeals, db.foods, start, end);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const amount = (l: (typeof list)[number]) => {
    if (l.baseUnit === "unit") return `${Math.ceil(l.amount)} × unit`;
    if (imperial && l.baseUnit === "g") return `${(l.amount / OZ_TO_G).toFixed(1)} oz`;
    return l.amount >= 1000 ? `${(l.amount / 1000).toFixed(2)} ${l.baseUnit === "g" ? "kg" : "L"}` : `${Math.round(l.amount)} ${l.baseUnit}`;
  };
  const text = `Shopping list (${formatDate(start)} – ${formatDate(end)})\n` + list.map((l) => `- ${l.name}: ${amount(l)}`).join("\n");
  return (
    <Dialog
      open
      onClose={onClose}
      title="Shopping list"
      description={`From planned meals not yet logged, ${formatDate(start)} – ${formatDate(end)}`}
      footer={
        <>
          <Button onClick={() => { navigator.clipboard?.writeText(text).then(() => toast("Copied to clipboard"), () => toast("Couldn't access the clipboard", { tone: "error" })); }}><ClipboardCopy /> Copy</Button>
          <Button onClick={() => downloadText("shopping-list.txt", text, "text/plain;charset=utf-8")}><Download /> Download</Button>
          <Button variant="primary" onClick={onClose}>Done</Button>
        </>
      }
    >
      {list.length ? (
        <ul className="divide-y divide-line">
          {list.map((l) => (
            <li key={l.foodId} className="flex items-center gap-3 py-2">
              <Checkbox tone="nutrition" checked={checked.has(l.foodId)} label={l.name} onChange={(v) => { const n = new Set(checked); if (v) n.add(l.foodId); else n.delete(l.foodId); setChecked(n); }} />
              <span className={cn("flex-1 text-base", checked.has(l.foodId) && "text-ink-3 line-through")}>{l.name}</span>
              <span className="num text-sm text-ink-2">{amount(l)}</span>
              <span className="w-16 text-right text-caption text-ink-3">{l.meals} meal{l.meals > 1 ? "s" : ""}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-ink-3">No upcoming planned meals this week.</p>
      )}
      <p className="mt-3 text-caption text-ink-3">Amounts are cooked/as-eaten weights from your plan; adjust for raw ingredients as needed.</p>
    </Dialog>
  );
}
