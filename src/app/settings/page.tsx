"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Download, Upload, FlaskConical, Eraser, Trash2, Plus, X, ShieldCheck, Pencil, PlugZap, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/shell/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { Icon, IconTile, CATEGORY_ICONS } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { cn } from "@/lib/cn";
import { useDb, useToday, actions } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { CURRENCIES } from "@/lib/domain/money";
import { browserTimeZone } from "@/lib/domain/dates";
import { downloadText } from "@/lib/data/csv";
import { PALETTE, uid } from "@/lib/data/defaults";
import type { Category, CategoryKind, ThemePref } from "@/lib/domain/types";

const ZONES = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [browserTimeZone()];
  } catch {
    return [browserTimeZone()];
  }
})();

function TagEditor({ values, onChange, placeholder, label }: { values: string[]; onChange: (v: string[]) => void; placeholder: string; label: string }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setText("");
  };
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2.5 pr-1 text-sm">
            {v}
            <button onClick={() => onChange(values.filter((x) => x !== v))} className="grid size-4 place-items-center rounded-full hover:bg-line" aria-label={`Remove ${v}`}><X className="size-3" /></button>
          </span>
        ))}
        <Input className="h-7 w-44 text-sm" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} onBlur={add} placeholder={placeholder} aria-label={label} />
      </div>
    </div>
  );
}

const numOrNull = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.round(Number(s) || 0)));

