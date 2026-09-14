/**
 * Concorrência real do PUT de StoreSettings (N3-CORRECTION-01).
 *
 * Harness in-memory com:
 * - barreira: A e B entram na transação antes de qualquer write
 * - fila por chave emulando pg_advisory_xact_lock (transacional, exclusivo)
 * - re-read / merge / upsert na MESMA transação, depois do lock
 *
 * Não é o teste sequencial "A grava, depois B lê".
 */
import { describe, expect, it } from "vitest"
import {
  persistStoreSettingsPut,
  storeSettingsAdvisoryLockKey,
  type StoreSettingsPutDb,
  type StoreSettingsPutTx,
  type StoreSettingsRow,
} from "./store-settings-put"

type Printer = Record<string, unknown>

function clone<T>(v: T): T {
  return v == null ? v : (JSON.parse(JSON.stringify(v)) as T)
}

function createConcurrentHarness(initial: StoreSettingsRow | null) {
  let row: StoreSettingsRow | null = initial ? clone(initial) : null
  const globalOrder: string[] = []
  const traces = new Map<string, string[]>()
  const lockSql: string[] = []
  const lockKeys: string[] = []
  const filas = new Map<string, Promise<void>>()
  let txSeq = 0
  let started = 0
  let releaseStart!: () => void
  const bothStarted = new Promise<void>((r) => {
    releaseStart = r
  })
  let expectedStarters = 2

  async function adquirirLock(key: string): Promise<() => void> {
    const anterior = filas.get(key) ?? Promise.resolve()
    let liberar!: () => void
    const meu = new Promise<void>((r) => {
      liberar = r
    })
    filas.set(key, anterior.then(() => meu))
    await anterior
    return liberar
  }

  const db: StoreSettingsPutDb = {
    $transaction: async <T>(fn: (tx: StoreSettingsPutTx) => Promise<T>): Promise<T> => {
      const txId = `tx${++txSeq}`
      const trace: string[] = []
      traces.set(txId, trace)
      const releases: Array<() => void> = []
      trace.push("tx-start")
      globalOrder.push(`${txId}:tx-start`)

      started += 1
      if (started >= expectedStarters) releaseStart()
      await bothStarted

      try {
        const tx: StoreSettingsPutTx = {
          $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
            const sql = strings.join("?")
            lockSql.push(sql)
            if (!sql.includes("pg_advisory_xact_lock") || !sql.includes("hashtext")) {
              throw new Error(`SQL de lock inesperado: ${sql}`)
            }
            const key = String(values[0])
            lockKeys.push(key)
            trace.push("lock-wait")
            globalOrder.push(`${txId}:lock-wait`)
            const unlock = await adquirirLock(key)
            releases.push(unlock)
            trace.push("lock-acquired")
            globalOrder.push(`${txId}:lock-acquired`)
            return [{ lock: "" }]
          },
          storeSettings: {
            findUnique: async () => {
              if (!trace.includes("lock-acquired")) {
                throw new Error("findUnique antes do advisory lock")
              }
              trace.push("findUnique")
              globalOrder.push(`${txId}:findUnique`)
              return clone(row)
            },
            upsert: async (args) => {
              if (!trace.includes("findUnique")) {
                throw new Error("upsert antes do re-read")
              }
              trace.push("upsert")
              globalOrder.push(`${txId}:upsert`)
              if (!row) {
                row = {
                  storeId: String(args.create.storeId),
                  printerConfig: clone(args.create.printerConfig),
                  contactEmail: String(args.create.contactEmail ?? ""),
                }
              } else {
                if (args.update.printerConfig !== undefined) {
                  row = { ...row, printerConfig: clone(args.update.printerConfig) }
                }
                if (args.update.contactEmail !== undefined) {
                  row = { ...row, contactEmail: String(args.update.contactEmail) }
                }
              }
              return clone(row) as StoreSettingsRow
            },
          },
        }
        return await fn(tx)
      } finally {
        trace.push("tx-end")
        globalOrder.push(`${txId}:tx-end`)
        for (const unlock of releases) unlock()
      }
    },
  }

  return {
    db,
    get row() {
      return row
    },
    setExpectedStarters(n: number) {
      expectedStarters = n
    },
    globalOrder,
    traces,
    lockSql,
    lockKeys,
    layout(): string | undefined {
      const pc = row?.printerConfig
      if (pc && typeof pc === "object" && !Array.isArray(pc)) {
        return (pc as Printer).pdvMainLayout as string | undefined
      }
      return undefined
    },
  }
}

