"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Clock, FileUp, Ban, Wrench, PlugZap, ExternalLink, ChevronDown, ShieldCheck, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { STATUS_LABEL, type CapabilityLevel, type IntegrationStatus, type ProviderInfo } from "@/lib/integrations/catalog";

const STATUS_META: Record<IntegrationStatus, { tone: "positive" | "warning" | "negative" | "info" | "neutral" | "outline"; icon: typeof CheckCircle2 }> = {
  connected: { tone: "positive", icon: CheckCircle2 },
  available: { tone: "info", icon: PlugZap },
  sync_required: { tone: "warning", icon: Clock },
  expired: { tone: "negative", icon: XCircle },
  error: { tone: "negative", icon: AlertTriangle },
  manual_import: { tone: "neutral", icon: FileUp },
  unsupported: { tone: "outline", icon: Ban },
  needs_config: { tone: "outline", icon: Wrench },
};

export function StatusBadge({ status }: { status: IntegrationStatus }) {
  const m = STATUS_META[status];
  return <Badge tone={m.tone} icon={<m.icon />}>{STATUS_LABEL[status]}</Badge>;
}

const LEVEL: Record<CapabilityLevel, { label: string; cls: string }> = {
  supported: { label: "Supported", cls: "text-positive" },
  partial: { label: "Partial", cls: "text-warning" },
  csv: { label: "CSV import", cls: "text-info" },
  unsupported: { label: "Not available", cls: "text-ink-3" },
  unverified: { label: "Unverified", cls: "text-ink-3" },
};

export function ProviderLogo({ info, size = "md" }: { info: ProviderInfo; size?: "md" | "lg" }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-lg font-semibold text-white", size === "lg" ? "size-12 text-base" : "size-10 text-sm")} style={{ background: info.brandColor }} aria-hidden>
      {info.monogram}
    </span>
  );
}

export function ProviderCard({ info, status, meta, children, title }: { info: ProviderInfo; status: IntegrationStatus; meta?: React.ReactNode; children?: React.ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="card flex flex-col">
      <div className="flex items-start gap-3 p-4 pb-3">
        <ProviderLogo info={info} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-md font-semibold">{title ?? info.name}</h3>
            <StatusBadge status={status} />
          </div>
          <p className="mt-0.5 text-sm text-ink-3">{info.tagline}</p>
        </div>
      </div>
      {meta ? <div className="mx-4 mb-3 rounded-md bg-subtle px-3 py-2 text-sm">{meta}</div> : null}
      <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
        {children}
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="mt-auto flex items-center gap-1 self-start text-sm font-medium text-ink-2 hover:text-ink">
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} /> What this integration can and can&apos;t do
        </button>
        {open ? (
          <div className="flex flex-col gap-3 border-t border-line pt-3">
            <p className="text-sm text-ink-2">{info.description}</p>
            <ul className="flex flex-col gap-1.5">
              {info.capabilities.map((c) => (
                <li key={c.label} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-ink">
                    {c.label}
                    {c.note ? <span className="block text-caption text-ink-3">{c.note}</span> : null}
                  </span>
                  <span className={cn("shrink-0 text-caption font-medium", LEVEL[c.level].cls)}>{LEVEL[c.level].label}</span>
                </li>
              ))}
            </ul>
            {info.docs.length ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {info.docs.map((d) => (
                  <a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-info hover:underline">
                    {d.label} <ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** Shown before redirecting to the provider's official authorization page. */
export function ConsentDialog({ info, onClose, onContinue }: { info: ProviderInfo; onClose: () => void; onContinue: () => void }) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Connect ${info.name}`}
      description="Review what Personal Life OS will be able to read before you continue."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={onContinue}>Continue to {info.name}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex items-center gap-3">
          <ProviderLogo info={info} size="lg" />
          <p className="text-ink-2">You&apos;ll sign in on <strong className="font-medium text-ink">{info.name}&apos;s own page</strong>. This app never sees or stores your password.</p>
        </div>
        <div>
          <p className="mb-1 font-medium text-ink">Data that will be read</p>
          <ul className="list-disc pl-5 text-ink-2">{info.dataAccessed.map((d) => <li key={d}>{d}</li>)}</ul>
        </div>
        {info.permissions.length ? (
          <div>
            <p className="mb-1 font-medium text-ink">Permissions requested</p>
            <ul className="flex flex-wrap gap-1.5">{info.permissions.map((p) => <li key={p}><code className="rounded bg-muted px-1.5 py-0.5 text-caption">{p}</code></li>)}</ul>
          </div>
        ) : null}
        <ul className="flex flex-col gap-1.5 rounded-md bg-subtle p-3 text-ink-2">
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-finance" /> Read-only: no payments, transfers, trades or edits can be made.</li>
          <li className="flex gap-2"><Lock className="mt-0.5 size-4 shrink-0 text-finance" /> Access tokens are encrypted on the server and never sent to your browser.</li>
          <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-finance" /> “Connected” only appears after the connection is verified.</li>
        </ul>
      </div>
    </Dialog>
  );
}
