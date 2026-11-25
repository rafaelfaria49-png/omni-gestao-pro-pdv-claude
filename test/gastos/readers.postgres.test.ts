import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { GET as analytics } from "@/app/api/financeiro/analytics/route"
import { GET as pagar } from "@/app/api/financeiro/pagar/route"
import { GET as receber } from "@/app/api/financeiro/receber/route"
import { GET as movimentos } from "@/app/api/financeiro/movimentacoes/route"
import { GET as carteiras } from "@/app/api/financeiro/carteiras/route"
import { GET as fluxo } from "@/app/api/financeiro/fluxo-caixa/route"
import { GET as dre } from "@/app/api/financeiro/dre/route"
import { GET as conciliacao } from "@/app/api/financeiro/conciliacao/route"
import { GET as fechamentos } from "@/app/api/financeiro/fechamentos/route"
import { GET as auditoria } from "@/app/api/financeiro/auditoria/route"
import { GET as auditoriaDetalhe } from "@/app/api/financeiro/auditoria/[entidade]/[entidadeId]/route"
import { GET as resumo } from "@/app/api/financeiro/relatorios/resumo/route"
import { GET as rankings } from "@/app/api/financeiro/relatorios/rankings/route"
import { GET as categorias } from "@/app/api/financeiro/relatorios/categorias/route"
import { GET as fluxoRelatorio } from "@/app/api/financeiro/relatorios/fluxo/route"
import { GET as indicadores } from "@/app/api/financeiro/relatorios/indicadores/route"
import { GET as exportar } from "@/app/api/financeiro/relatorios/exportar/route"
import { GET as opsList } from "@/app/api/ops/contas-receber-list/route"
import { GET as detalheVenda } from "@/app/api/vendas/[id]/route"
import { GET as detalheCaixa } from "@/app/api/ops/caixa/sessao-detalhe/route"
import { GET as dashboard } from "@/app/api/dashboard/elite/route"
import { requireFinanceiroPerfilAccess } from "@/lib/gastos/access"
import { comLeituraFinanceira, lerFinanceiroPerfil } from "@/lib/gastos/read-scope"
import { getContaPagarById, getContaPagarByLocalKey } from "@/lib/financeiro/services/contas-pagar-service"
import { getContaReceberById, getContaReceberByLocalKey } from "@/lib/financeiro/services/contas-receber-service"
import { createMovimentacao } from "@/lib/financeiro/services/movimentacoes-service"
import { registrarAuditoriaFinanceira } from "@/lib/financeiro/services/auditoria-financeira-service"
import { fecharDia } from "@/lib/financeiro/services/fechamento-service"
import { listarContasReceberComVendas, buscarContaReceberPorIdComVendas } from "@/lib/contas-receber-prisma-queries"
import { requireContadorScope } from "@/lib/contador/scope"
import { construirDadosContador } from "@/lib/contador/readers"
import { carregarFontesPacote } from "@/lib/contador/pacote/carregar-fontes"
import { fabricarEscopoPortalExterno } from "@/lib/contador/scope-core"
import { criarRepoAuthExterna } from "@/lib/contador/auth-externa/repo-prisma"
import { resolverEscopoExterno } from "@/lib/contador/auth-externa/escopo-externo"
import { autenticarECriarSessao, CONTADOR_EXTERNO_COOKIE, ENV_SEGREDO_SESSAO_EXTERNA } from "@/lib/contador/auth-externa/sessao"
import { hashSenhaExterna } from "@/lib/contador/auth-externa/usuarios"
import { lerProjecaoFinanceiraOSV4 } from "@/lib/operacoes-v4/financial-projection-actions"
import { localKeyContaReceberOSV3 } from "@/lib/operacoes-v3/payment-model"
import { executeOmniAgentIntent } from "@/lib/omni-agent/executor"
import { interpretOmniAgentCommand } from "@/lib/omni-agent/interpret"
import { getOmniAgentReportsSnapshot, listOmniAgentCommands, listOmniAgentAutomations } from "@/app/actions/omni-agent"
import { getOmniAgentTimeline } from "@/app/actions/omni-agent-timeline"
import { searchOmniAgentMemories } from "@/app/actions/omni-agent-memory"
import { contexto, E1, E2, P1, P2, L1, L2, L3, U1, U2, EXT, requestCookiesG003, ids, request, login, logout,
  prepararG003, limparG003, estadoFinanceiroG003, periodo } from "./g003-fixtures"

vi.mock("@/auth", async () => ({ auth: async () => (await import("./g003-fixtures")).sessaoAtual }))
// Cookie é adaptador do request Next.js; nenhuma ACL ou fonte financeira é mockada.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => {
  const value = requestCookiesG003.get(name) ?? (name === "assistec-active-store" ? L1 : undefined)
  return value ? { value } : undefined
} }) }))

const endpoints = [
  ["analytics", analytics], ["pagar", pagar], ["receber", receber], ["movimentacoes", movimentos],
  ["carteiras", carteiras], ["fluxo-caixa", fluxo], ["dre", dre], ["conciliacao", conciliacao],
  ["fechamentos", fechamentos], ["auditoria", auditoria], ["relatorios/resumo", resumo],
  ["relatorios/rankings", rankings], ["relatorios/categorias", categorias],
  ["relatorios/fluxo", fluxoRelatorio], ["relatorios/indicadores", indicadores],
] as const

