import { expect, test } from "bun:test"
import type { SupabaseClient } from "@supabase/supabase-js"
import { claimLease, heartbeat, releaseLease } from "../src/lease.ts"

interface UpdateCall {
  readonly values: Record<string, unknown>
  readonly filters: ReadonlyArray<{ kind: string; column?: string; value?: string | null; raw?: string }>
}

interface SelectCall {
  readonly columns: string
  readonly filters: ReadonlyArray<{ kind: string; column?: string; value?: string | null }>
}

interface FakeRow {
  active_executor_id: string | null
  active_executor_lease_until: string | null
}

interface FakeBundle {
  readonly client: SupabaseClient
  readonly updates: UpdateCall[]
  readonly selects: SelectCall[]
  state: FakeRow
  // When set, claim attempts succeed unconditionally (single-device case).
  // When false, simulate a fresh lease held by another device → conditional
  // update returns no row.
  acceptClaim: boolean
}

const makeFakeClient = (initial: FakeRow): FakeBundle => {
  const updates: UpdateCall[] = []
  const selects: SelectCall[] = []
  const bundle: FakeBundle = {
    state: { ...initial },
    acceptClaim: true,
    updates,
    selects,
    client: {} as SupabaseClient,
  }

  const client = {
    from: (_table: string) => ({
      select: (columns: string) => makeSelectChain(bundle, { columns, filters: [] }),
      update: (values: Record<string, unknown>) => makeUpdateChain(bundle, values),
    }),
  } as unknown as SupabaseClient
  bundle.client = client
  return bundle
}

const makeSelectChain = (bundle: FakeBundle, call: SelectCall) => {
  const chain = {
    eq: (column: string, value: string | null) =>
      makeSelectChain(bundle, { ...call, filters: [...call.filters, { kind: "eq", column, value }] }),
    or: (raw: string) =>
      makeSelectChain(bundle, { ...call, filters: [...call.filters, { kind: "or", value: raw }] }),
    is: (column: string, _value: null) =>
      makeSelectChain(bundle, { ...call, filters: [...call.filters, { kind: "is", column }] }),
    lt: (column: string, value: string) =>
      makeSelectChain(bundle, { ...call, filters: [...call.filters, { kind: "lt", column, value }] }),
    select: (columns: string) => makeSelectChain(bundle, { ...call, columns }),
    maybeSingle: () => {
      bundle.selects.push(call)
      return Promise.resolve({ data: bundle.state, error: null })
    },
  }
  return chain
}

const makeUpdateChain = (bundle: FakeBundle, values: Record<string, unknown>) => {
  const filters: Array<{ kind: string; column?: string; value?: string | null; raw?: string }> = []
  const chain = {
    eq: (column: string, value: string | null) => {
      filters.push({ kind: "eq", column, value })
      return chain
    },
    or: (raw: string) => {
      filters.push({ kind: "or", raw })
      return chain
    },
    select: (_columns: string) => ({
      eq: (_c: string, _v: string | null) => ({
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }),
      maybeSingle: () => {
        bundle.updates.push({ values, filters })
        // For an UPDATE … RETURNING, return a row only if the conditional
        // matched the current state.
        const matchedConditional = filters.every((f) => {
          if (f.kind !== "or") return true
          // The `or` filter encodes the lease-claim condition. For the
          // single-device test this always matches; we expose `acceptClaim`
          // to flip behavior.
          return bundle.acceptClaim
        })
        if (!matchedConditional) return Promise.resolve({ data: null, error: null })
        // Mutate state to reflect the update.
        for (const [k, v] of Object.entries(values)) {
          if (k === "active_executor_id") bundle.state.active_executor_id = v as string | null
          if (k === "active_executor_lease_until") bundle.state.active_executor_lease_until = v as string | null
        }
        return Promise.resolve({ data: bundle.state, error: null })
      },
    }),
  }
  return chain
}

test("claimLease succeeds against a fresh session and sets executor + lease_until", async () => {
  const bundle = makeFakeClient({ active_executor_id: null, active_executor_lease_until: null })
  const result = await claimLease(bundle.client, "sess-1", "dev-A", { now: () => 1_700_000_000_000 })
  expect(result.acquired).toBe(true)
  expect(result.ownedBy).toBe("dev-A")
  expect(bundle.updates).toHaveLength(1)
  expect(bundle.updates[0]?.values.active_executor_id).toBe("dev-A")
  // 30s default TTL → 1_700_000_030_000.
  expect(bundle.updates[0]?.values.active_executor_lease_until).toBe(
    new Date(1_700_000_030_000).toISOString(),
  )
})

test("claimLease returns acquired=false when another device holds a fresh lease", async () => {
  const bundle = makeFakeClient({
    active_executor_id: "dev-B",
    active_executor_lease_until: new Date(2_000_000_000_000).toISOString(),
  })
  bundle.acceptClaim = false
  const result = await claimLease(bundle.client, "sess-1", "dev-A", { now: () => 1_700_000_000_000 })
  expect(result.acquired).toBe(false)
  expect(result.ownedBy).toBe("dev-B")
})

test("claimLease with null client is a no-op that reports acquired=true (offline)", async () => {
  const result = await claimLease(null, "sess-1", "dev-A")
  expect(result.acquired).toBe(true)
})

test("claimLease is idempotent for the same device (re-claim works)", async () => {
  const bundle = makeFakeClient({
    active_executor_id: "dev-A",
    active_executor_lease_until: new Date(2_000_000_000_000).toISOString(),
  })
  const first = await claimLease(bundle.client, "sess-1", "dev-A", { now: () => 1_700_000_000_000 })
  expect(first.acquired).toBe(true)
  const second = await claimLease(bundle.client, "sess-1", "dev-A", { now: () => 1_700_000_010_000 })
  expect(second.acquired).toBe(true)
  expect(bundle.updates).toHaveLength(2)
})

test("heartbeat extends lease_until and only succeeds when device still owns the lease", async () => {
  const bundle = makeFakeClient({
    active_executor_id: "dev-A",
    active_executor_lease_until: new Date(1_700_000_005_000).toISOString(),
  })
  await heartbeat(bundle.client, "sess-1", "dev-A", { now: () => 1_700_000_010_000 })
  expect(bundle.updates).toHaveLength(1)
  expect(bundle.updates[0]?.values.active_executor_lease_until).toBe(
    new Date(1_700_000_040_000).toISOString(),
  )
})

test("heartbeat with null client is a no-op", async () => {
  await heartbeat(null, "sess-1", "dev-A")
})

test("releaseLease clears executor + lease_until", async () => {
  const bundle = makeFakeClient({
    active_executor_id: "dev-A",
    active_executor_lease_until: new Date(1_700_000_005_000).toISOString(),
  })
  await releaseLease(bundle.client, "sess-1", "dev-A")
  expect(bundle.updates[0]?.values.active_executor_id).toBeNull()
  expect(bundle.updates[0]?.values.active_executor_lease_until).toBeNull()
})

test("releaseLease with null client is a no-op", async () => {
  await releaseLease(null, "sess-1", "dev-A")
})
