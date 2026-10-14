"use client";

import { useMemo, useState } from "react";
import { Search, Star, Plus, Pencil, Trash2, Bookmark, Info, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { Field, Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { cn } from "@/lib/cn";
import { useDb, useToday, actions } from "@/lib/hooks";
import { openSheet } from "@/lib/store/ui";
import { localFoodProvider } from "@/lib/data/food-provider";
import { formatQuantity, itemNutrients } from "@/lib/calc/nutrition";
import type { Food, MealItem, QuantityUnit, SavedMeal } from "@/lib/domain/types";
import { FoodEditor } from "@/features/nutrition/food-editor";

export default function FoodsPage() {
  const [tab, setTab] = useState<"foods" | "meals">("foods");
  return (
    <div className="flex flex-col gap-4">
      <Segmented label="View" value={tab} onChange={setTab} options={[{ value: "foods", label: "Food database" }, { value: "meals", label: "Saved meals" }]} className="self-start" />
      {tab === "foods" ? <FoodsTab /> : <MealsTab />}
    </div>
  );
}

function FoodsTab() {
  const db = useDb();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "favorites" | "custom" | "sample">("all");
  const [editing, setEditing] = useState<Food | "new" | null>(null);
  const list = useMemo(() => localFoodProvider.search(q, db.foods).filter((f) => filter === "all" || (filter === "favorites" ? f.favorite : f.source === filter)), [q, db.foods, filter]);
  const unit = (f: Food) => (f.baseUnit === "unit" ? "per unit" : `per 100 ${f.baseUnit}`);

  const del = async (f: Food) => {
    const used = db.foodEntries.filter((e) => e.foodId === f.id).length;
    if (!(await confirm({ title: `Delete “${f.name}”?`, description: used ? `${used} logged entries keep their saved nutrition values. It will be removed from saved meals and plans.` : "It will be removed from saved meals and plans." }))) return;
    actions().deleteFood(f.id);
    toast("Food deleted");
  };

  return (
    <>
      <div className="flex items-start gap-2 rounded-md border border-line bg-surface p-3 text-sm text-ink-2">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <p>
          This is a <strong>local sample database</strong> with approximate reference values — not verified for any brand. No external nutrition API is connected. Create custom foods from package labels for exact numbers.
        </p>
      </div>
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search foods" className="pl-9" aria-label="Search foods" />
          </div>
          <Segmented size="sm" label="Filter" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "favorites", label: "Favorites" }, { value: "custom", label: "Custom" }, { value: "sample", label: "Sample" }]} />
          <Button size="sm" variant="primary" onClick={() => setEditing("new")}><Plus /> Custom food</Button>
        </div>
      </Card>
      <Card>
        {list.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-base">
              <thead>
                <tr className="border-b border-line text-left text-caption uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5 font-medium">Food</th>
                  <th className="px-2 py-2.5 text-right font-medium">Protein</th>
                  <th className="px-2 py-2.5 text-right font-medium">kcal</th>
                  <th className="px-2 py-2.5 text-right font-medium">Carbs</th>
                  <th className="px-2 py-2.5 text-right font-medium">Fat</th>
                  <th className="px-4 py-2.5 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {list.map((f) => (
                  <tr key={f.id} className="border-b border-line/70 last:border-0 hover:bg-subtle">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => actions().update("foods", f.id, { favorite: !f.favorite })} aria-label={f.favorite ? `Unfavorite ${f.name}` : `Favorite ${f.name}`} aria-pressed={f.favorite}>
                          <Star className={cn("size-4", f.favorite ? "fill-warning text-warning" : "text-line-strong hover:text-ink-3")} />
                        </button>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{f.name}</p>
                          <p className="text-caption text-ink-3">
                            {unit(f)}
                            {f.portions.length ? ` · ${f.portions.map((p) => p.label).join(", ")}` : ""}
                          </p>
                        </div>
                        {f.source === "sample" ? <Badge tone="outline">Sample</Badge> : <Badge tone="nutrition">Custom</Badge>}
                      </div>
                    </td>
                    <td className="num px-2 py-2 text-right font-semibold text-nutrition">{f.per.protein} g</td>
                    <td className="num px-2 py-2 text-right text-ink-2">{f.per.calories ?? "—"}</td>
                    <td className="num px-2 py-2 text-right text-ink-2">{f.per.carbs ?? "—"}</td>
                    <td className="num px-2 py-2 text-right text-ink-2">{f.per.fat ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => openSheet({ kind: "food", foodId: f.id })}>Log</Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditing(f)} aria-label={f.source === "sample" ? `Customize ${f.name}` : `Edit ${f.name}`}><Pencil /></Button>
                      {f.source === "custom" ? <Button size="icon-sm" variant="ghost" onClick={() => del(f)} aria-label={`Delete ${f.name}`}><Trash2 /></Button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No foods found" description={q ? `Nothing matches “${q}”.` : undefined} action={<Button onClick={() => setEditing("new")}>Create custom food</Button>} />
        )}
      </Card>
      {editing ? (
        <Dialog open onClose={() => setEditing(null)} title={editing === "new" ? "New custom food" : editing.source === "sample" ? `Customize ${editing.name}` : `Edit ${editing.name}`} size="lg">
          <FoodEditor food={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)} onSaved={(f) => { toast(`Saved “${f.name}”`); setEditing(null); }} />
        </Dialog>
      ) : null}
    </>
  );
}

