import { expect, test } from "bun:test"
import type { SupabaseClient } from "@supabase/supabase-js"
import { pollForToken, requestDeviceCode } from "../src/auth.ts"

interface InvokeArgs {
  readonly name: string
  readonly body: Record<string, unknown>
}

interface FakeFunctions {
  readonly client: SupabaseClient
  readonly calls: InvokeArgs[]
}

const makeFakeClient = (responses: ReadonlyArray<{ data: unknown; error?: { message: string } | null }>): FakeFunctions => {
  const calls: InvokeArgs[] = []
  const cursor = { i: 0 }
  const client = {
    functions: {
      invoke: (name: string, opts: { body: Record<string, unknown> }) => {
        calls.push({ name, body: opts.body })
        const next = responses[Math.min(cursor.i, responses.length - 1)]
        cursor.i += 1
        return Promise.resolve({ data: next?.data ?? null, error: next?.error ?? null })
      },
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

test("requestDeviceCode posts empty body and returns normalized grant", async () => {
  const { client, calls } = makeFakeClient([
    {
      data: {
        device_code: "dev-123",
        user_code: "ABCD-EFGH",
        verification_uri: "https://arthas.dev/kneel?code=ABCD-EFGH",
        expires_at: 9_999_999_999,
        poll_interval_ms: 5000,
      },
    },
  ])

  const grant = await requestDeviceCode(client)
  expect(calls).toHaveLength(1)
  expect(calls[0]?.name).toBe("device-code-grant")
  expect(calls[0]?.body).toEqual({})
  expect(grant.userCode).toBe("ABCD-EFGH")
  expect(grant.verificationUri).toContain("ABCD-EFGH")
  expect(grant.deviceCode).toBe("dev-123")
  expect(grant.pollIntervalMs).toBe(5000)
})

test("requestDeviceCode rejects on edge function error", async () => {
  const { client } = makeFakeClient([{ data: null, error: { message: "boom" } }])
  await expect(requestDeviceCode(client)).rejects.toThrow(/device-code issue failed/)
})

test("requestDeviceCode rejects on malformed response", async () => {
  const { client } = makeFakeClient([{ data: { not: "the right shape" } }])
  await expect(requestDeviceCode(client)).rejects.toThrow(/device-code issue malformed/)
})

test("pollForToken loops on pending until approved", async () => {
  const { client, calls } = makeFakeClient([
    { data: { status: "pending" } },
    { data: { status: "pending" } },
    {
      data: {
        status: "approved",
        access_token: "access-jwt",
        refresh_token: "refresh-jwt",
        expires_in: 3600,
        user_id: "user-123",
      },
    },
  ])

  const sleeps: number[] = []
  const tokens = await pollForToken(client, "dev-123", {
    intervalMs: 10,
    sleep: (ms) => {
      sleeps.push(ms)
      return Promise.resolve()
    },
  })

  expect(calls).toHaveLength(3)
  expect(calls.every((c) => c.body.device_code === "dev-123")).toBe(true)
  expect(sleeps).toEqual([10, 10])
  expect(tokens.accessToken).toBe("access-jwt")
  expect(tokens.refreshToken).toBe("refresh-jwt")
  expect(tokens.userId).toBe("user-123")
  expect(tokens.expiresIn).toBe(3600)
})

test("pollForToken rejects when grant expires", async () => {
  const { client } = makeFakeClient([{ data: { status: "expired" } }])
  await expect(
    pollForToken(client, "dev-123", { intervalMs: 1, sleep: () => Promise.resolve() }),
  ).rejects.toThrow(/expired/)
})

test("pollForToken rejects past deadline", async () => {
  const { client } = makeFakeClient([{ data: { status: "pending" } }])
  await expect(
    pollForToken(client, "dev-123", {
      deadlineMs: -1,
      intervalMs: 1,
      sleep: () => Promise.resolve(),
    }),
  ).rejects.toThrow(/timed out/)
})
