import { createServerClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

/**
 * Server-side Supabase client wired to Next's cookie store so the
 * App Router can read auth state during SSR.
 *
 * Returns `null` when env vars are missing — pages branch on this and
 * render the EmptyState placeholder.
 */
export async function getServerClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  const cookieStore = await cookies()
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(items) {
        // Server Components cannot write cookies; this no-ops there.
        // Route Handlers / Server Actions get the writable cookie store
        // and the framework swallows the throw silently.
        for (const { name, value, options } of items) {
          cookieStore.set({ name, value, ...options })
        }
      },
    },
  })
}

export async function getCurrentUser() {
  const client = await getServerClient()
  if (!client) return null
  const { data } = await client.auth.getUser()
  return data.user
}
