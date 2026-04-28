/**
 * `ollama-local` — Arthas's first-class provider for a locally-running Ollama
 * instance. Wraps `OllamaClient` from `arthas-triage`.
 *
 * Hard rules (mirrored from `triage-engineer`):
 *  - Never auto-start Ollama. Never pull models without explicit user intent.
 *  - `/api/tags` failures degrade to an empty model list — they MUST NOT crash
 *    the CLI or block other providers from initializing.
 *  - No try/catch. We use `.catch()` chains and the `OllamaClient.health()`
 *    sentinel (`{ ok: false }`) to signal "Ollama unreachable".
 *
 * Implementation status:
 *  - listModels (via `discoverModels`): IMPLEMENTED — probes `/api/tags` once
 *    at provider init and feeds names through to opencode's model registry.
 *  - chat / completion: WIRED through `@ai-sdk/openai-compatible`, which talks
 *    to Ollama's OpenAI-compatible endpoint at `${baseUrl}/v1`. Most local
 *    models route through that path without further translation.
 *  - streaming: same path as chat (provider streams via SSE).
 *  - embeddings: NOT routed through opencode's provider system yet — the
 *    `arthas-triage` package owns embeddings via `OllamaClient.embed()`
 *    directly and writes to `~/.arthas/embeddings.db`. See `triage-engineer`.
 */

import { OllamaClient } from "arthas-triage/ollama-client"
import { Effect } from "effect"
import * as Log from "@opencode-ai/core/util/log"

import type * as ModelsDev from "../models"
import { ModelID, ProviderID } from "../schema"
import type { Info, Model } from "../provider"

const log = Log.create({ service: "provider.ollama-local" })

export const PROVIDER_ID = "ollama-local"
const DEFAULT_BASE_URL = "http://localhost:11434"
// Ollama's OpenAI-compatible API lives at /v1. The bundled `@ai-sdk/openai-compatible`
// SDK appends paths like /chat/completions to this baseURL.
const OPENAI_COMPAT_PATH = "/v1"
const OPENAI_COMPAT_NPM = "@ai-sdk/openai-compatible"

/**
 * Models.dev-shaped synthetic database entry. opencode's provider loader keys
 * into a `database: Record<string, ModelsDev.Provider>` before custom loaders
 * run; injecting this entry lets `mergeProvider("ollama-local", ...)` succeed
 * without us having to publish anything to models.dev.
 */
export const databaseEntry: ModelsDev.Provider = {
  id: PROVIDER_ID,
  name: "Ollama (local)",
  api: `${DEFAULT_BASE_URL}${OPENAI_COMPAT_PATH}`,
  npm: OPENAI_COMPAT_NPM,
  env: ["OLLAMA_BASE_URL"],
  models: {},
}

/**
 * Build a placeholder `Model` record for an Ollama-served model whose name we
 * learned via `/api/tags`. We don't know the model's true context window, cost
 * (zero, but recorded for completeness), or capabilities — so we use sane
 * defaults. Users can override per-model in opencode.json if needed.
 */
function makeModel(id: string, baseURL: string): Model {
  return {
    id: ModelID.make(id),
    providerID: ProviderID.make(PROVIDER_ID),
    name: id,
    family: "ollama",
    api: {
      id,
      url: `${baseURL}${OPENAI_COMPAT_PATH}`,
      npm: OPENAI_COMPAT_NPM,
    },
    status: "active",
    headers: {},
    options: {},
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    // Conservative default; most modern local models support >=8k. Users can
    // override `limit.context` in opencode.json per model if needed.
    limit: { context: 8192, output: 4096 },
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: false,
      toolcall: true,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    release_date: "",
    variants: {},
  }
}

interface LoaderDep {
  env: () => Effect.Effect<Record<string, string | undefined>>
}

/**
 * Custom loader for `ollama-local`. Mirrors the shape of the loaders in
 * `provider.ts#custom()` (autoload + getModel + discoverModels). Probes
 * `/api/tags` once via `OllamaClient.health()`. If unreachable: `autoload:
 * false` and an empty model map — opencode then drops the provider from the
 * active list, so `models ollama-local` simply prints nothing rather than
 * surfacing an error.
 */
export const loader = (dep: LoaderDep) =>
  Effect.gen(function* () {
    const env = yield* dep.env()
    const baseUrl = (env["OLLAMA_BASE_URL"] ?? DEFAULT_BASE_URL).replace(/\/+$/, "")
    const client = new OllamaClient({ baseUrl })
    const health = yield* Effect.promise(() => client.health())

    if (!health.ok) {
      log.info("ollama unreachable; provider will report empty model list", { baseUrl })
      // We always autoload `ollama-local`, even when the daemon is down. The
      // provider survives in the registry with zero models — see the
      // ollama-local exception in provider.ts's empty-models filter — so
      // `opencode models ollama-local` prints an empty list rather than
      // "provider not found". The cloud path is never blocked.
      return {
        autoload: true,
        options: {
          baseURL: `${baseUrl}${OPENAI_COMPAT_PATH}`,
          // openai-compatible SDK demands an apiKey; Ollama ignores it but
          // omitting causes the SDK constructor to throw. Use a sentinel.
          apiKey: "ollama-local",
        },
        async discoverModels(): Promise<Record<string, Model>> {
          return {}
        },
      }
    }

    const names = health.models ?? []
    log.info("ollama reachable; discovered models", { baseUrl, count: names.length })

    return {
      autoload: true,
      options: {
        baseURL: `${baseUrl}${OPENAI_COMPAT_PATH}`,
        apiKey: "ollama-local",
      },
      async discoverModels(): Promise<Record<string, Model>> {
        const result: Record<string, Model> = {}
        for (const name of names) {
          result[name] = makeModel(name, baseUrl)
        }
        return result
      },
    }
  })

export * as OllamaLocal from "./index"
