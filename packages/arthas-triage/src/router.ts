/**
 * RouteLLM-style router scaffolding.
 *
 * NOTE: This is a stub. The real classifier (small local model or learned
 * confidence-weighted rules) lands in a follow-up. For now the rule is naive:
 *
 *   - localEnabled === false                  -> cloud
 *   - prompt.length < threshold && no files
 *     && no tools                             -> local
 *   - otherwise                               -> cloud
 *
 * Always require explicit opt-in via `localEnabled`. Never auto-route to local
 * if the user hasn't enabled it.
 */

export type RouteDecision =
  | { route: "cloud"; reason: string; confidence: number }
  | { route: "local"; reason: string; confidence: number; suggestedModel: string }

export interface RouterOptions {
  localEnabled: boolean
  /** Max prompt length (chars) for the local fast-path. Default 120. */
  threshold?: number
  /** Model name passed through to Ollama for local routes. Default `qwen2.5:4b`. */
  defaultLocalModel?: string
}

export interface RouteContext {
  hasFiles: boolean
  hasTools: boolean
}

export class Router {
  readonly localEnabled: boolean
  readonly threshold: number
  readonly defaultLocalModel: string

  constructor(opts: RouterOptions) {
    this.localEnabled = opts.localEnabled
    this.threshold = opts.threshold ?? 120
    this.defaultLocalModel = opts.defaultLocalModel ?? "qwen2.5:4b"
  }

  /**
   * Decide where to route a prompt. Returns a `RouteDecision` with a
   * `reason` string suitable for the observability sidebar.
   *
   * Confidence values are placeholders (0.5 / 0.9) until a real classifier
   * replaces this stub.
   */
  decide(prompt: string, ctx?: RouteContext): RouteDecision {
    if (!this.localEnabled) {
      return {
        route: "cloud",
        reason: "local routing disabled",
        confidence: 0.9,
      }
    }
    const hasFiles = ctx?.hasFiles ?? false
    const hasTools = ctx?.hasTools ?? false
    if (hasFiles || hasTools) {
      return {
        route: "cloud",
        reason: hasFiles ? "prompt has file attachments" : "prompt requires tool calls",
        confidence: 0.9,
      }
    }
    if (prompt.length >= this.threshold) {
      return {
        route: "cloud",
        reason: `prompt length ${prompt.length} >= threshold ${this.threshold}`,
        confidence: 0.6,
      }
    }
    return {
      route: "local",
      reason: `short prompt (${prompt.length} chars), no files, no tools`,
      confidence: 0.5,
      suggestedModel: this.defaultLocalModel,
    }
  }
}
