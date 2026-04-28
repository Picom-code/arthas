// Bridges opencode's Effect.ts-typed event bus to arthas-observability's
// string-typed Subscriber, then writes one ObservabilityRecord per assistant
// turn into ~/.arthas/sessions/<sessionId>.events.jsonl.
//
// Wired from packages/opencode/src/index.ts at CLI startup. Swallows its
// own errors so observability can never break the user's session.

import { Bus } from "@/bus"
import { Subscriber, EventLog, type BusLike } from "arthas-observability"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "observability" })

type BusEventPayload = { type: string; properties: unknown }
type Handler = (payload: BusEventPayload) => void

let active: (() => void) | null = null

export function startObservability(): () => void {
  if (active) return active

  const handlers = new Map<string, Set<Handler>>()

  // Adapter from opencode's typed bus to the string-typed BusLike the
  // Subscriber expects.
  const adapter: BusLike = {
    subscribe(eventType, handler) {
      const typed = handler as Handler
      const set = handlers.get(eventType) ?? new Set<Handler>()
      set.add(typed)
      handlers.set(eventType, set)
      return () => {
        set.delete(typed)
        if (set.size === 0) handlers.delete(eventType)
      }
    },
  }

  const subscriber = new Subscriber({
    bus: adapter,
    logFor: (sessionId) => new EventLog(sessionId),
  })
  const stopSubscriber = subscriber.start()

  // Bus.subscribeAll runs synchronously via runSync in opencode/bus/index.ts.
  // If runtime initialization fails for any reason (no instance yet, etc.),
  // observability is best-effort: log and continue, never throw.
  let cleanupAll: (() => void) | undefined
  Promise.resolve()
    .then(() => {
      cleanupAll = Bus.subscribeAll((event: BusEventPayload) => {
        const set = handlers.get(event.type)
        if (!set || set.size === 0) return
        for (const h of set) {
          // Forward fire-and-forget. Subscriber's #onMessageUpdated is async;
          // we don't await here to keep the bus dispatch synchronous.
          Promise.resolve()
            .then(() => h(event))
            .catch((err) => log.warn("subscriber handler threw", { err: String(err) }))
        }
      })
    })
    .catch((err) => log.warn("Bus.subscribeAll failed", { err: String(err) }))

  active = () => {
    stopSubscriber()
    if (cleanupAll) cleanupAll()
    active = null
  }
  return active
}
