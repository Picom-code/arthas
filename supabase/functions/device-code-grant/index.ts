// =============================================================================
// device-code-grant — v0 stub edge function
// =============================================================================
//
// This is the Supabase edge function backing the `arthas kneel` device-code
// auth flow. The real implementation will:
//
//   1. POST {} → mint a device_code + user_code, store with TTL in a table,
//      return verification_uri.
//   2. POST { device_code }       → poll. Returns:
//      - `{ status: "pending" }` until the user approves at verification_uri
//      - `{ status: "approved", access_token, refresh_token }` once approved
//      - `{ status: "expired" }` past TTL
//
// For v0 we ship a deterministic stub that returns realistic shapes so the
// CLI + sync engine can be developed against it without a live Supabase. The
// stub:
//   - generates a fake but well-formed device_code / user_code
//   - returns "pending" for the first ~3 polls, then "approved" with fake
//     JWT-shaped tokens
//   - keeps state in module scope (per-edge-runtime instance; fine for stub)
//
// TODO(sync v0.5): replace with the real grant — RFC 8628-style device flow
// backed by a `device_grants` table (device_code, user_code, user_id?, status,
// expires_at) plus a magic-link approval page that flips the row to approved.
// =============================================================================

interface PendingGrant {
  readonly userCode: string
  readonly verificationUri: string
  readonly issuedAt: number
  readonly expiresAt: number
  pollsRemaining: number
}

const PENDING = new Map<string, PendingGrant>()

const DEVICE_CODE_TTL_MS = 15 * 60 * 1000 // 15 min
const APPROVE_AFTER_POLLS = 3
const POLL_INTERVAL_MS = 5_000
const VERIFICATION_BASE = "https://arthas.dev/kneel"

const randomCode = (len: number): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length] ?? "X").join("")
}

const fakeJwt = (sub: string): string => {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const payload = btoa(JSON.stringify({ sub, iat: Math.floor(Date.now() / 1000), aud: "arthas-stub" }))
  return `${header}.${payload}.stub-signature`
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

interface RequestBody {
  readonly device_code?: string
}

const handle = async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" })
  const body = (await req.json().catch(() => ({}))) as RequestBody

  // Issue path: no device_code → mint a new grant.
  if (!body.device_code) {
    const deviceCode = crypto.randomUUID()
    const userCode = `${randomCode(4)}-${randomCode(4)}`
    const grant: PendingGrant = {
      userCode,
      verificationUri: `${VERIFICATION_BASE}?code=${userCode}`,
      issuedAt: Date.now(),
      expiresAt: Date.now() + DEVICE_CODE_TTL_MS,
      pollsRemaining: APPROVE_AFTER_POLLS,
    }
    PENDING.set(deviceCode, grant)
    return json(200, {
      device_code: deviceCode,
      user_code: grant.userCode,
      verification_uri: grant.verificationUri,
      expires_at: grant.expiresAt,
      poll_interval_ms: POLL_INTERVAL_MS,
    })
  }

  // Poll path: caller provided device_code.
  const grant = PENDING.get(body.device_code)
  if (!grant) return json(404, { error: "unknown_device_code" })
  if (Date.now() > grant.expiresAt) {
    PENDING.delete(body.device_code)
    return json(410, { status: "expired" })
  }
  if (grant.pollsRemaining > 0) {
    grant.pollsRemaining -= 1
    return json(202, { status: "pending" })
  }
  // Approved. Return fake JWT shapes; replace with real Supabase Auth tokens
  // in v0.5.
  PENDING.delete(body.device_code)
  const userId = crypto.randomUUID()
  return json(200, {
    status: "approved",
    access_token: fakeJwt(userId),
    refresh_token: fakeJwt(`refresh:${userId}`),
    expires_in: 3600,
    user_id: userId,
  })
}

// @ts-ignore - Deno.serve in Supabase edge runtime
Deno.serve(handle)

export { handle }
