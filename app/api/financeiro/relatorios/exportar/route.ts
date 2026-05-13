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
import { NextResponse } from "next/server"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { prismaEnsureConnected, prisma } from "@/lib/prisma"
import { buildFiltroPreset, type PeriodoFiltro } from "@/lib/financeiro/services/relatorios-financeiros-service"

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

  if (tipo === "movimentacoes") {
    const rows = await prisma.movimentacaoFinanceira.findMany({
      where: { storeId, createdAt: range },
      select: { id: true, tipo: true, descricao: true, valor: true, origem: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    })
    return {
      filename: "movimentacoes",
      rows: rows.map((r) => ({
        id: r.id, tipo: r.tipo, descricao: r.descricao,
        valor: r.valor, origem: r.origem ?? "",
        data: r.createdAt.toISOString().slice(0, 10),
      })),
    }
  }

  if (tipo === "receber") {
    const rows = await prisma.contaReceberTitulo.findMany({
      where: { storeId, createdAt: range },
      select: { id: true, localKey: true, cliente: true, descricao: true, valor: true, status: true, vencimento: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    })
    return {
      filename: "contas_receber",
      rows: rows.map((r) => ({
        id: r.id, localKey: r.localKey, cliente: r.cliente ?? "",
        descricao: r.descricao, valor: r.valor, status: r.status,
        vencimento: r.vencimento ?? "", createdAt: r.createdAt.toISOString().slice(0, 10),
      })),
    }
  }

  if (tipo === "pagar") {
    const rows = await prisma.contaPagarTitulo.findMany({
      where: { storeId, createdAt: range },
      select: { id: true, localKey: true, fornecedor: true, descricao: true, valor: true, status: true, vencimento: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    })
    return {
      filename: "contas_pagar",
      rows: rows.map((r) => ({
        id: r.id, localKey: r.localKey ?? "",
        fornecedor: typeof r.fornecedor === "string" ? r.fornecedor : (r.fornecedor ? String((r.fornecedor as { name?: string }).name ?? "") : ""),
        descricao: r.descricao, valor: r.valor, status: r.status,
        vencimento: r.vencimento ?? "", createdAt: r.createdAt.toISOString().slice(0, 10),
      })),
    }
  }

  if (tipo === "conciliacoes") {
    const rows = await prisma.conciliacaoFinanceira.findMany({
      where: { storeId, createdAt: range },
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
    const rows = await prisma.auditoriaFinanceira.findMany({
      where: { storeId, createdAt: range },
      select: { id: true, entidade: true, entidadeId: true, acao: true, usuarioNome: true, ip: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    })
    return {
      filename: "auditoria",
      rows: rows.map((r) => ({
        id: r.id, entidade: r.entidade, entidadeId: r.entidadeId ?? "",
        acao: r.acao, usuarioNome: r.usuarioNome ?? "sistema",
        ip: r.ip ?? "", data: r.createdAt.toISOString().slice(0, 16),
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
      where: { storeId, localKey: { startsWith: "os-faturamento:" }, createdAt: range },
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
        status: r.status,
        vencimento: r.vencimento ?? "",
        criadoEm: r.createdAt.toISOString().slice(0, 10),
      })),
    }
  }

  // fluxo = movimentações simplificadas (padrão fallback)
  const rows = await prisma.movimentacaoFinanceira.findMany({
    where: { storeId, createdAt: range },
    select: { tipo: true, descricao: true, valor: true, origem: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 5000,
  })
  return {
    filename: "fluxo_caixa",
    rows: rows.map((r) => ({
      tipo: r.tipo,
      descricao: r.descricao,
      valor: r.valor,
      origem: r.origem ?? "",
      data: r.createdAt.toISOString().slice(0, 10),
    })),
  }
}

export async function GET(req: Request) {
  await prismaEnsureConnected()
  const storeId = opsLojaIdFromRequest(req) || "loja-1"
  const url = new URL(req.url)

  const tipo = url.searchParams.get("tipo") ?? "movimentacoes"
  const formato = (url.searchParams.get("formato") ?? "csv").toLowerCase()
  const preset = url.searchParams.get("preset")

  let filtro: PeriodoFiltro = preset ? buildFiltroPreset(preset) : {}
  if (url.searchParams.get("dataInicio")) filtro.dataInicio = url.searchParams.get("dataInicio")!
  if (url.searchParams.get("dataFim")) filtro.dataFim = url.searchParams.get("dataFim")!

  try {
    const { rows, filename } = await fetchRows(storeId, tipo, filtro)

    if (formato === "xlsx") {
      const buffer = await toXLSX(rows, filename)
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}_${new Date().toISOString().slice(0, 10)}.xlsx"`,
        },
      })
    }

    // Default: CSV
    const csv = toCSV(rows)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 503 })
  }
}
