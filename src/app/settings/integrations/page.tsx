"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ShieldCheck, Wrench, AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/shell/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/empty";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useDb, actions } from "@/lib/hooks";
import { activeFinanceCount, MAX_FINANCE_CONNECTIONS, PROVIDERS, type ServerProviderState } from "@/lib/integrations/catalog";
import { CALLBACK_ERRORS, useServerStatus } from "@/lib/integrations/client";
import { CocosCard, CustomSourceCards, MercadoPagoCard, type FinanceCtx } from "@/features/integrations/finance-cards";
import { GoogleCalendarCard, NotionCard } from "@/features/integrations/calendar-cards";

const LEVEL_TEXT = { supported: "✓ Supported", partial: "◐ Partial", csv: "⇪ CSV", unsupported: "✕ No", unverified: "? Unverified" } as const;

function IntegrationsInner() {
  const db = useDb();
  const params = useSearchParams();
  const router = useRouter();
  const { status, refresh } = useServerStatus();
  const [banner, setBanner] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [justConnected, setJustConnected] = useState<string | null>(null);
  const handled = useRef(false);

  const server = useMemo(() => {
    const out: Record<string, ServerProviderState | undefined> = {};
    if (status.state === "ready") for (const p of status.data.providers) out[p.provider] = p;
    return out;
  }, [status]);
  const serverUnavailable = status.state === "unavailable" || (status.state === "ready" && !status.data.core.ok);
  const localActive = db.integrationSources.filter((s) => s.status === "active");
  const serverFinance = Object.values(server).filter((p) => p?.connection && PROVIDERS.find((x) => x.id === p.provider)?.group === "finance").map((p) => p!.provider);
  const activeCount = activeFinanceCount({ localActiveProviders: localActive.map((s) => s.provider), serverConnected: serverFinance });
  const ctx: FinanceCtx = { server, serverUnavailable, activeCount, limitReached: activeCount >= MAX_FINANCE_CONNECTIONS, refresh };

  // OAuth return: trust only the server's verified status, never the query string alone.
  useEffect(() => {
    if (handled.current || status.state !== "ready") return;
    const connected = params.get("connected");
    const error = params.get("error");
    if (!connected && !error) return;
    handled.current = true;
    const provider = connected ?? params.get("provider") ?? "";
    const name = PROVIDERS.find((p) => p.id === provider)?.name ?? "The provider";
    if (connected) {
      const conn = server[connected]?.connection;
      if (conn?.status === "connected") {
        setBanner({ tone: "ok", text: `${name} connected and verified as ${conn.accountLabel}.` });
        toast(`${name} connected`);
        setJustConnected(connected);
        if (connected === "mercadopago") {
          const existing = db.integrationSources.find((s) => s.provider === "mercadopago" && s.status === "active");
          if (existing) actions().update("integrationSources", existing.id, { kind: "oauth" });
          else actions().addSource({ provider: "mercadopago", name: "Mercado Pago", kind: "oauth", accountId: null, reviewAll: false }, []);
        }
      } else setBanner({ tone: "error", text: `${name} didn't finish connecting — the server couldn't confirm the connection.` });
    } else if (error) setBanner({ tone: "error", text: `${name}: ${CALLBACK_ERRORS[error] ?? "The connection failed."}` });
    router.replace("/settings/integrations", { scroll: false });
  }, [status, params, server, router, db.integrationSources]);

  return (
    <>
      <Link href="/settings" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink"><ChevronLeft className="size-4" /> Settings</Link>
      <PageHeader title="Integrations & connections" description="Connect supported services to Finance and Activities. Every connection is read-only, and statuses reflect what the server has actually verified." />
      <div className="flex flex-col gap-5">
        {banner ? (
          <div role="status" className={cn("flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm", banner.tone === "ok" ? "border-positive/30 bg-positive-soft text-positive" : "border-negative/30 bg-negative-soft text-negative")}>
            {banner.tone === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
            <p>{banner.text}</p>
          </div>
        ) : null}

        <div className="flex items-start gap-3 rounded-md border border-line bg-surface p-3 text-sm text-ink-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-finance" />
          <p>
            You sign in on each provider&apos;s own page — this app never asks for passwords, 2FA codes or API secrets. Access tokens are encrypted on the server and never reach the browser. No payments, transfers or trades can be made through any integration.
          </p>
        </div>

        {status.state === "loading" ? <Skeleton className="h-16 rounded-lg" /> : null}
        {serverUnavailable ? (
          <div className="flex items-start gap-3 rounded-md border border-dashed border-line-strong bg-subtle p-3 text-sm">
            <Wrench className="mt-0.5 size-4 shrink-0 text-ink-3" />
            <div>
              <p className="font-medium text-ink">Automatic connections require developer configuration</p>
              <p className="mt-0.5 text-ink-2">
                {status.state === "unavailable" ? status.message : `Missing server settings: ${[...(status.state === "ready" ? status.data.core.missing : [])].join(", ") || "—"}${status.state === "ready" && status.data.core.problems.length ? `. ${status.data.core.problems.join(". ")}` : ""}.`} CSV imports and manual entries still work. Setup steps are in <code className="rounded bg-muted px-1">docs/INTEGRATIONS.md</code>.
              </p>
            </div>
          </div>
        ) : null}

        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Finance, payments & investments</h2>
              <p className="text-sm text-ink-3">Up to {MAX_FINANCE_CONNECTIONS} providers at a time. Imported rows go through review before they affect your summaries.</p>
            </div>
            <div className="w-56">
              <div className="mb-1 flex justify-between text-sm"><span className="text-ink-2">Connected providers</span><span className="num font-semibold">{activeCount} / {MAX_FINANCE_CONNECTIONS}</span></div>
              <ProgressBar value={activeCount / MAX_FINANCE_CONNECTIONS} tone={ctx.limitReached ? "warning" : "finance"} size="sm" label="Financial providers in use" />
            </div>
          </div>
          {ctx.limitReached ? (
            <p className="mb-3 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Limit reached. To add another provider, disconnect one first — transactions imported from it are kept.
            </p>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <MercadoPagoCard ctx={ctx} />
            <CocosCard ctx={ctx} />
            <CustomSourceCards ctx={ctx} />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Calendars</h2>
          <p className="mb-3 text-sm text-ink-3">Separate from the financial limit. External events are shown read-only next to your own events.</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <GoogleCalendarCard ctx={{ server, serverUnavailable, refresh }} autoSync={justConnected === "google"} />
            <NotionCard ctx={{ server, serverUnavailable, refresh }} />
          </div>
        </section>

        <CapabilityReport />
      </div>
    </>
  );
}

function CapabilityReport() {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader title="Capability report" subtitle="What each provider's official documentation supports — checked before implementation." action={<button onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">{open ? "Hide" : "Show"} <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} /></button>} />
      {open ? (
        <CardBody className="flex flex-col gap-5">
          {PROVIDERS.map((p) => (
            <div key={p.id}>
              <p className="mb-1 font-medium">{p.name}</p>
              <table className="w-full text-sm">
                <tbody>
                  {p.capabilities.map((c) => (
                    <tr key={c.label} className="border-b border-line/70 last:border-0">
                      <td className="py-1.5 pr-3 text-ink">{c.label}{c.note ? <span className="block text-caption text-ink-3">{c.note}</span> : null}</td>
                      <td className="w-32 py-1.5 text-right text-caption font-medium text-ink-2">{LEVEL_TEXT[c.level]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <p className="text-caption text-ink-3">Full report with sources: docs/INTEGRATIONS.md. Live connections were not exercised without real developer credentials.</p>
        </CardBody>
      ) : null}
    </Card>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense>
      <IntegrationsInner />
    </Suspense>
  );
}
