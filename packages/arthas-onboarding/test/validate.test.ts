/**
 * Smoke tests for the cloud-provider validators. We patch `globalThis.fetch`
 * to simulate the three response shapes that branch in `validate.ts`:
 * 200, 401, and a network error. The goal is to lock in the contract that
 * the wizard relies on (no thrown errors, just `{ ok, reason? }`).
 */
import { describe, expect, test, afterEach } from "bun:test"
import { validateAnthropic, validateOpenAI, validateOpenRouter } from "../src/validate"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

const stubFetch = (impl: (url: string, init?: RequestInit) => Promise<Response>) => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    impl(typeof input === "string" ? input : input.toString(), init)) as typeof fetch
}

describe("validators", () => {
  test("200 returns ok=true", async () => {
    stubFetch(async () => new Response("{}", { status: 200 }))
    const result = await validateAnthropic("sk-test")
    expect(result.ok).toBe(true)
  })

  test("401 returns ok=false with a reason", async () => {
    stubFetch(async () => new Response("nope", { status: 401 }))
    const result = await validateOpenAI("bad-key")
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/unauthorized/i)
  })

  test("network error returns ok=false with a reason", async () => {
    stubFetch(async () => {
      throw new Error("ECONNREFUSED")
    })
    const result = await validateOpenRouter("anything")
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/network/i)
  })
})
