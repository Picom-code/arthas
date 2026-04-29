// =============================================================================
// arthas-sync — Sync engine
// =============================================================================
//
// `SyncEngine` is the local↔Supabase bridge for a single session. Lifecycle:
//
//   * `start()` — opens a Realtime channel filtered to this session's
//     `session_events` rows, decodes incoming payloads, and exposes them via
//     the `onRemoteEvent` listener API. Already-buffered remote events are
//     replayed to late subscribers.
//   * `pushEvent(event)` — INSERT into `session_events`. Server assigns `seq`
//     via the trigger in 0001_init.sql; we trust the server, not local clocks.
//     `client_seq` is a caller-provided idempotency hint (the local monotonic
//     counter the engine tracks).
//   * `stop()` — unsubscribes the channel.
//
// Offline tolerance: when constructed with `client = null` (env vars missing),
// every method becomes a no-op that still emits local events to local
// listeners, so the rest of the harness can stay sync-agnostic.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import { Result } from "effect"
import { decodeSessionEvent, type SessionEventInsert, type SessionEventRow } from "./types.ts"

export interface EventLogLike {
  append?(record: unknown): Promise<void>
}

export interface SyncEngineOptions {
  readonly client: SupabaseClient | null
  readonly sessionId: string
  readonly deviceId: string
  readonly eventLog?: EventLogLike | undefined
}

export interface PushEventInput {
  readonly kind: string
  readonly payload: Record<string, unknown>
}

export type RemoteListener = (event: SessionEventRow) => void
export type LocalListener = (event: PushEventInput) => void

interface RealtimeChange {
  readonly new: unknown
  readonly old: unknown
  readonly eventType: string
}

interface ChannelLike {
  on(type: string, filter: Record<string, unknown>, handler: (payload: RealtimeChange) => void): ChannelLike
  subscribe(callback?: (status: string) => void): ChannelLike
  unsubscribe(): Promise<"ok" | "timed out" | "error">
}

interface RealtimeCapableClient {
  channel(name: string): ChannelLike
  removeChannel?(channel: ChannelLike): Promise<"ok" | "timed out" | "error">
  from(table: string): {
    insert(rows: ReadonlyArray<Record<string, unknown>>): Promise<{ error: { message: string } | null }>
  }
}

export class SyncEngine {
  readonly #client: SupabaseClient | null
  readonly #sessionId: string
  readonly #deviceId: string
  readonly #eventLog: EventLogLike | undefined
  readonly #remoteListeners = new Set<RemoteListener>()
  readonly #localListeners = new Set<LocalListener>()
  readonly #remoteBuffer: SessionEventRow[] = []
  #channel: ChannelLike | null = null
  #clientSeq = 0
  #started = false

  constructor(options: SyncEngineOptions) {
    this.#client = options.client
    this.#sessionId = options.sessionId
    this.#deviceId = options.deviceId
    this.#eventLog = options.eventLog
  }

  get sessionId(): string {
    return this.#sessionId
  }

  get deviceId(): string {
    return this.#deviceId
  }

  get isOnline(): boolean {
    return this.#client !== null
  }

  start(): void {
    if (this.#started) return
    this.#started = true
    if (!this.#client) return

    const realtime = this.#client as unknown as RealtimeCapableClient
    const channel = realtime
      .channel(`arthas:session_events:${this.#sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "session_events",
          filter: `session_id=eq.${this.#sessionId}`,
        },
        (change) => this.#handleChange(change),
      )
      .subscribe()
    this.#channel = channel
  }

  async stop(): Promise<void> {
    if (!this.#started) return
    this.#started = false
    const channel = this.#channel
    this.#channel = null
    this.#remoteListeners.clear()
    this.#localListeners.clear()
    this.#remoteBuffer.length = 0
    if (!channel || !this.#client) return
    const realtime = this.#client as unknown as RealtimeCapableClient
    if (realtime.removeChannel) {
      await realtime.removeChannel(channel)
      return
    }
    await channel.unsubscribe()
  }

  pushEvent(event: PushEventInput): Promise<void> {
    this.#clientSeq += 1
    const clientSeq = this.#clientSeq
    for (const listener of this.#localListeners) listener(event)
    if (this.#eventLog?.append) {
      // Best-effort fan-out to local JSONL log; failures shouldn't block sync.
      void this.#eventLog
        .append({ ...event, sessionId: this.#sessionId, clientSeq, deviceId: this.#deviceId })
        .catch(() => undefined)
    }
    if (!this.#client) return Promise.resolve()
    const insert: SessionEventInsert = {
      session_id: this.#sessionId,
      kind: event.kind,
      payload: event.payload,
      author_device: this.#deviceId,
      client_seq: clientSeq,
    }
    return (this.#client as unknown as RealtimeCapableClient)
      .from("session_events")
      .insert([insert as unknown as Record<string, unknown>])
      .then((res) => {
        if (res.error) return Promise.reject(new Error(`pushEvent insert failed: ${res.error.message}`))
        return undefined
      })
  }

  onRemoteEvent(listener: RemoteListener): () => void {
    this.#remoteListeners.add(listener)
    // Replay buffered remote events for late subscribers.
    for (const buffered of this.#remoteBuffer) listener(buffered)
    return () => {
      this.#remoteListeners.delete(listener)
    }
  }

  onLocalEvent(listener: LocalListener): () => void {
    this.#localListeners.add(listener)
    return () => {
      this.#localListeners.delete(listener)
    }
  }

  get remoteEvents(): ReadonlyArray<SessionEventRow> {
    return this.#remoteBuffer.slice()
  }

  #handleChange(change: RealtimeChange): void {
    if (change.eventType !== "INSERT") return
    const decoded = decodeSessionEvent(change.new)
    if (Result.isFailure(decoded)) return
    const row: SessionEventRow = decoded.success
    // Skip our own writes — they were already emitted as local events.
    if (row.author_device === this.#deviceId) return
    this.#remoteBuffer.push(row)
    for (const listener of this.#remoteListeners) listener(row)
  }
}
