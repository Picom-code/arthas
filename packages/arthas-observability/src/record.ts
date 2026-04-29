import * as DateTime from "effect/DateTime"
import { Schema } from "effect"

// Every provider opencode ships with as of fork point. "other" catches
// providers added upstream after this list was last refreshed so unknown IDs
// surface honestly instead of silently misattributing spend to "openai".
export const Provider = Schema.Literals([
  "anthropic",
  "openai",
  "openrouter",
  "bedrock",
  "vertex",
  "google",
  "groq",
  "mistral",
  "cohere",
  "perplexity",
  "xai",
  "azure",
  "cerebras",
  "deepinfra",
  "togetherai",
  "alibaba",
  "vercel",
  "gateway",
  "copilot",
  "gitlab",
  "venice",
  "poe",
  "deepseek",
  "ollama-local",
  "other",
])
export type Provider = Schema.Schema.Type<typeof Provider>

export const Route = Schema.Literals(["cloud", "local"])
export type Route = Schema.Schema.Type<typeof Route>

export class ObservabilityRecord extends Schema.Class<ObservabilityRecord>("Arthas.Observability.Record")({
  turnId: Schema.String,
  sessionId: Schema.String,
  timestamp: Schema.DateTimeUtc,
  model: Schema.String,
  provider: Provider,
  route: Route,
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  cacheCreationInputTokens: Schema.Number.pipe(Schema.optional),
  cacheReadInputTokens: Schema.Number.pipe(Schema.optional),
  costUsd: Schema.Number,
  latencyMs: Schema.Number,
  toolCallCount: Schema.Number,
  toolCallLatencyMsTotal: Schema.Number.pipe(Schema.optional),
}) {
  static create(input: {
    turnId: string
    sessionId: string
    model: string
    provider: Provider
    route: Route
    inputTokens: number
    outputTokens: number
    costUsd: number
    latencyMs: number
    toolCallCount: number
    cacheCreationInputTokens?: number
    cacheReadInputTokens?: number
    toolCallLatencyMsTotal?: number
    timestamp?: Schema.Schema.Type<typeof Schema.DateTimeUtc>
  }) {
    return new ObservabilityRecord({
      turnId: input.turnId,
      sessionId: input.sessionId,
      timestamp: input.timestamp ?? DateTime.makeUnsafe(Date.now()),
      model: input.model,
      provider: input.provider,
      route: input.route,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cacheCreationInputTokens: input.cacheCreationInputTokens,
      cacheReadInputTokens: input.cacheReadInputTokens,
      costUsd: input.costUsd,
      latencyMs: input.latencyMs,
      toolCallCount: input.toolCallCount,
      toolCallLatencyMsTotal: input.toolCallLatencyMsTotal,
    })
  }
}

export const encode = Schema.encodeSync(ObservabilityRecord)
export const decode = Schema.decodeUnknownSync(ObservabilityRecord)
