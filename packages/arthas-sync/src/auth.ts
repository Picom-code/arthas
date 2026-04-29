// =============================================================================
// arthas-sync — Device-code auth flow (`arthas kneel`)
// =============================================================================
//
// RFC 8628-style device-code grant against the `device-code-grant` Supabase
// edge function. v0 stub: see supabase/functions/device-code-grant/index.ts.
//
// Flow:
//   1. CLI calls `requestDeviceCode(client)` → POST /functions/v1/device-code-grant
//      with empty body. Server returns user_code + verification_uri to display.
//   2. CLI displays user_code, opens verification_uri in a browser.
//   3. CLI calls `pollForToken(client, deviceCode)` which loops POSTing the
//      device_code until status flips to "approved" (returns tokens) or
//      "expired" (rejects) or the overall deadline passes.
//
// Errors are returned as rejections (not thrown) via `.then`/`.catch` chains —
// no try/catch (per project style). Schema validation lives in types.ts and
// returns Either; we convert Either → Promise here at the boundary.
// =============================================================================

import { Result } from "effect"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  decodeDeviceCodeIssue,
  decodeDeviceCodePoll,
  type DeviceCodePollResponse,
} from "./types.ts"

const FUNCTION_NAME = "device-code-grant"
const DEFAULT_POLL_DEADLINE_MS = 15 * 60 * 1000

export interface DeviceCodeGrant {
  readonly userCode: string
  readonly verificationUri: string
  readonly deviceCode: string
  readonly expiresAt: number
  readonly pollIntervalMs: number
}

export interface DeviceTokens {
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresIn: number
  readonly userId: string
}

export interface PollOptions {
  readonly deadlineMs?: number
  readonly intervalMs?: number
  readonly sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface InvokeResult<T> {
  readonly data: T | null
  readonly error: { readonly message: string } | null
}

const invoke = <T>(client: SupabaseClient, body: Record<string, unknown>): Promise<InvokeResult<T>> =>
  client.functions.invoke<T>(FUNCTION_NAME, { body }) as Promise<InvokeResult<T>>

export const requestDeviceCode = (client: SupabaseClient): Promise<DeviceCodeGrant> =>
  invoke<unknown>(client, {}).then((res) => {
    if (res.error) return Promise.reject(new Error(`device-code issue failed: ${res.error.message}`))
    const decoded = decodeDeviceCodeIssue(res.data)
    if (Result.isFailure(decoded)) {
      return Promise.reject(new Error(`device-code issue malformed: ${String(decoded.failure)}`))
    }
    const value = decoded.success
    return {
      userCode: value.user_code,
      verificationUri: value.verification_uri,
      deviceCode: value.device_code,
      expiresAt: value.expires_at,
      pollIntervalMs: value.poll_interval_ms,
    }
  })

export const pollForToken = (
  client: SupabaseClient,
  deviceCode: string,
  options: PollOptions = {},
): Promise<DeviceTokens> => {
  const deadline = Date.now() + (options.deadlineMs ?? DEFAULT_POLL_DEADLINE_MS)
  const interval = options.intervalMs ?? 5_000
  const sleep = options.sleep ?? defaultSleep

  const step = (): Promise<DeviceTokens> => {
    if (Date.now() > deadline) return Promise.reject(new Error("device-code poll timed out"))
    return invoke<unknown>(client, { device_code: deviceCode }).then((res) => {
      if (res.error) return Promise.reject(new Error(`device-code poll failed: ${res.error.message}`))
      const decoded = decodeDeviceCodePoll(res.data)
      if (Result.isFailure(decoded)) {
        return Promise.reject(new Error(`device-code poll malformed: ${String(decoded.failure)}`))
      }
      return handlePoll(decoded.success, () => sleep(interval).then(step))
    })
  }

  return step()
}

const handlePoll = (
  response: DeviceCodePollResponse,
  retry: () => Promise<DeviceTokens>,
): Promise<DeviceTokens> => {
  if (response.status === "approved") {
    return Promise.resolve({
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresIn: response.expires_in,
      userId: response.user_id,
    })
  }
  if (response.status === "expired") return Promise.reject(new Error("device-code expired"))
  // status === "pending"
  return retry()
}