function MealsTab() {
  const db = useDb();
  const today = useToday();
  const [editing, setEditing] = useState<SavedMeal | "new" | null>(null);
  const foods = new Map(db.foods.map((f) => [f.id, f]));
  const mealName = (id: string | null) => db.mealTypes.find((m) => m.id === id)?.name;

  return (
    <>
      <div className="flex justify-end">
        <Button size="sm" variant="primary" onClick={() => setEditing("new")}><Plus /> New saved meal</Button>
      </div>
      {db.savedMeals.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {db.savedMeals.map((m) => {
            const protein = m.items.reduce((s, it) => s + itemNutrients(it, foods.get(it.foodId)).protein, 0);
            const kcal = m.items.reduce((s, it) => s + (itemNutrients(it, foods.get(it.foodId)).calories ?? 0), 0);
            return (
              <article key={m.id} className="card flex flex-col gap-3 p-4">
                <header className="flex items-start gap-2">
                  <Bookmark className="mt-0.5 size-4 text-nutrition" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold">{m.name}</h3>
                    <p className="num text-caption text-ink-3">{Math.round(protein)} g protein · {Math.round(kcal)} kcal{mealName(m.mealTypeId) ? ` · ${mealName(m.mealTypeId)}` : ""}</p>
                  </div>
                  <button onClick={() => actions().update("savedMeals", m.id, { favorite: !m.favorite })} aria-label="Toggle favorite" aria-pressed={m.favorite}>
                    <Star className={cn("size-4", m.favorite ? "fill-warning text-warning" : "text-line-strong")} />
                  </button>
                </header>
                <ul className="flex-1 text-sm text-ink-2">
                  {m.items.map((it, i) => {
                    const f = foods.get(it.foodId);
                    return <li key={i} className="truncate">• {f?.name ?? "Removed food"} <span className="text-ink-3">— {formatQuantity(it.quantity, it.unit, f?.portions ?? [])}</span></li>;
                  })}
                </ul>
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => { const n = actions().logItems(m.items, today, m.mealTypeId ?? db.mealTypes[0].id); toast(`Logged “${m.name}” (${n} items) today`); }}>Log today</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(m)}><Pencil /> Edit</Button>
                  <Button size="sm" variant="ghost" className="ml-auto text-negative hover:text-negative" onClick={async () => { if (await confirm({ title: `Delete “${m.name}”?` })) { actions().remove("savedMeals", m.id); toast("Saved meal deleted"); } }} aria-label="Delete saved meal"><Trash2 /></Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState icon={<Bookmark />} title="No saved meals" description="Save meals you eat often and log them in one tap. You can also save any meal from the Today view." action={<Button variant="primary" onClick={() => setEditing("new")}>Create saved meal</Button>} />
        </Card>
      )}
      {editing ? <SavedMealDialog meal={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function SavedMealDialog({ meal, onClose }: { meal?: SavedMeal; onClose: () => void }) {
  const db = useDb();
  const [name, setName] = useState(meal?.name ?? "");
  const [mealTypeId, setMealTypeId] = useState(meal?.mealTypeId ?? "");
  const [items, setItems] = useState<MealItem[]>(meal?.items ?? []);
  const [foodId, setFoodId] = useState("");
  const [qty, setQty] = useState("1");
  const foods = new Map(db.foods.map((f) => [f.id, f]));
  const sel = foods.get(foodId);
  const [unit, setUnit] = useState<QuantityUnit>("g");
  const protein = items.reduce((s, it) => s + itemNutrients(it, foods.get(it.foodId)).protein, 0);
  const valid = name.trim() && items.length;

  const pickFood = (id: string) => {
    setFoodId(id);
    const f = foods.get(id);
    if (!f) return;
    if (f.portions[0]) { setUnit(`portion:${f.portions[0].id}`); setQty("1"); }
    else { setUnit(f.baseUnit); setQty(f.baseUnit === "unit" ? "1" : "100"); }
  };
  const addItem = () => {
    const q = Number(qty);
    if (!sel || !(q > 0)) return;
    setItems([...items, { foodId: sel.id, quantity: q, unit }]);
    setFoodId("");
  };
  const save = () => {
    if (!valid) return;
    const rec = { name: name.trim(), mealTypeId: mealTypeId || null, items, favorite: meal?.favorite ?? true };
    if (meal) actions().update("savedMeals", meal.id, rec);
    else actions().add("savedMeals", rec);
    toast("Saved meal stored");
    onClose();
  };

  return (
    <Dialog open onClose={onClose} title={meal ? "Edit saved meal" : "New saved meal"} description={`${Math.round(protein)} g protein in total`} size="lg" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={!valid}>Save</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Post-workout shake" />}</Field>
          <Field label="Usual meal" optional>
            {(p) => (
              <Select {...p} value={mealTypeId} onChange={(e) => setMealTypeId(e.target.value)}>
                <option value="">Any</option>
                {db.mealTypes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-2">Items</p>
          <ul className="mb-2 divide-y divide-line rounded-md border border-line">
            {items.map((it, i) => {
              const f = foods.get(it.foodId);
              return (
                <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="flex-1 truncate">{f?.name ?? "Removed food"}</span>
                  <span className="text-ink-3">{formatQuantity(it.quantity, it.unit, f?.portions ?? [])}</span>
                  <span className="num w-12 text-right font-medium">{Math.round(itemNutrients(it, f).protein)} g</span>
                  <button onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove item" className="text-ink-3 hover:text-negative"><X className="size-3.5" /></button>
                </li>
              );
            })}
            {!items.length ? <li className="px-3 py-3 text-sm text-ink-3">Add at least one food.</li> : null}
          </ul>
          <div className="grid grid-cols-[1fr_80px_1fr_auto] gap-2">
            <Select value={foodId} onChange={(e) => pickFood(e.target.value)} aria-label="Food">
              <option value="">Choose food…</option>
              {db.foods.filter((f) => !f.archived).sort((a, b) => a.name.localeCompare(b.name)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" aria-label="Quantity" />
            <Select value={unit} onChange={(e) => setUnit(e.target.value as QuantityUnit)} aria-label="Unit" disabled={!sel}>
              {sel ? [...sel.portions.map((p) => <option key={p.id} value={`portion:${p.id}`}>{p.label}</option>), <option key="b" value={sel.baseUnit}>{sel.baseUnit === "unit" ? "units" : sel.baseUnit}</option>] : <option>unit</option>}
            </Select>
            <Button onClick={addItem} disabled={!sel || !(Number(qty) > 0)}><Plus /> Add</Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
