"use client";

import { z } from "zod";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useForm } from "@/lib/hooks/use-form";
import { actions } from "@/lib/hooks";
import type { BaseUnit, Food } from "@/lib/domain/types";
import { uid } from "@/lib/data/defaults";

type Values = { name: string; brand: string; baseUnit: BaseUnit; protein: string; calories: string; carbs: string; fat: string; portionLabel: string; portionAmount: string };

const num = (label: string, required = false) =>
  z.string().trim().refine((s) => (required ? s !== "" : true), `${label} is required`).refine((s) => s === "" || (Number.isFinite(Number(s.replace(",", "."))) && Number(s.replace(",", ".")) >= 0), `${label} must be a positive number`);

const schema = z
  .object({
    name: z.string().trim().min(1, "Give the food a name").max(80),
    brand: z.string().trim().max(60),
    baseUnit: z.enum(["g", "ml", "unit"]),
    protein: num("Protein", true),
    calories: num("Calories"),
    carbs: num("Carbs"),
    fat: num("Fat"),
    portionLabel: z.string().trim().max(40),
    portionAmount: num("Portion size"),
  })
  .superRefine((v, ctx) => {
    if (v.portionLabel && !v.portionAmount) ctx.addIssue({ code: "custom", path: ["portionAmount"], message: "How much is one portion?" });
    if (Number(v.protein) > (v.baseUnit === "unit" ? 300 : 100)) ctx.addIssue({ code: "custom", path: ["protein"], message: v.baseUnit === "unit" ? "That's more than 300 g per unit" : "Protein can't exceed 100 g per 100" });
  });

const toNum = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

/** Create or edit a custom food. Values are whatever the user enters (e.g. from a label). */
export function FoodEditor({ food, onSaved, onCancel }: { food?: Food; onSaved: (food: Food) => void; onCancel: () => void }) {
  const firstPortion = food?.portions[0];
  const { values, set, errors, handleSubmit } = useForm<Values, z.infer<typeof schema>>(schema, {
    name: food?.name ?? "",
    brand: food?.brand ?? "",
    baseUnit: food?.baseUnit ?? "g",
    protein: food ? String(food.per.protein) : "",
    calories: food?.per.calories != null ? String(food.per.calories) : "",
    carbs: food?.per.carbs != null ? String(food.per.carbs) : "",
    fat: food?.per.fat != null ? String(food.per.fat) : "",
    portionLabel: firstPortion?.label ?? "",
    portionAmount: firstPortion ? String(firstPortion.amount) : "",
  });
  const per = values.baseUnit === "unit" ? "per 1 unit" : `per 100 ${values.baseUnit}`;

  const submit = handleSubmit((v) => {
    const portions = v.portionLabel ? [{ id: firstPortion?.id ?? uid(), label: v.portionLabel, amount: toNum(v.portionAmount)! }, ...(food?.portions.slice(1) ?? [])] : food?.portions.slice(firstPortion ? 1 : 0) ?? [];
    const data = {
      name: v.name,
      brand: v.brand || undefined,
      baseUnit: v.baseUnit,
      per: { protein: toNum(v.protein)!, calories: toNum(v.calories), carbs: toNum(v.carbs), fat: toNum(v.fat) },
      portions,
    };
    const s = actions();
    if (food && food.source === "custom") {
      s.update("foods", food.id, data);
      onSaved({ ...food, ...data });
    } else {
      // Editing a sample food creates a personal copy so sample values stay distinguishable.
      const id = s.add("foods", { ...data, source: "custom", favorite: food?.favorite ?? false, archived: false });
      onSaved({ ...data, id, source: "custom", favorite: false, archived: false, createdAt: new Date().toISOString() });
    }
  });

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-6" noValidate>
      <Field label="Name" error={errors.name} className="sm:col-span-4">
        {(p) => <Input {...p} value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. High-protein yogurt" autoFocus />}
      </Field>
      <Field label="Measured in" className="sm:col-span-2">
        {(p) => (
          <Select {...p} value={values.baseUnit} onChange={(e) => set("baseUnit", e.target.value as BaseUnit)}>
            <option value="g">Grams</option>
            <option value="ml">Millilitres</option>
            <option value="unit">Units / items</option>
          </Select>
        )}
      </Field>
      <Field label="Brand" optional className="sm:col-span-6">
        {(p) => <Input {...p} value={values.brand} onChange={(e) => set("brand", e.target.value)} />}
      </Field>
      <p className="text-sm font-medium text-ink-2 sm:col-span-6">Nutrition {per}</p>
      {(["protein", "calories", "carbs", "fat"] as const).map((k) => (
        <Field key={k} label={k === "calories" ? "kcal" : `${k[0].toUpperCase()}${k.slice(1)} (g)`} error={errors[k]} optional={k !== "protein"} className="sm:col-span-3 lg:col-span-3">
          {(p) => <Input {...p} inputMode="decimal" value={values[k]} onChange={(e) => set(k, e.target.value)} placeholder="—" />}
        </Field>
      ))}
      <Field label="Portion name" optional hint="e.g. “1 scoop”" className="sm:col-span-4">
        {(p) => <Input {...p} value={values.portionLabel} onChange={(e) => set("portionLabel", e.target.value)} />}
      </Field>
      <Field label={`Size (${values.baseUnit === "unit" ? "units" : values.baseUnit})`} error={errors.portionAmount} className="sm:col-span-2">
        {(p) => <Input {...p} inputMode="decimal" value={values.portionAmount} onChange={(e) => set("portionAmount", e.target.value)} />}
      </Field>
      {food?.source === "sample" ? <p className="text-caption text-ink-3 sm:col-span-6">Saving creates your own copy; the sample entry stays unchanged.</p> : null}
      <div className="flex justify-end gap-2 pt-1 sm:col-span-6">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary">
          {food?.source === "custom" ? "Save food" : "Create food"}
        </Button>
      </div>
    </form>
  );
}