const tiposExportacao = ["movimentacoes", "receber", "pagar", "conciliacoes", "auditoria", "dre", "fluxo",
  "devolucoes", "sessoes_caixa", "operacoes_caixa", "vendas_canceladas", "cobrancas_os"] as const
const matrizExportacao = tiposExportacao.flatMap(tipo => ["csv", "xlsx"].map(formato => ({ tipo, formato })))

function semEstrangeiros(text: string) {
  for (const perfil of [E2, P1, P2]) expect(text).not.toContain(perfil)
}

async function saldoLedgerEmpresaSQL() {
  const [row] = await prisma.$queryRaw<Array<{ centavos: string }>>`
    SELECT SUM(saldo)::bigint::text AS centavos FROM (
      SELECT c.id, COALESCE(c."saldoInicialCentavos",c."saldoInicial"::numeric*100)
        + COALESCE(SUM(CASE WHEN m.tipo='entrada' THEN COALESCE(m."valorCentavos",m.valor::numeric*100)
            ELSE -COALESCE(m."valorCentavos",m.valor::numeric*100) END),0) AS saldo
      FROM carteiras_financeiras c LEFT JOIN movimentacoes_financeiras m
        ON m."carteiraId"=c.id AND m."storeId"=${L1} AND (m."perfilId"=${E1} OR m."perfilId" IS NULL)
      WHERE c."storeId"=${L1} AND (c."perfilId"=${E1} OR c."perfilId" IS NULL) AND c.ativo=TRUE AND c.tipo<>'credito'
      GROUP BY c.id) contas`
  expect(row.centavos).toBe("-12345") // fixture G003 intacta; abertura + ledger, sem usar saldoAtual
  return Number(row.centavos) / 100
}

