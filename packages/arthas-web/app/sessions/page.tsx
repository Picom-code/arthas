import Link from "next/link"
import { Banner } from "@/components/Banner"
import { EmptyState } from "@/components/EmptyState"
import { SessionList, type SessionRow } from "@/components/SessionList"
import { getServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function SessionsPage() {
  const client = await getServerClient()

  if (!client) {
    return (
      <main className="flex flex-1 flex-col gap-10">
        <Banner />
        <EmptyState
          variant="config"
          title="Supabase not configured"
          description="Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment to load sessions from the cloud."
        />
      </main>
    )
  }

  const { data: userData } = await client.auth.getUser()
  if (!userData.user) {
    return (
      <main className="flex flex-1 flex-col gap-10">
        <Banner />
        <EmptyState
          title="Sign in to view your sessions"
          description="Your quests are stored privately. Sign in to see them on this device."
          action={
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-md border border-arthas-primary bg-arthas-primary/10 px-4 py-2 text-sm font-semibold text-arthas-primary transition hover:bg-arthas-primary/20"
            >
              Sign in
            </Link>
          }
        />
      </main>
    )
  }

  const { data, error } = await client
    .from("sessions")
    .select("id, title, updated_at, device, status")
    .order("updated_at", { ascending: false })
    .limit(50)

  const sessions: SessionRow[] = (data as SessionRow[] | null) ?? []

  return (
    <main className="flex flex-1 flex-col gap-8">
      <Banner />
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-arthas-text">Sessions</h1>
        {error ? (
          <EmptyState
            variant="config"
            title="Could not load sessions"
            description={error.message}
          />
        ) : sessions.length === 0 ? (
          <EmptyState
            title="No sessions yet"
            description="Start a quest from your laptop with `arthas summon` and it will appear here."
          />
        ) : (
          <SessionList sessions={sessions} />
        )}
      </section>
    </main>
  )
}
