import Link from "next/link"
import { Banner } from "@/components/Banner"
import { EmptyState } from "@/components/EmptyState"
import { Transcript, type SessionEvent } from "@/components/Transcript"
import { getServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SessionDetailPage({ params }: PageProps) {
  const { id } = await params
  const client = await getServerClient()

  if (!client) {
    return (
      <main className="flex flex-1 flex-col gap-10">
        <Banner />
        <EmptyState
          variant="config"
          title="Supabase not configured"
          description="Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable live transcripts."
        />
      </main>
    )
  }

  const { data: sessionData, error: sessionError } = await client
    .from("sessions")
    .select("id, title")
    .eq("id", id)
    .single()

  if (sessionError || !sessionData) {
    return (
      <main className="flex flex-1 flex-col gap-10">
        <Banner />
        <EmptyState
          title="Session not found"
          description={sessionError?.message ?? "This quest may have been archived or you may not have access."}
          action={
            <Link
              href="/sessions"
              className="inline-flex items-center justify-center rounded-md border border-arthas-primary/40 px-3 py-1.5 text-sm text-arthas-text"
            >
              Back to sessions
            </Link>
          }
        />
      </main>
    )
  }

  const { data: eventsData } = await client
    .from("session_events")
    .select("id, session_id, kind, role, content, created_at, payload")
    .eq("session_id", id)
    .order("created_at", { ascending: true })

  const events: SessionEvent[] = (eventsData as SessionEvent[] | null) ?? []

  return (
    <main className="flex flex-1 flex-col gap-6">
      <Banner />
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-arthas-text">
          {sessionData.title ?? "Untitled quest"}
        </h1>
        <Link
          href="/sessions"
          className="text-xs text-arthas-muted hover:text-arthas-primary"
        >
          ← All sessions
        </Link>
      </header>
      <Transcript sessionId={id} initialEvents={events} />
    </main>
  )
}
