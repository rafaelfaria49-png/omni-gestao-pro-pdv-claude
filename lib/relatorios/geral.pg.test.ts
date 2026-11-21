import { beforeAll, afterAll, describe, it, expect } from "vitest"
import { spawnSync } from "node:child_process"
import { PrismaClient } from "@/generated/prisma"
import { buildReport } from "./service"
import { parseReportQuery, type ReportResponse } from "./contracts"
import { csvReport, pdfGeneralReport } from "./export"

/**
 * Relatório Geral — cenários sintéticos em PostgreSQL descartável.
 * Usa um banco PRÓPRIO (omni_reports_qa_geral) no mesmo cluster loopback descartável dos
 * demais testes de relatórios, para não depender da ordem nem do banco vazio deles.
 */
const base = process.env.REPORTS_QA_DATABASE_URL ?? ""
if (base) { const u = new URL(base); if (u.hostname !== "127.0.0.1" || u.pathname !== "/omni_reports_qa" || process.env.REPORTS_QA_DISPOSABLE !== "1") throw new Error("REPORTS_QA_REQUIRES_FRESH_DISPOSABLE_LOOPBACK") }
const dbName = "omni_reports_qa_geral"
const url = base ? (() => { const u = new URL(base); u.pathname = `/${dbName}`; return u.toString() })() : ""

