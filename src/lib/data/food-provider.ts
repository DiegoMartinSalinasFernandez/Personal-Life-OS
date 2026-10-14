import type { Food } from "../domain/types";

/**
 * Food search abstraction. Today only the local database (sample + custom
 * foods stored with the user's data) is available. A real nutrition API can
 * be added by implementing this interface and mapping results to `Food`
 * with `source: "api"`. No external food service is connected.
 */
export interface FoodProvider {
  readonly name: string;
  search(query: string, foods: Food[]): Food[];
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export const localFoodProvider: FoodProvider = {
  name: "Local food database",
  search(query, foods) {
    const q = norm(query.trim());
    const active = foods.filter((f) => !f.archived);
    if (!q) return active;
    const terms = q.split(/\s+/);
    return active
      .map((f) => {
        const hay = norm(`${f.name} ${f.brand ?? ""}`);
        if (!terms.every((t) => hay.includes(t))) return null;
        const score = (hay.startsWith(q) ? 0 : 1) + (f.favorite ? -0.5 : 0) + (f.source === "custom" ? -0.2 : 0);
        return { f, score };
      })
      .filter((x): x is { f: Food; score: number } => !!x)
      .sort((a, b) => a.score - b.score || a.f.name.localeCompare(b.f.name))
      .map((x) => x.f);
  },
};
