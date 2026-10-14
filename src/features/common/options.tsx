import type { Account, Category, CategoryKind, Project } from "@/lib/domain/types";

/** Category <option>s with subcategories indented under their parent. */
export function CategoryOptions({ categories, kind }: { categories: Category[]; kind?: CategoryKind }) {
  const active = categories.filter((c) => !c.archived && (!kind || c.kind === kind));
  const roots = active.filter((c) => !c.parentId).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      {roots.map((r) => {
        const kids = active.filter((c) => c.parentId === r.id).sort((a, b) => a.name.localeCompare(b.name));
        return [
          <option key={r.id} value={r.id}>
            {r.name}
          </option>,
          ...kids.map((k) => (
            <option key={k.id} value={k.id}>
              {"   "}↳ {k.name}
            </option>
          )),
        ];
      })}
    </>
  );
}

export function AccountOptions({ accounts, includeArchivedId }: { accounts: Account[]; includeArchivedId?: string }) {
  return (
    <>
      {accounts
        .filter((a) => !a.archived || a.id === includeArchivedId)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {a.currency}
          </option>
        ))}
    </>
  );
}

export function ProjectOptions({ projects }: { projects: Project[] }) {
  const areas = [...new Set(projects.filter((p) => !p.archived).map((p) => p.area))];
  return (
    <>
      {areas.map((area) => (
        <optgroup key={area} label={area}>
          {projects
            .filter((p) => !p.archived && p.area === area)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}

export const parseTags = (s: string) => [...new Set(s.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean))].slice(0, 12);
