import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { Schema } from "effect"
import { ObservabilityRecord } from "./record.ts"

const decodeRecord = Schema.decodeUnknownSync(ObservabilityRecord)
const encodeRecord = Schema.encodeSync(ObservabilityRecord)

const defaultDir = () => join(homedir(), ".arthas", "sessions")

export class EventLog {
  readonly sessionId: string
  readonly dir: string
  readonly path: string

  constructor(sessionId: string, dir: string = defaultDir()) {
    this.sessionId = sessionId
    this.dir = dir
    this.path = join(dir, `${sessionId}.events.jsonl`)
  }

  async append(record: ObservabilityRecord): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const line = JSON.stringify(encodeRecord(record)) + "\n"
    const file = Bun.file(this.path)
    const exists = await file.exists()
    const previous = exists ? await file.text() : ""
    await Bun.write(this.path, previous + line)
  }

  async *read(): AsyncIterable<ObservabilityRecord> {
    const file = Bun.file(this.path)
    if (!(await file.exists())) return
    const stream = file.stream()
    const decoder = new TextDecoder()
    const reader = stream.getReader()
    let buffer = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (line.length === 0) continue
        yield decodeRecord(JSON.parse(line))
      }
    }
    const tail = buffer.trim()
    if (tail.length > 0) yield decodeRecord(JSON.parse(tail))
  }
}
