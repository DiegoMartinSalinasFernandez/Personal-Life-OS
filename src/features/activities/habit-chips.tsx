"use client";

import Link from "next/link";
import { Check, Flame } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useDb, useToday, actions } from "@/lib/hooks";
import { habitStreak, habitsToday } from "@/lib/calc/productivity";

/** Today's scheduled habits as tappable check-in chips. */
export function HabitChips({ limit }: { limit?: number }) {
  const db = useDb();
  const today = useToday();
  const { scheduled, doneIds } = habitsToday(db.habits, db.habitCompletions, today);
  if (!scheduled.length)
    return (
      <p className="text-sm text-ink-3">
        No habits scheduled today. <Link href="/activities/habits" className="font-medium text-ink-2 underline-offset-2 hover:underline">Manage habits</Link>
      </p>
    );
  return (
    <ul className="flex flex-wrap gap-2">
      {scheduled.slice(0, limit).map((h) => {
        const done = doneIds.has(h.id);
        const streak = habitStreak(h, db.habitCompletions, today);
        return (
          <li key={h.id}>
            <button
              onClick={() => actions().toggleHabit(h.id, today)}
              aria-pressed={done}
              className={cn("flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors", done ? "border-transparent text-white" : "border-line bg-surface text-ink hover:border-line-strong")}
              style={done ? { background: h.color } : undefined}
            >
              <span className={cn("grid size-6 place-items-center rounded-full [&_svg]:size-3.5", done ? "bg-white/20" : "")} style={done ? undefined : { background: `${h.color}1f`, color: h.color }}>
                {done ? <Check aria-hidden /> : <Icon name={h.icon} />}
              </span>
              <span className="font-medium">{h.name}</span>
              {streak > 1 ? (
                <span className={cn("num inline-flex items-center gap-0.5 text-caption", done ? "text-white/85" : "text-ink-3")}>
                  <Flame className="size-3" aria-hidden />
                  {streak}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
