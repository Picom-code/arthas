import type { ObservabilityRecord, Provider } from "./record.ts"

export interface Totals {
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  turnCount: number
}

export interface Summary extends Totals {
  cacheHitRatio: number
  byProvider: Record<string, Totals>
  byModel: Record<string, Totals>
  localShare: number
}

const emptyTotals = (): Totals => ({
  totalCostUsd: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
  turnCount: 0,
})

const accumulate = (acc: Totals, r: ObservabilityRecord): Totals => ({
  totalCostUsd: acc.totalCostUsd + r.costUsd,
  totalInputTokens: acc.totalInputTokens + r.inputTokens,
  totalOutputTokens: acc.totalOutputTokens + r.outputTokens,
  cacheCreationInputTokens: acc.cacheCreationInputTokens + (r.cacheCreationInputTokens ?? 0),
  cacheReadInputTokens: acc.cacheReadInputTokens + (r.cacheReadInputTokens ?? 0),
  turnCount: acc.turnCount + 1,
})

const groupBy = <K extends string>(
  records: ReadonlyArray<ObservabilityRecord>,
  key: (r: ObservabilityRecord) => K,
): Record<K, Totals> => {
  const out: Partial<Record<K, Totals>> = {}
  for (const r of records) {
    const k = key(r)
    out[k] = accumulate(out[k] ?? emptyTotals(), r)
  }
  return out as Record<K, Totals>
}

export const summarize = (records: ReadonlyArray<ObservabilityRecord>): Summary => {
  const overall = records.reduce((acc, r) => accumulate(acc, r), emptyTotals())
  const cacheBase = overall.totalInputTokens + overall.cacheReadInputTokens + overall.cacheCreationInputTokens
  const cacheHitRatio = cacheBase === 0 ? 0 : overall.cacheReadInputTokens / cacheBase
  const localTurns = records.filter((r) => r.route === "local").length
  const localShare = records.length === 0 ? 0 : localTurns / records.length
  return {
    ...overall,
    cacheHitRatio,
    byProvider: groupBy<Provider>(records, (r) => r.provider),
    byModel: groupBy<string>(records, (r) => r.model),
    localShare,
  }
}
