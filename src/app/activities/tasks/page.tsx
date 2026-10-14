"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, CheckCheck, Trash2, CalendarDays, X, ListTodo } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { useDb, useToday, actions, useSessionState } from "@/lib/hooks";
import { compareTasks, PRIORITY_RANK } from "@/lib/calc/productivity";
import { addDays, diffDays, formatDate, relativeDay } from "@/lib/domain/dates";
import type { Priority, Task } from "@/lib/domain/types";
import { ProjectOptions } from "@/features/common/options";
import { TaskItem } from "@/features/activities/task-item";
import { QuickAddTask } from "@/features/activities/quick-add-task";

type View = "all" | "today" | "upcoming" | "overdue" | "nodate" | "completed";
type Sort = "smart" | "due" | "priority" | "created";

function TasksInner() {
  const db = useDb();
  const today = useToday();
  const params = useSearchParams();
  const [view, setView] = useSessionState<View>("task-view", "today");
  const [q, setQ] = useState("");
  const [project, setProject] = useState("");
  const [priority, setPriority] = useState<"" | Priority>("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<Sort>("smart");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  useEffect(() => {
    const v = params.get("view") as View | null;
    if (v) setView(v);
  }, [params, setView]);

  const tags = useMemo(() => [...new Set(db.tasks.flatMap((t) => t.tags))].sort(), [db.tasks]);
  const counts = useMemo(() => {
    const open = db.tasks.filter((t) => !t.done);
    return {
      all: open.length,
      today: open.filter((t) => t.dueDate && t.dueDate <= today).length,
      upcoming: open.filter((t) => t.dueDate && t.dueDate > today).length,
      overdue: open.filter((t) => t.dueDate && t.dueDate < today).length,
      nodate: open.filter((t) => !t.dueDate).length,
      completed: db.tasks.length - open.length,
    };
  }, [db.tasks, today]);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let xs = db.tasks.filter((t) => {
      switch (view) {
        case "all": if (t.done) return false; break;
        case "today": if (t.done || !t.dueDate || t.dueDate > today) return false; break;
        case "upcoming": if (t.done || !t.dueDate || t.dueDate <= today) return false; break;
        case "overdue": if (t.done || !t.dueDate || t.dueDate >= today) return false; break;
        case "nodate": if (t.done || t.dueDate) return false; break;
        case "completed": if (!t.done) return false; break;
      }
      if (project && (project === "inbox" ? t.projectId : t.projectId !== project)) return false;
      if (priority && t.priority !== priority) return false;
      if (tag && !t.tags.includes(tag)) return false;
      if (ql && !`${t.title} ${t.description ?? ""} ${t.notes ?? ""} ${t.tags.join(" ")}`.toLowerCase().includes(ql)) return false;
      return true;
    });
    if (view === "completed") xs = xs.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    else if (sort === "smart") xs = xs.sort(compareTasks);
    else if (sort === "due") xs = xs.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || compareTasks(a, b));
    else if (sort === "priority") xs = xs.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || compareTasks(a, b));
    else xs = xs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return xs;
  }, [db.tasks, view, project, priority, tag, q, sort, today]);

  // Group by date for date-oriented views.
  const groups = useMemo(() => {
    if (!(view === "upcoming" || view === "completed" || (sort === "due" && view !== "nodate"))) return [{ label: null as string | null, items: list }];
    const g = new Map<string, Task[]>();
    for (const t of list) {
      const key = view === "completed" ? t.completedOn ?? "" : t.dueDate ?? "";
      g.set(key, [...(g.get(key) ?? []), t]);
    }
    return [...g.entries()].map(([k, items]) => ({ label: k ? (Math.abs(diffDays(today, k)) < 7 ? `${relativeDay(k, today)} · ${formatDate(k)}` : relativeDay(k, today)) : "No date", items }));
  }, [list, view, sort, today]);

  const toggleSel = (id: string, v: boolean) => {
    const n = new Set(selected);
    if (v) n.add(id); else n.delete(id);
    setSelected(n);
  };
  const bulk = async (action: "complete" | "delete" | "today" | "tomorrow" | "reopen") => {
    const ids = [...selected];
    if (!ids.length) return;
    if (action === "delete" && !(await confirm({ title: `Delete ${ids.length} task${ids.length > 1 ? "s" : ""}?`, description: "This can't be undone." }))) return;
    if (action === "today" || action === "tomorrow") ids.forEach((id) => actions().update("tasks", id, { dueDate: action === "today" ? today : addDays(today, 1) }));
    else actions().bulkTasks(ids, action, today);
    toast(`${ids.length} task${ids.length > 1 ? "s" : ""} updated`);
    setSelected(new Set());
  };
  const filtered = q || project || priority || tag;

  return (
    <div className="flex flex-col gap-4">
      <QuickAddTask defaults={{ dueDate: view === "today" ? today : null, projectId: project && project !== "inbox" ? project : null }} />
      <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <Segmented
          label="View"
          value={view}
          onChange={(v) => { setView(v); setSelected(new Set()); }}
          options={([["today", "Today"], ["upcoming", "Upcoming"], ["overdue", "Overdue"], ["nodate", "No date"], ["all", "All open"], ["completed", "Completed"]] as [View, string][]).map(([v, l]) => ({
            value: v,
            label: <span>{l} <span className="num ml-0.5 text-caption text-ink-3">{counts[v]}</span></span>,
          }))}
        />
      </div>
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" className="h-8 pl-9 text-sm" aria-label="Search tasks" />
          </div>
          <Select className="h-8 w-auto text-sm" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project">
            <option value="">All projects</option>
            <option value="inbox">Inbox (no project)</option>
            <ProjectOptions projects={db.projects} />
          </Select>
          <Select className="h-8 w-auto text-sm" value={priority} onChange={(e) => setPriority(e.target.value as Priority | "")} aria-label="Priority">
            <option value="">Any priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
          {tags.length ? (
            <Select className="h-8 w-auto text-sm" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag">
              <option value="">Any tag</option>
              {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
            </Select>
          ) : null}
          {view !== "completed" ? (
            <Select className="h-8 w-auto text-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
              <option value="smart">Sort: Smart</option>
              <option value="due">Sort: Due date</option>
              <option value="priority">Sort: Priority</option>
              <option value="created">Sort: Newest</option>
            </Select>
          ) : null}
          <Button size="sm" variant={selecting ? "subtle" : "ghost"} onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}>
            {selecting ? "Done selecting" : "Select"}
          </Button>
          {filtered ? <Button size="sm" variant="ghost" onClick={() => { setQ(""); setProject(""); setPriority(""); setTag(""); }}><X /> Clear</Button> : null}
        </div>
        {selecting ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2 text-sm">
            <span className="text-ink-2"><span className="num font-medium">{selected.size}</span> selected</span>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(list.map((t) => t.id)))}>Select all ({list.length})</Button>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {view === "completed" ? (
                <Button size="sm" disabled={!selected.size} onClick={() => bulk("reopen")}>Reopen</Button>
              ) : (
                <>
                  <Button size="sm" disabled={!selected.size} onClick={() => bulk("complete")}><CheckCheck /> Complete</Button>
                  <Button size="sm" disabled={!selected.size} onClick={() => bulk("today")}><CalendarDays /> Today</Button>
                  <Button size="sm" disabled={!selected.size} onClick={() => bulk("tomorrow")}>Tomorrow</Button>
                </>
              )}
              <Button size="sm" variant="danger" disabled={!selected.size} onClick={() => bulk("delete")}><Trash2 /> Delete</Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="py-2">
        {list.length ? (
          groups.map((g) => (
            <section key={g.label ?? "all"} className="px-3">
              {g.label ? <h3 className="eyebrow px-2 pb-1 pt-3">{g.label}</h3> : null}
              {g.items.map((t) => (
                <TaskItem key={t.id} task={t} selectable={selecting} selected={selected.has(t.id)} onSelect={(v) => toggleSel(t.id, v)} showDue={view !== "today" || t.dueDate !== today} />
              ))}
            </section>
          ))
        ) : (
          <EmptyState
            icon={<ListTodo />}
            title={filtered ? "No tasks match these filters" : view === "today" ? "Nothing due today" : view === "overdue" ? "Nothing overdue" : view === "completed" ? "No completed tasks yet" : "No tasks here"}
            description={view === "today" && !filtered ? "Enjoy the space — or pull something forward from Upcoming." : undefined}
          />
        )}
      </Card>
      <p className="text-caption text-ink-3">Keyboard: <kbd className="rounded border border-line px-1">N</kbd> create · <kbd className="rounded border border-line px-1">/</kbd> search · <kbd className="rounded border border-line px-1">G</kbd> then <kbd className="rounded border border-line px-1">A</kbd> go to Activities</p>
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense>
      <TasksInner />
    </Suspense>
  );
}
