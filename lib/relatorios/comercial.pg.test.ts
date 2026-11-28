import { beforeAll, afterAll, describe, it, expect } from "vitest"
import { spawnSync } from "node:child_process"
import { PrismaClient } from "@/generated/prisma"
import { buildReport } from "./service"
import { parseReportQuery, type ReportResponse } from "./contracts"

/**
 * Relatório "Aparelhos e custos comerciais" — cenários sintéticos em PostgreSQL descartável.
 * Banco PRÓPRIO (omni_reports_qa_comercial) no mesmo cluster loopback descartável dos demais testes de relatórios.
 */
const base = process.env.REPORTS_QA_DATABASE_URL ?? ""
if (base) { const u = new URL(base); if (u.hostname !== "127.0.0.1" || u.pathname !== "/omni_reports_qa" || process.env.REPORTS_QA_DISPOSABLE !== "1") throw new Error("REPORTS_QA_REQUIRES_FRESH_DISPOSABLE_LOOPBACK") }
const dbName = "omni_reports_qa_comercial"
const url = base ? (() => { const u = new URL(base); u.pathname = `/${dbName}`; return u.toString() })() : ""

describe.skipIf(!base)("Relatório comercial — PostgreSQL descartável", () => {
  const admin = new PrismaClient({ datasourceUrl: base || "postgresql://omni_qa@127.0.0.1:1/omni_reports_qa" })
  let db: PrismaClient
  const A = "com-qa-a", B = "com-qa-b"
  const at = (day: number) => new Date(Date.UTC(2026, 10, day, 15))
  const query = (extra = "") => parseReportQuery(new URLSearchParams(`from=2026-11-01&to=2026-11-10&${extra}`))
  const report = (store = A, extra = "") => buildReport(db, "comercial", store, query(extra), { compare: false, financial: true })
  const metric = (r: ReportResponse, key: string) => r.metrics.find(m => m.key === key)
  const hash = "a".repeat(64)

  async function unit(storeId: string, id: string, codigo: string, extra: Record<string, unknown>, perfil: Record<string, unknown> = {}) {
    await db.aparelhoFisico.create({ data: { id, storeId, produtoId: `p-${storeId}`, codigoInterno: codigo, marca: "Marca", modelo: `Modelo ${codigo}`, condicao: "seminovo", origem: "cadastro_manual", propriedade: "loja", ...extra } as never })
    await db.comercialPerfilUnidade.create({ data: { storeId, aparelhoId: id, ...perfil } })
  }
  async function sale(storeId: string, id: string, aparelhoId: string, dataVenda: Date, custo?: { preco: number; total: number | null; completo: boolean }) {
    await db.venda.create({ data: { id: `v-${id}`, storeId, pedidoId: `PED-${id}`, total: 500, at: dataVenda, status: "concluida" } })
    const av = await db.aparelhoVenda.create({ data: { id, storeId, aparelhoId, vendaId: `v-${id}`, pedidoId: `PED-${id}`, numeroGarantia: `GAR-${id}`, status: "ativa", precoVenda: 500, dataVenda, dataEntrega: dataVenda,
      legalFim: dataVenda, coberturaFim: dataVenda, politicaVersao: 1, snapshot: {}, snapshotHash: hash } })
    if (custo) await db.comercialVendaCusto.create({ data: { storeId, aparelhoVendaId: av.id, vendaId: `v-${id}`, aparelhoId, precoVendaCentavos: custo.preco, custoAquisicaoCentavos: custo.total, custoAplicadoCentavos: 0,
      custoTotalCentavos: custo.total, completo: custo.completo, estimado: false, componentes: [] } })
  }

  beforeAll(async () => {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
    await admin.$executeRawUnsafe(`CREATE DATABASE ${dbName}`)
    const push = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, stdio: "inherit", windowsHide: true })
    if (push.status !== 0) throw new Error("COMERCIAL_QA_SCHEMA_PUSH_FAILED")
    db = new PrismaClient({ datasourceUrl: url })
    await db.store.createMany({ data: [{ id: A, name: "QA Comercial A" }, { id: B, name: "QA Comercial B" }] })
    await db.produto.createMany({ data: [{ id: `p-${A}`, storeId: A, name: "QA Aparelho" }, { id: `p-${B}`, storeId: B, name: "QA Aparelho B" }] })
    // U1: disponível, adquirido no período, 100 + lançamento 50 = 150
    await unit(A, "u1", "APA-1", { status: "disponivel", custoAquisicao: 100, entradaEstoqueEm: at(2), createdAt: at(2) })
    await db.comercialCustoLancamento.create({ data: { storeId: A, aparelhoId: "u1", categoria: "mao_obra_interna", origem: "gerencial", descricao: "Troca de tela", valorCentavos: 5000, idempotencyKey: "k1", payloadHash: hash, createdAt: at(3) } })
    // U2: em preparação, custo de aquisição DESCONHECIDO (nunca zero)
    await unit(A, "u2", "APA-2", { status: "em_revisao", custoAquisicao: 0, createdAt: at(3) }, { etapaPreparacao: "em_preparacao", custoAquisicaoStatus: "desconhecido" })
    // U3: vendido no período com custo congelado completo (500 - 300 = 200)
    await unit(A, "u3", "APA-3", { status: "vendido", custoAquisicao: 300, entradaEstoqueEm: new Date("2026-10-01T12:00:00Z"), createdAt: new Date("2026-10-01T12:00:00Z") })
    await sale(A, "av3", "u3", at(5), { preco: 50000, total: 30000, completo: true })
    // U4: vendido no período SEM custo congelado (legado) — fora da margem
    await unit(A, "u4", "APA-4", { status: "vendido", custoAquisicao: 100, entradaEstoqueEm: new Date("2026-10-02T12:00:00Z"), createdAt: new Date("2026-10-02T12:00:00Z") })
    await sale(A, "av4", "u4", at(6))
    // U5: estoque parado (> 60 dias)
    await unit(A, "u5", "APA-5", { status: "disponivel", custoAquisicao: 80, entradaEstoqueEm: new Date("2026-08-01T12:00:00Z"), createdAt: new Date("2026-08-01T12:00:00Z") })
    // Loja B: nunca pode vazar para A
    await unit(B, "ub", "APA-B", { status: "disponivel", custoAquisicao: 9999, entradaEstoqueEm: at(2), createdAt: at(2) })
    // Venda retroativa com brinde (custo histórico = custoUnitario 10 × 2)
    await db.venda.create({ data: { id: "v-retro", storeId: A, pedidoId: "PED-RETRO", total: 10, at: at(8), status: "concluida",
      payload: { comercial: { versao: 1, retroativa: { dataEfetivaVenda: "2026-11-04" }, brindes: [{ lineIndex: 0, motivo: "cortesia", produtoRef: `p-${A}`, quantidade: 2 }] } } } })
    await db.movimentacaoEstoque.create({ data: { storeId: A, produtoId: `p-${A}`, produtoNome: "QA Aparelho", tipo: "saida", origem: "pdv", quantidade: -2, estoqueAntes: 5, estoqueDepois: 3, custoUnitario: 10, documento: "PED-RETRO" } })
  }, 180_000)
  afterAll(async () => { await db?.$disconnect(); await admin.$disconnect() })

  it("indicadores de unidades, capital parcial e custo desconhecido nunca somado como zero", async () => {
    const r = await report()
    expect(metric(r, "acquired")?.value).toBe(2)
    expect(metric(r, "inPreparation")?.value).toBe(1)
    expect(metric(r, "available")?.value).toBe(2)
    expect(metric(r, "capital")?.value).toBe(230)
    expect(metric(r, "capital")?.label).toContain("parcial")
    expect(metric(r, "stalled")?.value).toBe(1)
    expect(metric(r, "appliedCosts")?.value).toBe(50)
    const u2 = r.rows.find(x => x.codigo === "APA-2")
    expect(u2?.total).toBe("Incompleto")
    expect(u2?.acquisition).toBeNull()
  })
  it("margem histórica só com custo congelado completo; venda legada contada à parte", async () => {
    const r = await report()
    expect(metric(r, "sold")?.value).toBe(2)
    expect(metric(r, "margin")?.value).toBe(200)
    expect(metric(r, "salesWithoutCost")?.value).toBe(1)
    expect(r.rows.find(x => x.codigo === "APA-3")?.margin).toBe(200)
    expect(r.rows.find(x => x.codigo === "APA-4")?.margin).toBe("Sem custo completo")
  })
  it("vendas retroativas pela data efetiva e brindes com custo histórico da saída", async () => {
    const r = await report()
    expect(metric(r, "retroactive")?.value).toBe(1)
    expect(metric(r, "gifts")?.value).toBe(1)
    expect(metric(r, "giftsCost")?.value).toBe(20)
    const outside = await buildReport(db, "comercial", A, parseReportQuery(new URLSearchParams("from=2026-11-05&to=2026-11-10")), { compare: false })
    expect(metric(outside, "retroactive")?.value).toBe(0)
  })
  it("isolamento multiloja", async () => {
    const r = await report()
    expect(r.rows.some(x => x.codigo === "APA-B")).toBe(false)
    const b = await report(B)
    expect(b.rows.map(x => x.codigo)).toEqual(["APA-B"])
    expect(metric(b, "sold")?.value).toBe(0)
  })
})
