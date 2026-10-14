"use client";

import { useState } from "react";
import { ArrowRight, FlaskConical, Sparkles, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { useStore } from "@/lib/store";
import { CURRENCIES } from "@/lib/domain/money";
import { browserTimeZone } from "@/lib/domain/dates";
import { LogoMark } from "./logo";

const ZONES = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [browserTimeZone()];
  } catch {
    return [browserTimeZone()];
  }
})();

export function Onboarding() {
  const [step, setStep] = useState<"welcome" | "setup">("welcome");
  const profile = useStore((s) => s.db.profile);
  const [name, setName] = useState(profile.name);
  const [currency, setCurrency] = useState(profile.currency);
  const [timezone, setTimezone] = useState(profile.timezone || browserTimeZone());
  const [protein, setProtein] = useState(String(profile.nutrition.proteinTarget));
  const [calories, setCalories] = useState(profile.nutrition.calorieTracking);
  const [units, setUnits] = useState(profile.nutrition.units);
  const [weekStart, setWeekStart] = useState<"1" | "0">(String(profile.weekStartsOn) as "1" | "0");
  const proteinNum = Number(protein);
  const proteinError = !protein || !Number.isFinite(proteinNum) || proteinNum <= 0 || proteinNum > 500 ? "Enter a target between 1 and 500 g" : undefined;

  const finish = () => {
    if (proteinError) return;
    useStore.getState().startFresh({
      name: name.trim(),
      currency,
      timezone,
      weekStartsOn: weekStart === "1" ? 1 : 0,
      nutrition: { ...profile.nutrition, proteinTarget: Math.round(proteinNum), calorieTracking: calories, units },
    });
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[520px]">
        <div className="mb-8 flex items-center gap-3">
          <LogoMark className="size-9" />
          <span className="text-lg font-semibold tracking-tight">Life OS</span>
        </div>
        {step === "welcome" ? (
          <div className="card p-6 sm:p-8 animate-pop-in">
            <h1 className="text-2xl font-semibold tracking-tight">Your money, meals and days — in one place.</h1>
            <p className="mt-2 text-md text-ink-2">Track spending and budgets, hit your protein target, and plan your day with tasks, calendar and habits.</p>
            <ul className="mt-6 space-y-3 text-base text-ink-2">
              <li className="flex gap-3">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-finance" /> Finance — accounts, transactions, budgets, bills and savings goals.
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-nutrition" /> Nutrition — protein-first food logging, meal plans and history.
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-activities" /> Activities — tasks, projects, calendar and habit streaks.
              </li>
            </ul>
            <div className="mt-6 flex items-start gap-2.5 rounded-md bg-subtle p-3 text-sm text-ink-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-finance" aria-hidden />
              <p>Everything is stored only in this browser. No bank, food or calendar service is connected — you enter data manually or import a CSV.</p>
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button variant="primary" size="lg" className="flex-1" onClick={() => setStep("setup")}>
                <Sparkles /> Set up my workspace
              </Button>
              <Button size="lg" className="flex-1" onClick={() => useStore.getState().loadDemo()}>
                <FlaskConical /> Explore demo data
              </Button>
            </div>
            <p className="mt-3 text-center text-caption text-ink-3">Demo data is clearly marked and can be cleared at any time in Settings.</p>
          </div>
        ) : (
          <form
            className="card p-6 sm:p-8 animate-pop-in"
            onSubmit={(e) => {
              e.preventDefault();
              finish();
            }}
          >
            <h1 className="text-xl font-semibold tracking-tight">A few preferences</h1>
            <p className="mt-1 text-base text-ink-3">You can change all of these later in Settings.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Your name" optional className="sm:col-span-2">
                {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Used for greetings" autoFocus />}
              </Field>
              <Field label="Base currency" hint="Totals are shown in this currency.">
                {(p) => (
                  <Select {...p} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Timezone" hint="Defines when your day starts.">
                {(p) => (
                  <Select {...p} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                    {ZONES.map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Daily protein target (g)" error={proteinError} hint="Pick a number that suits you — the app doesn't prescribe one.">
                {(p) => <Input {...p} inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value.replace(/[^\d]/g, ""))} />}
              </Field>
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink-2">Units</p>
                <Segmented label="Units" value={units} onChange={setUnits} options={[{ value: "metric", label: "Metric (g, ml)" }, { value: "imperial", label: "Imperial (oz)" }]} />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink-2">Week starts on</p>
                <Segmented label="Week starts on" value={weekStart} onChange={setWeekStart} options={[{ value: "1", label: "Monday" }, { value: "0", label: "Sunday" }]} />
              </div>
              <div className="sm:col-span-2">
                <Switch checked={calories} onChange={setCalories} label="Track calories" description="Protein is always tracked. Calories are optional." />
              </div>
            </div>
            <div className="mt-8 flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep("welcome")}>
                Back
              </Button>
              <Button type="submit" variant="primary">
                Start using Life OS <ArrowRight />
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
