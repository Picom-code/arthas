-- =============================================================================
-- Arthas sync — Realtime publication
-- =============================================================================
-- Only `session_events` joins the realtime publication. Other tables (sessions,
-- mcp_configs, user_settings, devices) sync via REST + manual polling because
-- they're low-frequency LWW state. Adding them to the realtime publication
-- would be too chatty (every settings touch fanning out to every device).
-- =============================================================================

alter publication supabase_realtime add table public.session_events;
