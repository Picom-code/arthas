import { expect, test } from "bun:test"
import type { SupabaseClient } from "@supabase/supabase-js"
import { SyncEngine } from "../src/engine.ts"

interface InsertCall {
  readonly table: string
  readonly rows: ReadonlyArray<Record<string, unknown>>
}

interface FakeBundle {
  readonly client: SupabaseClient
  readonly inserts: InsertCall[]
  readonly emit: (newRow: Record<string, unknown>) => void
  readonly subscribed: { value: boolean }
}

const makeFakeClient = (): FakeBundle => {
  const inserts: InsertCall[] = []
  const handlers: Array<(payload: { new: unknown; old: unknown; eventType: string }) => void> = []
  const subscribed = { value: false }

  const channel = {
    on: (_type: string, _filter: Record<string, unknown>, handler: (p: { new: unknown; old: unknown; eventType: string }) => void) => {
      handlers.push(handler)
      return channel
    },
    subscribe: () => {
      subscribed.value = true
      return channel
    },
    unsubscribe: () => Promise.resolve("ok" as const),
  }

  const client = {
    channel: (_name: string) => channel,
    removeChannel: (_c: unknown) => {
      subscribed.value = false
      return Promise.resolve("ok" as const)
    },
    from: (table: string) => ({
      insert: (rows: ReadonlyArray<Record<string, unknown>>) => {
        inserts.push({ table, rows })
        return Promise.resolve({ error: null })
      },
    }),
  } as unknown as SupabaseClient

  const emit = (newRow: Record<string, unknown>) => {
    for (const h of handlers) h({ new: newRow, old: null, eventType: "INSERT" })
  }

  return { client, inserts, emit, subscribed }
}

test("pushEvent calls supabase.from('session_events').insert(...) once with server-trusting payload", async () => {
  const { client, inserts } = makeFakeClient()
  const engine = new SyncEngine({ client, sessionId: "sess-1", deviceId: "dev-A" })
  engine.start()
  await engine.pushEvent({ kind: "user_msg", payload: { text: "hello" } })

  expect(inserts).toHaveLength(1)
  expect(inserts[0]?.table).toBe("session_events")
  const row = inserts[0]?.rows[0]
  expect(row?.session_id).toBe("sess-1")
  expect(row?.kind).toBe("user_msg")
  expect(row?.payload).toEqual({ text: "hello" })
  expect(row?.author_device).toBe("dev-A")
  expect(row?.client_seq).toBe(1)
  // No `seq` — that is server-assigned by the trigger.
  expect("seq" in (row ?? {})).toBe(false)

  await engine.stop()
})

test("pushEvent monotonically increments client_seq", async () => {
  const { client, inserts } = makeFakeClient()
  const engine = new SyncEngine({ client, sessionId: "sess-1", deviceId: "dev-A" })
  engine.start()
  await engine.pushEvent({ kind: "x", payload: {} })
  await engine.pushEvent({ kind: "y", payload: {} })
  await engine.pushEvent({ kind: "z", payload: {} })
  expect(inserts.map((c) => c.rows[0]?.client_seq)).toEqual([1, 2, 3])
  await engine.stop()
})

test("SyncEngine with null client is a no-op pass-through (offline tolerant)", async () => {
  const local: Array<{ kind: string }> = []
  const engine = new SyncEngine({ client: null, sessionId: "sess-1", deviceId: "dev-A" })
  expect(engine.isOnline).toBe(false)
  engine.onLocalEvent((e) => local.push({ kind: e.kind }))
  engine.start()
  await engine.pushEvent({ kind: "user_msg", payload: { text: "offline" } })
  expect(local).toEqual([{ kind: "user_msg" }])
  await engine.stop()
})

test("Realtime payloads from other devices reach onRemoteEvent listeners; own writes are filtered", () => {
  const { client, emit } = makeFakeClient()
  const engine = new SyncEngine({ client, sessionId: "sess-1", deviceId: "dev-A" })
  engine.start()

  const seen: Array<{ seq: number; author: string | null }> = []
  engine.onRemoteEvent((event) => seen.push({ seq: event.seq, author: event.author_device }))

  emit({
    id: 1,
    session_id: "sess-1",
    seq: 1,
    kind: "user_msg",
    payload: { text: "from B" },
    author_device: "dev-B",
    client_seq: 1,
    created_at: new Date().toISOString(),
  })
  // Self-write should be filtered (engine emits these as local events).
  emit({
    id: 2,
    session_id: "sess-1",
    seq: 2,
    kind: "user_msg",
    payload: { text: "from A" },
    author_device: "dev-A",
    client_seq: 2,
    created_at: new Date().toISOString(),
  })
  // Malformed payload should be silently dropped, not crash.
  emit({ wrong: "shape" })

  expect(seen).toEqual([{ seq: 1, author: "dev-B" }])
})

test("eventLog.append is invoked on pushEvent when provided", async () => {
  const { client } = makeFakeClient()
  const captured: unknown[] = []
  const engine = new SyncEngine({
    client,
    sessionId: "sess-1",
    deviceId: "dev-A",
    eventLog: { append: (r) => Promise.resolve(captured.push(r) as unknown as void) },
  })
  engine.start()
  await engine.pushEvent({ kind: "tool_call", payload: { name: "Read" } })
  expect(captured).toHaveLength(1)
  await engine.stop()
})

test("late onRemoteEvent subscriber gets buffered events replayed", () => {
  const { client, emit } = makeFakeClient()
  const engine = new SyncEngine({ client, sessionId: "sess-1", deviceId: "dev-A" })
  engine.start()

  emit({
    id: 1,
    session_id: "sess-1",
    seq: 1,
    kind: "user_msg",
    payload: {},
    author_device: "dev-B",
    client_seq: 1,
    created_at: new Date().toISOString(),
  })

  const seen: number[] = []
  engine.onRemoteEvent((e) => seen.push(e.seq))
  expect(seen).toEqual([1])
})
