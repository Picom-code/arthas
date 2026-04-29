"use client"

import { useEffect, useRef, useState } from "react"
import { getBrowserClient } from "@/lib/supabase/client"

export interface SessionEvent {
  id: string
  session_id: string
  // Loose typing for now; the sync stream owns the canonical event schema
  // (see packages/opencode/src/v2/session-event.ts). We render whatever
  // ships in `kind` + `payload` without claiming exhaustiveness.
  kind: string
  role?: string | null
  content?: string | null
  created_at: string
  payload?: Record<string, unknown> | null
}

interface TranscriptProps {
  sessionId: string
  initialEvents: SessionEvent[]
}

/**
 * Renders an existing event log and subscribes to Supabase Realtime
 * for new rows. Falls back to the static log when env vars are missing.
 */
export function Transcript({ sessionId, initialEvents }: TranscriptProps) {
  const [events, setEvents] = useState<SessionEvent[]>(initialEvents)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const client = getBrowserClient()
    if (!client) return

    const channel = client
      .channel(`session_events:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "session_events",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const next = payload.new as SessionEvent
          setEvents((prev) => (prev.some((e) => e.id === next.id) ? prev : [...prev, next]))
        },
      )
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [sessionId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [events.length])

  return (
    <div ref={scrollRef} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-2">
      {events.length === 0 ? (
        <p className="text-sm text-arthas-muted">No events yet. Waiting for the executor…</p>
      ) : (
        events.map((event) => <Bubble key={event.id} event={event} />)
      )}
    </div>
  )
}

function Bubble({ event }: { event: SessionEvent }) {
  const isUser = event.role === "user"
  const align = isUser ? "self-end" : "self-start"
  const tone = isUser
    ? "bg-arthas-primary/20 border-arthas-primary/50"
    : "bg-arthas-bg/70 border-arthas-primary/20"
  return (
    <article
      className={`max-w-[85%] rounded-2xl border px-4 py-2 text-sm ${align} ${tone}`}
    >
      <header className="mb-1 flex items-center justify-between gap-3 text-[10px] uppercase tracking-wide text-arthas-muted">
        <span>{event.role ?? event.kind}</span>
        <time dateTime={event.created_at}>
          {new Date(event.created_at).toLocaleTimeString()}
        </time>
      </header>
      <p className="whitespace-pre-wrap text-arthas-text">
        {event.content ?? JSON.stringify(event.payload ?? {}, null, 2)}
      </p>
    </article>
  )
}
