// OMNI-GESTOR-MONEY-LEGACY-COMPATIBILITY-FINAL-004 — contrato do gatilho G002 `gastos_venda_titulo_escopo`
// com vendas legadas que guardam vínculo com título de OUTRA loja (resíduo da colisão global de pedidoId).
// Banco: migrations REAIS (scripts/aparelhos/prepare-pg.mjs aplica as da branch com os gatilhos), dados sintéticos.
// Sem ambiente = BLOQUEIO_EXPLICITO_PG (nunca skip).
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PrismaClient } from "@/generated/prisma"
import { titulosDaVendaWhere } from "@/lib/pdv/trocas/troca-recebimento"

function exigirBancoLocal(): string {
  const url = (process.env.GASTOS_LEGADO_PG_URL ?? "").trim()
  if (!url) throw new Error("BLOQUEIO_EXPLICITO_PG: defina GASTOS_LEGADO_PG_URL (PostgreSQL descartável preparado).")
  if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname)) throw new Error("BLOQUEIO_EXPLICITO_PG: somente loopback.")
  return url
}

const db = new PrismaClient({ datasourceUrl: exigirBancoLocal() })
const A = "leg004-loja-a", B = "leg004-loja-b", C = "leg004-loja-c"
const recusa = { code: "P2010", meta: { code: "23514" } }
const vinculo = async (id: string) => (await db.venda.findUniqueOrThrow({ where: { id }, select: { contaReceberTituloId: true } })).contaReceberTituloId

beforeAll(async () => {
  const gatilho = await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM pg_trigger WHERE tgname = 'gastos_venda_titulo_escopo'`
  if (Number(gatilho[0].n) !== 1) throw new Error("BLOQUEIO_EXPLICITO_PG: gatilho G002 ausente — banco não preparado pelas migrations.")
  for (const id of [A, B, C]) await db.store.create({ data: { id, name: id } })
  const titulo = (id: string, storeId: string, ativo = true) =>
    db.contaReceberTitulo.create({ data: { id, storeId, localKey: `pdv-aprazo-${id}`, descricao: id, cliente: "sintetico", valor: 10, vencimento: "2026-12-01", status: "pendente", ativo } })
  await titulo("leg004-tA", A); await titulo("leg004-tA2", A); await titulo("leg004-tB", B); await titulo("leg004-tB2", B)
  await titulo("leg004-tB-inativo", B, false)
  await db.venda.create({ data: { id: "leg004-vB-ok", pedidoId: "LEG004-OK", storeId: B, total: 10, contaReceberTituloId: "leg004-tB" } })
  // Legado anterior à migration: vínculo cruzado gravado com o gatilho fora (como em Production hoje).
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`ALTER TABLE vendas DISABLE TRIGGER gastos_venda_titulo_escopo`)
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await tx.venda.create({ data: { id: `leg004-vX${n}`, pedidoId: `LEG004-X${n}`, storeId: B, total: 3, contaReceberTituloId: "leg004-tA" } })
    }
    await tx.$executeRawUnsafe(`ALTER TABLE vendas ENABLE TRIGGER gastos_venda_titulo_escopo`)
  })
})

afterAll(async () => { await db.$disconnect() })

describe("G002 · venda × título de outra loja (legado preservado, vínculo novo inválido recusado)", () => {
  it("INSERT com vínculo cruzado é recusado; INSERT válido passa", async () => {
    await expect(db.$executeRaw`INSERT INTO vendas (id,"storeId","pedidoId","contaReceberTituloId") VALUES ('leg004-ins-x',${B},'LEG004-INS-X','leg004-tA')`).rejects.toMatchObject(recusa)
    await expect(db.$executeRaw`INSERT INTO vendas (id,"storeId","pedidoId","contaReceberTituloId") VALUES ('leg004-ins-ok',${B},'LEG004-INS-OK','leg004-tB2')`).resolves.toBe(1)
  })

  it("venda válida não pode passar a apontar para título de outra loja", async () => {
    await expect(db.venda.update({ where: { id: "leg004-vB-ok" }, data: { contaReceberTituloId: "leg004-tA" } })).rejects.toThrow(/Vinculo financeiro invalido/)
    await expect(db.$executeRaw`UPDATE vendas SET "contaReceberTituloId" = 'leg004-tA' WHERE id = 'leg004-vB-ok'`).rejects.toMatchObject(recusa)
    expect(await vinculo("leg004-vB-ok")).toBe("leg004-tB")
  })

  it("UPDATE que não altera o vínculo nem a loja não congela a venda legada", async () => {
    await expect(db.$executeRaw`UPDATE vendas SET status = 'concluida' WHERE id = 'leg004-vX1'`).resolves.toBe(1)
    await expect(db.$executeRaw`UPDATE vendas SET "contaReceberTituloId" = "contaReceberTituloId", "storeId" = "storeId" WHERE id = 'leg004-vX1'`).resolves.toBe(1)
    // Prisma lista o campo no SET mesmo com o mesmo valor: o gatilho dispara e não recusa.
    await expect(db.venda.update({ where: { id: "leg004-vX1" }, data: { contaReceberTituloId: "leg004-tA", total: 4 } })).resolves.toMatchObject({ total: 4 })
    expect(await vinculo("leg004-vX1")).toBe("leg004-tA")
  })

  it("trocar o vínculo legado para OUTRO título de outra loja é recusado", async () => {
    await expect(db.$executeRaw`UPDATE vendas SET "contaReceberTituloId" = 'leg004-tA2' WHERE id = 'leg004-vX2'`).rejects.toMatchObject(recusa)
    expect(await vinculo("leg004-vX2")).toBe("leg004-tA")
  })

  it("correção para título ativo da mesma loja é permitida; para título inativo, recusada", async () => {
    await expect(db.$executeRaw`UPDATE vendas SET "contaReceberTituloId" = 'leg004-tB-inativo' WHERE id = 'leg004-vX3'`).rejects.toMatchObject(recusa)
    await expect(db.venda.update({ where: { id: "leg004-vX3" }, data: { contaReceberTituloId: "leg004-tB2" } })).resolves.toBeTruthy()
    expect(await vinculo("leg004-vX3")).toBe("leg004-tB2")
  })

  it("remoção legítima do vínculo é permitida", async () => {
    await expect(db.venda.update({ where: { id: "leg004-vX4" }, data: { contaReceberTituloId: null } })).resolves.toBeTruthy()
    expect(await vinculo("leg004-vX4")).toBeNull()
  })

  it("trocar a loja da venda legada exige coerência com o título", async () => {
    await expect(db.$executeRaw`UPDATE vendas SET "storeId" = ${C} WHERE id = 'leg004-vX5'`).rejects.toMatchObject(recusa)
    expect((await db.venda.findUniqueOrThrow({ where: { id: "leg004-vX5" } })).storeId).toBe(B)
  })

  it("o vínculo legado não concede acesso: o leitor da venda na loja B não enxerga o título da loja A", async () => {
    const venda = await db.venda.findUniqueOrThrow({ where: { id: "leg004-vX6" } })
    const titulos = await db.contaReceberTitulo.findMany({ where: titulosDaVendaWhere(venda.storeId, venda.pedidoId, venda.contaReceberTituloId) })
    expect(titulos).toHaveLength(0)
    // E o título continua inteiro na loja A, intocado pelo teste.
    expect(await db.contaReceberTitulo.findUniqueOrThrow({ where: { id: "leg004-tA" } })).toMatchObject({ storeId: A, status: "pendente", valor: 10 })
  })
})
