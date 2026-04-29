/**
 * Provider-specific API key validation.
 *
 * Each function pings the provider's models-list endpoint with the supplied key
 * and reports whether it was accepted. We deliberately keep this surface tiny —
 * three cloud providers, one shape — so it is easy to read and to mock in tests.
 *
 * Constraints:
 *  - No try/catch — use `.then().catch()` and check `response.ok`.
 *  - 10s timeout via `AbortSignal.timeout(10_000)` so a flaky network can't hang
 *    the wizard.
 *  - Pure: no logging, no side effects beyond the network call.
 */

export type ValidationResult = { ok: boolean; reason?: string }

const TIMEOUT_MS = 10_000

const reasonForStatus = (status: number): string => {
  if (status === 401 || status === 403) return "Key was rejected (unauthorized)."
  if (status === 429) return "Rate limited; the key looks valid but the provider is throttling."
  if (status >= 500) return `Provider error (${status}); try again in a moment.`
  return `Unexpected response (HTTP ${status}).`
}

const probe = (url: string, headers: Record<string, string>): Promise<ValidationResult> =>
  fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    .then((res) => (res.ok ? { ok: true } : { ok: false, reason: reasonForStatus(res.status) }))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("aborted") || message.includes("timeout"))
        return { ok: false, reason: "Validation timed out after 10s — check your network." }
      return { ok: false, reason: `Network error: ${message}` }
    })

export const validateAnthropic = (key: string): Promise<ValidationResult> =>
  probe("https://api.anthropic.com/v1/models", {
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  })

export const validateOpenAI = (key: string): Promise<ValidationResult> =>
  probe("https://api.openai.com/v1/models", {
    Authorization: `Bearer ${key}`,
  })

export const validateOpenRouter = (key: string): Promise<ValidationResult> =>
  probe("https://openrouter.ai/api/v1/models", {
    Authorization: `Bearer ${key}`,
  })

export const probeOllama = (): Promise<{ ok: boolean }> =>
  fetch("http://localhost:11434/api/tags", { method: "GET", signal: AbortSignal.timeout(2_000) })
    .then((res) => ({ ok: res.ok }))
    .catch(() => ({ ok: false }))
