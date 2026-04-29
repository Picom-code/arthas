-- =============================================================================
-- Arthas sync schema — initial migration
-- =============================================================================
-- Tables backing optional cross-device sync. RLS lives in 0002_rls.sql; the
-- realtime publication add lives in 0003_realtime.sql. Schema decisions:
--
--   * `session_events` is append-only with a server-assigned `seq` per session.
--     Clients propose `client_seq` for idempotency/dedupe but never trust their
--     own ordering across devices — the trigger below assigns canonical seq.
--   * `sessions.active_executor_*` columns implement the executor lease used
--     by `packages/arthas-sync/src/lease.ts`.
--   * `mcp_configs.device_scope` lets a user pin an MCP server to a single
--     device (e.g. a workstation-only filesystem MCP) without leaking it to
--     other machines.
-- =============================================================================

-- profiles --------------------------------------------------------------------
-- Mirrors auth.users. Auto-populated by a trigger on auth.users insert so we
-- can FK from every other table without exposing auth.users to PostgREST.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  display_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- sessions --------------------------------------------------------------------
-- One row per user-facing chat session. Owners are profile rows. The
-- `active_executor_*` pair encodes the executor lease: at most one device per
-- session may execute the agent loop. `arthas resume` updates these.
create table if not exists public.sessions (
  id                            uuid primary key default gen_random_uuid (),
  owner                         uuid not null references public.profiles (id) on delete cascade,
  title                         text,
  cwd                           text,
  active_executor_id            text,
  active_executor_lease_until   timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  archived                      boolean not null default false
);

create index if not exists sessions_owner_updated_idx
  on public.sessions (owner, updated_at desc);

create index if not exists sessions_owner_archived_idx
  on public.sessions (owner, archived);

-- session_events --------------------------------------------------------------
-- Append-only event log. `seq` is server-assigned by the trigger below; we do
-- NOT trust client-side seq because clocks drift, retries dup, and concurrent
-- executors on a session would clobber each other's numbering. The unique
-- constraint catches both replays and the (rare) trigger race.
create table if not exists public.session_events (
  id            bigserial primary key,
  session_id    uuid not null references public.sessions (id) on delete cascade,
  seq           int not null,
  kind          text not null,
  payload       jsonb not null,
  author_device text,
  client_seq    bigint,
  created_at    timestamptz not null default now(),
  unique (session_id, seq)
);

create index if not exists session_events_session_seq_idx
  on public.session_events (session_id, seq);

create index if not exists session_events_session_created_idx
  on public.session_events (session_id, created_at);

-- Server-assigned seq trigger.
--
-- Why we don't trust client-side seq:
--   * Multiple devices may be pushing concurrently; their local sequences are
--     independent and would collide on `unique (session_id, seq)`.
--   * Network retries can re-deliver the same logical event; idempotency is
--     handled by `client_seq` (caller-provided dedupe key) but ordering must
--     be stamped server-side.
--   * Clock drift across devices means a "later" event from device A could
--     have an earlier client timestamp than an earlier event from device B.
--
-- The trigger uses `coalesce(max(seq), 0) + 1` under row-level lock; with the
-- `unique (session_id, seq)` constraint, a concurrent insert that loses the
-- race will fail and the client retries.
create or replace function public.assign_session_event_seq()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.seq is null or new.seq = 0 then
    select coalesce(max(seq), 0) + 1
      into new.seq
      from public.session_events
     where session_id = new.session_id
       for update;
  end if;
  return new;
end;
$$;

drop trigger if exists session_events_assign_seq on public.session_events;
create trigger session_events_assign_seq
  before insert on public.session_events
  for each row
  execute function public.assign_session_event_seq ();

-- user_settings ---------------------------------------------------------------
-- Last-writer-wins settings blob. Per the plan, *no* secrets in here — API
-- keys, OAuth tokens, encryption material stay device-local in keychain.
create table if not exists public.user_settings (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- mcp_configs -----------------------------------------------------------------
-- Synced MCP server registrations. `device_scope` (nullable) pins a config
-- to a specific device id so a workstation-only filesystem MCP doesn't leak
-- to a phone PWA.
create table if not exists public.mcp_configs (
  id           uuid primary key default gen_random_uuid (),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  name         text not null,
  command      text,
  transport    text not null,
  url          text,
  env          jsonb not null default '{}'::jsonb,
  enabled      boolean not null default true,
  device_scope text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists mcp_configs_user_idx
  on public.mcp_configs (user_id);

-- devices ---------------------------------------------------------------------
-- Registry of devices a user has paired via `arthas kneel`. `capabilities`
-- captures which MCP servers / models the device can run.
create table if not exists public.devices (
  id            uuid primary key default gen_random_uuid (),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  name          text not null,
  platform      text,
  last_seen_at  timestamptz,
  capabilities  jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists devices_user_idx
  on public.devices (user_id);

-- updated_at touches ----------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at ();

drop trigger if exists sessions_touch_updated_at on public.sessions;
create trigger sessions_touch_updated_at
  before update on public.sessions
  for each row execute function public.touch_updated_at ();

drop trigger if exists user_settings_touch_updated_at on public.user_settings;
create trigger user_settings_touch_updated_at
  before update on public.user_settings
  for each row execute function public.touch_updated_at ();

drop trigger if exists mcp_configs_touch_updated_at on public.mcp_configs;
create trigger mcp_configs_touch_updated_at
  before update on public.mcp_configs
  for each row execute function public.touch_updated_at ();
