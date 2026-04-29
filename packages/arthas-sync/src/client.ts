// =============================================================================
// arthas-sync — Supabase client factory
// =============================================================================
//
// `createSupabaseClient` returns either a configured client or `null` when env
// vars are missing. Sync is opt-in (per the v0.5 plan), so a missing config
// must NOT throw — the engine + lease helpers no-op cleanly when handed null.
//
// Realtime is configured eagerly (ten events/sec rate limit, auto-reconnect).
// We don't enable persisted auth here because device-code flow stores tokens
// out-of-band in the OS keychain via the consumer (`packages/opencode/src/auth`).
// =============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export interface SupabaseEnv {
  readonly SUPABASE_URL?: string | undefined
  readonly SUPABASE_ANON_KEY?: string | undefined
}

export interface CreateClientOptions {
  readonly accessToken?: string | undefined
  readonly realtimeEventsPerSecond?: number | undefined
}

const DEFAULT_REALTIME_RATE = 10

export const createSupabaseClient = (
  env: SupabaseEnv,
  options: CreateClientOptions = {},
): SupabaseClient | null => {
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_ANON_KEY
  if (!url || !key) return null

  const client = createClient(url, key, {
    auth: {
      // Token persistence is the consumer's job (keytar / OS keychain) — we
      // don't want supabase-js touching localStorage in a CLI context.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        eventsPerSecond: options.realtimeEventsPerSecond ?? DEFAULT_REALTIME_RATE,
      },
    },
    global: options.accessToken
      ? {
          headers: { Authorization: `Bearer ${options.accessToken}` },
        }
      : undefined,
  })

  return client
}

export type { SupabaseClient }
