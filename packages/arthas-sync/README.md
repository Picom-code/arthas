# arthas-sync

Optional cross-device sync for Arthas. Wraps a Supabase client, ships a
device-code auth flow, runs an append-only event sync engine over Supabase
Realtime, and exposes an executor-lease helper so at most one device executes
the agent loop per session.

This package is **off by default**. The CLI is fully usable without it; sync is
opt-in via `arthas kneel` / `~/.arthas/settings.json#sync.enabled = true`.

## Bringing up local Supabase

```bash
# install the Supabase CLI once
brew install supabase/tap/supabase

# from the repo root:
supabase start          # boots Postgres, GoTrue, Realtime, Storage in Docker
supabase db reset       # applies supabase/migrations/000{1,2,3}_*.sql

# get the locally-issued URL + anon key:
supabase status
```

The `supabase status` output prints `API URL`, `anon key`, and
`service_role key`. Drop those into your shell:

```bash
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_ANON_KEY="<anon key from supabase status>"
# Only needed for migration / RLS policy tests, not for the CLI:
export SUPABASE_SERVICE_ROLE_KEY="<service role key from supabase status>"
```

## Required env vars

| Var | When you need it |
| --- | --- |
| `SUPABASE_URL`              | Always, when sync is enabled. |
| `SUPABASE_ANON_KEY`         | Always, when sync is enabled. |
| `SUPABASE_SERVICE_ROLE_KEY` | Migration / RLS policy testing only. **Never** ship this to a client. |

If `SUPABASE_URL` or `SUPABASE_ANON_KEY` are missing, `createSupabaseClient`
returns `null` and the engine + lease helpers all become no-op pass-throughs —
the CLI keeps working offline. Sync is graceful, not a hard dependency.

## Schema overview

See `supabase/migrations/0001_init.sql`. Tables: `profiles`, `sessions`,
`session_events`, `user_settings`, `mcp_configs`, `devices`. RLS is enforced
on every table in `0002_rls.sql`. Only `session_events` joins the realtime
publication (`0003_realtime.sql`) — other tables sync via REST + manual reads
so we don't drown clients in chatter.

`session_events.seq` is **server-assigned** by a trigger; clients propose
`client_seq` for idempotency only. Never trust client-side ordering.

## Device-code auth (`arthas kneel`)

The CLI flow:

1. `requestDeviceCode(client)` → POST `/functions/v1/device-code-grant` with
   empty body. Returns `{ userCode, verificationUri, deviceCode, expiresAt,
   pollIntervalMs }`. Display the user code to the user.
2. `pollForToken(client, deviceCode)` → polls `/functions/v1/device-code-grant`
   with `{ device_code }` until status flips to `approved`. Resolves to
   `{ accessToken, refreshToken, expiresIn, userId }`. Tokens go into the OS
   keychain (consumer's job).

The `device-code-grant` edge function in `supabase/functions/device-code-grant/`
is a **v0 stub** that returns a deterministic pending → approved sequence
with fake JWT-shaped tokens. Replace with the real RFC 8628 implementation
backed by a `device_grants` table before shipping v0.5.

## Sync engine

```ts
import { createSupabaseClient, SyncEngine } from "arthas-sync"

const client = createSupabaseClient(process.env)
const engine = new SyncEngine({
  client,
  sessionId: "<uuid>",
  deviceId: "<uuid>",
  eventLog,                 // optional, from arthas-observability
})

engine.start()
engine.onRemoteEvent((event) => { /* render in TUI */ })
await engine.pushEvent({ kind: "user_msg", payload: { text: "hello" } })
await engine.stop()
```

When `client` is `null`, the engine emits to local listeners only; nothing
hits the network.

## Executor lease

```ts
import { claimLease, heartbeat, releaseLease } from "arthas-sync"

const claim = await claimLease(client, sessionId, deviceId)
if (!claim.acquired) {
  console.log(`session is locked by ${claim.ownedBy}`)
  return
}

setInterval(() => heartbeat(client, sessionId, deviceId), 10_000)
// ... run the agent loop ...
await releaseLease(client, sessionId, deviceId)
```

Default lease TTL: 30s. Heartbeat cadence: every 10s (3 misses → expired,
reclaimable). `arthas resume` performs an explicit takeover by passing a
fresh `claimLease` after a short user-facing confirm.

## Running tests

```bash
cd packages/arthas-sync && bun test
```

Tests are fully mocked — no live Supabase needed.
