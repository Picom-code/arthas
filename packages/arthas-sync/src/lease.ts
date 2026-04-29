// =============================================================================
// arthas-sync — Executor lease helpers
// =============================================================================
//
// At most one device executes the agent loop per session. We model the lease
// as two columns on `sessions`:
//
//   * `active_executor_id` — opaque device id that holds the lease
//   * `active_executor_lease_until` — timestamptz; lease is valid while now()
//     is before this value, otherwise considered expired and reclaimable.
//
// Heartbeat cadence: 10s. Lease TTL: 30s. If a device misses three beats the
// lease auto-expires and another device can claim. Explicit takeover via
// `arthas resume` is just `claimLease` ignoring the existing lease (we use
// a conditional update so a lost race surfaces as `acquired: false`).
//
// All helpers no-op gracefully when `client` is null.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js"

const DEFAULT_LEASE_TTL_MS = 30_000

export interface ClaimResult {
  readonly acquired: boolean
  readonly ownedBy?: string | undefined
  readonly leaseUntil?: string | undefined
}

export interface LeaseOptions {
  readonly leaseTtlMs?: number | undefined
  readonly now?: () => number | undefined
}

interface SessionLeaseRow {
  readonly active_executor_id: string | null
  readonly active_executor_lease_until: string | null
}

interface SelectQueryResponse {
  readonly data: SessionLeaseRow | null
  readonly error: { readonly message: string } | null
}

interface UpdateQueryResponse {
  readonly data: SessionLeaseRow | null
  readonly error: { readonly message: string } | null
}

interface PostgrestSingleQuery<T> {
  select(columns: string): PostgrestSingleQuery<T>
  eq(column: string, value: string | null): PostgrestSingleQuery<T>
  or(filter: string): PostgrestSingleQuery<T>
  is(column: string, value: null): PostgrestSingleQuery<T>
  lt(column: string, value: string): PostgrestSingleQuery<T>
  maybeSingle(): Promise<T>
}

interface PostgrestUpdate<T> {
  eq(column: string, value: string): PostgrestUpdate<T>
  or(filter: string): PostgrestUpdate<T>
  select(columns: string): PostgrestSingleQuery<T>
}

interface PostgrestTable {
  select(columns: string): PostgrestSingleQuery<SelectQueryResponse>
  update(values: Record<string, unknown>): PostgrestUpdate<UpdateQueryResponse>
}

interface LeaseCapableClient {
  from(table: string): PostgrestTable
}

const futureIso = (now: number, ttlMs: number): string => new Date(now + ttlMs).toISOString()

export const claimLease = (
  client: SupabaseClient | null,
  sessionId: string,
  deviceId: string,
  options: LeaseOptions = {},
): Promise<ClaimResult> => {
  if (!client) return Promise.resolve({ acquired: true })
  const ttl = options.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS
  const now = (options.now ?? Date.now)() ?? Date.now()
  const nowIso = new Date(now).toISOString()
  const leaseUntil = futureIso(now, ttl)
  const table = (client as unknown as LeaseCapableClient).from("sessions")
  // Conditional claim: take the lease iff it is currently unowned, expired,
  // or already ours. We rely on Postgres to evaluate the predicate atomically.
  return table
    .update({ active_executor_id: deviceId, active_executor_lease_until: leaseUntil })
    .eq("id", sessionId)
    .or(
      `active_executor_id.is.null,active_executor_id.eq.${deviceId},active_executor_lease_until.lt.${nowIso}`,
    )
    .select("active_executor_id,active_executor_lease_until")
    .maybeSingle()
    .then((res) => {
      if (res.error) return Promise.reject(new Error(`claimLease failed: ${res.error.message}`))
      if (!res.data) {
        // No row updated → someone else holds a fresh lease. Read it back.
        return readLease(client, sessionId).then((existing) => ({
          acquired: false,
          ownedBy: existing?.active_executor_id ?? undefined,
          leaseUntil: existing?.active_executor_lease_until ?? undefined,
        }))
      }
      return {
        acquired: true,
        ownedBy: res.data.active_executor_id ?? undefined,
        leaseUntil: res.data.active_executor_lease_until ?? undefined,
      }
    })
}

export const heartbeat = (
  client: SupabaseClient | null,
  sessionId: string,
  deviceId: string,
  options: LeaseOptions = {},
): Promise<void> => {
  if (!client) return Promise.resolve()
  const ttl = options.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS
  const now = (options.now ?? Date.now)() ?? Date.now()
  const leaseUntil = futureIso(now, ttl)
  const table = (client as unknown as LeaseCapableClient).from("sessions")
  return table
    .update({ active_executor_lease_until: leaseUntil })
    .eq("id", sessionId)
    .eq("active_executor_id", deviceId)
    .select("active_executor_id,active_executor_lease_until")
    .maybeSingle()
    .then((res) => {
      if (res.error) return Promise.reject(new Error(`heartbeat failed: ${res.error.message}`))
      if (!res.data) return Promise.reject(new Error("heartbeat lost: another device holds the lease"))
      return undefined
    })
}

export const releaseLease = (
  client: SupabaseClient | null,
  sessionId: string,
  deviceId: string,
): Promise<void> => {
  if (!client) return Promise.resolve()
  const table = (client as unknown as LeaseCapableClient).from("sessions")
  return table
    .update({ active_executor_id: null, active_executor_lease_until: null })
    .eq("id", sessionId)
    .eq("active_executor_id", deviceId)
    .select("active_executor_id")
    .maybeSingle()
    .then((res) => {
      if (res.error) return Promise.reject(new Error(`releaseLease failed: ${res.error.message}`))
      return undefined
    })
}

const readLease = (client: SupabaseClient, sessionId: string): Promise<SessionLeaseRow | null> => {
  const table = (client as unknown as LeaseCapableClient).from("sessions")
  return table
    .select("active_executor_id,active_executor_lease_until")
    .eq("id", sessionId)
    .maybeSingle()
    .then((res) => res.data)
}
