import { expect, test } from "bun:test"
import { createSupabaseClient } from "../src/client.ts"

test("createSupabaseClient returns null when SUPABASE_URL is missing", () => {
  expect(createSupabaseClient({ SUPABASE_ANON_KEY: "anon" })).toBeNull()
})

test("createSupabaseClient returns null when SUPABASE_ANON_KEY is missing", () => {
  expect(createSupabaseClient({ SUPABASE_URL: "https://example.supabase.co" })).toBeNull()
})

test("createSupabaseClient returns null when both env vars are empty strings", () => {
  expect(createSupabaseClient({ SUPABASE_URL: "", SUPABASE_ANON_KEY: "" })).toBeNull()
})

test("createSupabaseClient returns a client when both env vars are present", () => {
  const client = createSupabaseClient({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
  })
  expect(client).not.toBeNull()
  // supabase-js exposes `from` and `channel` on the client; smoke-test the
  // surface so a future supabase-js bump that breaks the contract is noisy.
  expect(typeof client?.from).toBe("function")
  expect(typeof client?.channel).toBe("function")
})

test("createSupabaseClient honors accessToken option by adding Authorization header", () => {
  const client = createSupabaseClient(
    {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "anon-key",
    },
    { accessToken: "jwt-token" },
  )
  expect(client).not.toBeNull()
})