describe.skipIf(!base)("Relatório Geral — PostgreSQL descartável", () => {
  const admin = new PrismaClient({ datasourceUrl: base || "postgresql://omni_qa@127.0.0.1:1/omni_reports_qa" })
  let db: PrismaClient
  const A = "geral-qa-a", B = "geral-qa-b"
  const nov = (day: number, hour = 15) => new Date(Date.UTC(2026, 10, day, hour))
  const oct = new Date("2026-10-15T15:00:00Z")
  const query = (extra = "") => parseReportQuery(new URLSearchParams(`from=2026-11-01&to=2026-11-10&${extra}`))
  const report = (extra = "", store = A, pageSize?: number) => buildReport(db, "geral", store, pageSize ? { ...query(extra), pageSize } : query(extra), { compare: false, financial: true, service: true })
  const section = (r: ReportResponse, key: string) => r.sections!.find(s => s.key === key)!
  const metric = (r: ReportResponse, sec: string, key: string) => section(r, sec).metrics.find(m => m.key === key)?.value
  const row = (r: ReportResponse, sec: string, id: string) => section(r, sec).rows!.find(x => x.id === id)

  beforeAll(async () => {
    // Banco novo e exclusivo, só no cluster descartável validado acima.
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
    await admin.$executeRawUnsafe(`CREATE DATABASE ${dbName}`)
    const push = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, stdio: "inherit", windowsHide: true })
    if (push.status !== 0) throw new Error("GERAL_QA_SCHEMA_PUSH_FAILED")
    db = new PrismaClient({ datasourceUrl: url })
    const all = { version: 1, modules: ["home", "pdv", "sales", "cash", "catalog", "stock", "reports", "settings", "service", "finance"] }
    await db.store.createMany({ data: [{ id: A, name: "QA Geral A", moduleAccess: all }, { id: B, name: "QA Geral B", moduleAccess: all }] })
    await db.categoriaProduto.create({ data: { storeId: A, slug: "acessorios", nome: "Acessórios" } })
    await db.produto.createMany({ data: [
      { id: "g-cel", storeId: A, name: "QA Celular", category: "celulares", metadata: { serializedDevice: { version: 1 } } },
      { id: "g-capa", storeId: A, name: "QA Capa", sku: "CAPA-1", category: "acessorios" },
      { id: "g-pel", storeId: A, name: "QA Peça", category: "pecas" },
      { id: "g-b", storeId: B, name: "QA Segredo B" }] })
    const pb = (o: Record<string, number>) => ({ paymentBreakdown: { dinheiro: 0, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0, ...o } })
    const sales: [string, string, number, string, Date, object, [string, number][]][] = [
      ["gv1", "QA-V1", 100, "parcialmente_devolvida", nov(2), pb({ dinheiro: 100 }), [["CAPA-1", 100]]],
      ["gv2", "QA-V2", 300, "concluida", nov(2), pb({ aPrazo: 300 }), [["g-pel", 300]]],
      ["gvold", "QA-VOLD", 200, "concluida", oct, pb({ aPrazo: 200 }), [["g-pel", 200]]],
      ["gv3", "QA-V3", 1500, "concluida", nov(3), pb({ pix: 1500 }), [["g-cel", 1500]]],
      ["gv4", "QA-V4", 80, "concluida", nov(3), pb({ dinheiro: 80 }), [["__servico__svc1", 80]]],
      ["gv5", "QA-V5", 250, "concluida", nov(4), pb({ dinheiro: 250 }), [["__os_servico__os1", 250]]],
      ["gv6", "QA-V6", 90, "cancelada", nov(4), pb({ dinheiro: 90 }), [["g-capa", 90]]],
      ["gv7", "QA-V7", 40, "cancelada", nov(5), pb({ dinheiro: 40 }), [["g-capa", 40]]],
      ["gv8", "QA-V8", 60, "concluida", nov(5), pb({ dinheiro: 60 }), [["SKU-INEXISTENTE", 60]]],
      ["gvb", "QA-VB", 999, "concluida", nov(2), pb({ dinheiro: 999 }), [["g-b", 999]]],
    ]
    for (const [id, pedidoId, total, status, at, payload, lines] of sales) {
      await db.venda.create({ data: { id, storeId: id === "gvb" ? B : A, pedidoId, total, status, at, payload,
        itens: { create: lines.map(([inventoryId, v]) => ({ inventoryId, nome: `QA ${inventoryId}`, quantidade: 1, precoUnitario: v, lineTotal: v })) } } })
    }
    await db.aparelhoFisico.create({ data: { id: "g-af1", storeId: A, produtoId: "g-cel", codigoInterno: "AP-1", marca: "QA", modelo: "X", condicao: "novo", origem: "compra", status: "vendido" } })
    await db.aparelhoVenda.create({ data: { storeId: A, aparelhoId: "g-af1", vendaId: "gv3", pedidoId: "QA-V3", numeroGarantia: "G-1", precoVenda: 1500, dataVenda: nov(3), dataEntrega: nov(3),
      legalFim: new Date("2027-02-01T12:00:00Z"), coberturaFim: new Date("2027-02-01T12:00:00Z"), politicaVersao: 1, snapshot: {}, snapshotHash: "0".repeat(64) } })
    await db.devolucaoVenda.create({ data: { id: "g-d1", storeId: A, localId: "DEV-1", vendaLocalId: "QA-V1", tipo: "vale_credito", valorTotal: 30, at: nov(4),
      itens: { create: { inventoryId: "CAPA-1", nome: "QA Capa", quantidade: 1, valorTotal: 30 } } } })
    const hist = (...v: number[]) => ({ historico: v.map(valor => ({ tipo: "pagamento", valor, observacao: "texto privado QA" })) })
    await db.contaReceberTitulo.createMany({ data: [
      { id: "g-t1", storeId: A, localKey: "pdv-aprazo-QA-V2-1", valor: 150, vencimento: "2026-11-08", status: "parcial", payload: hist(50), cliente: "Cliente Privado QA" },
      { id: "g-t2", storeId: A, localKey: "pdv-aprazo-QA-V2-2", valor: 150, vencimento: "2099-12-20", status: "pendente" },
      { id: "g-told", storeId: A, localKey: "pdv-aprazo-QA-VOLD", valor: 200, vencimento: "2026-11-05", status: "pago", payload: hist(200) },
      { id: "g-os1", storeId: A, localKey: `receber:os:${A}:os1`, valor: 250, vencimento: "2026-11-04", status: "pago", payload: hist(250) },
      { id: "g-os2", storeId: A, localKey: `os-faturamento:${A}:os2`, valor: 120, vencimento: "2026-11-06", status: "pago", payload: hist(120) },
      { id: "g-man", storeId: A, localKey: `receber:manual:${A}:x`, valor: 70, vencimento: "2020-01-01", status: "vencido" },
      { id: "g-tb", storeId: B, valor: 555, vencimento: "2026-11-05", status: "pendente" }] })
    await db.contaPagarTitulo.createMany({ data: [
      { id: "g-cp1", storeId: A, valor: 1000, vencimento: "2026-11-06", status: "pago", payload: { categoria: "Aluguel", ...hist(1000) } },
      { id: "g-cp2", storeId: A, valor: 500, vencimento: "2026-11-09", status: "parcial", payload: { categoria: "estoque", ...hist(200) } },
      { id: "g-cp3", storeId: A, valor: 150, vencimento: "2099-11-25", status: "pendente", payload: { categoria: "Energia" } }] })
    await db.carteiraFinanceira.createMany({ data: [{ id: "g-w1", storeId: A, nome: "QA Caixa", saldoInicial: 500, createdAt: oct }, { id: "g-w2", storeId: A, nome: "QA Banco", createdAt: oct },
      { id: "g-wb", storeId: B, nome: "QA B", saldoInicial: 9000, createdAt: oct }] })
    const mov = (tipo: string, origem: string, valor: number, referenciaId: string | null, createdAt: Date, carteiraId = "g-w1", storeId = A) => ({ storeId, tipo, origem, valor, referenciaId, createdAt, carteiraId })
    await db.movimentacaoFinanceira.createMany({ data: [
      mov("entrada", "venda", 200, "QA-VOLD-NAO", oct), // anterior ao período: só saldo inicial
      mov("entrada", "venda", 100, "QA-V1", nov(2)), mov("entrada", "venda", 1500, "QA-V3", nov(3)), mov("entrada", "venda", 80, "QA-V4", nov(3)),
      mov("entrada", "venda", 250, "QA-V5", nov(4)), mov("entrada", "venda", 90, "QA-V6", nov(4)), mov("saida", "cancelamento_pdv", 90, "QA-V6", nov(4)),
      mov("entrada", "venda", 40, "QA-V7", nov(5)), mov("entrada", "venda", 60, "QA-V8", nov(5)),
      mov("entrada", "receber_parcial", 50, "g-t1", nov(5)), mov("entrada", "receber", 200, "g-told", nov(3)),
      mov("entrada", "receber", 250, "g-os1", nov(4)), mov("entrada", "receber", 120, "g-os2", nov(6)), mov("entrada", "receber", 15, "titulo-inexistente", nov(6)),
      mov("saida", "devolucao_pdv", 30, "g-d1", nov(4)),
      mov("saida", "pagar", 1000, "g-cp1", nov(6)), mov("saida", "pagar_parcial", 200, "g-cp2", nov(7)),
      mov("saida", "transferencia", 100, null, nov(7)), mov("entrada", "transferencia", 100, null, nov(7), "g-w2"),
      mov("saida", "sangria_pdv", 50, null, nov(7)), mov("entrada", "suprimento_pdv", 20, null, nov(7)),
      mov("entrada", "manual", 10, null, nov(8)),
      mov("entrada", "venda", 999, "QA-VB", nov(2), "g-wb", B)] })
    const sessao = await db.sessaoCaixa.create({ data: { storeId: A, abertaEm: nov(4, 11) } })
    await db.caixaOperacao.create({ data: { sessaoId: sessao.id, storeId: A, tipo: "recebimento_cr", valor: 250, at: nov(4) } })
    await db.ordemServico.createMany({ data: [{ id: "os1", storeId: A, createdAt: nov(1) }, { id: "os2", storeId: A, createdAt: nov(2) }] })
  }, 120_000)
  afterAll(async () => { await db?.$disconnect(); await admin.$disconnect() })

  it("vendas por tipo: produto, acessório (categoria), aparelho, serviço, OS e não classificado; canceladas fora", async () => {
    const r = await report()
    expect(r.kind).toBe("geral")
    expect(metric(r, "resumo", "salesGross")).toBe(2290)
    expect(metric(r, "resumo", "salesCount")).toBe(6)
    expect(metric(r, "vendas-tipo", "cancelled")).toBe(130)
    expect(row(r, "vendas-tipo", "acessorio")).toMatchObject({ bruto: 100, devolvido: 30, liquido: 70 })
    expect(row(r, "vendas-tipo", "produto")).toMatchObject({ bruto: 300 })
    expect(row(r, "vendas-tipo", "aparelho")).toMatchObject({ bruto: 1500, vendas: 1 })
    expect(row(r, "vendas-tipo", "servico")).toMatchObject({ bruto: 80 })
    expect(row(r, "vendas-tipo", "os")).toMatchObject({ bruto: 250 })
    expect(row(r, "vendas-tipo", "nao_classificado")).toMatchObject({ bruto: 60 })
    expect(metric(r, "resumo", "salesNet")).toBe(2260)
  })

  it("recebimento de parcela antiga não vira venda; recebimentos excluem tesouraria e transferência", async () => {
    const r = await report()
    // 100+1500+80+250+90+40+60 à vista; títulos 50+200+250+120+15; −90 cancelamento; −30 devolução
    expect(metric(r, "resumo", "receipts")).toBe(2120 + 635 - 120)
    expect(metric(r, "recebimentos", "oldInstallments")).toBe(200)
    expect(row(r, "recebimentos", "receber:parcela_venda_periodo")).toMatchObject({ valor: 50 })
    expect(row(r, "recebimentos", "receber:os")).toMatchObject({ valor: 370 })
    expect(row(r, "recebimentos", "receber:titulo_nao_encontrado")).toMatchObject({ valor: 15 })
    expect(metric(r, "fluxo", "treasury")).toBe(-30)
    expect(metric(r, "fluxo", "transfers")).toBe(0)
    // A venda antiga (outubro) não está nas vendas de novembro.
    expect(r.rows.some(x => x.reference === "QA-VOLD")).toBe(false)
  })

  it("à vista × a prazo comprovados, despesas pagas × títulos pendentes, compras sem CMV", async () => {
    const r = await report()
    expect(metric(r, "vista-prazo", "avista")).toBe(1990)
    expect(metric(r, "vista-prazo", "aprazo")).toBe(300)
    expect(metric(r, "vista-prazo", "semComprovacao")).toBe(0)
    expect(metric(r, "despesas", "paymentsNet")).toBe(1200)
    expect(metric(r, "despesas", "purchases")).toBe(200)
    expect(metric(r, "despesas", "expenses")).toBe(1000)
    expect(metric(r, "pagar", "payableOpen2")).toBe(450)
    expect(metric(r, "pagar", "payableOverdue")).toBe(300)
    expect(metric(r, "resumo", "cmv")).toBeNull()
    expect(metric(r, "receber", "receivableOpen2")).toBe(320)
    expect(metric(r, "receber", "receivableOverdue")).toBe(170)
    expect(metric(r, "receber", "receivableCohort")).toBe(250)
  })

  it("conferência aponta duplicidade de OS, cancelamento sem estorno, órfãos e não classificados", async () => {
    const r = await report()
    expect(row(r, "conferencia", "osDupla")).toMatchObject({ registros: 1, valor: 250, situacao: "Verificar" })
    expect(row(r, "conferencia", "cancel")).toMatchObject({ registros: 1, valor: 40, situacao: "Verificar" })
    expect(row(r, "conferencia", "orfao")).toMatchObject({ registros: 1, valor: 15 })
    expect(row(r, "conferencia", "ledgerNc")).toMatchObject({ registros: 1, valor: 10 })
    expect(row(r, "conferencia", "fluxo")).toMatchObject({ situacao: "OK" })
    expect(row(r, "conferencia", "caixa")).toMatchObject({ valor: 250, situacao: "Informativo" })
    expect(metric(r, "os", "osCreated")).toBe(2)
    expect(metric(r, "os", "devices")).toBe(1)
  })

  it("isola lojas: nada de B em A e vice-versa", async () => {
    const a = await report("", A, 100), b = await report("", B, 100)
    const text = JSON.stringify(a)
    for (const secret of ["QA-VB", "g-tb", "g-wb", "QA Segredo"]) expect(text).not.toContain(secret)
    expect(metric(b, "resumo", "salesGross")).toBe(999)
    expect(metric(b, "resumo", "receipts")).toBe(999)
    expect(metric(b, "receber", "receivableOpen2")).toBe(555)
    expect(metric(a, "fluxo", "flowInitial")).toBe(700) // 500 da carteira A + 200 de outubro; nunca os 9000 de B
    expect(JSON.stringify(b)).not.toContain("QA-V1")
  })

  it("detalhamento filtra, pagina e rastreia a origem sem dados pessoais", async () => {
    const vendas = await report("record=venda", A, 100)
    expect(vendas.total).toBe(8)
    expect(vendas.rows.find(x => x.reference === "QA-V6")?.status).toBe("Cancelada")
    const os = await report("origin=os", A, 100)
    expect(os.rows.every(x => x.origin === "Ordem de serviço")).toBe(true)
    const despesa = await report("category=despesa:Aluguel", A, 100)
    expect(despesa.rows.map(x => x.reference).sort()).toEqual(["g-cp1", "g-cp1"])
    const vencidos = await report("status=vencido", A, 100)
    expect(vencidos.rows.map(x => x.reference).sort()).toEqual(["g-cp2", "g-man", "g-t1"])
    const page = await report("", A, 5)
    expect(page.rows).toHaveLength(5)
    expect(page.total).toBeGreaterThan(30)
    const trace = await buildReport(db, "geral", A, query("source=venda:QA-V2"), { compare: false, financial: true })
    expect(trace.rows.map(x => x.record)).toEqual(["Venda", "Linha da venda", "Título a receber", "Título a receber", "Movimento financeiro"])
    const title = await buildReport(db, "geral", A, query("source=titulo:receber:g-t1"), { compare: false, financial: true })
    expect(title.rows.find(x => x.record === "Venda de origem")?.reference).toBe("QA-V2")
    expect(JSON.stringify(title)).not.toMatch(/Cliente Privado|texto privado/)
    const foreign = await buildReport(db, "geral", A, query("source=venda:QA-VB"), { compare: false, financial: true })
    expect(foreign.rows).toHaveLength(0)
  })

  it("venda gerada de OS sem título da OS não é tratada como paga; rastreio grande é marcado incompleto", async () => {
    const C = "geral-qa-c"
    await db.store.create({ data: { id: C, name: "QA Geral C" } })
    await db.venda.create({ data: { id: "gvc-os", storeId: C, pedidoId: "QA-C-OS", total: 400, at: nov(3), payload: { origem: "os", origemRefId: "os-sem-titulo" },
      itens: { create: { inventoryId: "peca-c", nome: "QA", quantidade: 1, lineTotal: 400 } } } })
    await db.venda.create({ data: { id: "gvc-big", storeId: C, pedidoId: "QA-C-BIG", total: 2001, at: nov(3), payload: { origem: "os", origemRefId: "os-sem-titulo" } } })
    await db.itemVenda.createMany({ data: Array.from({ length: 2001 }, (_, i) => ({ vendaId: "gvc-big", inventoryId: "__servico__x", nome: "Texto livre do caixa " + i, quantidade: 1, lineTotal: 1 })) })
    const r = await report("", C)
    expect(metric(r, "vista-prazo", "osDoc")).toBe(0)
    expect(metric(r, "vista-prazo", "semComprovacao")).toBe(2401)
    const trace = await buildReport(db, "geral", C, query("source=venda:QA-C-BIG"), { compare: false, financial: true })
    expect(trace.rows).toHaveLength(2000)
    expect(trace.total).toBeGreaterThan(trace.rows.length)
    expect(trace.limitations.join(" ")).toContain("INCOMPLETO")
    expect(JSON.stringify(trace)).not.toContain("Texto livre do caixa")
  })

  it("RAFACELL: vencimento dd/mm/aaaa do PDV a prazo tem saldo comprovado; acessório pela configuração do produto", async () => {
    const D = "geral-qa-d"
    await db.store.create({ data: { id: D, name: "QA Geral D" } })
    // Categoria de texto livre sem "acess" (como "Capinha silicone" em produção); a configuração de acessório é a prova.
    await db.produto.createMany({ data: [
      { id: "gd-capa", storeId: D, name: "QA Capinha", category: "Capinha silicone", metadata: { acessorios: { version: 1, tipo: "capinha", exigeModelo: false, exigeCor: false, usaCoresPadrao: true } } },
      { id: "gd-cabo", storeId: D, name: "QA Cabo", category: "Cabos de celular" }] })
    await db.venda.create({ data: { id: "gvd1", storeId: D, pedidoId: "QA-D1", total: 150, at: nov(3), payload: { paymentBreakdown: { dinheiro: 30, aPrazo: 120 } },
      itens: { create: [{ inventoryId: "gd-capa", nome: "QA", quantidade: 1, lineTotal: 25 }, { inventoryId: "gd-cabo", nome: "QA", quantidade: 1, lineTotal: 5 },
        { inventoryId: "__servico__svc-d", nome: "QA", quantidade: 1, lineTotal: 120 }] } } })
    // Mesmo formato gravado por ops-upsert-venda (toLocaleDateString("pt-BR")).
    await db.contaReceberTitulo.createMany({ data: [
      { id: "gd-t1", storeId: D, localKey: "pdv-aprazo-QA-D1-1", valor: 60, vencimento: "05/11/2026", status: "pendente" },
      { id: "gd-t2", storeId: D, localKey: "pdv-aprazo-QA-D1-2", valor: 60, vencimento: "20/12/2099", status: "parcial", payload: { historico: [{ tipo: "pagamento", valor: 20 }] } }] })
    const r = await report("", D)
    expect(row(r, "vendas-tipo", "acessorio")).toMatchObject({ bruto: 25 })
    expect(row(r, "vendas-tipo", "produto")).toMatchObject({ bruto: 5 })
    expect(row(r, "vendas-tipo", "servico")).toMatchObject({ bruto: 120 })
    expect(metric(r, "receber", "receivableUnknown")).toBe(0)
    expect(metric(r, "receber", "receivableOpen2")).toBe(100)
    expect(metric(r, "receber", "receivableOverdue")).toBe(60)
    expect(metric(r, "receber", "receivableDue")).toBe(60)
    expect(metric(r, "resumo", "receivableOpen")).toBe(100)
    // Data impossível continua sem comprovação (nunca vira zero nem data estimada).
    await db.contaReceberTitulo.create({ data: { id: "gd-t3", storeId: D, localKey: "pdv-aprazo-QA-D1-3", valor: 10, vencimento: "31/02/2026", status: "pendente" } })
    const bad = await report("", D)
    expect(metric(bad, "receber", "receivableUnknown")).toBe(1)
    expect(metric(bad, "receber", "receivableOpen2")).toBeNull()
  })

  it("é estritamente somente leitura", async () => {
    const before = await db.movimentacaoFinanceira.count()
    await report()
    expect(await db.movimentacaoFinanceira.count()).toBe(before)
  })

  it("CSV e PDF completos: blocos + todos os registros do recorte", async () => {
    const r = await report("", A, 5000)
    expect(r.rows.length).toBe(r.total)
    const csv = csvReport(r)
    expect(csv).toContain("Seção: Vendas por tipo")
    expect(csv).toContain("Conferência de lançamentos e divergências")
    for (const x of r.rows) expect(csv).toContain(String(x.reference ?? "Indisponível"))
    const pdf = Buffer.from(pdfGeneralReport(r)).toString("latin1")
    expect(pdf).toContain("/BaseFont /Courier")
    expect(pdf).toContain("QA-V8")
    const offset = Number(pdf.match(/startxref\n(\d+)/)?.[1])
    expect(pdf.slice(offset, offset + 4)).toBe("xref")
  })
})
