/**
 * Minimal HTTP client for a local Ollama instance.
 *
 * Hard rules:
 * - No try/catch. Failures bubble through `.catch()` chains and resolve to
 *   safe sentinels for `health()`; streaming/generate/embed surface errors
 *   to the caller.
 * - Never auto-start Ollama. Never pull models without explicit caller intent.
 * - The `health()` probe must never throw — we degrade silently so the cloud
 *   path is never blocked by an unreachable local daemon.
 */

export interface OllamaHealth {
  ok: boolean
  models?: string[]
}

export interface OllamaPullEvent {
  status: string
  completed?: number
  total?: number
}

export interface OllamaGenerateRequest {
  model: string
  prompt: string
  stream?: false
}

export interface OllamaGenerateResponse {
  response: string
  eval_count: number
  total_duration: number
}

export interface OllamaEmbedRequest {
  model: string
  input: string | string[]
}

export interface OllamaEmbedResponse {
  embeddings: number[][]
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string }>
}

export class OllamaClient {
  readonly baseUrl: string

  constructor(opts?: { baseUrl?: string }) {
    this.baseUrl = (opts?.baseUrl ?? "http://localhost:11434").replace(/\/+$/, "")
  }

  /**
   * Probe `/api/tags`. Never throws. Returns `{ ok: false }` on any failure
   * (network error, non-2xx, malformed JSON).
   */
  health(): Promise<OllamaHealth> {
    return fetch(`${this.baseUrl}/api/tags`)
      .then((res) => (res.ok ? (res.json() as Promise<OllamaTagsResponse>) : Promise.reject(new Error("not ok"))))
      .then((data): OllamaHealth => {
        const models = (data.models ?? [])
          .map((m) => m.name)
          .filter((n): n is string => typeof n === "string")
        return { ok: true, models }
      })
      .catch((): OllamaHealth => ({ ok: false }))
  }

  /**
   * Wraps `/api/pull` (streaming NDJSON). Yields one event per line.
   * Caller is responsible for handling errors — we do NOT silently swallow
   * pull failures, since pulling is always an explicit user action.
   */
  pullModel(name: string): AsyncIterable<OllamaPullEvent> {
    const url = `${this.baseUrl}/api/pull`
    return {
      [Symbol.asyncIterator]: () => streamNdjson<OllamaPullEvent>(url, { name, stream: true }),
    }
  }

  generate(req: OllamaGenerateRequest): Promise<OllamaGenerateResponse> {
    return fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...req, stream: false }),
    })
      .then((res) => (res.ok ? (res.json() as Promise<OllamaGenerateResponse>) : Promise.reject(new Error(`ollama generate failed: ${res.status}`))))
  }

  embed(req: OllamaEmbedRequest): Promise<OllamaEmbedResponse> {
    return fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    })
      .then((res) => (res.ok ? (res.json() as Promise<OllamaEmbedResponse>) : Promise.reject(new Error(`ollama embed failed: ${res.status}`))))
  }
}

function streamNdjson<T>(url: string, body: unknown): AsyncIterator<T> {
  const reader = fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((res) => {
    if (!res.ok || !res.body) return Promise.reject(new Error(`ollama stream failed: ${res.status}`))
    return res.body.getReader()
  })

  const decoder = new TextDecoder()
  const buf = { value: "" }

  const next = (): Promise<IteratorResult<T>> =>
    reader.then((r) =>
      r.read().then((chunk) => {
        if (chunk.done) {
          const tail = buf.value.trim()
          buf.value = ""
          if (tail.length === 0) return { value: undefined as unknown as T, done: true }
          return { value: JSON.parse(tail) as T, done: false }
        }
        buf.value += decoder.decode(chunk.value, { stream: true })
        const newlineIndex = buf.value.indexOf("\n")
        if (newlineIndex === -1) return next()
        const line = buf.value.slice(0, newlineIndex).trim()
        buf.value = buf.value.slice(newlineIndex + 1)
        if (line.length === 0) return next()
        return { value: JSON.parse(line) as T, done: false }
      }),
    )

  return {
    next,
    return: (): Promise<IteratorResult<T>> =>
      reader
        .then((r) => r.cancel())
        .catch(() => undefined)
        .then(() => ({ value: undefined as unknown as T, done: true })),
  }
}
