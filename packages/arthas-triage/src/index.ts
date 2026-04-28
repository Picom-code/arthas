export { OllamaClient } from "./ollama-client"
export type {
  OllamaHealth,
  OllamaPullEvent,
  OllamaGenerateRequest,
  OllamaGenerateResponse,
  OllamaEmbedRequest,
  OllamaEmbedResponse,
} from "./ollama-client"

export { Router } from "./router"
export type { RouteDecision, RouterOptions, RouteContext } from "./router"

export { detectAppleSilicon } from "./system-detect"
export type { SystemInfo } from "./system-detect"
