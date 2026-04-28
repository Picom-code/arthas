<p align="center">
  <strong>Arthas</strong>
</p>
<p align="center">A knight-themed AI agent harness with cross-device sync, heavy observability, and local-compute acceleration.</p>

---

> ⚔️ **Frostmourne hungers...**
>
> Arthas is a personal-use first, distributable later AI agent CLI. Forked from [sst/opencode](https://github.com/sst/opencode) — see [ATTRIBUTION.md](./ATTRIBUTION.md). Differentiators:
>
> 1. **Cross-device chat continuity** — start a conversation in your terminal, SSH into a GPU box and continue it, then resume from your phone. Cloud sync is opt-in.
> 2. **Heavy observability** — live token / cost / cache-hit / tool-latency dashboard, structured JSONL event logs, optional OTLP export, replay-from-event-N debugging.
> 3. **Local-compute acceleration** — small local model (Qwen 3.5 / Llama 3.x via Ollama) handles trivial routing, summarization, and embeddings to cut tokens and latency.

## Status

Pre-alpha. Active build in progress.

## Provider support

BYO API key. Anthropic, OpenAI, OpenRouter, Bedrock, Vertex, local Ollama.

## License

MIT — see [LICENSE](./LICENSE) and [ATTRIBUTION.md](./ATTRIBUTION.md).
