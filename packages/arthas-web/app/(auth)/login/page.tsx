"use client"

import { useState } from "react"
import { Banner } from "@/components/Banner"
import { EmptyState } from "@/components/EmptyState"
import { getBrowserClient, isConfigured } from "@/lib/supabase/client"

type Status = "idle" | "sending" | "sent" | "error"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isConfigured()) {
    return (
      <main className="flex flex-1 flex-col gap-10">
        <Banner />
        <EmptyState
          variant="config"
          title="Supabase not configured"
          description="Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment to enable magic-link sign-in."
        />
      </main>
    )
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const client = getBrowserClient()
    if (!client) return
    setStatus("sending")
    setErrorMsg(null)

    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/sessions` : undefined
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })
    if (error) {
      setStatus("error")
      setErrorMsg(error.message)
      return
    }
    setStatus("sent")
  }

  return (
    <main className="flex flex-1 flex-col gap-10">
      <Banner />
      <section className="mx-auto w-full max-w-md rounded-lg border border-arthas-primary/30 bg-arthas-bg/50 p-6">
        <h1 className="text-xl font-semibold text-arthas-text">Sign in</h1>
        <p className="mt-1 text-sm text-arthas-muted">
          We'll send you a magic link. No password required.
        </p>

        {status === "sent" ? (
          <p className="mt-6 rounded-md border border-arthas-success/40 bg-arthas-success/10 p-4 text-sm text-arthas-text">
            Check your email — we sent a sign-in link to <strong>{email}</strong>.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-arthas-muted">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-md border border-arthas-primary/30 bg-arthas-bg px-3 py-2 text-arthas-text outline-none focus:border-arthas-primary"
              />
            </label>
            <button
              type="submit"
              disabled={status === "sending" || !email}
              className="inline-flex items-center justify-center rounded-md border border-arthas-primary bg-arthas-primary/10 px-4 py-2 text-sm font-semibold text-arthas-primary transition hover:bg-arthas-primary/20 disabled:opacity-50"
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
            {errorMsg ? (
              <p className="text-sm text-arthas-error">{errorMsg}</p>
            ) : null}
          </form>
        )}
      </section>
    </main>
  )
}
