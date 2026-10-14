"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { Plus, ChevronLeft, CalendarClock, MoreHorizontal, Pencil, Archive, Trash2, FolderKanban, Target } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Menu } from "@/components/ui/menu";
import { ProgressBar } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/components/ui/confirm";
import { cn } from "@/lib/cn";
import { useForm } from "@/lib/hooks/use-form";
import { useDb, useToday, actions } from "@/lib/hooks";
import { compareTasks, daysLeft, projectProgress } from "@/lib/calc/productivity";
import { formatDate, isISODate } from "@/lib/domain/dates";
import type { Project } from "@/lib/domain/types";
import { PALETTE, PROJECT_AREAS } from "@/lib/data/defaults";
import { TaskItem } from "@/features/activities/task-item";
import { QuickAddTask } from "@/features/activities/quick-add-task";
import Link from "next/link";

function ProjectsInner() {
  const db = useDb();
  const today = useToday();
  const params = useSearchParams();
  const router = useRouter();
  const selectedId = params.get("id");
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const progress = useMemo(() => db.projects.map((p) => projectProgress(p, db.tasks, today)), [db.projects, db.tasks, today]);
  const selected = selectedId ? db.projects.find((p) => p.id === selectedId) : null;
  const inbox = db.tasks.filter((t) => !t.projectId && !t.done).length;

  const remove = async (p: Project) => {
    const count = db.tasks.filter((t) => t.projectId === p.id).length;
    const ok = await confirm({ title: `Delete “${p.name}”?`, description: count ? `Its ${count} tasks will move to the Inbox (no project). Linked goals and events are kept.` : "This project has no tasks.", confirmLabel: "Delete project" });
    if (!ok) return;
    actions().deleteProject(p.id, false);
    toast("Project deleted");
    router.replace("/activities/projects");
  };

  if (selected) {
    const pp = projectProgress(selected, db.tasks, today);
    const open = db.tasks.filter((t) => t.projectId === selected.id && !t.done).sort(compareTasks);
    const done = db.tasks.filter((t) => t.projectId === selected.id && t.done).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    const goals = db.goals.filter((g) => g.linkedProjectIds.includes(selected.id));
    const left = daysLeft(selected.deadline, today);
    return (
      <div className="flex flex-col gap-4">
        <Link href="/activities/projects" className="inline-flex items-center gap-1 self-start text-sm font-medium text-ink-3 hover:text-ink"><ChevronLeft className="size-4" /> All projects</Link>
        <Card className="p-5">
          <div className="flex flex-wrap items-start gap-4">
            <span className="mt-1 size-3 rounded-full" style={{ background: selected.color }} />
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold">{selected.name}</h2>
              <p className="text-sm text-ink-3">{selected.area}{selected.description ? ` · ${selected.description}` : ""}</p>
            </div>
            <Button size="sm" onClick={() => setEditing(selected)}><Pencil /> Edit</Button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <div className="mb-1.5 flex justify-between text-sm"><span className="text-ink-2">{pp.done} of {pp.total} tasks done</span><span className="num font-medium">{pp.pct == null ? "—" : `${Math.round(pp.pct * 100)}%`}</span></div>
              <ProgressBar value={pp.pct ?? 0} tone="activities" label="Project progress" />
            </div>
            <div className="text-sm">
              <p className="text-ink-3">Deadline</p>
              <p className={cn("font-medium", left != null && left < 0 && "text-negative")}>{selected.deadline ? `${formatDate(selected.deadline, { month: "short", day: "numeric", year: "numeric" })} · ${left! < 0 ? `${-left!}d overdue` : `${left}d left`}` : "None"}</p>
            </div>
          </div>
          {goals.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-3">
              <Target className="size-3.5" /> Supports:
              {goals.map((g) => <Badge key={g.id} tone="activities">{g.title}</Badge>)}
            </div>
          ) : null}
        </Card>
        <QuickAddTask defaults={{ projectId: selected.id }} placeholder={`Add a task to ${selected.name}`} />
        <Card>
          <CardHeader title={`Open (${open.length})`} />
          <CardBody className="pb-3">{open.length ? <div className="-mx-2">{open.map((t) => <TaskItem key={t.id} task={t} showProject={false} />)}</div> : <p className="text-sm text-ink-3">No open tasks.</p>}</CardBody>
        </Card>
        {done.length ? (
          <Card>
            <CardHeader title={`Completed (${done.length})`} />
            <CardBody className="pb-3"><div className="-mx-2">{done.slice(0, 20).map((t) => <TaskItem key={t.id} task={t} showProject={false} compact />)}</div></CardBody>
          </Card>
        ) : null}
        {editing ? <ProjectDialog project={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} /> : null}
      </div>
    );
  }

  const visible = progress.filter((p) => showArchived || !p.project.archived);
  const areas = [...new Set(visible.map((p) => p.project.area))];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-3">{inbox} open task{inbox === 1 ? "" : "s"} without a project (Inbox)</p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Hide archived" : "Show archived"}</Button>
          <Button size="sm" variant="primary" onClick={() => setEditing("new")}><Plus /> New project</Button>
        </div>
      </div>
      {visible.length ? (
        areas.map((area) => (
          <section key={area}>
            <h2 className="eyebrow mb-2">{area}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visible.filter((p) => p.project.area === area).map(({ project: p, total, done, open, overdue, pct }) => {
                const left = daysLeft(p.deadline, today);
                return (
                  <article key={p.id} className={cn("card flex flex-col gap-3 p-4 transition hover:border-line-strong", p.archived && "opacity-60")}>
                    <div className="flex items-start gap-2.5">
                      <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                      <Link href={`/activities/projects?id=${p.id}`} className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-semibold hover:underline">{p.name}</h3>
                        {p.description ? <p className="truncate text-caption text-ink-3">{p.description}</p> : null}
                      </Link>
                      <Menu
                        label="Project actions"
                        trigger={(t) => <Button {...t} size="icon-sm" variant="ghost" aria-label={`Actions for ${p.name}`}><MoreHorizontal /></Button>}
                        items={[
                          { label: "Edit", icon: <Pencil />, onSelect: () => setEditing(p) },
                          { label: p.archived ? "Unarchive" : "Archive", icon: <Archive />, onSelect: () => actions().update("projects", p.id, { archived: !p.archived }) },
                          "separator",
                          { label: "Delete…", icon: <Trash2 />, danger: true, onSelect: () => remove(p) },
                        ]}
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-caption text-ink-3"><span>{done}/{total} done</span><span className="num">{pct == null ? "No tasks" : `${Math.round(pct * 100)}%`}</span></div>
                      <ProgressBar value={pct ?? 0} tone="activities" size="sm" label={`${p.name} progress`} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-caption text-ink-3">
                      <span>{open} open</span>
                      {overdue ? <Badge tone="negative">{overdue} overdue</Badge> : null}
                      {p.deadline ? <span className={cn("ml-auto inline-flex items-center gap-1", left != null && left < 0 && "text-negative")}><CalendarClock className="size-3" />{formatDate(p.deadline)} · {left! < 0 ? `${-left!}d late` : `${left}d`}</span> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))
      ) : (
        <Card><EmptyState icon={<FolderKanban />} title="No projects yet" description="Group tasks into projects or areas like Work, Study or Fitness." action={<Button variant="primary" onClick={() => setEditing("new")}>Create project</Button>} /></Card>
      )}
      {editing ? <ProjectDialog project={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

type Values = { name: string; area: string; customArea: string; color: string; description: string; deadline: string };
const schema = z.object({
  name: z.string().trim().min(1, "Name the project").max(80),
  area: z.string(),
  customArea: z.string().max(40),
  color: z.string(),
  description: z.string().max(400),
  deadline: z.string().refine((s) => s === "" || isISODate(s), "Enter a valid date"),
}).refine((v) => v.area !== "__custom" || v.customArea.trim(), { path: ["customArea"], message: "Name the area" });

function ProjectDialog({ project, onClose }: { project?: Project; onClose: () => void }) {
  const db = useDb();
  const areas = [...new Set([...PROJECT_AREAS, ...db.projects.map((p) => p.area)])];
  const { values, set, errors, handleSubmit } = useForm<Values, z.infer<typeof schema>>(schema, {
    name: project?.name ?? "",
    area: project?.area ?? "Personal",
    customArea: "",
    color: project?.color ?? PALETTE[db.projects.length % PALETTE.length],
    description: project?.description ?? "",
    deadline: project?.deadline ?? "",
  });
  const submit = handleSubmit((v) => {
    const rec = { name: v.name, area: v.area === "__custom" ? v.customArea.trim() : v.area, color: v.color, description: v.description || undefined, deadline: v.deadline || null };
    if (project) actions().update("projects", project.id, rec);
    else actions().add("projects", { ...rec, archived: false });
    toast(project ? "Project updated" : "Project created");
    onClose();
  });
  return (
    <Dialog open onClose={onClose} title={project ? "Edit project" : "New project"} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="project-form">Save</Button></>}>
      <form id="project-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Name" error={errors.name} className="sm:col-span-2">{(p) => <Input {...p} value={values.name} onChange={(e) => set("name", e.target.value)} autoFocus />}</Field>
        <Field label="Area">
          {(p) => (
            <Select {...p} value={values.area} onChange={(e) => set("area", e.target.value)}>
              {areas.map((a) => <option key={a}>{a}</option>)}
              <option value="__custom">Custom…</option>
            </Select>
          )}
        </Field>
        {values.area === "__custom" ? <Field label="Custom area" error={errors.customArea}>{(p) => <Input {...p} value={values.customArea} onChange={(e) => set("customArea", e.target.value)} />}</Field> : <Field label="Deadline" optional error={errors.deadline}>{(p) => <Input {...p} type="date" value={values.deadline} onChange={(e) => set("deadline", e.target.value)} />}</Field>}
        {values.area === "__custom" ? <Field label="Deadline" optional error={errors.deadline}>{(p) => <Input {...p} type="date" value={values.deadline} onChange={(e) => set("deadline", e.target.value)} />}</Field> : null}
        <Field label="Description" optional className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={values.description} onChange={(e) => set("description", e.target.value)} />}</Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-medium text-ink-2">Colour</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colour">
            {PALETTE.map((c) => <button key={c} type="button" role="radio" aria-checked={values.color === c} aria-label={c} onClick={() => set("color", c)} className={cn("size-6 rounded-full ring-offset-2 ring-offset-surface", values.color === c && "ring-2 ring-ink")} style={{ background: c }} />)}
          </div>
        </div>
      </form>
    </Dialog>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsInner />
    </Suspense>
  );
}
