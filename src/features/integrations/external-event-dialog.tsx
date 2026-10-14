"use client";

import { ExternalLink, Lock } from "lucide-react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDb } from "@/lib/hooks";
import { closeSheet } from "@/lib/store/ui";
import { formatDate } from "@/lib/domain/dates";

/** Read-only view of an event that lives in an external calendar. */
export function ExternalEventDialog({ id }: { id: string }) {
  const db = useDb();
  const e = db.externalEvents.find((x) => x.id === id);
  if (!e) return null;
  const providerName = e.provider === "google" ? "Google Calendar" : "Notion";
  return (
    <Dialog
      open
      onClose={closeSheet}
      title={e.title}
      description={<span className="inline-flex items-center gap-1.5"><Badge tone="info">{providerName}</Badge> {e.calendarName}</span>}
      footer={
        <>
          <Link href="/settings/integrations" onClick={closeSheet}><Button variant="ghost">Manage integration</Button></Link>
          {e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer"><Button variant="primary">Open in {providerName} <ExternalLink /></Button></a> : null}
        </>
      }
    >
      <dl className="grid grid-cols-[100px_1fr] gap-y-2 text-sm">
        <dt className="text-ink-3">When</dt>
        <dd>
          {formatDate(e.date, { weekday: "long", month: "long", day: "numeric" })}
          {e.allDay ? " · all day" : ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ""}`}
          {e.endDate !== e.date ? ` → ${formatDate(e.endDate, { month: "short", day: "numeric" })}` : ""}
          <span className="block text-caption text-ink-3">Shown in your timezone ({db.profile.timezone})</span>
        </dd>
        {e.location ? (<><dt className="text-ink-3">Location</dt><dd>{e.location}</dd></>) : null}
        {e.recurring ? (<><dt className="text-ink-3">Repeats</dt><dd>Part of a recurring series</dd></>) : null}
      </dl>
      <p className="mt-4 flex items-center gap-2 rounded-md bg-subtle px-3 py-2 text-caption text-ink-3"><Lock className="size-3.5" /> Read-only copy. Edit it in {providerName}; it updates here on the next sync.</p>
    </Dialog>
  );
}
