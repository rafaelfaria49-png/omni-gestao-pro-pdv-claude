import { requireModuleApi } from "@/lib/auth/module-access"
import { ConsultaFinanceiraError } from "@/lib/gastos/query-calculo"
import { erroConsultaFinanceira } from "@/lib/gastos/query"
import { consultarFinanceiroEmpresa, reaisConsulta } from "@/lib/gastos/query"
/**
 * GET /api/financeiro/relatorios/exportar
 *
 * Exporta dados financeiros como CSV ou XLSX.
 *
 * Query params:
 *   tipo      — movimentacoes | receber | pagar | conciliacoes | auditoria | dre | fluxo |
 *               devolucoes | sessoes_caixa | operacoes_caixa | vendas_canceladas | cobrancas_os
 *   formato   — csv | xlsx (padrão: csv)
 *   dataInicio — yyyy-mm-dd
 *   dataFim    — yyyy-mm-dd
 *   preset     — hoje | 7dias | 30dias | estemes | mespassado
 */
import { apiGuardLeituraFinanceira, respostaFinanceiraPrivada } from "@/lib/gastos/read-scope"
import { leituraEmpresaWhere } from "@/lib/gastos/read-scope"
import { NextResponse } from "next/server"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import type { EnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import { prismaEnsureConnected, prisma } from "@/lib/prisma"
import { buildFiltroPreset, type PeriodoFiltro } from "@/lib/financeiro/services/relatorios-financeiros-service"
import { listarAuditoriaFinanceiraParaExportacao } from "@/lib/financeiro/services/auditoria-financeira-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function toDateRange(filtro: PeriodoFiltro) {
  const hoje = new Date().toISOString().slice(0, 10)
  const firstDay = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01` })()
  return {
    gte: new Date((filtro.dataInicio ?? firstDay) + "T00:00:00.000Z"),
    lte: new Date((filtro.dataFim ?? hoje) + "T23:59:59.999Z"),
  }
}

type Row = Record<string, string | number | null | undefined>

function toCSV(rows: Row[]): string {
  if (!rows.length) return ""
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => {
      const v = r[h]
      if (v === null || v === undefined) return ""
      const s = String(v)
      return s.includes(";") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s
    }).join(";")),
  ]
  return lines.join("\n")
}

async function toXLSX(rows: Row[], sheetName: string): Promise<Buffer> {
  // Dynamic import — xlsx is in package.json
  const XLSX = await import("xlsx")
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer)
}

async function fetchRows(storeId: string, tipo: string, filtro: PeriodoFiltro): Promise<{ rows: Row[]; filename: string }> {
  const range = toDateRange(filtro)

  if (["movimentacoes","pagar","receber","fluxo","dre"].includes(tipo)) {
    const q=await consultarFinanceiroEmpresa(storeId,filtro)
    const criterios={base_apuracao:q.base,finalidade:tipo==="dre"?"FONTE_CAIXA_PARA_DRE_CLASSIFICADA_NO_RELATORIO":"MOVIMENTOS_E_POSICOES",timezone:q.timezone,data_inicio:q.periodo.dataInicio,data_fim:q.periodo.dataFim,as_of:q.asOf,versao_calculo:q.versaoCalculo,posicao_titulos:q.criterios.posicaoTitulos}
    if(tipo==="pagar"||tipo==="receber")return {filename:"contas_"+tipo,rows:q[tipo].map(t=>({id:t.id,localKey:t.localKey??"",descricao:t.descricao,valor:reaisConsulta(t.valorCentavos),valorOriginal:reaisConsulta(t.valorCentavos),valorPago:reaisConsulta(t.pagoCentavos),valorRestante:reaisConsulta(t.restanteCentavos),valorAberto:reaisConsulta(t.restanteCentavos),status:t.status,vencimento:t.vencimento,categoriaId:t.categoriaId??"",...criterios}))}
    return {filename:tipo==="dre"?"dre_fonte_caixa":tipo==="fluxo"?"fluxo_caixa":"movimentacoes",rows:q.eventos.map(e=>({id:e.movimentoId,alocacao:e.id,tipo:e.tipo,descricao:e.descricao,valor:reaisConsulta(e.valorCentavos),receitaRealizada:reaisConsulta(e.receitaCentavos),despesaRealizada:reaisConsulta(e.despesaCentavos),transferencia:e.transferencia?"sim":"nao",categoriaId:e.categoriaId??"",categoria:e.categoria,origem:e.origem,data:e.dia,ocorridoEm:e.ocorridoEm,...criterios}))}
  }

  if (tipo === "conciliacoes") {
    const rows = await prisma.conciliacaoFinanceira.findMany({
      where: { storeId, createdAt: range, carteira: { is: leituraEmpresaWhere(storeId, {}) } },
      include: { carteira: { select: { nome: true } } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    })
    return {
      filename: "conciliacoes",
      rows: rows.map((r) => ({
        id: r.id, carteira: r.carteira.nome, dataReferencia: r.dataReferencia,
        saldoSistema: r.saldoSistema, saldoInformado: r.saldoInformado,
        diferenca: r.diferenca, status: r.status,
        conciliadoPor: r.conciliadoPor ?? "",
        data: r.createdAt.toISOString().slice(0, 10),
      })),
    }
  }

  if (tipo === "auditoria") {
    const rows = await listarAuditoriaFinanceiraParaExportacao(storeId,
      range.gte.toISOString().slice(0, 10), range.lte.toISOString().slice(0, 10))
    return {
      filename: "auditoria",
      rows: rows.map((r) => ({
        id: r.id, entidade: r.entidade, entidadeId: r.entidadeId ?? "",
        acao: r.acao, usuarioNome: r.usuarioNome ?? "sistema",
        ip: r.ip ?? "", data: r.createdAt.slice(0, 16),
      })),
    }
  }

  if (tipo === "devolucoes") {
    const rows = await prisma.devolucaoVenda.findMany({
      where: { storeId, at: range },
      select: {
        id: true, localId: true, vendaLocalId: true, tipo: true, valorTotal: true, clienteNome: true,
        operador: true, motivo: true, at: true, sessaoId: true,
      },
      orderBy: { at: "desc" },
      take: 5000,
    })
    return {
      filename: "devolucoes_pdv",
      rows: rows.map((r) => ({
        id: r.id,
        localId: r.localId,
        vendaLocalId: r.vendaLocalId,
        sessaoId: r.sessaoId ?? "",
        tipo: r.tipo,
        valorTotal: r.valorTotal,
        cliente: r.clienteNome,
        operador: r.operador,
        motivo: r.motivo,
        data: r.at.toISOString().slice(0, 10),
      })),
    }
  }

  if (tipo === "sessoes_caixa") {
    const rows = await prisma.sessaoCaixa.findMany({
      where: {
        storeId,
        abertaEm: { lte: range.lte },
        OR: [{ fechadaEm: null }, { fechadaEm: { gte: range.gte } }],
      },
      select: {
        id: true, operador: true, saldoInicial: true, saldoFinal: true, saldoContado: true,
        status: true, abertaEm: true, fechadaEm: true, observacao: true,
      },
      orderBy: { abertaEm: "desc" },
      take: 5000,
    })
    return {
      filename: "sessoes_caixa",
      rows: rows.map((r) => ({
        id: r.id,
        operador: r.operador,
        saldoInicial: r.saldoInicial,
        saldoFinal: r.saldoFinal ?? "",
        saldoContado: r.saldoContado ?? "",
        status: r.status,
        abertaEm: r.abertaEm.toISOString().slice(0, 16),
        fechadaEm: r.fechadaEm ? r.fechadaEm.toISOString().slice(0, 16) : "",
        observacao: r.observacao,
      })),
    }
  }

  if (tipo === "operacoes_caixa") {
    const rows = await prisma.caixaOperacao.findMany({
      where: { storeId, at: range },
      select: { id: true, sessaoId: true, tipo: true, valor: true, motivo: true, operador: true, at: true },
      orderBy: { at: "desc" },
      take: 5000,
    })
    return {
      filename: "operacoes_caixa",
      rows: rows.map((r) => ({
        id: r.id,
        sessaoId: r.sessaoId,
        tipo: r.tipo,
        valor: r.valor,
        motivo: r.motivo,
        operador: r.operador,
        data: r.at.toISOString().slice(0, 16),
      })),
    }
  }

  if (tipo === "vendas_canceladas") {
    const rows = await prisma.venda.findMany({
      where: {
        storeId,
        status: "cancelada",
        OR: [
          { canceladaEm: { gte: range.gte, lte: range.lte } },
          { AND: [{ canceladaEm: null }, { at: { gte: range.gte, lte: range.lte } }] },
        ],
      },
      select: {
        id: true, pedidoId: true, total: true, at: true, canceladaEm: true, canceladaPor: true, motivoCancelamento: true,
      },
      orderBy: [{ canceladaEm: "desc" }, { at: "desc" }],
      take: 5000,
    })
    return {
      filename: "vendas_canceladas",
      rows: rows.map((r) => ({
        id: r.id,
        pedidoId: r.pedidoId,
        total: r.total,
        vendaEm: r.at.toISOString().slice(0, 10),
        canceladaEm: r.canceladaEm ? r.canceladaEm.toISOString().slice(0, 16) : "",
        canceladaPor: r.canceladaPor ?? "",
        motivo: r.motivoCancelamento ?? "",
      })),
    }
  }

  if (tipo === "cobrancas_os") {
    const rows = await prisma.contaReceberTitulo.findMany({
      where: leituraEmpresaWhere(storeId, { storeId, localKey: { startsWith: "os-faturamento:" }, createdAt: range }),
      select: {
        id: true, localKey: true, cliente: true, descricao: true, valor: true, status: true, vencimento: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    })
    return {
      filename: "cobrancas_os",
      rows: rows.map((r) => ({
        id: r.id,
        localKey: r.localKey,
        cliente: r.cliente ?? "",
        descricao: r.descricao,
        valor: r.valor,
        baseValor: "VALOR_ORIGINAL_DO_TITULO",
        status: r.status,
        vencimento: r.vencimento ?? "",
        criadoEm: r.createdAt.toISOString().slice(0, 10),
      })),
    }
  }

  throw new ConsultaFinanceiraError("tipo_exportacao_invalido",400)
}

export async function GET(req: Request) {
  // Reconciliação main × G003: módulo finance por loja (main) + guard de leitura privada (G003).
  const moduleDenied = await requireModuleApi(req, "finance")
  if (moduleDenied) return respostaFinanceiraPrivada(moduleDenied)
  // F-02-anchor (SPRINT_MULTI_LOJA-S-002): a chamada via anchor-tag (`<a href>`) não envia
  // `x-assistec-loja-id`, mas o cliente passa `storeId` na query — resolvido por
  // `storeIdFromAssistecRequestForRead`. Sem fallback `loja-1`: ausência → 400 explícito.
  const storeId = opsLojaIdFromRequest(req)
  if (!storeId) {
    return respostaFinanceiraPrivada(NextResponse.json({ ok: false, error: "storeId obrigatório" }, { status: 400 }))
  }
  const url = new URL(req.url)

  const tipo = url.searchParams.get("tipo") ?? "movimentacoes"
  const exportCheck = (p: EnterprisePermissions) => {
    if (tipo === "auditoria") return p.auditoria
    if (tipo === "conciliacoes") return p.financeiro.conciliacao
    return p.financeiro.edit
  }
  const denied = await apiGuardLeituraFinanceira(storeId, exportCheck, req)
  if (denied) return respostaFinanceiraPrivada(denied)

  const formato = (url.searchParams.get("formato") ?? "csv").toLowerCase()
  const preset = url.searchParams.get("preset")

  try {
  let filtro: PeriodoFiltro = preset ? buildFiltroPreset(preset) : {}
  if (url.searchParams.get("dataInicio")) filtro.dataInicio = url.searchParams.get("dataInicio")!
  if (url.searchParams.get("dataFim")) filtro.dataFim = url.searchParams.get("dataFim")!
  if (url.searchParams.get("carteiraId")) filtro.carteiraId=url.searchParams.get("carteiraId")!
  if (url.searchParams.get("categoriaId")) filtro.categoriaId=url.searchParams.get("categoriaId")!

    await prismaEnsureConnected()
    const { rows, filename } = await fetchRows(storeId, tipo, filtro)

    if (formato === "xlsx") {
      const buffer = await toXLSX(rows, filename)
      return respostaFinanceiraPrivada(new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}_${new Date().toISOString().slice(0, 10)}.xlsx"`,
        },
      }))
    }

    // Default: CSV
    const csv = toCSV(rows)
    return respostaFinanceiraPrivada(new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    }))
  } catch (e) {
    const erro=erroConsultaFinanceira(e)
    return respostaFinanceiraPrivada(NextResponse.json(erro.body,{status:erro.status}))
  }
}