describe("persistStoreSettingsPut — lock + re-read na mesma transação", () => {
  it("SQL usa pg_advisory_xact_lock(hashtext) com chave por loja", async () => {
    const h = createConcurrentHarness({ storeId: "loja-a", printerConfig: {} })
    h.setExpectedStarters(1)
    await persistStoreSettingsPut(h.db, "loja-a", {
      printerConfig: { pdvMainLayout: "classic" },
      backfill: true,
    })
    expect(h.lockSql[0]).toContain("pg_advisory_xact_lock")
    expect(h.lockSql[0]).toContain("hashtext")
    expect(h.lockKeys).toEqual([storeSettingsAdvisoryLockKey("loja-a")])
    const trace = [...h.traces.values()][0]
    expect(trace.indexOf("lock-acquired")).toBeLessThan(trace.indexOf("findUnique"))
    expect(trace.indexOf("findUnique")).toBeLessThan(trace.indexOf("upsert"))
    expect(trace.indexOf("upsert")).toBeLessThan(trace.indexOf("tx-end"))
  })
})

describe("CONCURRENT_BACKFILL_EXISTING_ROW", () => {
  it("Promise.all + barreira: first lock writer wins e o segundo relê sem sobrescrever", async () => {
    const h = createConcurrentHarness({ storeId: "loja-a", printerConfig: {} })

    await Promise.all([
      persistStoreSettingsPut(h.db, "loja-a", {
        printerConfig: { pdvMainLayout: "classic" },
        backfill: true,
      }),
      persistStoreSettingsPut(h.db, "loja-a", {
        printerConfig: { pdvMainLayout: "supermercado" },
        backfill: true,
      }),
    ])

    const first = h.globalOrder.find((s) => s.endsWith(":lock-acquired"))
    expect(first).toBeTruthy()
    const winnerTx = first!.split(":")[0]
    const winnerTrace = h.traces.get(winnerTx) ?? []
    expect(winnerTrace).toEqual(["tx-start", "lock-wait", "lock-acquired", "findUnique", "upsert", "tx-end"])

    const expected = winnerTx === "tx1" ? "classic" : "supermercado"
    expect(h.layout()).toBe(expected)

    for (const trace of h.traces.values()) {
      expect(trace.indexOf("lock-acquired")).toBeLessThan(trace.indexOf("findUnique"))
      expect(trace.indexOf("findUnique")).toBeLessThan(trace.indexOf("upsert"))
    }
  })
})

describe("CONCURRENT_BACKFILL_CREATE", () => {
  it("duas criações simultâneas: segundo espera, relê e não sobrescreve o primeiro commit", async () => {
    const h = createConcurrentHarness(null)

    await Promise.all([
      persistStoreSettingsPut(h.db, "loja-a", {
        printerConfig: { pdvMainLayout: "classic" },
        backfill: true,
      }),
      persistStoreSettingsPut(h.db, "loja-a", {
        printerConfig: { pdvMainLayout: "supermercado" },
        backfill: true,
      }),
    ])

    const first = h.globalOrder.find((s) => s.endsWith(":lock-acquired"))
    const winnerTx = first!.split(":")[0]
    expect(h.layout()).toBe(winnerTx === "tx1" ? "classic" : "supermercado")
    expect(h.row?.storeId).toBe("loja-a")
  })
})

describe("BACKFILL_VS_ADMIN", () => {
  it("admin primeiro: backfill posterior preserva o valor administrativo", async () => {
    const h = createConcurrentHarness({ storeId: "loja-a", printerConfig: {} })

    await Promise.all([
      persistStoreSettingsPut(h.db, "loja-a", {
        printerConfig: { pdvMainLayout: "supermercado" },
      }),
      persistStoreSettingsPut(h.db, "loja-a", {
        printerConfig: { pdvMainLayout: "classic" },
        backfill: true,
      }),
    ])

    expect(h.layout()).toBe("supermercado")
  })

  it("backfill primeiro: PUT admin posterior altera normalmente", async () => {
    const h = createConcurrentHarness({ storeId: "loja-a", printerConfig: {} })

    await Promise.all([
      persistStoreSettingsPut(h.db, "loja-a", {
        printerConfig: { pdvMainLayout: "classic" },
        backfill: true,
      }),
      persistStoreSettingsPut(h.db, "loja-a", {
        printerConfig: { pdvMainLayout: "next" },
      }),
    ])

    expect(h.layout()).toBe("next")
  })
})