export default function SettingsPage() {
  const db = useDb();
  const today = useToday();
  const p = db.profile;
  const n = p.nutrition;
  const adapter = useStore((s) => s.adapter);
  const fileRef = useRef<HTMLInputElement>(null);
  const [catEdit, setCatEdit] = useState<Category | { kind: CategoryKind } | null>(null);
  const [newMeal, setNewMeal] = useState("");

  const exportJson = () => {
    downloadText(`life-os-backup-${today}.json`, JSON.stringify(db, null, 2), "application/json");
    toast("Backup downloaded");
  };
  const importJson = async (file: File) => {
    if (!(await confirm({ title: "Replace all data with this backup?", description: "Everything currently stored in this browser will be overwritten.", confirmLabel: "Replace data" }))) return;
    try {
      actions().importJSON(await file.text());
      toast("Backup restored");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't read that file", { tone: "error" });
    }
  };

  const sections = [
    ["#profile", "Profile"],
    ["#appearance", "Appearance"],
    ["#nutrition", "Nutrition"],
    ["#categories", "Categories"],
    ["#data", "Data & privacy"],
    ["/settings/integrations", "Integrations"],
  ];

  return (
    <>
      <PageHeader title="Settings" description="Preferences are stored with your data on this device." />
      <div className="grid gap-6 lg:grid-cols-[180px_1fr]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-20 flex flex-col gap-0.5 text-base">
            {sections.map(([h, l]) => <li key={h}><a href={h} className="block rounded-md px-2.5 py-1.5 text-ink-2 hover:bg-muted hover:text-ink">{l}</a></li>)}
          </ul>
        </nav>
        <div className="flex min-w-0 flex-col gap-4">
          <Link href="/settings/integrations" className="card flex items-center gap-3 p-4 transition hover:border-line-strong">
            <span className="grid size-9 place-items-center rounded-md bg-info-soft text-info"><PlugZap className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold">Integrations & connections</span>
              <span className="block truncate text-sm text-ink-3">Mercado Pago, Cocos Capital, other providers, Google Calendar and Notion</span>
            </span>
            <ChevronRight className="size-4 text-ink-3" />
          </Link>
          <Card id="profile" className="scroll-mt-20">
            <CardHeader title="Profile & region" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">{(f) => <Input {...f} value={p.name} onChange={(e) => actions().setProfile({ name: e.target.value })} placeholder="Used for greetings" />}</Field>
              <Field label="Base currency" hint="Totals use this currency. Existing amounts are not converted; accounts in other currencies are shown separately.">
                {(f) => (
                  <Select {...f} value={p.currency} onChange={async (e) => { const c = e.target.value; if (db.transactions.length && !(await confirm({ title: `Switch base currency to ${c}?`, description: "No exchange rates are applied. Accounts in other currencies will be excluded from totals.", confirmLabel: "Switch", danger: false }))) return; actions().setProfile({ currency: c }); }}>
                    {[...new Set([p.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Timezone" hint="Defines when your day starts; records keep their calendar dates.">
                {(f) => <Select {...f} value={p.timezone} onChange={(e) => actions().setProfile({ timezone: e.target.value })}>{[...new Set([p.timezone, ...ZONES])].map((z) => <option key={z}>{z}</option>)}</Select>}
              </Field>
              <Field label="Number & date format">
                {(f) => (
                  <Select {...f} value={p.locale} onChange={(e) => actions().setProfile({ locale: e.target.value })}>
                    {[...new Set([p.locale, "en-US", "en-GB", "es-ES", "es-MX", "es-AR", "fr-FR", "de-DE", "pt-BR", "it-IT", "nl-NL", "ja-JP"])].map((l) => <option key={l}>{l}</option>)}
                  </Select>
                )}
              </Field>
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink-2">Week starts on</p>
                <Segmented label="Week starts on" value={String(p.weekStartsOn) as "0" | "1"} onChange={(v) => actions().setProfile({ weekStartsOn: v === "1" ? 1 : 0 })} options={[{ value: "1", label: "Monday" }, { value: "0", label: "Sunday" }]} />
              </div>
            </CardBody>
          </Card>

          <Card id="appearance" className="scroll-mt-20">
            <CardHeader title="Appearance" />
            <CardBody className="flex flex-col gap-4">
              <Segmented label="Theme" value={p.theme} onChange={(t: ThemePref) => actions().setProfile({ theme: t })} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
              <div className="flex flex-col gap-1 border-t border-line pt-3">
                <p className="text-sm font-medium text-ink-2">Overview dashboard</p>
                {(["finance", "nutrition", "activities"] as const).map((m) => (
                  <Switch key={m} checked={!p.home.hidden.includes(m)} onChange={(v) => actions().setProfile({ home: { ...p.home, hidden: v ? p.home.hidden.filter((x) => x !== m) : [...p.home.hidden, m] } })} label={`Show ${m[0].toUpperCase()}${m.slice(1)} summary`} />
                ))}
                <Switch checked={p.home.showTimeline} onChange={(v) => actions().setProfile({ home: { ...p.home, showTimeline: v } })} label="Show daily timeline" />
                <Switch checked={p.home.showInsights} onChange={(v) => actions().setProfile({ home: { ...p.home, showInsights: v } })} label="Show insights" />
              </div>
            </CardBody>
          </Card>

          <Card id="nutrition" className="scroll-mt-20">
            <CardHeader title="Nutrition" subtitle="Targets are yours to choose — the app doesn't prescribe them and isn't medical advice." />
            <CardBody className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Daily protein target (g)" hint="Applies to today and to how history is evaluated.">
                  {(f) => <Input {...f} inputMode="numeric" value={String(n.proteinTarget)} onChange={(e) => { const v = Number(e.target.value.replace(/\D/g, "")); if (v <= 500) actions().setNutrition({ proteinTarget: v }); }} />}
                </Field>
                <div>
                  <p className="mb-1.5 text-sm font-medium text-ink-2">Units</p>
                  <Segmented label="Units" value={n.units} onChange={(u) => actions().setNutrition({ units: u })} options={[{ value: "metric", label: "Metric" }, { value: "imperial", label: "Imperial" }]} />
                </div>
                <Field label="Lunch reminder after" optional hint="In-app reminder if lunch isn't logged.">
                  {(f) => <Input {...f} type="time" value={n.mealReminderTime ?? ""} onChange={(e) => actions().setNutrition({ mealReminderTime: e.target.value || null })} />}
                </Field>
              </div>
              <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Switch checked={n.calorieTracking} onChange={(v) => actions().setNutrition({ calorieTracking: v })} label="Track calories" />
                  {n.calorieTracking ? <Field label="Calorie target (kcal)" optional>{(f) => <Input {...f} inputMode="numeric" value={n.calorieTarget ?? ""} onChange={(e) => actions().setNutrition({ calorieTarget: numOrNull(e.target.value) })} />}</Field> : null}
                </div>
                <div className="flex flex-col gap-2">
                  <Switch checked={n.waterTracking} onChange={(v) => actions().setNutrition({ waterTracking: v })} label="Track water" />
                  {n.waterTracking ? <Field label="Water target (ml)" optional>{(f) => <Input {...f} inputMode="numeric" value={n.waterTargetMl ?? ""} onChange={(e) => actions().setNutrition({ waterTargetMl: numOrNull(e.target.value) })} />}</Field> : null}
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Switch checked={n.macroTracking} onChange={(v) => actions().setNutrition({ macroTracking: v })} label="Track carbs & fat" />
                  {n.macroTracking ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Carbs target (g)" optional>{(f) => <Input {...f} inputMode="numeric" value={n.carbTarget ?? ""} onChange={(e) => actions().setNutrition({ carbTarget: numOrNull(e.target.value) })} />}</Field>
                      <Field label="Fat target (g)" optional>{(f) => <Input {...f} inputMode="numeric" value={n.fatTarget ?? ""} onChange={(e) => actions().setNutrition({ fatTarget: numOrNull(e.target.value) })} />}</Field>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-4 border-t border-line pt-3 sm:grid-cols-2">
                <TagEditor label="Dietary preferences" values={n.dietaryPreferences} onChange={(v) => actions().setNutrition({ dietaryPreferences: v })} placeholder="e.g. vegetarian" />
                <TagEditor label="Foods to avoid" values={n.avoidFoods} onChange={(v) => actions().setNutrition({ avoidFoods: v })} placeholder="e.g. peanut" />
              </div>
              <p className="-mt-2 text-caption text-ink-3">Foods matching your avoid list are flagged when you search.</p>
              <div className="border-t border-line pt-3">
                <p className="mb-2 text-sm font-medium text-ink-2">Meal types</p>
                <ul className="flex flex-col gap-1.5">
                  {[...db.mealTypes].sort((a, b) => a.order - b.order).map((m) => {
                    const used = db.foodEntries.some((e) => e.mealTypeId === m.id) || db.plannedMeals.some((x) => x.mealTypeId === m.id);
                    return (
                      <li key={m.id} className="flex items-center gap-2">
                        <Input className="h-8 flex-1" value={m.name} onChange={(e) => actions().setMealTypes((ms) => ms.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))} aria-label="Meal name" />
                        <Input className="h-8 w-28" type="time" value={m.time} onChange={(e) => actions().setMealTypes((ms) => ms.map((x) => (x.id === m.id ? { ...x, time: e.target.value || x.time } : x)))} aria-label={`${m.name} usual time`} />
                        <Button size="icon-sm" variant="ghost" disabled={used || db.mealTypes.length <= 1} title={used ? "In use by logged or planned food" : "Remove"} onClick={() => actions().setMealTypes((ms) => ms.filter((x) => x.id !== m.id))} aria-label={`Remove ${m.name}`}><Trash2 /></Button>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-2 flex gap-2">
                  <Input className="h-8" value={newMeal} onChange={(e) => setNewMeal(e.target.value)} placeholder="Add a meal type, e.g. Pre-workout" aria-label="New meal type" />
                  <Button size="sm" disabled={!newMeal.trim()} onClick={() => { actions().setMealTypes((ms) => [...ms, { id: uid(), name: newMeal.trim(), order: ms.length, time: "12:00" }]); setNewMeal(""); }}><Plus /> Add</Button>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card id="categories" className="scroll-mt-20">
            <CardHeader title="Categories" subtitle="Used for transactions and budgets" action={<div className="flex gap-1.5"><Button size="sm" onClick={() => setCatEdit({ kind: "expense" })}><Plus /> Expense</Button><Button size="sm" onClick={() => setCatEdit({ kind: "income" })}><Plus /> Income</Button></div>} />
            <CardBody className="grid gap-6 md:grid-cols-2">
              {(["expense", "income"] as const).map((kind) => (
                <div key={kind}>
                  <p className="eyebrow mb-2">{kind === "expense" ? "Expenses" : "Income"}</p>
                  <ul className="flex flex-col">
                    {db.categories.filter((c) => c.kind === kind && !c.parentId).sort((a, b) => a.name.localeCompare(b.name)).flatMap((c) => [c, ...db.categories.filter((s) => s.parentId === c.id)]).map((c) => {
                      const count = db.transactions.filter((t) => t.categoryId === c.id).length;
                      return (
                        <li key={c.id} className={cn("group flex items-center gap-2.5 rounded-md py-1 pr-1 hover:bg-subtle", c.parentId ? "pl-8" : "pl-1", c.archived && "opacity-50")}>
                          <IconTile name={c.icon} color={c.color} size="sm" />
                          <span className="flex-1 truncate text-base">{c.name}</span>
                          {c.archived ? <Badge>Archived</Badge> : null}
                          <span className="num text-caption text-ink-3">{count}</span>
                          <Button size="icon-sm" variant="ghost" onClick={() => setCatEdit(c)} aria-label={`Edit ${c.name}`}><Pencil /></Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card id="data" className="scroll-mt-20">
            <CardHeader title="Data & privacy" />
            <CardBody className="flex flex-col gap-4">
              <div className="flex items-start gap-3 rounded-md bg-subtle p-3 text-sm text-ink-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-finance" />
                <div>
                  <p><span className="font-medium text-ink">Storage:</span> {adapter?.label ?? "Local"}. Your data never leaves this device; there&apos;s no account, server or sync.</p>
                  <p className="mt-1">Clearing site data in your browser deletes it — download a backup regularly. Optional integrations are managed under <Link href="/settings/integrations" className="font-medium underline">Integrations</Link>; their credentials live encrypted on the server, never in this browser.</p>
                </div>
              </div>
              {p.demo ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-warning/50 bg-warning-soft/50 p-3">
                  <p className="flex items-center gap-2 text-sm"><FlaskConical className="size-4 text-warning" /> Demo data is loaded. Clear it to start with your own records (settings and the sample food list are kept).</p>
                  <Button variant="primary" size="sm" onClick={async () => { if (await confirm({ title: "Clear all demo data?", description: "Accounts, transactions, food logs, tasks, events, habits and goals are removed. Your preferences stay.", confirmLabel: "Clear demo data" })) { actions().clearDemoData(); toast("Demo data cleared — you're starting fresh"); } }}>
                    <Eraser /> Clear demo data
                  </Button>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button onClick={exportJson}><Download /> Download backup (JSON)</Button>
                <Button onClick={() => fileRef.current?.click()}><Upload /> Restore from backup</Button>
                <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ""; }} />
                <Button onClick={async () => { if (await confirm({ title: "Load demo data?", description: "This replaces everything currently stored with sample records.", confirmLabel: "Load demo data" })) { actions().loadDemo(); toast("Demo data loaded"); } }}><FlaskConical /> {p.demo ? "Reset demo data" : "Load demo data"}</Button>
              </div>
              <div className="border-t border-line pt-4">
                <Button variant="danger" onClick={async () => { if (await confirm({ title: "Delete everything?", description: "All records and preferences in this browser are permanently erased and you'll return to onboarding. Download a backup first if you might need it.", confirmLabel: "Delete everything" })) { actions().wipe(); } }}>
                  <Trash2 /> Delete all data
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
      {catEdit ? <CategoryDialog cat={"id" in catEdit ? catEdit : undefined} kind={catEdit.kind} onClose={() => setCatEdit(null)} /> : null}
    </>
  );
}

function CategoryDialog({ cat, kind, onClose }: { cat?: Category; kind: CategoryKind; onClose: () => void }) {
  const db = useDb();
  const [name, setName] = useState(cat?.name ?? "");
  const [parentId, setParentId] = useState(cat?.parentId ?? "");
  const [icon, setIcon] = useState(cat?.icon ?? "tag");
  const [color, setColor] = useState(cat?.color ?? PALETTE[0]);
  const hasChildren = cat ? db.categories.some((c) => c.parentId === cat.id) : false;
  const count = cat ? db.transactions.filter((t) => t.categoryId === cat.id).length : 0;
  const valid = name.trim().length > 0;

  const save = () => {
    if (!valid) return;
    const rec = { name: name.trim(), parentId: parentId || null, icon, color, kind };
    if (cat) actions().update("categories", cat.id, rec);
    else actions().add("categories", { ...rec, archived: false });
    toast(cat ? "Category updated" : "Category created");
    onClose();
  };
  const del = async () => {
    if (!cat) return;
    if (!(await confirm({ title: `Delete “${cat.name}”?`, description: `${count ? `${count} transactions move to ${cat.parentId ? "the parent category" : "Uncategorized"}. ` : ""}${hasChildren ? "Subcategories become top-level. " : ""}Budgets for it are removed.` }))) return;
    actions().deleteCategory(cat.id);
    toast("Category deleted");
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={cat ? "Edit category" : `New ${kind} category`}
      footer={
        <>
          {cat ? (
            <div className="mr-auto flex gap-1">
              <Button variant="ghost" onClick={() => { actions().update("categories", cat.id, { archived: !cat.archived }); onClose(); }}>{cat.archived ? "Restore" : "Archive"}</Button>
              <Button variant="ghost" className="text-negative hover:text-negative" onClick={del}>Delete</Button>
            </div>
          ) : null}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!valid}>Save</Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Name" error={!valid && name ? "Required" : undefined}>{(f) => <Input {...f} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}</Field>
        <Field label="Parent" optional hint={hasChildren ? "Has subcategories, so it stays top-level." : undefined}>
          {(f) => (
            <Select {...f} value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={hasChildren}>
              <option value="">None (top-level)</option>
              {db.categories.filter((c) => c.kind === kind && !c.parentId && c.id !== cat?.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-medium text-ink-2">Icon</p>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_ICONS.map((i) => <button key={i} type="button" aria-label={i} aria-pressed={icon === i} onClick={() => setIcon(i)} className={cn("grid size-8 place-items-center rounded-md [&_svg]:size-4", icon === i ? "bg-ink text-canvas" : "bg-muted text-ink-2 hover:bg-line")}><Icon name={i} /></button>)}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PALETTE.map((c) => <button key={c} type="button" aria-label={c} aria-pressed={color === c} onClick={() => setColor(c)} className={cn("size-6 rounded-full ring-offset-2 ring-offset-surface", color === c && "ring-2 ring-ink")} style={{ background: c }} />)}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
