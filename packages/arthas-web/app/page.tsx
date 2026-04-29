import Link from "next/link"
import { STRINGS } from "arthas-theme/strings"
import { Banner } from "@/components/Banner"

/**
 * Landing page — server component.
 *
 * Static, env-agnostic; safely renders before Supabase is configured.
 */
export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col gap-10">
      <Banner />

      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold text-arthas-text sm:text-4xl">
          {STRINGS.welcomeLine}
        </h1>
        <p className="max-w-prose text-base leading-relaxed text-arthas-muted">
          Pick up a quest from any device. Arthas streams your terminal session
          to the cloud so you can read transcripts, continue conversations, and
          hand work back to your laptop without losing context.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-md border border-arthas-primary bg-arthas-primary/10 px-4 py-2 text-sm font-semibold text-arthas-primary transition hover:bg-arthas-primary/20"
          >
            Sign in
          </Link>
          <Link
            href="/sessions"
            className="inline-flex items-center justify-center rounded-md border border-arthas-primary/30 px-4 py-2 text-sm text-arthas-text transition hover:border-arthas-primary/60"
          >
            View sessions
          </Link>
        </div>
      </section>

      <footer className="mt-auto pt-8 text-xs text-arthas-muted">{STRINGS.promptHint}</footer>
    </main>
  )
}
