import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@/lib/store";
import { emptyDatabase } from "@/lib/data/defaults";
import { activeFinanceCount, canAddFinanceConnection, computeStatus, providerInfo, type ServerProviderState } from "@/lib/integrations/catalog";
import { stageRecords, type RawRecord } from "@/lib/integrations/importer";
import { autoMap, detectPreset, HOLDING_FIELDS, rowsToHoldings, rowsToRaw, TX_FIELDS } from "@/lib/integrations/csv-presets";
import { normalizeGoogleEvents, normalizeNotionPages } from "@/lib/integrations/normalize";
import { parseCSV } from "@/lib/data/csv";
import { externalEventsBetween } from "@/lib/calc/productivity";
import { balanceSummary, periodTotals } from "@/lib/calc/finance";
import type { Account, CalendarEvent } from "@/lib/domain/types";

const S = () => useStore.getState();
const acc: Account = { id: "acc-mp", name: "Mercado Pago wallet", type: "checking", currency: "ARS", openingBalance: 0, openingDate: "2026-01-01", color: "", archived: false, createdAt: "" };

beforeEach(() => {
  const db = emptyDatabase();
  db.profile.currency = "ARS";
  db.accounts = [acc, { ...acc, id: "acc-bank", name: "Bank" }];
  useStore.setState({ db, hydrated: true });
});

describe("status model", () => {
  const google = providerInfo("google")!;
  const mp = providerInfo("mercadopago")!;
  const conn = (p: Partial<NonNullable<ServerProviderState["connection"]>> = {}): ServerProviderState => ({ provider: "google", configured: true, missing: [], connection: { provider: "google", status: "connected", accountLabel: "me", externalAccountId: "me", scopes: [], connectedAt: "2026-10-01T00:00:00Z", lastVerifiedAt: "2026-10-01T00:00:00Z", lastSyncAt: "2026-10-14T10:00:00Z", lastError: null, ...p } });
  const now = Date.parse("2026-10-14T12:00:00Z");
  it("never reports connected without a verified server connection", () => {
    expect(computeStatus({ info: google, server: { provider: "google", configured: false, missing: ["GOOGLE_CLIENT_ID"], connection: null } })).toBe("needs_config");
    expect(computeStatus({ info: google, serverUnavailable: true })).toBe("needs_config");
    expect(computeStatus({ info: google, server: { provider: "google", configured: true, missing: [], connection: null } })).toBe("available");
    expect(computeStatus({ info: mp, localCsvActive: true })).toBe("manual_import");
    expect(computeStatus({ info: providerInfo("cocos")!, localCsvActive: false })).toBe("manual_import");
  });
  it("derives connected / sync required / expired / error", () => {
    expect(computeStatus({ info: google, server: conn(), now })).toBe("connected");
    expect(computeStatus({ info: google, server: conn({ lastSyncAt: null }), now })).toBe("sync_required");
    expect(computeStatus({ info: google, server: conn({ lastSyncAt: "2026-10-10T00:00:00Z" }), now })).toBe("sync_required");
    expect(computeStatus({ info: google, server: conn({ status: "expired" }), now })).toBe("expired");
    expect(computeStatus({ info: google, server: conn({ lastError: { code: "network", message: "x", at: "2026-10-14T11:00:00Z" } }), now })).toBe("error");
  });
});

describe("three-provider financial limit", () => {
  it("counts each provider once and every custom provider separately", () => {
    expect(activeFinanceCount({ localActiveProviders: ["mercadopago", "custom", "custom"], serverConnected: ["mercadopago"] })).toBe(3);
    expect(canAddFinanceConnection(3).ok).toBe(false);
    expect(canAddFinanceConnection(2).ok).toBe(true);
  });
  it("blocks a fourth provider until one is disconnected; calendars don't count", () => {
    const add = (provider: "mercadopago" | "cocos" | "custom", name: string) => S().addSource({ provider, name, kind: "csv", accountId: null, reviewAll: false }, []);
    expect(add("mercadopago", "MP").ok).toBe(true);
    expect(add("mercadopago", "MP again").ok).toBe(false);
    expect(add("cocos", "Cocos").ok).toBe(true);
    const third = add("custom", "Bank A");
    expect(third.ok).toBe(true);
    const fourth = add("custom", "Bank B");
    expect(fourth.ok).toBe(false);
    S().setCalendarSource("google", { selected: ["x"] }); // calendar config is independent
    S().disconnectSource((third as { id: string }).id);
    expect(add("custom", "Bank B").ok).toBe(true);
  });
  it("includes server-side connections in the count", () => {
    S().addSource({ provider: "cocos", name: "Cocos", kind: "csv", accountId: null, reviewAll: false }, []);
    S().addSource({ provider: "custom", name: "A", kind: "csv", accountId: null, reviewAll: false }, []);
    expect(S().addSource({ provider: "custom", name: "B", kind: "csv", accountId: null, reviewAll: false }, ["mercadopago"]).ok).toBe(false);
  });
});

