// =============================================================================
// Arthas Observability — Bus → JSONL pipeline
// =============================================================================
//
// `Subscriber` registers handlers on a bus-like object and forwards LLM-turn
// and tool-call telemetry into a per-session JSONL `EventLog`.
//
// ── Bus event → ObservabilityRecord mapping ─────────────────────────────────
//
//   message.updated            (opencode SyncEvent, payload: { sessionID, info })
//     • triggers when info.role === "assistant" AND info.time.completed is set
//     • carries: providerID, modelID, cost, tokens.{input,output,cache.{read,write}}
//     • derived: latencyMs = time.completed - time.created
//     • emits: ObservabilityRecord with full token/cost/latency fields
//
//   message.part.updated       (opencode SyncEvent, payload: { sessionID, part, time })
//     • only handled when part.type === "tool" AND part.state.status is
//       "completed" or "error"; tracked per-callID to compute toolCallCount
//       and toolCallLatencyMsTotal that get attached to the next/current
//       assistant ObservabilityRecord for that session.
//     • opencode does NOT emit a discrete "tool ended" record on the bus,
//       so we attribute completed tool calls to the assistant turn they
//       belong to (same sessionID, accumulated until the assistant message
//       completes).
//
// ── Fields we cannot fully populate from current opencode events ────────────
//
//   route               — derived from providerID: "ollama-local" → "local",
//                         everything else → "cloud". This is correct today
//                         because routing decisions in arthas v0 are 1:1 with
//                         provider selection. When triage-engineer adds a real
//                         classifier emitting `triage.decision`, swap to
//                         consuming that event for richer reason/confidence.
//   provider (literal)  — opencode's providerID is a free-form string; we map
//                         the well-known IDs to the Provider literal in
//                         record.ts and surface anything else as "other"
//                         (see coerceProvider). Adding a new opencode provider
//                         requires extending Provider + PROVIDER_ALIASES.
//   turnId              — opencode lacks a stable per-turn identifier on the
//                         bus payload, so we use the assistant message id.
//
// ── What we'd need from cli-builder / session layer to fill the gaps ────────
//
//   1. A `triage.decision` BusEvent carrying `{ sessionID, route: "cloud" |
//      "local", providerID, modelID }` published just before each turn.
//   2. A `tool.ended` BusEvent (or include the tool-call latency on the
//      assistant message.updated payload) so we don't have to accumulate
//      across part.updated.
// =============================================================================

import { EventLog } from "./event-log.ts"
import { ObservabilityRecord, type Provider, type Route } from "./record.ts"

export interface BusPayload<P = unknown> {
  type: string
  properties: P
}

export interface BusLike {
  subscribe(eventType: string, handler: (payload: BusPayload) => void): () => void
}

interface AssistantInfo {
  readonly id: string
  readonly sessionID: string
  readonly role: "assistant"
  readonly time: { readonly created: number; readonly completed?: number }
  readonly providerID: string
  readonly modelID: string
  readonly cost: number
  readonly tokens: {
    readonly input: number
    readonly output: number
    readonly reasoning: number
    readonly cache: { readonly read: number; readonly write: number }
  }
}

interface UserInfo {
  readonly role: "user"
}

interface MessageUpdatedPayload {
  readonly sessionID: string
  readonly info: AssistantInfo | UserInfo
}

interface ToolPart {
  readonly type: "tool"
  readonly sessionID: string
  readonly state: ToolState
}

interface OtherPart {
  readonly type: string
  readonly sessionID: string
}

interface ToolStateCompleted {
  readonly status: "completed"
  readonly time: { readonly start: number; readonly end: number }
}

interface ToolStateError {
  readonly status: "error"
  readonly time: { readonly start: number; readonly end: number }
}

interface ToolStateOther {
  readonly status: string
}

type ToolState = ToolStateCompleted | ToolStateError | ToolStateOther

interface PartUpdatedPayload {
  readonly sessionID: string
  readonly part: ToolPart | OtherPart
  readonly time: number
}

interface ToolCallAccumulator {
  count: number
  latencyMsTotal: number
  seenCallIDs: Set<string>
}

const KNOWN_PROVIDERS: ReadonlyArray<Provider> = [
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
]

// Maps opencode's free-form providerID to our typed Provider literal.
// Includes upstream variant strings (e.g. "amazon-bedrock", "google-vertex").
const PROVIDER_ALIASES: Record<string, Provider> = {
  "anthropic": "anthropic",
  "openai": "openai",
  "openrouter": "openrouter",
  "bedrock": "bedrock",
  "amazon-bedrock": "bedrock",
  "vertex": "vertex",
  "google-vertex": "vertex",
  "google-vertex-anthropic": "vertex",
  "google": "google",
  "groq": "groq",
  "mistral": "mistral",
  "cohere": "cohere",
  "perplexity": "perplexity",
  "xai": "xai",
  "azure": "azure",
  "cerebras": "cerebras",
  "deepinfra": "deepinfra",
  "togetherai": "togetherai",
  "together": "togetherai",
  "alibaba": "alibaba",
  "vercel": "vercel",
  "gateway": "gateway",
  "ai-gateway": "gateway",
  "copilot": "copilot",
  "github-copilot": "copilot",
  "gitlab": "gitlab",
  "venice": "venice",
  "poe": "poe",
  "deepseek": "deepseek",
  "ollama": "ollama-local",
  "ollama-local": "ollama-local",
}

