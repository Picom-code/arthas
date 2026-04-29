// =============================================================================
// arthas-sync — TypeScript types matching the Supabase schema (0001_init.sql).
// =============================================================================
//
// Two layers:
//   1. Plain `type` aliases for row-shapes consumed by the engine + lease
//      helpers. These avoid pulling Effect Schema into hot paths where we
//      pass-through Postgres rows.
//   2. Effect `Schema.Class` definitions for boundaries where runtime parsing
//      matters — incoming Realtime payloads (untrusted JSON over the wire)
//      and the device-code grant edge function response.
//
// Row shapes mirror the columns in supabase/migrations/0001_init.sql exactly.
// If you change the migration, update both halves and regenerate Supabase
// types via `supabase gen types typescript --local > types.gen.ts` to verify.
// =============================================================================

import { Schema } from "effect"

// -----------------------------------------------------------------------------
// Row shapes (plain types — no runtime cost)
// -----------------------------------------------------------------------------

export interface ProfileRow {
  readonly id: string
  readonly email: string | null
  readonly display_name: string | null
  readonly created_at: string
  readonly updated_at: string
}

export interface SessionRow {
  readonly id: string
  readonly owner: string
  readonly title: string | null
  readonly cwd: string | null
  readonly active_executor_id: string | null
  readonly active_executor_lease_until: string | null
  readonly created_at: string
  readonly updated_at: string
  readonly archived: boolean
}

export interface SessionEventRow {
  readonly id: number
  readonly session_id: string
  readonly seq: number
  readonly kind: string
  readonly payload: Record<string, unknown>
  readonly author_device: string | null
  readonly client_seq: number | null
  readonly created_at: string
}

export interface UserSettingsRow {
  readonly user_id: string
  readonly settings: Record<string, unknown>
  readonly updated_at: string
}

export interface McpConfigRow {
  readonly id: string
  readonly user_id: string
  readonly name: string
  readonly command: string | null
  readonly transport: string
  readonly url: string | null
  readonly env: Record<string, string>
  readonly enabled: boolean
  readonly device_scope: string | null
  readonly created_at: string
  readonly updated_at: string
}

export interface DeviceRow {
  readonly id: string
  readonly user_id: string
  readonly name: string
  readonly platform: string | null
  readonly last_seen_at: string | null
  readonly capabilities: Record<string, unknown>
  readonly created_at: string
}

// -----------------------------------------------------------------------------
// Insert shapes (omit server-assigned columns)
// -----------------------------------------------------------------------------

export interface SessionEventInsert {
  readonly session_id: string
  readonly kind: string
  readonly payload: Record<string, unknown>
  readonly author_device?: string | null
  readonly client_seq?: number | null
}

// -----------------------------------------------------------------------------
// Effect Schema (runtime parsing for untrusted boundaries)
// -----------------------------------------------------------------------------

// Realtime broadcasts arbitrary JSON; we parse here before handing payloads
// to consumers so a malformed event can't crash the engine.
export class SessionEventSchema extends Schema.Class<SessionEventSchema>("Arthas.Sync.SessionEvent")({
  id: Schema.Number,
  session_id: Schema.String,
  seq: Schema.Number,
  kind: Schema.String,
  payload: Schema.Record(Schema.String, Schema.Unknown),
  author_device: Schema.NullOr(Schema.String),
  client_seq: Schema.NullOr(Schema.Number),
  created_at: Schema.String,
}) {}

export const decodeSessionEvent = Schema.decodeUnknownResult(SessionEventSchema)

// Device-code grant responses (issue + poll merged because the edge function
// returns one of three response shapes depending on state).
export class DeviceCodeIssueResponse extends Schema.Class<DeviceCodeIssueResponse>("Arthas.Sync.DeviceCodeIssue")({
  device_code: Schema.String,
  user_code: Schema.String,
  verification_uri: Schema.String,
  expires_at: Schema.Number,
  poll_interval_ms: Schema.Number,
}) {}

export const decodeDeviceCodeIssue = Schema.decodeUnknownResult(DeviceCodeIssueResponse)

export class DeviceCodePendingResponse extends Schema.Class<DeviceCodePendingResponse>(
  "Arthas.Sync.DeviceCodePending",
)({
  status: Schema.Literal("pending"),
}) {}

export class DeviceCodeApprovedResponse extends Schema.Class<DeviceCodeApprovedResponse>(
  "Arthas.Sync.DeviceCodeApproved",
)({
  status: Schema.Literal("approved"),
  access_token: Schema.String,
  refresh_token: Schema.String,
  expires_in: Schema.Number,
  user_id: Schema.String,
}) {}

export class DeviceCodeExpiredResponse extends Schema.Class<DeviceCodeExpiredResponse>(
  "Arthas.Sync.DeviceCodeExpired",
)({
  status: Schema.Literal("expired"),
}) {}

export const DeviceCodePollResponse = Schema.Union([
  DeviceCodePendingResponse,
  DeviceCodeApprovedResponse,
  DeviceCodeExpiredResponse,
])
export type DeviceCodePollResponse = Schema.Schema.Type<typeof DeviceCodePollResponse>

export const decodeDeviceCodePoll = Schema.decodeUnknownResult(DeviceCodePollResponse)