describe("import staging, review and duplicates", () => {
  const rows: RawRecord[] = [
    { externalId: "mp:1", date: "2026-10-10", signedAmount: 150050, currency: "ARS", description: "Logo design", providerStatus: "approved", fee: 9003 },
    { externalId: "mp:2", date: "2026-10-11", signedAmount: -20000, currency: "ARS", description: "Coffee", providerStatus: "approved" },
    { externalId: "mp:3", date: "2026-10-12", signedAmount: -50000, currency: "ARS", description: "Transferencia a cuenta propia", providerStatus: "approved" },
    { externalId: "mp:4", date: "2026-10-12", signedAmount: 1000, currency: "ARS", description: "Refund", providerStatus: "rejected" },
    { externalId: "mp:5", date: "2026-10-13", signedAmount: null, absAmount: 7000, currency: "ARS", description: "Unknown payment", providerStatus: "approved" },
  ];
  const setup = (reviewAll = false) => {
    const r = S().addSource({ provider: "mercadopago", name: "Mercado Pago", kind: "oauth", accountId: "acc-mp", reviewAll }, []);
    return (r as { id: string }).id;
  };

  it("auto-accepts only clean rows and keeps ambiguous ones out of summaries", () => {
    const src = setup();
    const run = S().stageImport(src, rows, { kind: "api" })!;
    expect(run).toMatchObject({ added: 5, accepted: 2, needsReview: 2, ignored: 1, duplicates: 0 });
    const db = S().db;
    // Income 1500.50 + fee expense 90.03 + coffee 200 — the transfer and the unknown row are not counted yet.
    const totals = periodTotals(db.transactions, { start: "2026-10-01", end: "2026-10-31" });
    expect(totals.income).toBe(150050);
    expect(totals.expenses).toBe(9003 + 20000);
    expect(db.transactions.every((t) => t.source?.provider === "mercadopago")).toBe(true);
    expect(db.transactions.find((t) => t.description.includes("fees"))?.source?.externalId).toBe("mp:1:fee");
    const pending = db.importedRecords.filter((r) => r.state === "pending");
    expect(pending.map((r) => r.externalId).sort()).toEqual(["mp:3", "mp:5"]);
    expect(pending.find((r) => r.externalId === "mp:3")!.issues.join()).toMatch(/transfer/i);
  });

  it("never imports the same provider record twice", () => {
    const src = setup();
    S().stageImport(src, rows, { kind: "api" });
    const before = S().db.transactions.length;
    const again = S().stageImport(src, rows, { kind: "api" })!;
    expect(again).toMatchObject({ added: 0, duplicates: 5 });
    expect(S().db.transactions.length).toBe(before);
  });

  it("makes CSV re-imports idempotent via fingerprints while keeping genuine same-day repeats", () => {
    const src = setup();
    const csvRows: RawRecord[] = [
      { externalId: null, date: "2026-10-05", signedAmount: -1500, currency: "ARS", description: "Subte" },
      { externalId: null, date: "2026-10-05", signedAmount: -1500, currency: "ARS", description: "Subte" },
    ];
    expect(S().stageImport(src, csvRows, { kind: "csv" })!.added).toBe(2);
    expect(S().stageImport(src, csvRows, { kind: "csv" })!).toMatchObject({ added: 0, duplicates: 2 });
  });

  it("flags rows that look like an existing manual transaction and can link instead of duplicating", () => {
    S().add("transactions", { type: "expense", amount: 20000, accountId: "acc-mp", categoryId: null, date: "2026-10-10", description: "Café con amigos", tags: [] });
    const src = setup();
    S().stageImport(src, [rows[1]], { kind: "api" });
    const rec = S().db.importedRecords[0];
    expect(rec.state).toBe("pending");
    expect(rec.duplicateOfId).toBeTruthy();
    expect(S().resolveRecord(rec.id, { as: "link", transactionId: rec.duplicateOfId! }).ok).toBe(true);
    const txs = S().db.transactions;
    expect(txs).toHaveLength(1);
    expect(txs[0].source?.externalId).toBe("mp:2");
    expect(S().db.importedRecords[0].state).toBe("duplicate");
  });

  it("resolves review items as transfer (balance-neutral), income, or rejection", () => {
    const src = setup(true);
    S().stageImport(src, rows, { kind: "api" });
    const byId = (id: string) => S().db.importedRecords.find((r) => r.externalId === id)!;
    expect(S().db.transactions).toHaveLength(0); // reviewAll: nothing counts yet
    S().resolveRecord(byId("mp:3").id, { as: "transfer", toAccountId: "acc-bank", direction: "out" });
    S().resolveRecord(byId("mp:5").id, { as: "reject" });
    S().resolveRecord(byId("mp:1").id, { as: "income" });
    const db = S().db;
    expect(periodTotals(db.transactions, { start: "2026-10-01", end: "2026-10-31" })).toMatchObject({ income: 150050, expenses: 9003 });
    const bal = balanceSummary(db.accounts, db.transactions, "ARS");
    expect(bal.byAccount.find((b) => b.account.id === "acc-bank")!.balance).toBe(50000);
    expect(byId("mp:5").state).toBe("rejected");
    expect(S().resolveRecord(byId("mp:1").id, { as: "income" }).ok).toBe(false); // can't accept twice
  });

  it("requires a linked account before accepting", () => {
    const r = S().addSource({ provider: "custom", name: "Bank", kind: "csv", accountId: null, reviewAll: false }, []);
    const id = (r as { id: string }).id;
    S().stageImport(id, [rows[1]], { kind: "csv" });
    const rec = S().db.importedRecords[0];
    expect(rec.issues.join()).toMatch(/Link this source/);
    expect(S().resolveRecord(rec.id, { as: "expense" }).ok).toBe(false);
  });

  it("keeps imported history when a provider is disconnected", () => {
    const src = setup();
    S().stageImport(src, rows, { kind: "api" });
    const before = S().db.transactions.length;
    S().disconnectSource(src);
    expect(S().db.transactions.length).toBe(before);
    expect(S().db.importRuns).toHaveLength(1);
    expect(S().db.integrationSources[0].status).toBe("disconnected");
  });

  it("warns about currency mismatches instead of silently converting", () => {
    const res = stageRecords([{ externalId: "x", date: "2026-10-01", signedAmount: -100, currency: "USD", description: "Netflix" }], { provider: "custom", sourceId: "s", runId: "r", account: acc, reviewAll: false, transactions: [], existing: [] });
    expect(res.records[0].issues.join()).toMatch(/USD differs/);
  });
});