// Unknown providerIDs surface as "other" so spend isn't silently misattributed.
const coerceProvider = (providerID: string): Provider => {
  const aliased = PROVIDER_ALIASES[providerID]
  if (aliased) return aliased
  if ((KNOWN_PROVIDERS as ReadonlyArray<string>).includes(providerID)) return providerID as Provider
  return "other"
}

const isAssistantInfo = (info: AssistantInfo | UserInfo): info is AssistantInfo => info.role === "assistant"

const isToolPart = (part: ToolPart | OtherPart): part is ToolPart => part.type === "tool"

const hasEndedTime = (state: ToolState): state is ToolStateCompleted | ToolStateError =>
  state.status === "completed" || state.status === "error"

export interface SubscriberOptions {
  readonly bus: BusLike
  readonly logFor: (sessionId: string) => EventLog
  // Optional override for route derivation. Default: "ollama-local" → "local",
  // everything else → "cloud". Will be replaced/augmented when a real
  // `triage.decision` bus event is published per-turn.
  readonly routeFor?: (provider: Provider) => Route
}

const defaultRouteFor = (provider: Provider): Route => (provider === "ollama-local" ? "local" : "cloud")

export class Subscriber {
  readonly #bus: BusLike
  readonly #logFor: (sessionId: string) => EventLog
  readonly #routeFor: (provider: Provider) => Route
  readonly #toolAccum = new Map<string, ToolCallAccumulator>()
  readonly #unsubscribers: Array<() => void> = []
  #started = false

  constructor(options: SubscriberOptions) {
    this.#bus = options.bus
    this.#logFor = options.logFor
    this.#routeFor = options.routeFor ?? defaultRouteFor
  }

  start(): () => void {
    if (this.#started) return this.stop.bind(this)
    this.#started = true
    this.#unsubscribers.push(
      this.#bus.subscribe("message.updated", (payload) => {
        this.#onMessageUpdated(payload.properties as MessageUpdatedPayload)
      }),
    )
    this.#unsubscribers.push(
      this.#bus.subscribe("message.part.updated", (payload) => {
        this.#onPartUpdated(payload.properties as PartUpdatedPayload)
      }),
    )
    return this.stop.bind(this)
  }

  stop(): void {
    if (!this.#started) return
    this.#started = false
    for (const off of this.#unsubscribers) off()
    this.#unsubscribers.length = 0
    this.#toolAccum.clear()
  }

  #accum(sessionID: string): ToolCallAccumulator {
    const existing = this.#toolAccum.get(sessionID)
    if (existing) return existing
    const fresh: ToolCallAccumulator = { count: 0, latencyMsTotal: 0, seenCallIDs: new Set() }
    this.#toolAccum.set(sessionID, fresh)
    return fresh
  }

  #onPartUpdated(payload: PartUpdatedPayload): void {
    if (!isToolPart(payload.part)) return
    const state = payload.part.state
    if (!hasEndedTime(state)) return
    // Each completed tool call updates message.part.updated multiple times
    // (running → completed). Dedupe by callID via the discriminated state to
    // avoid double-counting; tool parts carry callID at runtime even though
    // we don't model the full ToolPart shape here.
    const callID = (payload.part as { callID?: string }).callID
    const accum = this.#accum(payload.sessionID)
    const dedupKey = callID ?? `${payload.sessionID}:${state.time.start}:${state.time.end}`
    if (accum.seenCallIDs.has(dedupKey)) return
    accum.seenCallIDs.add(dedupKey)
    accum.count += 1
    accum.latencyMsTotal += Math.max(0, state.time.end - state.time.start)
  }

  async #onMessageUpdated(payload: MessageUpdatedPayload): Promise<void> {
    const info = payload.info
    if (!isAssistantInfo(info)) return
    const completed = info.time.completed
    if (completed === undefined) return
    const accum = this.#toolAccum.get(payload.sessionID)
    const provider = coerceProvider(info.providerID)
    const record = ObservabilityRecord.create({
      turnId: info.id,
      sessionId: info.sessionID,
      model: info.modelID,
      provider,
      route: this.#routeFor(provider),
      inputTokens: info.tokens.input,
      outputTokens: info.tokens.output,
      cacheReadInputTokens: info.tokens.cache.read,
      cacheCreationInputTokens: info.tokens.cache.write,
      // Trust opencode's info.cost ($USD). Some providers report 0 (e.g. when
      // opencode hasn't priced the model); deriving cost client-side from
      // token counts × pricing is fragile (drift) and not done here. The
      // observed value is whatever opencode publishes on the bus.
      costUsd: info.cost,
      latencyMs: Math.max(0, completed - info.time.created),
      toolCallCount: accum?.count ?? 0,
      toolCallLatencyMsTotal: accum?.latencyMsTotal,
    })
    this.#toolAccum.delete(payload.sessionID)
    await this.#logFor(payload.sessionID).append(record)
  }
}
