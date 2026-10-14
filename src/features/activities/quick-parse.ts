import type { Priority, Project } from "@/lib/domain/types";
import { addDays, weekday, type ISODate } from "@/lib/domain/dates";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Parses natural shortcuts in a quick-add line:
 *   "Call bank tomorrow !high #finance-admin"
 *   today | tomorrow | mon…sun → due date,  !urgent|!high|!medium|!low → priority,
 *   #project-name → project (prefix match),  +tag → tag
 */
export function parseQuickTask(input: string, today: ISODate, projects: Project[]) {
  let title = ` ${input} `;
  let dueDate: ISODate | null = null;
  let priority: Priority = "medium";
  let projectId: string | null = null;
  const tags: string[] = [];

  title = title.replace(/\s!(urgent|high|medium|low|p1|p2|p3|p4)\b/i, (_, p: string) => {
    const k = p.toLowerCase();
    priority = (({ p1: "urgent", p2: "high", p3: "medium", p4: "low" } as Record<string, Priority>)[k] ?? k) as Priority;
    return " ";
  });
  title = title.replace(/\s(today|tod)\b/i, () => ((dueDate = today), " "));
  title = title.replace(/\s(tomorrow|tmr)\b/i, () => ((dueDate = addDays(today, 1)), " "));
  title = title.replace(/\s(mon|tue|wed|thu|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?\b/i, (m, d: string) => {
    const target = DAYS.indexOf(d.toLowerCase());
    const diff = (target - weekday(today) + 7) % 7 || 7;
    dueDate = addDays(today, diff);
    return " ";
  });
  title = title.replace(/\s#([\w-]+)/, (m, name: string) => {
    const n = name.toLowerCase().replace(/-/g, " ");
    const p = projects.find((x) => !x.archived && x.name.toLowerCase().startsWith(n));
    if (!p) return m;
    projectId = p.id;
    return " ";
  });
  title = title.replace(/\s\+([\w-]+)/g, (_, t: string) => (tags.push(t), " "));
  return { title: title.replace(/\s+/g, " ").trim(), dueDate: dueDate as ISODate | null, priority, projectId: projectId as string | null, tags };
}
