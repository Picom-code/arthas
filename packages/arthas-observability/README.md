# arthas-observability

Append-only JSONL event log, `ObservabilityRecord` schema, and a pure cost meter for the Arthas agent harness. The package is bus-agnostic: it exposes types and a writer; wiring is owned by the consumer.

## Wiring into the bus

To plumb this into opencode's existing event bus, create a subscriber inside `packages/opencode/src/observability/` that listens for `SessionEvent.Step.Ended` (or your turn-completed event of choice), maps the payload into an `ObservabilityRecord` via `ObservabilityRecord.create({ ... })`, and pushes it through a per-session `EventLog` instance (`new EventLog(sessionId)` defaults to `~/.arthas/sessions/<id>.events.jsonl`). Tool latency totals can be aggregated from `Tool.Called`/`Tool.Success`/`Tool.Error` pairs over the turn window. The `summarize()` helper in `cost-meter.ts` is what `tome cost` will call after streaming records back via `EventLog#read()`.