describe("CSV presets", () => {
  it("detects a Mercado Pago account report and maps credit/debit columns", () => {
    const csv = parseCSV("DATE,SOURCE_ID,RECORD_TYPE,DESCRIPTION,NET_CREDIT_AMOUNT,NET_DEBIT_AMOUNT,CURRENCY\n2026-10-01T10:00:00.000-03:00,123,release,payment,1500.00,0.00,ARS\n2026-10-02T10:00:00.000-03:00,124,release,withdrawal,0.00,300.50,ARS\n");
    expect(detectPreset(csv[0]).id).toBe("mercadopago-report");
    const map = autoMap(csv[0], TX_FIELDS);
    // DESCRIPTION wins over RECORD_TYPE for the description; RECORD_TYPE becomes the type hint.
    expect(map).toMatchObject({ date: 0, externalId: 1, type: 2, description: 3, credit: 4, debit: 5, currency: 6 });
    const { raw, errors } = rowsToRaw(csv.slice(1), map, "ymd");
    expect(errors).toEqual([]);
    expect(raw.map((r) => [r.externalId, r.date, r.signedAmount])).toEqual([["123", "2026-10-01", 150000], ["124", "2026-10-02", -30050]]);
  });
  it("maps Spanish statement headers and reports unreadable rows", () => {
    const csv = parseCSV("Fecha;Concepto;Importe;Moneda\n05/10/2026;Supermercado;-12.345,60;ARS\nmal;x;1;ARS\n");
    const map = autoMap(csv[0], TX_FIELDS);
    const { raw, errors } = rowsToRaw(csv.slice(1), map, "dmy");
    expect(raw[0]).toMatchObject({ date: "2026-10-05", signedAmount: -1234560, description: "Supermercado" });
    expect(errors[0].line).toBe(3);
  });
  it("parses holdings with fractional quantities and keeps missing prices empty", () => {
    const csv = parseCSV("Especie,Cantidad,Moneda,Precio,Valuación,Fecha\nAL30,1500,ARS,820.5,1230750,14/10/2026\nFCI Ahorro,1234.567891,ARS,,98000,14/10/2026\n");
    const { holdings } = rowsToHoldings(csv.slice(1), autoMap(csv[0], HOLDING_FIELDS), "dmy");
    expect(holdings[0]).toMatchObject({ symbol: "AL30", quantity: 1500, price: 82050, valuation: 123075000, date: "2026-10-14" });
    expect(holdings[1]).toMatchObject({ quantity: 1234.567891, price: null });
  });
});

