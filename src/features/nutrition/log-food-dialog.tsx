"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Star, Plus, ChevronLeft, Trash2, PackagePlus, Bookmark, Clock } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { cn } from "@/lib/cn";
import { useClock, useDb, actions } from "@/lib/hooks";
import { closeSheet } from "@/lib/store/ui";
import { localFoodProvider } from "@/lib/data/food-provider";
import { itemNutrients, recentFoodIds, scaleNutrients, toBaseAmount, unitLabel, formatQuantity } from "@/lib/calc/nutrition";
import { formatDate, isISODate, type ISODate } from "@/lib/domain/dates";
import type { Food, FoodEntry, MealItem, QuantityUnit, SavedMeal } from "@/lib/domain/types";
import { FoodEditor } from "./food-editor";

function defaultUnit(food: Food, imperial: boolean): { quantity: number; unit: QuantityUnit } {
  if (food.portions[0]) return { quantity: 1, unit: `portion:${food.portions[0].id}` };
  if (food.baseUnit === "unit") return { quantity: 1, unit: "unit" };
  if (imperial) return { quantity: food.baseUnit === "g" ? 4 : 8, unit: food.baseUnit === "g" ? "oz" : "floz" };
  return { quantity: 100, unit: food.baseUnit };
}

function unitOptions(food: Pick<Food, "baseUnit" | "portions">): { value: QuantityUnit; label: string }[] {
  const opts: { value: QuantityUnit; label: string }[] = food.portions.map((p) => ({ value: `portion:${p.id}` as QuantityUnit, label: p.label }));
  if (food.baseUnit === "g") opts.push({ value: "g", label: "grams (g)" }, { value: "oz", label: "ounces (oz)" });
  if (food.baseUnit === "ml") opts.push({ value: "ml", label: "millilitres (ml)" }, { value: "floz", label: "fluid ounces (fl oz)" });
  if (food.baseUnit === "unit") opts.push({ value: "unit", label: "units" });
  return opts;
}

const fmt = (n: number | null, d = 0) => (n == null ? "—" : n.toFixed(d));

function SourceBadge({ food }: { food: Pick<Food, "source"> }) {
  return food.source === "sample" ? <Badge tone="outline">Sample · approx.</Badge> : food.source === "custom" ? <Badge tone="nutrition">Custom</Badge> : <Badge tone="info">API</Badge>;
}

