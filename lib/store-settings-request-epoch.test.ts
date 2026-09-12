/**
 * Descarte determinístico de respostas stale do StoreSettingsProvider.
 */
import { describe, expect, it } from "vitest"
import {
  applyIfLiveStoreSettingsEpoch,
  createStoreSettingsEpochGate,
  type StoreSettingsEpoch,
} from "./store-settings-request-epoch"

type Settings = { storeId: string; v: string } | null

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createProviderSim() {
  const gate = createStoreSettingsEpochGate()
  let settings: Settings = null
  let hydrated = false
  let storeId = ""

  function changeStore(next: string) {
    storeId = next
    gate.onStoreChange(next)
    settings = null
    hydrated = false
  }

  async function refresh(fetchImpl: () => Promise<Settings>) {
    const request = gate.begin(storeId)
    if (!request) return request
    if (!storeId) {
      applyIfLiveStoreSettingsEpoch(gate, request, () => {
        settings = null
        hydrated = true
      })
      return request
    }
    applyIfLiveStoreSettingsEpoch(gate, request, () => {
      hydrated = false
    })
    try {
      const result = await fetchImpl()
      applyIfLiveStoreSettingsEpoch(gate, request, () => {
        settings = result
      })
    } catch {
      applyIfLiveStoreSettingsEpoch(gate, request, () => {
        settings = null
      })
    } finally {
      applyIfLiveStoreSettingsEpoch(gate, request, () => {
        hydrated = true
      })
    }
    return request
  }

  async function applyBackfill(request: StoreSettingsEpoch, payload: Settings) {
    applyIfLiveStoreSettingsEpoch(gate, request, () => {
      settings = payload
    })
  }

  return {
    gate,
    changeStore,
    refresh,
    applyBackfill,
    snapshot: () => ({ settings, hydrated, storeId, generation: gate.active.generation }),
  }
}

describe("StoreSettings epoch gate", () => {
  it("A lento → B rápido → A atrasado: A é descartada e settings continua B", async () => {
    const p = createProviderSim()
    p.changeStore("A")
    const getA = deferred<Settings>()
    const getB = deferred<Settings>()

    const pendingA = p.refresh(() => getA.promise)
    p.changeStore("B")
    const pendingB = p.refresh(() => getB.promise)

    getB.resolve({ storeId: "B", v: "b" })
    await pendingB
    expect(p.snapshot().settings).toEqual({ storeId: "B", v: "b" })
    expect(p.snapshot().hydrated).toBe(true)

    getA.resolve({ storeId: "A", v: "a" })
    await pendingA
    expect(p.snapshot().settings).toEqual({ storeId: "B", v: "b" })
    expect(p.snapshot().hydrated).toBe(true)
    expect(p.snapshot().storeId).toBe("B")
  })

  it("A1 → B → A2 → A1 atrasado: A1 não sobrescreve A2", async () => {
    const p = createProviderSim()
    p.changeStore("A")
    const getA1 = deferred<Settings>()
    const getB = deferred<Settings>()
    const getA2 = deferred<Settings>()

    const pendingA1 = p.refresh(() => getA1.promise)
    p.changeStore("B")
    const pendingB = p.refresh(() => getB.promise)
    getB.resolve({ storeId: "B", v: "b" })
    await pendingB

    p.changeStore("A")
    const pendingA2 = p.refresh(() => getA2.promise)
    getA2.resolve({ storeId: "A", v: "a2" })
    await pendingA2
    expect(p.snapshot().settings).toEqual({ storeId: "A", v: "a2" })

    getA1.resolve({ storeId: "A", v: "a1-stale" })
    await pendingA1
    expect(p.snapshot().settings).toEqual({ storeId: "A", v: "a2" })
    expect(p.snapshot().hydrated).toBe(true)
  })

  it("backfill A atrasado depois de B não executa setSettings(A)", async () => {
    const p = createProviderSim()
    p.changeStore("A")
    const getA = deferred<Settings>()
    const pendingA = p.refresh(() => getA.promise)
    const backfillA = { ...p.gate.active }

    p.changeStore("B")
    const getB = deferred<Settings>()
    const pendingB = p.refresh(() => getB.promise)
    getB.resolve({ storeId: "B", v: "b" })
    await pendingB

    await p.applyBackfill(backfillA, { storeId: "A", v: "backfill-a" })
    getA.resolve({ storeId: "A", v: "a" })
    await pendingA
    expect(p.snapshot().settings).toEqual({ storeId: "B", v: "b" })
  })

  it("finally stale não altera hydrated da loja atual", async () => {
    const p = createProviderSim()
    p.changeStore("A")
    const getA = deferred<Settings>()
    const pendingA = p.refresh(() => getA.promise)

    p.changeStore("B")
    const getB = deferred<Settings>()
    const pendingB = p.refresh(() => getB.promise)
    getB.resolve({ storeId: "B", v: "b" })
    await pendingB
    expect(p.snapshot().hydrated).toBe(true)

    getA.reject(new Error("network A"))
    await pendingA
    expect(p.snapshot().hydrated).toBe(true)
    expect(p.snapshot().settings).toEqual({ storeId: "B", v: "b" })
  })

  it("erro da request stale não apaga settings atuais", async () => {
    const p = createProviderSim()
    p.changeStore("A")
    const getA = deferred<Settings>()
    const pendingA = p.refresh(() => getA.promise)

    p.changeStore("B")
    const getB = deferred<Settings>()
    const pendingB = p.refresh(() => getB.promise)
    getB.resolve({ storeId: "B", v: "b" })
    await pendingB

    getA.reject(new Error("stale fail"))
    await pendingA
    expect(p.snapshot().settings).toEqual({ storeId: "B", v: "b" })
    expect(p.snapshot().hydrated).toBe(true)
  })

  it("begin de loja que já não está ativa retorna null (não bumpa geração da loja B)", () => {
    const gate = createStoreSettingsEpochGate()
    gate.onStoreChange("A")
    const a = gate.begin("A")
    gate.onStoreChange("B")
    const genB = gate.active.generation
    expect(gate.begin("A")).toBeNull()
    expect(gate.active.generation).toBe(genB)
    expect(gate.isLive(a!)).toBe(false)
  })
})
