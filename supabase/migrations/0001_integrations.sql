-- Personal Life OS — integration storage (server-side only)
--
-- Access model
--   * The Next.js server talks to these tables with the service-role key
--     (SUPABASE_SERVICE_ROLE_KEY), which bypasses RLS and never reaches browsers.
--   * owner_id is the app's signed anonymous session id today. When Supabase Auth
--     is added, store auth.uid()::text in owner_id; the RLS policies below then let
--     an authenticated user read only their own connection metadata and sync runs.
--   * integration_tokens has RLS enabled and NO policies: anon/authenticated roles
--     can never read ciphertext, only the service role can.
--   * Token ciphertext is AES-256-GCM produced by the server with
--     INTEGRATIONS_ENCRYPTION_KEY and bound to owner+provider (AAD). The database
--     never sees plaintext tokens.

create extension if not exists pgcrypto;

create table if not exists public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  provider text not null check (provider in ('google', 'mercadopago', 'notion')),
  status text not null check (status in ('connected', 'expired', 'error')),
  account_label text,
  external_account_id text,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  last_verified_at timestamptz,
  last_sync_at timestamptz,
  last_error jsonb,
  token_expires_at timestamptz,
  unique (owner_id, provider)
);

create table if not exists public.integration_tokens (
  account_id uuid primary key references public.integration_accounts(id) on delete cascade,
  owner_id text not null,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_sync_runs (
  id text primary key,
  owner_id text not null,
  provider text not null,
  action text not null check (action in ('connect', 'verify', 'sync', 'refresh', 'disconnect')),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  ok boolean not null,
  item_count integer not null default 0,
  error_code text -- codes only; never tokens, codes or response bodies
);

create index if not exists integration_sync_runs_owner_idx on public.integration_sync_runs (owner_id, provider, started_at desc);

alter table public.integration_accounts enable row level security;
alter table public.integration_tokens enable row level security;
alter table public.integration_sync_runs enable row level security;

-- Authenticated users (once Supabase Auth is enabled) may read their own metadata only.
drop policy if exists "own integration accounts" on public.integration_accounts;
create policy "own integration accounts" on public.integration_accounts
  for select to authenticated using (owner_id = auth.uid()::text);

drop policy if exists "own sync runs" on public.integration_sync_runs;
create policy "own sync runs" on public.integration_sync_runs
  for select to authenticated using (owner_id = auth.uid()::text);

-- No policies on integration_tokens: deny all for anon/authenticated.
revoke all on public.integration_tokens from anon, authenticated;
