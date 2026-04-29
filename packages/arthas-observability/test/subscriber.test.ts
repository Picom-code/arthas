import { afterAll, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EventLog } from "../src/event-log.ts"
import { Subscriber, type BusLike, type BusPayload } from "../src/subscriber.ts"

interface RecordedHandler {
  eventType: string
  handler: (payload: BusPayload) => void
}

const makeFakeBus = () => {
  const handlers: RecordedHandler[] = []
  const bus: BusLike = {
    subscribe(eventType, handler) {
      const entry: RecordedHandler = { eventType, handler }
      handlers.push(entry)
      return () => {
        const idx = handlers.indexOf(entry)
        if (idx >= 0) handlers.splice(idx, 1)
      }
    },
  }
  const emit = (eventType: string, properties: unknown) => {
    for (const h of handlers) {
      if (h.eventType === eventType) h.handler({ type: eventType, properties })
    }
  }
  return { bus, emit, handlers }
}

const tempDirs: string[] = []
const newTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "arthas-obs-test-"))
  tempDirs.push(dir)
  return dir
}

afterAll(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true })
})

test("Subscriber writes ObservabilityRecord on assistant message.updated with completed time", async () => {
  const dir = await newTempDir()
  const { bus, emit, handlers } = makeFakeBus()
  const sub = new Subscriber({
    bus,
    logFor: (sessionId) => new EventLog(sessionId, dir),
  })
  const stop = sub.start()

  expect(handlers.length).toBe(2)
  expect(handlers.map((h) => h.eventType).sort()).toEqual(["message.part.updated", "message.updated"])

  emit("message.part.updated", {
    sessionID: "sess_1",
    part: {
      type: "tool",
      sessionID: "sess_1",
      callID: "call_a",
      tool: "read",
      state: { status: "completed", time: { start: 1000, end: 1300 } },
    },
    time: 1300,
  })

  // Duplicate emission for same callID must not double-count
  emit("message.part.updated", {
    sessionID: "sess_1",
    part: {
      type: "tool",
      sessionID: "sess_1",
      callID: "call_a",
      tool: "read",
      state: { status: "completed", time: { start: 1000, end: 1300 } },
    },
    time: 1310,
  })

  emit("message.updated", {
    sessionID: "sess_1",
    info: {
      id: "msg_1",
      sessionID: "sess_1",
      role: "assistant",
      time: { created: 500, completed: 1500 },
      providerID: "anthropic",
      modelID: "claude-sonnet-4-5",
      cost: 0.0042,
      tokens: {
        input: 100,
        output: 50,
        reasoning: 0,
        cache: { read: 80, write: 20 },
      },
    },
  })

  // Allow the async append to flush
  await new Promise((r) => setTimeout(r, 25))

  const path = join(dir, "sess_1.events.jsonl")
  const lines = (await readFile(path, "utf8")).trim().split("\n")
  expect(lines.length).toBe(1)
  const record = JSON.parse(lines[0]!) as Record<string, unknown>
  expect(record.sessionId).toBe("sess_1")
  expect(record.turnId).toBe("msg_1")
  expect(record.model).toBe("claude-sonnet-4-5")
  expect(record.provider).toBe("anthropic")
  expect(record.route).toBe("cloud")
  expect(record.inputTokens).toBe(100)
  expect(record.outputTokens).toBe(50)
  expect(record.cacheReadInputTokens).toBe(80)
  expect(record.cacheCreationInputTokens).toBe(20)
  expect(record.costUsd).toBeCloseTo(0.0042, 6)
  expect(record.latencyMs).toBe(1000)
  expect(record.toolCallCount).toBe(1)
  expect(record.toolCallLatencyMsTotal).toBe(300)

  stop()
  expect(handlers.length).toBe(0)
})

test("Subscriber ignores user messages and assistant messages without completed time", async () => {
  const dir = await newTempDir()
  const { bus, emit } = makeFakeBus()
  const sub = new Subscriber({
    bus,
    logFor: (sessionId) => new EventLog(sessionId, dir),
  })
  sub.start()

  emit("message.updated", {
    sessionID: "sess_2",
    info: { role: "user" },
  })
  emit("message.updated", {
    sessionID: "sess_2",
    info: {
      id: "msg_x",
      sessionID: "sess_2",
      role: "assistant",
      time: { created: 100 },
      providerID: "anthropic",
      modelID: "claude-sonnet-4-5",
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    },
  })

  await new Promise((r) => setTimeout(r, 25))
  const path = join(dir, "sess_2.events.jsonl")
  const file = Bun.file(path)
  expect(await file.exists()).toBe(false)

  sub.stop()
})

test("Subscriber maps unknown providerID to 'other' (no silent misattribution)", async () => {
  const dir = await newTempDir()
  const { bus, emit } = makeFakeBus()
  const sub = new Subscriber({
    bus,
    logFor: (sessionId) => new EventLog(sessionId, dir),
  })
  sub.start()

  emit("message.updated", {
    sessionID: "sess_3",
    info: {
      id: "msg_3",
      sessionID: "sess_3",
      role: "assistant",
      time: { created: 0, completed: 200 },
      providerID: "totally-made-up",
      modelID: "x",
      cost: 0,
      tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
    },
  })

  await new Promise((r) => setTimeout(r, 25))
  const lines = (await readFile(join(dir, "sess_3.events.jsonl"), "utf8")).trim().split("\n")
  const record = JSON.parse(lines[0]!) as Record<string, unknown>
  expect(record.provider).toBe("other")

  sub.stop()
})
