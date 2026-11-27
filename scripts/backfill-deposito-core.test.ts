/**
 * ESTOQUE-MANUAL-KG-001 — regressão do backfill de depósitos (`db:backfill-deposito`).
 * Antes: `Math.trunc` gravava 3,250 kg como 3 no depósito e, truncando também a soma
 * do produto, reportava "invariante verde". Fake em memória; `truncarNaGravacao`
 * simula uma coluna inteira para provar que a verificação relê o banco e acusa a perda.
 */
import { describe, expect, it } from "vitest"
import { backfillLoja, milesimosExatos } from "./backfill-deposito-core.mjs"

type Prod = { id: string; storeId: string; stock: number }
type Dep = { storeId: string; produtoId: string; depositoId: string; quantidade: number }

function fake(produtos: Prod[], depositos: Dep[] = [], opts: { truncarNaGravacao?: boolean } = {}) {
  const deps = new Map(depositos.map((d) => [`${d.produtoId}|${d.depositoId}`, { ...d }]))
  const grava = (q: number) => (opts.truncarNaGravacao ? Math.trunc(q) : q)
  return {
    deps,
    produtos,
    produto: {
      findMany: async ({ where }: { where: { storeId: string } }) =>
        produtos.filter((p) => p.storeId === where.storeId).map((p) => ({ id: p.id, stock: p.stock })),
    },
    produtoDeposito: {
      upsert: async (a: {
        where: { produtoId_depositoId: { produtoId: string; depositoId: string } }
        create: Dep
        update: { quantidade: number }
      }) => {
        const k = `${a.where.produtoId_depositoId.produtoId}|${a.where.produtoId_depositoId.depositoId}`
        const ex = deps.get(k)
        if (ex) ex.quantidade = grava(a.update.quantidade)
        else deps.set(k, { ...a.create, quantidade: grava(a.create.quantidade) })
        return {}
      },
      findMany: async ({ where }: { where: { storeId: string } }) =>
        [...deps.values()].filter((d) => d.storeId === where.storeId).map((d) => ({ produtoId: d.produtoId, quantidade: d.quantidade })),
    },
  }
}

const loja = [
  { id: "pao-kg", storeId: "a", stock: 3.25 },
  { id: "un-10", storeId: "a", stock: 10 },
  { id: "un-max", storeId: "a", stock: 2147483647 },
  { id: "outra-loja", storeId: "b", stock: 7 },
]

describe("milesimosExatos", () => {
  it("converte sem arredondar e recusa precisão acima de 3 casas", () => {
    expect(milesimosExatos(3.25)).toBe(3250)
    expect(milesimosExatos(0.001)).toBe(1)
    expect(milesimosExatos(2147483647)).toBe(2147483647000)
    expect(milesimosExatos(1.2345)).toBeNull()
    expect(milesimosExatos(0.1 + 0.2)).toBeNull()
    expect(milesimosExatos(Number.NaN)).toBeNull()
  })
})

describe("backfillLoja", () => {
  it("3,250 kg permanece 3,250 no depósito; UN e legado intactos; verde por produto em milésimos", async () => {
    const db = fake(loja)
    const r = await backfillLoja(db, { storeId: "a", depositoId: "dep-a", dryRun: false })
    expect(db.deps.get("pao-kg|dep-a")?.quantidade).toBe(3.25)
    expect(db.deps.get("un-10|dep-a")?.quantidade).toBe(10)
    expect(db.deps.get("un-max|dep-a")?.quantidade).toBe(2147483647)
    expect(db.deps.has("outra-loja|dep-a")).toBe(false)
    expect(loja.map((p) => p.stock)).toEqual([3.25, 10, 2147483647, 7])
    expect(r).toMatchObject({ somaStock: 2147483660250, somaDeposito: 2147483660250, drift: 0, divergentes: [], verde: true })
  })

  it("repetir o backfill não altera nada (idempotente)", async () => {
    const db = fake(loja)
    await backfillLoja(db, { storeId: "a", depositoId: "dep-a", dryRun: false })
    const antes = JSON.stringify([...db.deps.values()])
    const r2 = await backfillLoja(db, { storeId: "a", depositoId: "dep-a", dryRun: false })
    expect(JSON.stringify([...db.deps.values()])).toBe(antes)
    expect(r2.verde).toBe(true)
  })

  it("re-sincroniza depósito truncado por versão antiga (3 → 3,250)", async () => {
    const db = fake(loja, [{ storeId: "a", produtoId: "pao-kg", depositoId: "dep-a", quantidade: 3 }])
    const r = await backfillLoja(db, { storeId: "a", depositoId: "dep-a", dryRun: false })
    expect(db.deps.get("pao-kg|dep-a")?.quantidade).toBe(3.25)
    expect(r.verde).toBe(true)
  })

  it("sem invariante verde falso: se o banco truncar a gravação, a releitura acusa o produto KG", async () => {
    const db = fake(loja, [], { truncarNaGravacao: true })
    const r = await backfillLoja(db, { storeId: "a", depositoId: "dep-a", dryRun: false })
    expect(r.verde).toBe(false)
    expect(r.divergentes).toEqual(["pao-kg"])
    expect(r.drift).toBe(-250)
  })

  it("divergências que se compensam na soma da loja ainda são acusadas por produto", async () => {
    const db = fake(loja, [
      { storeId: "a", produtoId: "pao-kg", depositoId: "dep-x", quantidade: 1 },
      { storeId: "a", produtoId: "un-10", depositoId: "dep-x", quantidade: -1 },
    ])
    const r = await backfillLoja(db, { storeId: "a", depositoId: "dep-a", dryRun: false })
    expect(r.drift).toBe(0)
    expect(r.verde).toBe(false)
    expect(r.divergentes).toEqual(["pao-kg", "un-10"])
  })

  it("saldo com mais de 3 casas não é propagado nem arredondado: vira divergência explícita", async () => {
    const db = fake([{ id: "corrompido", storeId: "a", stock: 1.2345 }])
    const r = await backfillLoja(db, { storeId: "a", depositoId: "dep-a", dryRun: false })
    expect(db.deps.size).toBe(0)
    expect(r).toMatchObject({ verde: false, invalidos: ["corrompido"], divergentes: ["corrompido"] })
  })

  it("dry-run não grava", async () => {
    const db = fake(loja)
    await backfillLoja(db, { storeId: "a", depositoId: "dep-a", dryRun: true })
    expect(db.deps.size).toBe(0)
  })
})