describe.skipIf(!process.env.GASTOS_G003_TEST_DATABASE_URL)("G003 readers reais / PostgreSQL", () => {
  beforeEach(prepararG003)
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => { await limparG003(); await prisma.$disconnect() })

  it.each(endpoints)("GET %s omite pessoal/empresa estrangeira e não guarda resposta", async (path, get) => {
    const response = await get(request(`/api/financeiro/${path}`))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("private, no-store")
    expect(response.headers.get("vary")).toContain("Cookie")
    semEstrangeiros(await response.text())
  })

  it("analytics não agrega lojas globais e prova a fonte dos valores de saída", async () => {
    const result = await (await analytics(request("/api/financeiro/analytics"))).json()
    expect(result.resultadoLoja).toHaveLength(1)
    expect(result.resultadoLoja[0].loja).toBe(L1)
    expect(result.fluxoMensal.reduce((sum: number, row: { saida: number }) => sum + row.saida, 0)).toBeCloseTo(133.45)
    expect(result.movimentacoes.map((row: { id: string }) => row.id).sort()).toEqual([ids(E1).movimento, "g003-legado-mov"].sort())
  })

  it("resumo e indicadores somam exatamente E1 e legado, mesmo com P2 de nomes/valores iguais", async () => {
    const qs = new URLSearchParams(periodo())
    const a = await (await resumo(request(`/api/financeiro/relatorios/resumo?${qs}`))).json()
    const b = await (await indicadores(request(`/api/financeiro/relatorios/indicadores?${qs}`))).json()
    const esperado = { receitaTotal: 0, despesaTotal: 133.45, lucroLiquido: -133.45,
      saldoConsolidado: await saldoLedgerEmpresaSQL(), receberPendente: 375.01, pagarPendente: 375.01 }
    expect(a.indicadores).toMatchObject(esperado)
    expect(b.indicadores).toMatchObject(esperado)
    expect(a.topDespesas).toHaveLength(2)
    expect(a.topDespesas.reduce((sum: number, row: { valor: number }) => sum + row.valor, 0)).toBeCloseTo(133.45)
    expect(b.comparativoMensal.reduce((sum: number, row: { saida: number }) => sum + row.saida, 0)).toBeCloseTo(133.45)
    expect(b.comparativoAnual.reduce((sum: number, row: { saida: number }) => sum + row.saida, 0)).toBeCloseTo(133.45)
    semEstrangeiros(JSON.stringify([a, b]))
  }, 60_000)

  it("DRE conserva classificação e o fluxo compartilha saldo canônico G005 sem dados privados", async () => {
    const a = await (await dre(request("/api/financeiro/dre"))).json()
    expect(a.dre).toMatchObject({ receitaBruta: 0, custos: 0, totalDespesas: 133.45,
      despesasVariaveis: 133.45, lucroLiquido: -133.45, totalMovimentacoes: 2 })
    const b = await (await fluxo(request("/api/financeiro/fluxo-caixa"))).json()
    expect(b).toMatchObject({ saldoAtual: await saldoLedgerEmpresaSQL(), entradasHoje: 0, saidasHoje: 133.45,
      entradasMes: 0, saidasMes: 133.45, saldoMes: -133.45, totalReceberAberto: 375.01, totalPagarAberto: 375.01 })
    expect(b.apuracao.semCarteira).toEqual({ quantidade: 1, entradasCentavos: "0", saidasCentavos: "1000" })
    const [ledgerCompleto] = await prisma.$queryRaw<Array<{ centavos: string }>>`
      SELECT SUM(CASE WHEN tipo='entrada' THEN 1 ELSE -1 END * COALESCE("valorCentavos",round(valor*100)::bigint))::bigint::text centavos
      FROM movimentacoes_financeiras WHERE "storeId"=${L1} AND ("perfilId"=${E1} OR "perfilId" IS NULL)`
    expect(ledgerCompleto.centavos).toBe("-13345")
    expect(Math.round(b.saldoAtual * 100) - Number(b.apuracao.semCarteira.saidasCentavos)).toBe(Number(ledgerCompleto.centavos))
    expect(b.fluxoDiarioUltimos30Dias.reduce((sum: number, row: { saida: number }) => sum + row.saida, 0)).toBeCloseTo(133.45)
    semEstrangeiros(JSON.stringify([a, b]))
  }, 60_000)

  it("fluxo por período, categorias, rankings e carteiras excluem números pessoais e de L2", async () => {
    const qs = new URLSearchParams(periodo())
    const f = await (await fluxoRelatorio(request(`/api/financeiro/relatorios/fluxo?${qs}`))).json()
    expect(f.fluxo).toHaveLength(1)
    expect(f.fluxo[0]).toMatchObject({ entrada: 0, saida: 133.45, saldo: -133.45, acumulado: -133.45 })
    const c = await (await categorias(request(`/api/financeiro/relatorios/categorias?${qs}`))).json()
    expect(c.receitas).toEqual([])
    expect(c.despesas.map((row: { categoria: string; total: number; qtd: number }) => ({ categoria: row.categoria, total: row.total, qtd: row.qtd })))
      .toEqual([{ categoria: `CATEGORIA_${E1}`, total: 123.45, qtd: 1 }, { categoria: "Sem categoria", total: 10, qtd: 1 }])
    const r = await (await rankings(request(`/api/financeiro/relatorios/rankings?${qs}`))).json()
    expect(r.topReceitas).toEqual([])
    expect(r.topDespesas.map((row: { valor: number }) => row.valor)).toEqual([123.45, 10])
    expect(r.carteiras.map((row: { id: string }) => row.id).sort()).toEqual([ids(E1).conta, "g003-legado-conta"].sort())
    expect(r.carteiras.reduce((sum: number, row: { saldoAtual: number }) => sum + row.saldoAtual, 0)).toBe(await saldoLedgerEmpresaSQL())
    const cs = await (await carteiras(request("/api/financeiro/carteiras"))).json()
    expect(cs.saldoTotal).toBe(await saldoLedgerEmpresaSQL())
    expect(cs.carteiras).toHaveLength(2)
    semEstrangeiros(JSON.stringify([f, c, r, cs]))
  }, 60_000)

  it("conciliação não vazia filtra também a carteira; fechamento só retorna o snapshot de L1", async () => {
    const c = await (await conciliacao(request("/api/financeiro/conciliacao"))).json()
    expect(c.items.map((row: { id: string }) => row.id).sort()).toEqual(["g003-conciliacao-E1", "g003-conciliacao-legado"].sort())
    expect(c.items.reduce((sum: number, row: { diferenca: number }) => sum + row.diferenca, 0)).toBe(1)
    const cr = await (await conciliacao(request("/api/financeiro/conciliacao?resumo=1"))).json()
    expect(cr.resumo).toMatchObject({ total: 2, conciliadas: 1, divergentes: 1, pendentes: 0, totalDivergencia: 1 })
    const f = await (await fechamentos(request("/api/financeiro/fechamentos"))).json()
    expect(f.items).toHaveLength(1)
    expect(f.items[0]).toMatchObject({ id: "g003-fechamento-E1", saldoSistema: -133.45,
      snapshotDRE: { despesa: 133.45, origem: "EMPRESA_E1_LEGADO" } })
    semEstrangeiros(JSON.stringify([c, cr, f]))
  }, 60_000)

  it("fechamento real preservado usa a fonte empresarial e mantém os títulos privados intactos", async () => {
    const privados = await prisma.contaPagarTitulo.findMany({ where: { perfilId: { in: [P1, P2] } }, orderBy: { id: "asc" } })
    const fechado = await fecharDia(L1, "2099-12-30")
    expect(fechado.saldoSistema).toBeCloseTo(-133.45)
    expect(await prisma.contaPagarTitulo.findMany({ where: { perfilId: { in: [P1, P2] } }, orderBy: { id: "asc" } })).toEqual(privados)
  }, 60_000)

  it("auditoria não vazia omite origens privadas/estrangeiras no SQL e só devolve snapshots técnicos", async () => {
    const result = await (await auditoria(request("/api/financeiro/auditoria"))).json()
    expect(result.total).toBe(2)
    expect(result.items.map((row: { id: string }) => row.id).sort()).toEqual(["g003-audit-E1", "g003-audit-legado"].sort())
    expect(result.items.find((row: { id: string }) => row.id === "g003-audit-E1"))
      .toMatchObject({ antes: { status: "pendente", valor: 365.01 }, depois: { status: "pago", valor: 365.01 } })
    const text = JSON.stringify(result)
    semEstrangeiros(text)
    for (const segredo of ["TEXTO_LIVRE", "PRIVADO", "storageRef", "ownerAdminUserId", "perfilId"]) expect(text).not.toContain(segredo)
    for (const entidadeId of [ids(P1).pagar, ids(P2).pagar, ids(E2).pagar, "inexistente"]) {
      const response = await auditoriaDetalhe(request(`/api/financeiro/auditoria/pagar/${entidadeId}`),
        { params: Promise.resolve({ entidade: "pagar", entidadeId }) })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true, items: [], total: 0 })
    }
  }, 60_000)

  it("auditoria grava só os campos técnicos deliberados; origem já excluída não revela referência ou valor", async () => {
    await registrarAuditoriaFinanceira({ storeId: L1, entidade: "pagar", entidadeId: ids(E1).pagar,
      acao: "editar", usuarioId: U1, antes: { status: "pendente", valor: 365.01, descricao: "CONTEUDO_NAO_AUDITAVEL" },
      depois: { status: "pago", valor: 365.01, perfilId: E1, anexos: ["PRIVADO"], storageRef: "PRIVADO" } })
    const gravado = await prisma.auditoriaFinanceira.findFirstOrThrow({ where: { usuarioId: U1, entidadeId: ids(E1).pagar } })
    expect(gravado.antes).toEqual({ status: "pendente", valor: 365.01 })
    expect(gravado.depois).toEqual({ status: "pago", valor: 365.01 })
    await prisma.auditoriaFinanceira.create({ data: { id: "g003-audit-sem-origem", storeId: L1,
      entidade: "pagar", entidadeId: "g003-entidade-excluida", acao: "excluir", antes: { valor: 777, descricao: "LEGADO_NAO_COMPROVAVEL" } } })
    const data = await (await auditoria(request("/api/financeiro/auditoria"))).json()
    expect(data.items.find((row: { id: string }) => row.id === "g003-audit-sem-origem"))
      .toMatchObject({ acao: "excluir", entidadeId: null, antes: null, depois: null })
    const response = await auditoriaDetalhe(request("/api/financeiro/auditoria/pagar/g003-entidade-excluida"),
      { params: Promise.resolve({ entidade: "pagar", entidadeId: "g003-entidade-excluida" }) })
    expect(await response.json()).toEqual({ ok: true, items: [], total: 0 })
  }, 60_000)

  it.each(matrizExportacao)("export real $tipo/$formato tem fontes e totais empresariais conhecidos", async ({ tipo, formato }) => {
    // Modelos do PDV/caixa não têm perfil pessoal: provar o isolamento L1/L2
    // com linhas não vazias em ambos, sem inventar perfis/constraints inexistentes.
    if (["devolucoes", "sessoes_caixa", "operacoes_caixa", "vendas_canceladas"].includes(tipo)) {
      await prisma.sessaoCaixa.create({ data: { id: "g003-export-sessao-L2", storeId: L2,
        operador: "MESMO_OPERADOR", saldoInicial: 888.32 } })
      await prisma.sessaoCaixa.update({ where: { id: "g003-sessao" }, data: { operador: "MESMO_OPERADOR", saldoInicial: 33.33 } })
      for (const [storeId, sessaoId, valor] of [[L1, "g003-sessao", 33.33], [L2, "g003-export-sessao-L2", 888.32]] as const) {
        await prisma.devolucaoVenda.create({ data: { id: `g003-export-devolucao-${storeId}`, storeId,
          localId: "MESMA_DEVOLUCAO", tipo: "somente_estoque", valorTotal: valor, sessaoId } })
        await prisma.caixaOperacao.create({ data: { id: `g003-export-operacao-${storeId}`, storeId,
          sessaoId, tipo: "sangria", valor, motivo: "MESMO_MOTIVO" } })
        await prisma.venda.create({ data: { id: `g003-export-cancelada-${storeId}`, storeId,
          pedidoId: `g003-cancelada-${storeId}`, status: "cancelada", total: valor, canceladaEm: new Date() } })
      }
    }
    if (tipo === "cobrancas_os") {
      await prisma.contaReceberTitulo.createMany({ data: [
        { id: "g003-export-os-E1", storeId: L1, perfilId: E1, localKey: "os-faturamento:empresa", valor: 55.55 },
        { id: "g003-export-os-legado", storeId: L1, localKey: "os-faturamento:legado", valor: 5.55 },
        { id: "g003-export-os-E2", storeId: L2, perfilId: E2, localKey: "os-faturamento:empresa", valor: 999.99 },
        // G002 exige localKey NULL no pessoal; a identidade privada não vira chave de OS empresarial.
        ...[P1, P2].map(perfilId => ({ id: `g003-export-os-${perfilId}`, perfilId,
          identidadePessoal: `gastos:pessoal:${perfilId}:os-faturamento:empresa`, valor: 55.55 })),
      ] })
    }
    const qs = new URLSearchParams({ tipo, formato, ...periodo() })
    const response = await exportar(request(`/api/financeiro/relatorios/exportar?${qs}`))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("private, no-store")
    expect(response.headers.get("content-disposition")).toContain(`.${formato}`)
    let rows: Array<Record<string, string | number>>
    if (formato === "csv") {
      const text = await response.text()
      semEstrangeiros(text)
      // A massa usa strings sem separadores/aspas; não é um parser CSV de produto.
      const [header, ...lines] = text.trim().split("\n")
      rows = lines.map(line => Object.fromEntries(header.split(";").map((key, i) => [key, line.split(";")[i]])))
    } else {
      const XLSX = await import("xlsx")
      const wb = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: "buffer" })
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
    }
    semEstrangeiros(JSON.stringify(rows))
    const idsEsperados: Partial<Record<typeof tipo, string[]>> = {
      movimentacoes: [ids(E1).movimento, "g003-legado-mov"], receber: [ids(E1).receber, "g003-legado-receber"],
      pagar: [ids(E1).pagar, "g003-legado-pagar"], conciliacoes: ["g003-conciliacao-E1", "g003-conciliacao-legado"],
      auditoria: ["g003-audit-E1", "g003-audit-legado"], cobrancas_os: ["g003-export-os-E1", "g003-export-os-legado"],
      devolucoes: [`g003-export-devolucao-${L1}`], sessoes_caixa: ["g003-sessao"],
      operacoes_caixa: [`g003-export-operacao-${L1}`], vendas_canceladas: [`g003-export-cancelada-${L1}`],
    }
    if (idsEsperados[tipo]) expect(rows.map(row => row.id).sort()).toEqual(idsEsperados[tipo]?.sort())
    const total = (coluna: string) => rows.reduce((sum, row) => sum + Number(row[coluna]), 0)
    if (["movimentacoes", "dre", "fluxo"].includes(tipo)) {
      expect(rows).toHaveLength(2)
      expect(total("valor")).toBeCloseTo(133.45)
      expect(rows.map(row => row.descricao).sort()).toEqual([`SENTINELA_${E1}`, "EMPRESA_LEGADO"].sort())
    }
    if (["receber", "pagar"].includes(tipo)) expect(total("valor")).toBeCloseTo(375.01)
    if (tipo === "conciliacoes") expect(total("diferenca")).toBe(1)
    if (tipo === "cobrancas_os") expect(total("valor")).toBeCloseTo(61.10)
    if (tipo === "devolucoes") expect(total("valorTotal")).toBe(33.33)
    if (tipo === "sessoes_caixa") expect(total("saldoInicial")).toBe(33.33)
    if (tipo === "operacoes_caixa") expect(total("valor")).toBe(33.33)
    if (tipo === "vendas_canceladas") expect(total("total")).toBe(33.33)
  }, 60_000)

  it("pessoal único continua disponível após troca e perda de todas as lojas", async () => {
    const p1 = await contexto(P1)
    const before = await lerFinanceiroPerfil(p1)
    expect(before.pagar.map(row => row.id)).toEqual([ids(P1).pagar])
    login(U1, [L2])
    expect(await lerFinanceiroPerfil(p1)).toEqual(before)
    await prisma.adminUserStore.deleteMany({ where: { adminUserId: U1 } })
    login(U1, [])
    expect(await lerFinanceiroPerfil(p1)).toEqual(before)
    expect((await pagar(request("/api/financeiro/pagar"))).status).toBe(403)
  })

  it.each(["ADMIN", "SUPER_ADMIN"] as const)("%s U2 não ganha acesso a P1 por papel ou loja compartilhada", async role => {
    const ctx = await contexto(P1)
    await prisma.adminUser.update({ where: { id: U2 }, data: { role } })
    login(U2, [L1], role)
    expect((await requireFinanceiroPerfilAccess({ tipo: "PESSOAL", perfilId: P1 })).ok).toBe(false)
    await expect(lerFinanceiroPerfil(ctx)).rejects.toThrow("Não foi possível consultar")
    await expect(lerFinanceiroPerfil(JSON.parse(JSON.stringify(ctx)))).rejects.toThrow()
    const own = await lerFinanceiroPerfil(await contexto(P2))
    expect(own.pagar.map(row => row.id)).toEqual([ids(P2).pagar])
  })

  it.each([ids(P1).conta, ids(P2).conta, ids(E2).conta])("conta %s não atravessa o perfil E1", async carteiraId => {
    await expect(lerFinanceiroPerfil(await contexto(E1), { carteiraId })).rejects.toMatchObject({ status: 404 })
  })

  it("detalhes pessoais/estrangeiros e localKey forjada são indistinguíveis de ausentes", async () => {
    expect(await getContaPagarById(L1, ids(P1).pagar)).toBeNull()
    expect(await getContaReceberById(L1, ids(E2).receber)).toBeNull()
    expect(await buscarContaReceberPorIdComVendas(ids(P1).receber, L1)).toBeNull()
    expect((await listarContasReceberComVendas(L1)).map(row => row.id).sort()).toEqual([ids(E1).receber, "g003-legado-receber"].sort())
    const forged = await pagar(request(`/api/financeiro/pagar?localKey=${encodeURIComponent(`gastos:pessoal:${P1}:mesma-chave`)}`))
    const absent = await pagar(request("/api/financeiro/pagar?localKey=inexistente"))
    expect(forged.status).toBe(404)
    expect(await forged.text()).toBe(await absent.text())
    expect((await getContaPagarByLocalKey(L1, "legado"))?.perfilId).toBeNull()
    expect((await getContaReceberByLocalKey(L1, "legado"))?.perfilId).toBeNull()
  })

  it.each([
    ["header", "/api/financeiro/pagar", L2, {}],
    ["query", `/api/financeiro/pagar?storeId=${L2}`, L1, {}],
    ["cookie", "/api/financeiro/pagar", L1, { cookie: `assistec-active-store=${L2}` }],
    ["perfil", `/api/financeiro/pagar?perfilId=${P1}`, L1, {}],
    ["owner", `/api/financeiro/pagar?ownerAdminUserId=${U1}`, L1, {}],
  ])("seletor %s forjado é recusado no handler real", async (_kind, path, storeId, headers) => {
    login(U2, [L1])
    const response = await pagar(request(path, storeId, headers))
    expect(response.status).toBe(403)
    semEstrangeiros(await response.text())
  })

  it("revogação no banco prevalece sobre membership/permissões antigas na sessão", async () => {
    await prisma.perfilMembro.updateMany({ where: { adminUserId: U1, perfilId: E1 }, data: { revogadoEm: new Date() } })
    expect((await pagar(request("/api/financeiro/pagar"))).status).toBe(403)
    await prisma.adminUser.update({ where: { id: U1 }, data: { role: "TECNICO" } })
    login(U1) // token ainda diz ADMIN
    expect((await receber(request("/api/financeiro/receber"))).status).toBe(403)
  })

  it("store/cookie sem identidade não autoriza; legado empresarial sem perfil não provisiona", async () => {
    logout()
    expect((await pagar(request("/api/financeiro/pagar"))).status).toBe(401)
    login()
    const before = await prisma.financeiroPerfil.count()
    expect((await pagar(request("/api/financeiro/pagar", L3))).status).toBe(200)
    expect(await prisma.financeiroPerfil.count()).toBe(before)
  })

  it("writer G002 cria perfil sem grant: legado passa de 200 a 403 e só retorna com grant explícito", async () => {
    login(U1, [L3])
    requestCookiesG003.set("assistec-active-store", L3)
    const legadoId = "g003-legado-transicao"
    await prisma.contaPagarTitulo.create({ data: { id: legadoId, storeId: L3, localKey: "transicao",
      descricao: "Legado empresarial sintético", valor: 12.34 } })
    expect(await prisma.financeiroPerfil.findUnique({ where: { storeId: L3 } })).toBeNull()
    const antes = await pagar(request("/api/financeiro/pagar", L3))
    expect(antes.status).toBe(200)
    expect((await antes.json()).rows.map((row: { id: string }) => row.id)).toEqual(["transicao"])
    expect(await prisma.financeiroPerfil.findUnique({ where: { storeId: L3 } })).toBeNull()

    // Writer canônico REAL, preservado do G002. Não se mocka Prisma, perfil ou grant.
    const movimento = await createMovimentacao({ storeId: L3, tipo: "entrada", origem: "manual",
      descricao: "TRANSICAO_G002_SINTETICA", valor: 25 })
    const perfil = await prisma.financeiroPerfil.findUniqueOrThrow({ where: { storeId: L3 } })
    expect(perfil.tipo).toBe("EMPRESA")
    expect(await prisma.perfilMembro.count({ where: { perfilId: perfil.id } })).toBe(0)
    const negado = await pagar(request("/api/financeiro/pagar", L3))
    expect(negado.status).toBe(403)
    expect(negado.headers.get("cache-control")).toContain("no-store")
    expect(await prisma.perfilMembro.count({ where: { perfilId: perfil.id } })).toBe(0)

    // Somente a fixture simula a concessão explícita por operador autorizado.
    await prisma.perfilMembro.create({ data: { perfilId: perfil.id, storeId: L3, adminUserId: U1 } })
    const depois = await pagar(request("/api/financeiro/pagar", L3))
    expect(depois.status).toBe(200)
    expect((await depois.json()).rows.map((row: { id: string }) => row.id)).toEqual(["transicao"])
    const lancamentos = await movimentos(request("/api/financeiro/movimentacoes", L3))
    expect(lancamentos.status).toBe(200)
    expect((await lancamentos.json()).rows.map((row: { id: string }) => row.id)).toEqual([movimento.id])
    expect((await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: legadoId } })).perfilId).toBeNull()
  })

  it.each(["ADMIN", "GERENTE", "CAIXA", "VENDEDOR"] as const)("GET venda atende o consumidor comercial/caixa com papel %s vigente", async role => {
    await prisma.adminUser.update({ where: { id: U1 }, data: { role } })
    login(U1, [L1], role)
    const response = await detalheVenda(request("/api/vendas/g003-pedido?full=1"), { params: Promise.resolve({ id: "g003-pedido" }) })
    expect(response.status).toBe(200)
    semEstrangeiros(await response.text())
  })

  it("GET venda não usa token ADMIN antigo para contornar hubs.vendas do TECNICO atual", async () => {
    await prisma.adminUser.update({ where: { id: U1 }, data: { role: "TECNICO" } })
    login(U1, [L1], "ADMIN")
    const response = await detalheVenda(request("/api/vendas/g003-pedido?full=1"), { params: Promise.resolve({ id: "g003-pedido" }) })
    expect(response.status).toBe(403)
    expect(response.headers.get("cache-control")).toContain("no-store")
  })

  it("listagem PDV, venda, caixa e dashboard reais só leem a empresa autorizada", async () => {
    const responses = [await opsList(request("/api/ops/contas-receber-list")),
      await detalheVenda(request("/api/vendas/g003-pedido?full=1"), { params: Promise.resolve({ id: "g003-pedido" }) }),
      await detalheCaixa(request("/api/ops/caixa/sessao-detalhe?sessaoId=g003-sessao")),
      await dashboard(request("/api/dashboard/elite"))]
    for (const response of responses) { expect(response.status).toBe(200); semEstrangeiros(await response.text()) }
    login(U2, [L1])
    expect((await detalheVenda(request("/api/vendas/x", L2), { params: Promise.resolve({ id: "x" }) })).status).toBe(403)
  })

  it("Contador real usa seu gate e carga/DTO/pacote apenas de fontes empresariais", async () => {
    const scope = await requireContadorScope()
    if (!scope.ok) throw new Error("Scope Contador sintético negado")
    const now = new Date(), competencia = { ano: now.getFullYear(), mes: now.getMonth() + 1 }
    const dados = await construirDadosContador(scope, competencia)
    const pacote = await carregarFontesPacote({ scope, competencia })
    expect(pacote.movimentacoes.linhas.map(row => row.movimentacaoId).sort()).toEqual([ids(E1).movimento, "g003-legado-mov"].sort())
    expect(pacote.contasPagar.linhas.map(row => row.tituloId).sort()).toEqual([ids(E1).pagar, "g003-legado-pagar"].sort())
    semEstrangeiros(JSON.stringify({ dados, pacote }))
  })

  it("Contador interno recusa scope antigo depois de revogação no banco, mesmo com token ADMIN", async () => {
    const scope = await requireContadorScope()
    if (!scope.ok) throw new Error("Scope de fixture negado")
    const now = new Date(), competencia = { ano: now.getFullYear(), mes: now.getMonth() + 1 }
    await prisma.adminUserStore.deleteMany({ where: { adminUserId: U1, storeId: L1 } })
    await expect(construirDadosContador(scope, competencia)).rejects.toThrow("Não foi possível consultar")
    await expect(carregarFontesPacote({ scope, competencia })).rejects.toThrow("Não foi possível consultar")
    await prisma.adminUserStore.create({ data: { adminUserId: U1, storeId: L1 } })
    // A exclusão do vínculo de loja elimina o grant por FK. Recriar explicitamente
    // a concessão na fixture permite provar a revogação financeira isolada.
    await prisma.perfilMembro.create({ data: { perfilId: E1, storeId: L1, adminUserId: U1 } })
    await expect(construirDadosContador(scope, competencia)).resolves.toBeDefined()
    const revoked = await prisma.perfilMembro.updateMany({ where: { perfilId: E1, adminUserId: U1 }, data: { revogadoEm: new Date() } })
    expect(revoked.count).toBe(1)
    await expect(construirDadosContador(scope, competencia)).rejects.toThrow("Não foi possível consultar")
  })

  it("scope Contador de outro ator ou papel antigo nunca substitui a identidade/permissão atual", async () => {
    const scope = await requireContadorScope()
    if (!scope.ok) throw new Error("Scope de fixture negado")
    const now = new Date(), competencia = { ano: now.getFullYear(), mes: now.getMonth() + 1 }
    login(U2, [L1])
    await expect(construirDadosContador(scope, competencia)).rejects.toThrow("Não foi possível consultar")
    login()
    await prisma.adminUser.update({ where: { id: U1 }, data: { role: "TECNICO" } })
    await expect(carregarFontesPacote({ scope, competencia })).rejects.toThrow("Não foi possível consultar")
  })

  it("Contador externo revalida cookie e vínculo próprios sem ler pessoal, renovar sessão ou aceitar JSON como autoridade", async () => {
    const secret = "g003-fixture-session-secret-not-a-production-credential"
    vi.stubEnv(ENV_SEGREDO_SESSAO_EXTERNA, secret)
    const senha = "g003-synthetic-password"
    await prisma.contadorUsuario.create({ data: { id: EXT, email: `${EXT}@example.invalid`, nome: "Synthetic accountant", senhaHash: await hashSenhaExterna(senha) } })
    await prisma.contadorAcesso.create({ data: { usuarioId: EXT, storeId: L1, papel: "LEITURA", concedidoPorId: U1 } })
    const repo = criarRepoAuthExterna()
    const auth = await autenticarECriarSessao(repo, { email: `${EXT}@example.invalid`, senha })
    if (!auth.ok) throw new Error("Login de fixture negado")
    requestCookiesG003.set(CONTADOR_EXTERNO_COOKIE, auth.cookie.value)
    const external = await resolverEscopoExterno(repo, { token: auth.cookie.value, storeId: L1 })
    if (!external.ok) throw new Error("Scope externo de fixture negado")
    const scope = fabricarEscopoPortalExterno(external)
    logout() // A sessão externa não toma emprestado o AdminUser da fixture.
    const now = new Date(), competencia = { ano: now.getFullYear(), mes: now.getMonth() + 1 }
    const before = await prisma.contadorSessaoExterna.findMany({ where: { usuarioId: EXT } })
    const dados = await construirDadosContador(scope, competencia)
    const pacote = await carregarFontesPacote({ scope, competencia })
    semEstrangeiros(JSON.stringify({ dados, pacote }))
    expect(pacote.contasPagar.linhas.map(row => row.tituloId).sort()).toEqual([ids(E1).pagar, "g003-legado-pagar"].sort())
    expect(await prisma.contadorSessaoExterna.findMany({ where: { usuarioId: EXT } })).toEqual(before)
    await expect(construirDadosContador({ ...scope, storeId: L2 }, competencia)).rejects.toThrow()
    await expect(construirDadosContador({ ...scope, userId: U1 }, competencia)).rejects.toThrow()
    requestCookiesG003.delete(CONTADOR_EXTERNO_COOKIE)
    await expect(construirDadosContador(JSON.parse(JSON.stringify(scope)) as typeof scope, competencia)).rejects.toThrow()
    requestCookiesG003.set(CONTADOR_EXTERNO_COOKIE, auth.cookie.value)
    await prisma.contadorAcesso.updateMany({ where: { usuarioId: EXT, storeId: L1 }, data: { status: "REVOGADO", revogadoEm: new Date() } })
    await expect(construirDadosContador(scope, competencia)).rejects.toThrow()
    await expect(carregarFontesPacote({ scope, competencia })).rejects.toThrow()
  })

  it.each(["ADMIN", "TECNICO"] as const)("Action real OS V4 atende %s pelo gate de OS e revalida membership", async role => {
    await prisma.adminUser.update({ where: { id: U1 }, data: { role } })
    login(U1, [L1, L2], role)
    const osId = "g003-fixture-os1"
    await prisma.ordemServico.create({ data: { id: osId, storeId: L1, numero: "G003-OS", valorTotal: 100,
      payload: { id: osId, codigo: "G003-OS", status: "pronta", operacaoStatusV3: "pronta", timeline: [],
        orcamento: { id: "g003-orcamento", status: "aprovado", sintetizado: false, total: 100, desconto: 0,
          servicos: [{ id: "s1", descricao: "Synthetic service", valor: 100 }], pecas: [], criadoEm: new Date().toISOString() } },
    } })
    await prisma.contaReceberTitulo.create({ data: { id: `${osId}-receber`, storeId: L1, perfilId: E1,
      localKey: localKeyContaReceberOSV3(L1, osId), valor: 100, valorCentavos: "10000", status: "pago",
      payload: { ordemServicoId: osId, historico: [{ tipo: "liquidacao", valor: 100, formaPagamento: "pix" }] },
    } })
    const result = await lerProjecaoFinanceiraOSV4(L1, osId)
    expect(result).toMatchObject({ storeId: L1, osId, financialStatus: "PAID", receivedTotal: 100, balance: 0 })
    semEstrangeiros(JSON.stringify(result))
    await expect(lerProjecaoFinanceiraOSV4(L2, osId)).rejects.toThrow("OS não encontrada")
    await prisma.adminUserStore.deleteMany({ where: { adminUserId: U1, storeId: L1 } })
    await expect(lerProjecaoFinanceiraOSV4(L1, osId)).rejects.toThrow("Não foi possível consultar")
  })

  it("Omni Agent real consulta resumo sem pessoal e não alimenta memória/timeline com P1", async () => {
    const interp = interpretOmniAgentCommand("financeiro hoje")
    expect(interp.intent).toBe("FINANCE_SUMMARY")
    const result = await executeOmniAgentIntent(L1, interp)
    expect(result.ok).toBe(true)
    const snapshot = await getOmniAgentReportsSnapshot(L1)
    expect(snapshot.financeiroSemPermissao).toBe(false)
    const data = { result, snapshot, comandos: await listOmniAgentCommands(L1),
      memoria: await searchOmniAgentMemories(L1, "SENTINELA"), timeline: await getOmniAgentTimeline(L1) }
    semEstrangeiros(JSON.stringify(data))
    expect(await prisma.omniAgentMemory.count()).toBe(0)
  })

  it("histórico financeiro do Agent é oculto após revogar o grant e não cria automações em leitura", async () => {
    await prisma.omniAgentCommand.create({ data: { storeId: L1, comandoOriginal: "financeiro hoje", interpretacao: { intent: "FINANCE_SUMMARY", action: "Resumo" }, status: "EXECUTADO", resultado: { value: 123.45 } } })
    await prisma.perfilMembro.updateMany({ where: { adminUserId: U1, perfilId: E1 }, data: { revogadoEm: new Date() } })
    expect(await listOmniAgentCommands(L1)).toEqual([])
    expect((await getOmniAgentReportsSnapshot(L1)).financeiroHoje).toBeNull()
    const before = await prisma.omniAgentAutomation.count()
    await listOmniAgentAutomations(L1)
    expect(await prisma.omniAgentAutomation.count()).toBe(before)
  })

  it("consultas não adotam legado, não gravam dinheiro/documentos e o snapshot recusa mutação oculta", async () => {
    const before = await estadoFinanceiroG003()
    await pagar(request("/api/financeiro/pagar?localKey=legado"))
    await analytics(request("/api/financeiro/analytics"))
    await lerFinanceiroPerfil(await contexto(P1))
    expect(await estadoFinanceiroG003()).toBe(before)
    await expect(comLeituraFinanceira(await contexto(P1), db => db.store.update({ where: { id: L1 }, data: { name: "INVALID" } }))).rejects.toThrow()
    expect((await prisma.store.findUnique({ where: { id: L1 } }))?.name).toBe(L1)
  })
})
