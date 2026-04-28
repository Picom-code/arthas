# arthas-triage

Local-compute acceleration scaffolding for Arthas: a minimal Ollama HTTP client, a stub RouteLLM-style router, and an Apple Silicon / RAM detection helper. This package is intentionally inert — nothing here auto-starts Ollama, pulls models, or enables local routing without explicit caller intent.

## How `vault local enable` will wire this up

A future `arthas vault local enable` command (owned by `cli-builder`) will call `detectAppleSilicon()` to confirm the host is Apple Silicon with sufficient RAM (>= 16 GB by policy), then construct an `OllamaClient` and call `health()` to check whether Ollama is reachable. If healthy, it persists `localEnabled: true` into the user's settings and instantiates a `Router` so subsequent prompts can be classified via `router.decide(prompt, ctx)` before being dispatched to either the existing cloud provider abstraction (`packages/opencode/src/provider/`) or to `OllamaClient.generate()` for the local fast-path. `vault local disable` flips the flag; `vault local status` re-runs detection + health and reports.