export function LogFoodDialog({ date: initialDate, mealTypeId: initialMeal, foodId, entryId, mode: initialMode }: { date?: ISODate; mealTypeId?: string; foodId?: string; entryId?: string; mode?: "log" | "plan" }) {
  const db = useDb();
  const { today, now } = useClock();
  const entry = entryId ? db.foodEntries.find((e) => e.id === entryId) : undefined;
  const meals = [...db.mealTypes].sort((a, b) => a.order - b.order);
  const guessMeal = () => {
    const mins = Number(now.slice(0, 2)) * 60 + Number(now.slice(3));
    let best = meals[0];
    for (const m of meals) if (Number(m.time.slice(0, 2)) * 60 + Number(m.time.slice(3)) - 60 <= mins) best = m;
    return best?.id ?? "";
  };
  const [mode, setMode] = useState<"log" | "plan">(initialMode ?? "log");
  const [date, setDate] = useState<ISODate>(entry?.date ?? initialDate ?? today);
  const [mealTypeId, setMealTypeId] = useState(entry?.mealTypeId ?? initialMeal ?? guessMeal());
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Food | null>(foodId ? db.foods.find((f) => f.id === foodId) ?? null : null);
  const [creating, setCreating] = useState(false);
  const imperial = db.profile.nutrition.units === "imperial";
  const searchRef = useRef<HTMLInputElement>(null);
  const mealName = meals.find((m) => m.id === mealTypeId)?.name ?? "meal";

  const results = useMemo(() => localFoodProvider.search(query, db.foods), [query, db.foods]);
  const recent = useMemo(() => recentFoodIds(db.foodEntries, 6).map((id) => db.foods.find((f) => f.id === id)).filter(Boolean) as Food[], [db.foodEntries, db.foods]);
  const favorites = useMemo(() => db.foods.filter((f) => f.favorite && !f.archived), [db.foods]);
  const avoid = db.profile.nutrition.avoidFoods.map((a) => a.toLowerCase()).filter(Boolean);
  const flagged = (f: Food) => avoid.some((a) => f.name.toLowerCase().includes(a));

  const quickLog = (food: Food) => {
    const { quantity, unit } = defaultUnit(food, imperial);
    commit(food, quantity, unit, "");
  };

  const commit = (food: Food, quantity: number, unit: QuantityUnit, notes: string) => {
    const s = actions();
    const n = scaleNutrients(food.per, food.baseUnit, toBaseAmount(quantity, unit, food.baseUnit, food.portions) ?? 0);
    if (mode === "plan") {
      const existingPlan = db.plannedMeals.find((p) => p.date === date && p.mealTypeId === mealTypeId && !p.loggedAt);
      const item: MealItem = { foodId: food.id, quantity, unit };
      if (existingPlan) s.update("plannedMeals", existingPlan.id, { items: [...existingPlan.items, item] });
      else s.add("plannedMeals", { date, mealTypeId, items: [item], loggedAt: null });
      toast(`Planned ${food.name} for ${mealName.toLowerCase()} · ${formatDate(date)}`);
    } else {
      s.logFood(food, { date, time: date === today ? now : meals.find((m) => m.id === mealTypeId)?.time, mealTypeId, quantity, unit, notes: notes || undefined });
      toast(`${food.name} · +${n.protein.toFixed(1)} g protein`, { tone: "success" });
    }
  };

  const logSaved = (m: SavedMeal) => {
    const s = actions();
    if (mode === "plan") {
      s.add("plannedMeals", { date, mealTypeId, items: m.items, loggedAt: null, note: m.name });
      toast(`Planned “${m.name}”`);
    } else {
      const count = s.logItems(m.items, date, mealTypeId, date === today ? now : undefined);
      toast(`Logged “${m.name}” (${count} items) to ${mealName.toLowerCase()}`);
    }
    closeSheet();
  };

  // ───────── Edit an existing entry ─────────
  if (entry) return <EditEntryDialog entry={entry} />;

  const header = (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented size="sm" label="Mode" value={mode} onChange={setMode} options={[{ value: "log", label: "Log eaten" }, { value: "plan", label: "Plan" }]} />
        <Input type="date" aria-label="Date" value={date} onChange={(e) => isISODate(e.target.value) && setDate(e.target.value)} className="h-8 w-auto text-sm" />
      </div>
      <div className="scrollbar-thin -mx-1 overflow-x-auto px-1">
        <Segmented label="Meal" value={mealTypeId} onChange={setMealTypeId} options={meals.map((m) => ({ value: m.id, label: m.name }))} />
      </div>
      {mode === "plan" ? <p className="text-caption text-ink-3">Planned food is kept separate and doesn&apos;t count toward consumed protein until you log it.</p> : null}
    </div>
  );

  return (
    <Dialog open onClose={closeSheet} title={mode === "plan" ? "Plan food" : "Add food"} description={`${mealName} · ${date === today ? "Today" : formatDate(date, { weekday: "short", month: "short", day: "numeric" })}`} size="lg">
      {creating ? (
        <>
          <button onClick={() => setCreating(false)} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink">
            <ChevronLeft className="size-4" /> Back to search
          </button>
          <FoodEditor
            onCancel={() => setCreating(false)}
            onSaved={(f) => {
              setCreating(false);
              setSelected(f);
              toast(`Created “${f.name}”`);
            }}
          />
        </>
      ) : selected ? (
        <>
          {header}
          <FoodDetail
            food={selected}
            imperial={imperial}
            mealName={mealName}
            mode={mode}
            warn={flagged(selected)}
            onBack={() => {
              setSelected(null);
              requestAnimationFrame(() => searchRef.current?.focus());
            }}
            onAdd={(q, u, notes) => {
              commit(selected, q, u, notes);
              setSelected(null);
              setQuery("");
              requestAnimationFrame(() => searchRef.current?.focus());
            }}
          />
        </>
      ) : (
        <>
          {header}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input ref={searchRef} autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search foods…" className="h-10 pl-9" aria-label="Search foods" />
          </div>
          {!query && db.savedMeals.length ? (
            <section className="mt-4">
              <p className="eyebrow mb-2 flex items-center gap-1.5"><Bookmark className="size-3" /> Saved meals</p>
              <div className="flex flex-wrap gap-2">
                {[...db.savedMeals].sort((a, b) => Number(b.favorite) - Number(a.favorite)).map((m) => {
                  const p = m.items.reduce((s, it) => s + itemNutrients(it, db.foods.find((f) => f.id === it.foodId)).protein, 0);
                  return (
                    <button key={m.id} onClick={() => logSaved(m)} className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-left text-sm hover:border-nutrition/50 hover:bg-nutrition-soft/40">
                      <span className="font-medium text-ink">{m.name}</span>
                      <span className="num text-ink-3">{Math.round(p)} g</span>
                      <Plus className="size-3.5 text-nutrition" aria-hidden />
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
          {!query && recent.length ? <FoodList title="Recent" icon={<Clock className="size-3" />} foods={recent} onPick={setSelected} onQuick={quickLog} imperial={imperial} flagged={flagged} /> : null}
          {!query && favorites.length ? <FoodList title="Favorites" icon={<Star className="size-3" />} foods={favorites} onPick={setSelected} onQuick={quickLog} imperial={imperial} flagged={flagged} /> : null}
          <FoodList title={query ? `${results.length} result${results.length === 1 ? "" : "s"}` : "All foods"} foods={query ? results : results.slice(0, 40)} onPick={setSelected} onQuick={quickLog} imperial={imperial} flagged={flagged} />
          {query && !results.length ? <p className="py-6 text-center text-base text-ink-3">No food matches “{query}”.</p> : null}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-line-strong p-3">
            <p className="text-sm text-ink-3">Can&apos;t find it? Add it with the values from its label.</p>
            <Button size="sm" onClick={() => setCreating(true)}>
              <PackagePlus /> Create custom food
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}

function FoodList({ title, icon, foods, onPick, onQuick, imperial, flagged }: { title: string; icon?: React.ReactNode; foods: Food[]; onPick: (f: Food) => void; onQuick: (f: Food) => void; imperial: boolean; flagged: (f: Food) => boolean }) {
  if (!foods.length) return null;
  return (
    <section className="mt-4">
      <p className="eyebrow mb-1.5 flex items-center gap-1.5">{icon}{title}</p>
      <ul className="divide-y divide-line rounded-md border border-line">
        {foods.map((f) => {
          const d = defaultUnit(f, imperial);
          const n = scaleNutrients(f.per, f.baseUnit, toBaseAmount(d.quantity, d.unit, f.baseUnit, f.portions) ?? 0);
          return (
            <li key={f.id} className="flex items-center gap-2 pr-2 hover:bg-subtle">
              <button onClick={() => onPick(f)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-base font-medium text-ink">{f.name}</span>
                    {f.favorite ? <Star className="size-3 shrink-0 fill-warning text-warning" aria-label="Favorite" /> : null}
                    {flagged(f) ? <Badge tone="warning">On your avoid list</Badge> : null}
                  </span>
                  <span className="num block truncate text-caption text-ink-3">
                    {formatQuantity(d.quantity, d.unit, f.portions)}
                    {n.calories != null ? ` · ${Math.round(n.calories)} kcal` : ""}
                  </span>
                </span>
                <span className="num text-right text-base font-semibold text-nutrition">
                  {n.protein.toFixed(n.protein < 10 ? 1 : 0)} g
                  <span className="block text-micro font-normal text-ink-3">protein</span>
                </span>
              </button>
              <Button size="icon-sm" variant="subtle" onClick={() => onQuick(f)} aria-label={`Quick add ${f.name}, ${formatQuantity(d.quantity, d.unit, f.portions)}`} title="Quick add default portion">
                <Plus />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NutrientPreview({ food, quantity, unit }: { food: Pick<Food, "per" | "baseUnit" | "portions">; quantity: number; unit: QuantityUnit }) {
  const base = toBaseAmount(quantity, unit, food.baseUnit, food.portions);
  const n = scaleNutrients(food.per, food.baseUnit, base ?? 0);
  return (
    <div className="grid grid-cols-4 gap-2 rounded-md bg-subtle p-3 text-center">
      <div className="rounded bg-nutrition-soft py-2">
        <p className="num text-xl font-semibold text-nutrition">{fmt(n.protein, 1)}</p>
        <p className="text-caption text-ink-2">protein g</p>
      </div>
      {(["calories", "carbs", "fat"] as const).map((k) => (
        <div key={k} className="py-2">
          <p className="num text-lg font-semibold text-ink">{fmt(n[k], k === "calories" ? 0 : 1)}</p>
          <p className="text-caption text-ink-3">{k === "calories" ? "kcal" : `${k} g`}</p>
        </div>
      ))}
    </div>
  );
}

function FoodDetail({ food, imperial, onBack, onAdd, mealName, mode, warn }: { food: Food; imperial: boolean; onBack: () => void; onAdd: (q: number, u: QuantityUnit, notes: string) => void; mealName: string; mode: "log" | "plan"; warn: boolean }) {
  const d = defaultUnit(food, imperial);
  const [qty, setQty] = useState(String(d.quantity));
  const [unit, setUnit] = useState<QuantityUnit>(d.unit);
  const [notes, setNotes] = useState("");
  const q = Number(qty.replace(",", "."));
  const valid = Number.isFinite(q) && q > 0 && q < 100000;
  const toggleFav = () => actions().update("foods", food.id, { favorite: !food.favorite });
  useEffect(() => setUnit(d.unit), [food.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onAdd(q, unit, notes);
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="mb-1 inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink">
            <ChevronLeft className="size-4" /> All foods
          </button>
          <h3 className="text-lg font-semibold">{food.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-caption text-ink-3">
            <SourceBadge food={food} />
            <span className="num">
              {food.per.protein} g protein {food.baseUnit === "unit" ? "per unit" : `per 100 ${food.baseUnit}`}
            </span>
            {warn ? <Badge tone="warning">On your avoid list</Badge> : null}
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={toggleFav} aria-pressed={food.favorite} aria-label={food.favorite ? "Remove from favorites" : "Add to favorites"}>
          <Star className={cn(food.favorite && "fill-warning text-warning")} />
        </Button>
      </div>
      <div className="grid grid-cols-[1fr_1.4fr] gap-3">
        <Field label="Quantity" error={valid ? undefined : "Enter a quantity above zero"}>
          {(p) => <Input {...p} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus onFocus={(e) => e.currentTarget.select()} />}
        </Field>
        <Field label="Unit">
          {(p) => (
            <Select {...p} value={unit} onChange={(e) => setUnit(e.target.value as QuantityUnit)}>
              {unitOptions(food).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {food.portions.length ? (
        <div className="flex flex-wrap gap-1.5">
          {[0.5, 1, 1.5, 2].map((m) => (
            <button key={m} type="button" onClick={() => { setQty(String(m)); setUnit(`portion:${food.portions[0].id}`); }} className="rounded-full border border-line px-2.5 py-1 text-caption text-ink-2 hover:bg-muted">
              {m} × {food.portions[0].label}
            </button>
          ))}
        </div>
      ) : null}
      <NutrientPreview food={food} quantity={valid ? q : 0} unit={unit} />
      <Field label="Note" optional>
        {(p) => <Input {...p} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. post-workout" />}
      </Field>
      {food.source === "sample" ? <p className="text-caption text-ink-3">Sample values are approximate references, not verified for any specific product. Check the label or create a custom food for exact numbers.</p> : null}
      <Button type="submit" variant="primary" size="lg" disabled={!valid}>
        <Plus /> {mode === "plan" ? "Plan for" : "Add to"} {mealName}
      </Button>
    </form>
  );
}

function EditEntryDialog({ entry }: { entry: FoodEntry }) {
  const db = useDb();
  const [qty, setQty] = useState(String(entry.quantity));
  const [unit, setUnit] = useState<QuantityUnit>(entry.unit);
  const [mealTypeId, setMealTypeId] = useState(entry.mealTypeId);
  const [date, setDate] = useState(entry.date);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const q = Number(qty.replace(",", "."));
  const valid = Number.isFinite(q) && q > 0 && isISODate(date);

  const save = () => {
    if (!valid) return;
    actions().update("foodEntries", entry.id, { quantity: q, unit, mealTypeId, date, notes: notes || undefined });
    toast("Entry updated — totals recalculated");
    closeSheet();
  };
  const del = async () => {
    if (!(await confirm({ title: `Remove ${entry.foodName}?`, description: "Daily and historical totals will update." }))) return;
    actions().remove("foodEntries", entry.id);
    toast("Entry removed", { action: { label: "Undo", onClick: () => actions().add("foodEntries", entry) } });
    closeSheet();
  };

  return (
    <Dialog
      open
      onClose={closeSheet}
      title={entry.foodName}
      description={`Logged ${formatDate(entry.date, { weekday: "short", month: "short", day: "numeric" })}${entry.time ? ` at ${entry.time}` : ""}`}
      footer={
        <>
          <Button variant="ghost" className="mr-auto text-negative hover:text-negative" onClick={del}>
            <Trash2 /> Remove
          </Button>
          <Button onClick={closeSheet}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!valid}>
            Save
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="grid grid-cols-[1fr_1.4fr] gap-3">
          <Field label="Quantity" error={Number.isFinite(q) && q > 0 ? undefined : "Enter a quantity above zero"}>
            {(p) => <Input {...p} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />}
          </Field>
          <Field label="Unit">
            {(p) => (
              <Select {...p} value={unit} onChange={(e) => setUnit(e.target.value as QuantityUnit)}>
                {unitOptions(entry).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
                {!unitOptions(entry).some((o) => o.value === entry.unit) ? <option value={entry.unit}>{unitLabel(entry.unit, entry.portions)}</option> : null}
              </Select>
            )}
          </Field>
          <Field label="Meal">
            {(p) => (
              <Select {...p} value={mealTypeId} onChange={(e) => setMealTypeId(e.target.value)}>
                {[...db.mealTypes].sort((a, b) => a.order - b.order).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Date">
            {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        </div>
        <NutrientPreview food={entry} quantity={Number.isFinite(q) ? q : 0} unit={unit} />
        <Field label="Note" optional>
          {(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
        <p className="text-caption text-ink-3">Nutrition values were saved with this entry when it was logged, so editing the food later won&apos;t rewrite your history.</p>
      </form>
    </Dialog>
  );
}
