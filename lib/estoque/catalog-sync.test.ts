/**
 * PDV-CADASTROS-SYNC-AUTOMATICO-001 — controlador de sincronização do catálogo e aviso
 * entre abas. Ambiente node: `window` mínimo (EventTarget + localStorage) e o
 * BroadcastChannel nativo do Node (entrega entre instâncias do mesmo nome).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createCatalogSyncController,
  notifyCatalogChanged,
  scheduleCatalogRevalidation,
  subscribeCatalogChanged,
  type CatalogSnapshot,
} from "./catalog-sync"

type Item = { id: string; price: number }

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

function makeController(opts: {
  versions?: Array<string | null>
  snapshots?: Array<CatalogSnapshot<Item> | null>
  now?: () => number
} = {}) {
  const applied: CatalogSnapshot<Item>[] = []
  const versions = [...(opts.versions ?? [])]
  const snapshots = [...(opts.snapshots ?? [])]
  const fetchVersion = vi.fn(async () => (versions.length ? versions.shift()! : null))
  const fetchSnapshot = vi.fn(async () => (snapshots.length ? snapshots.shift()! : null))
  const c = createCatalogSyncController<Item>({
    storeId: "loja-a",
    fetchVersion,
    fetchSnapshot,
    apply: (s) => applied.push(s),
    now: opts.now ?? (() => 0),
    minGapMs: 3_000,
  })
  return { c, applied, fetchVersion, fetchSnapshot }
}

const snap = (version: string, price: number): CatalogSnapshot<Item> => ({ version, items: [{ id: "SKU-1", price }] })

describe("createCatalogSyncController", () => {
  it("não checa antes da carga inicial (enable)", async () => {
    const { c, fetchVersion } = makeController({ versions: ["v1:1:2"] })
    expect(await c.check()).toBe("disabled")
    expect(fetchVersion).not.toHaveBeenCalled()
  })

  it("versão igual → não baixa o catálogo (pergunta barata)", async () => {
    const { c, fetchSnapshot } = makeController({ versions: ["v1:1:1"] })
    c.setKnownVersion("v1:1:1")
    c.enable()
    expect(await c.check()).toBe("unchanged")
    expect(fetchSnapshot).not.toHaveBeenCalled()
  })

  it("invalidate: recarga forçada que falha não deixa a versão conhecida 'atual' (próximo check baixa)", async () => {
    // Snapshot KG sobrescreveu saldos locais: a versão remota não mudou, mas o catálogo precisa voltar.
    let t = 0
    const { c, applied } = makeController({ versions: ["v1:1:1"], snapshots: [null, snap("v1:1:1", 12)], now: () => t })
    c.setKnownVersion("v1:1:1")
    c.enable()
    c.invalidate()
    expect(await c.check({ force: true })).toBe("unavailable")
    expect(c.knownVersion()).toBeNull()
    t = 10_000
    expect(await c.check({ force: false })).toBe("updated")
    expect(applied.map((s) => s.items[0]!.price)).toEqual([12])
    expect(c.knownVersion()).toBe("v1:1:1")
  })

  it("versão mudou → baixa, aplica e passa a conhecer a versão nova", async () => {
    const { c, applied } = makeController({ versions: ["v1:1:2"], snapshots: [snap("v1:1:2", 12)] })
    c.setKnownVersion("v1:1:1")
    c.enable()
    expect(await c.check()).toBe("updated")
    expect(applied.map((s) => s.items[0]!.price)).toEqual([12])
    expect(c.knownVersion()).toBe("v1:1:2")
  })

  it("checks não forçados em rajada (foco + visibilidade) viram um só", async () => {
    let t = 0
    const { c, fetchVersion } = makeController({ versions: ["v1:1:1", "v1:1:1"], now: () => t })
    c.setKnownVersion("v1:1:1")
    c.enable()
    await c.check()
    t = 1_000
    expect(await c.check()).toBe("throttled")
    expect(fetchVersion).toHaveBeenCalledTimes(1)
  })

  it("aviso de cadastro salvo (force) baixa mesmo dentro do intervalo mínimo", async () => {
    const { c, applied, fetchVersion } = makeController({ versions: ["v1:1:1"], snapshots: [snap("v1:1:9", 15)] })
    c.setKnownVersion("v1:1:1")
    c.enable()
    await c.check()
    expect(await c.check({ force: true })).toBe("updated")
    expect(fetchVersion).toHaveBeenCalledTimes(1)
    expect(applied).toHaveLength(1)
  })

  it("resposta atrasada de pedido antigo NÃO sobrescreve o catálogo mais novo", async () => {
    const slow = deferred<CatalogSnapshot<Item> | null>()
    const fast = snap("v1:1:3", 30)
    const applied: CatalogSnapshot<Item>[] = []
    const fetchSnapshot = vi.fn().mockReturnValueOnce(slow.promise).mockResolvedValueOnce(fast)
    const c = createCatalogSyncController<Item>({
      storeId: "loja-a",
      fetchVersion: async () => "v1:1:2",
      fetchSnapshot,
      apply: (s) => applied.push(s),
      now: () => 0,
    })
    c.enable()
    const first = c.check({ force: true })
    const second = c.check({ force: true })
    expect(await second).toBe("updated")
    slow.resolve(snap("v1:1:2", 20))
    expect(await first).toBe("superseded")
    expect(applied.map((s) => s.items[0]!.price)).toEqual([30])
    expect(c.knownVersion()).toBe("v1:1:3")
  })

  it("falha de rede mantém o catálogo atual (nada aplicado)", async () => {
    const { c, applied } = makeController({ versions: [null] })
    c.enable()
    expect(await c.check()).toBe("unavailable")
    expect(applied).toHaveLength(0)
  })

  it("depois do dispose (troca de loja) nada é aplicado", async () => {
    const slow = deferred<CatalogSnapshot<Item> | null>()
    const applied: CatalogSnapshot<Item>[] = []
    const c = createCatalogSyncController<Item>({
      storeId: "loja-a",
      fetchVersion: async () => "v1:1:2",
      fetchSnapshot: () => slow.promise,
      apply: (s) => applied.push(s),
    })
    c.enable()
    const pending = c.check({ force: true })
    c.dispose()
    slow.resolve(snap("v1:1:2", 99))
    expect(await pending).toBe("disposed")
    expect(applied).toHaveLength(0)
  })
})

describe("notifyCatalogChanged / subscribeCatalogChanged", () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    const win = new EventTarget() as EventTarget & { localStorage: Storage }
    win.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    }
    vi.stubGlobal("window", win)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    store.clear()
  })

  const tick = () => new Promise((r) => setTimeout(r, 20))

  it("mesma aba e outra aba (BroadcastChannel) recebem o aviso UMA vez, só da própria loja", async () => {
    const lojaA = vi.fn()
    const lojaB = vi.fn()
    const offA = subscribeCatalogChanged("loja-a", lojaA)
    const offB = subscribeCatalogChanged("loja-b", lojaB)
    notifyCatalogChanged("loja-a")
    await tick()
    expect(lojaA).toHaveBeenCalledTimes(1)
    expect(lojaA.mock.calls[0]![0]).toMatchObject({ type: "catalog-changed", storeId: "loja-a" })
    expect(lojaB).not.toHaveBeenCalled()
    offA()
    offB()
  })

  it("fallback `storage` (outra aba sem BroadcastChannel) e loja errada ignorada", async () => {
    const cb = vi.fn()
    const off = subscribeCatalogChanged("loja-a", cb)
    const fire = (key: string, value: unknown) => {
      const e = new Event("storage") as Event & { key: string; newValue: string }
      Object.assign(e, { key, newValue: JSON.stringify(value) })
      window.dispatchEvent(e)
    }
    fire("omni-catalog-bump:loja-a", { type: "catalog-changed", storeId: "loja-a", at: 1, nonce: "n-1" })
    fire("omni-catalog-bump:loja-a", { type: "catalog-changed", storeId: "loja-a", at: 1, nonce: "n-1" })
    fire("omni-catalog-bump:loja-a", { type: "catalog-changed", storeId: "loja-b", at: 2, nonce: "n-2" })
    fire("omni-catalog-bump:loja-b", { type: "catalog-changed", storeId: "loja-b", at: 3, nonce: "n-3" })
    expect(cb).toHaveBeenCalledTimes(1)
    off()
  })

  it("loja vazia nunca emite", async () => {
    const cb = vi.fn()
    const off = subscribeCatalogChanged("", cb)
    notifyCatalogChanged("   ")
    await tick()
    expect(cb).not.toHaveBeenCalled()
    off()
  })
})

describe("scheduleCatalogRevalidation (snapshot KG fora do catálogo)", () => {
  function timers() {
    const queue: Array<{ fn: () => void; ms: number; cleared?: boolean }> = []
    return {
      queue,
      setTimer: (fn: () => void, ms: number) => { const t = { fn, ms }; queue.push(t); return t },
      clearTimer: (h: unknown) => { (h as { cleared?: boolean }).cleared = true },
      async fire() { const t = queue.shift()!; if (!t.cleared) t.fn(); for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)) },
    }
  }

  it("sem watchers: invalida, recarrega até um snapshot válido e para", async () => {
    // 1ª recarga falha, 2ª aplica o saldo autoritativo — nenhuma tela observando o catálogo.
    const { c, applied } = makeController({ snapshots: [null, snap("v1:1:9", 12)] })
    c.setKnownVersion("v1:1:9")
    c.enable()
    const t = timers()
    const statuses: string[] = []
    scheduleCatalogRevalidation(c, { delaysMs: [10, 20, 30], setTimer: t.setTimer, clearTimer: t.clearTimer, onSettled: (st) => statuses.push(st) })
    expect(c.knownVersion()).toBeNull()
    await t.fire()
    expect(statuses).toEqual(["unavailable"])
    expect(t.queue.map((q) => q.ms)).toEqual([20])
    await t.fire()
    expect(statuses).toEqual(["unavailable", "updated"])
    expect(applied.map((x) => x.items[0]!.price)).toEqual([12])
    expect(c.knownVersion()).toBe("v1:1:9")
    expect(t.queue).toHaveLength(0)
  })

  it("cancelamento (troca de loja/desmontagem) não dispara mais recargas", async () => {
    const { c, fetchSnapshot } = makeController({ snapshots: [snap("v1:1:9", 12)] })
    c.enable()
    const t = timers()
    const cancel = scheduleCatalogRevalidation(c, { delaysMs: [10], setTimer: t.setTimer, clearTimer: t.clearTimer })
    cancel()
    await t.fire()
    expect(fetchSnapshot).not.toHaveBeenCalled()
  })

  it("esgotadas as tentativas, a versão continua inválida para o próximo check comum", async () => {
    const { c } = makeController({ snapshots: [null, null] })
    c.setKnownVersion("v1:1:1")
    c.enable()
    const t = timers()
    scheduleCatalogRevalidation(c, { delaysMs: [10, 20], setTimer: t.setTimer, clearTimer: t.clearTimer })
    await t.fire(); await t.fire()
    expect(t.queue).toHaveLength(0)
    expect(c.knownVersion()).toBeNull()
  })
})
