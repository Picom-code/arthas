-- =============================================================================
-- Arthas sync — Row-Level Security policies
-- =============================================================================
-- Owner-reads-own-rows pattern keyed off auth.uid(). Every table created in
-- 0001_init.sql gets RLS enabled here on day one (non-negotiable per the
-- sync-engineer playbook). Service-role keys bypass RLS by design.
-- =============================================================================

-- profiles --------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select"
  on public.profiles for select
  using (auth.uid () = id);

drop policy if exists "profiles_self_insert" on public.profiles;
create policy "profiles_self_insert"
  on public.profiles for insert
  with check (auth.uid () = id);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
  on public.profiles for update
  using (auth.uid () = id)
  with check (auth.uid () = id);

-- sessions --------------------------------------------------------------------
alter table public.sessions enable row level security;

drop policy if exists "sessions_owner_select" on public.sessions;
create policy "sessions_owner_select"
  on public.sessions for select
  using (auth.uid () = owner);

drop policy if exists "sessions_owner_insert" on public.sessions;
create policy "sessions_owner_insert"
  on public.sessions for insert
  with check (auth.uid () = owner);

drop policy if exists "sessions_owner_update" on public.sessions;
create policy "sessions_owner_update"
  on public.sessions for update
  using (auth.uid () = owner)
  with check (auth.uid () = owner);

drop policy if exists "sessions_owner_delete" on public.sessions;
create policy "sessions_owner_delete"
  on public.sessions for delete
  using (auth.uid () = owner);

-- session_events --------------------------------------------------------------
-- Append-only: select + insert for the owner of the parent session. No update,
-- no delete (events are superseded by new events, never mutated).
alter table public.session_events enable row level security;

drop policy if exists "session_events_owner_select" on public.session_events;
create policy "session_events_owner_select"
  on public.session_events for select
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_events.session_id
        and s.owner = auth.uid ()
    )
  );

drop policy if exists "session_events_owner_insert" on public.session_events;
create policy "session_events_owner_insert"
  on public.session_events for insert
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = session_events.session_id
        and s.owner = auth.uid ()
    )
  );

-- user_settings ---------------------------------------------------------------
alter table public.user_settings enable row level security;

drop policy if exists "user_settings_self_select" on public.user_settings;
create policy "user_settings_self_select"
  on public.user_settings for select
  using (auth.uid () = user_id);

drop policy if exists "user_settings_self_upsert" on public.user_settings;
create policy "user_settings_self_upsert"
  on public.user_settings for insert
  with check (auth.uid () = user_id);

drop policy if exists "user_settings_self_update" on public.user_settings;
create policy "user_settings_self_update"
  on public.user_settings for update
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

-- mcp_configs -----------------------------------------------------------------
alter table public.mcp_configs enable row level security;

drop policy if exists "mcp_configs_owner_select" on public.mcp_configs;
create policy "mcp_configs_owner_select"
  on public.mcp_configs for select
  using (auth.uid () = user_id);

drop policy if exists "mcp_configs_owner_insert" on public.mcp_configs;
create policy "mcp_configs_owner_insert"
  on public.mcp_configs for insert
  with check (auth.uid () = user_id);

drop policy if exists "mcp_configs_owner_update" on public.mcp_configs;
create policy "mcp_configs_owner_update"
  on public.mcp_configs for update
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

drop policy if exists "mcp_configs_owner_delete" on public.mcp_configs;
create policy "mcp_configs_owner_delete"
  on public.mcp_configs for delete
  using (auth.uid () = user_id);

-- devices ---------------------------------------------------------------------
alter table public.devices enable row level security;

drop policy if exists "devices_owner_select" on public.devices;
create policy "devices_owner_select"
  on public.devices for select
  using (auth.uid () = user_id);

drop policy if exists "devices_owner_insert" on public.devices;
create policy "devices_owner_insert"
  on public.devices for insert
  with check (auth.uid () = user_id);

drop policy if exists "devices_owner_update" on public.devices;
create policy "devices_owner_update"
  on public.devices for update
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

drop policy if exists "devices_owner_delete" on public.devices;
create policy "devices_owner_delete"
  on public.devices for delete
  using (auth.uid () = user_id);