describe("calendar normalization", () => {
  const cal = { id: "me@example.com", name: "Me", color: "#123" };
  it("converts instants to the user's timezone (including date changes)", () => {
    const items = [{ id: "a", summary: "Late call", start: { dateTime: "2026-10-14T23:30:00Z" }, end: { dateTime: "2026-10-15T00:30:00Z" } }];
    expect(normalizeGoogleEvents(items, cal, "America/New_York")[0]).toMatchObject({ date: "2026-10-14", startTime: "19:30", endTime: "20:30" });
    expect(normalizeGoogleEvents(items, cal, "Asia/Tokyo")[0]).toMatchObject({ date: "2026-10-15", startTime: "08:30", endTime: "09:30" });
    // DST boundary in New York (Nov 1 2026): wall time stays correct after the change.
    expect(normalizeGoogleEvents([{ id: "d", start: { dateTime: "2026-11-02T14:00:00Z" }, end: { dateTime: "2026-11-02T15:00:00Z" } }], cal, "America/New_York")[0].startTime).toBe("09:00");
  });
  it("handles all-day spans (exclusive end), recurring instances, cancellations and cross-calendar duplicates", () => {
    const seen = new Set<string>();
    const out = normalizeGoogleEvents([
      { id: "trip", summary: "Trip", start: { date: "2026-10-20" }, end: { date: "2026-10-23" } },
      { id: "std_20261014", recurringEventId: "std", iCalUID: "std@google", summary: "Standup", start: { dateTime: "2026-10-14T13:00:00Z" }, end: { dateTime: "2026-10-14T13:15:00Z" } },
      { id: "std_20261015", recurringEventId: "std", iCalUID: "std@google", summary: "Standup", start: { dateTime: "2026-10-15T13:00:00Z" }, end: { dateTime: "2026-10-15T13:15:00Z" } },
      { id: "gone", status: "cancelled", start: { dateTime: "2026-10-14T13:00:00Z" }, end: { dateTime: "2026-10-14T14:00:00Z" } },
    ], cal, "UTC", seen);
    expect(out.filter((e) => e.externalId === "trip").map((e) => e.date)).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
    expect(out.filter((e) => e.title === "Standup").map((e) => e.date)).toEqual(["2026-10-14", "2026-10-15"]);
    expect(out.some((e) => e.externalId === "gone")).toBe(false);
    // Same event visible through a second selected calendar is not added twice.
    const second = normalizeGoogleEvents([{ id: "std_20261014", iCalUID: "std@google", summary: "Standup", start: { dateTime: "2026-10-14T13:00:00Z" }, end: { dateTime: "2026-10-14T13:15:00Z" } }], { ...cal, id: "team" }, "UTC", seen);
    expect(second).toHaveLength(0);
  });
  it("maps Notion database entries with date properties", () => {
    const out = normalizeNotionPages([
      { id: "p1", url: "https://notion.so/p1", properties: { Name: { type: "title", title: [{ plain_text: "Essay due" }] }, When: { type: "date", date: { start: "2026-10-20" } } } },
      { id: "p2", properties: { Name: { type: "title", title: [{ plain_text: "Call" }] }, When: { type: "date", date: { start: "2026-10-21T15:00:00.000-03:00", end: "2026-10-21T16:00:00.000-03:00" } } } },
      { id: "p3", properties: { Name: { type: "title", title: [] }, When: { type: "date", date: null } } },
    ], { id: "db", name: "Uni", dateProperty: "When" }, "America/Argentina/Buenos_Aires");
    expect(out.map((e) => [e.title, e.date, e.startTime, e.allDay])).toEqual([["Essay due", "2026-10-20", null, true], ["Call", "2026-10-21", "15:00", false]]);
  });
  it("hides external events that a local event already represents", () => {
    const local: CalendarEvent[] = [{ id: "l", createdAt: "", title: "Dentist", date: "2026-10-16", allDay: false, startTime: "10:00", endTime: "10:45", color: "", recurrence: null, exDates: [], projectId: null }];
    const ext = normalizeGoogleEvents([{ id: "g1", summary: "dentist", start: { dateTime: "2026-10-16T10:00:00Z" }, end: { dateTime: "2026-10-16T10:45:00Z" } }, { id: "g2", summary: "Lunch", start: { dateTime: "2026-10-16T12:00:00Z" }, end: { dateTime: "2026-10-16T13:00:00Z" } }], cal, "UTC");
    expect(externalEventsBetween(ext, local, "2026-10-16", "2026-10-16").map((e) => e.title)).toEqual(["Lunch"]);
  });
});
