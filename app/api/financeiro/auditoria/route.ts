/**
 * GET /api/financeiro/auditoria
 *
 * Query params opcionais:
 *   entidade   — movimentacao | receber | pagar | carteira | dre | fechamento | conciliacao
 *   acao       — criar | editar | excluir | liquidar | estornar | fechar | reabrir | conciliar
 *   dataInicial — yyyy-mm-dd
 *   dataFinal   — yyyy-mm-dd
 *   take        — int (max 200)
 *   skip        — int
 */
import { NextResponse } from "next/server"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { prismaEnsureConnected } from "@/lib/prisma"
import {
  listarAuditoriaFinanceira,
  type EntidadeAuditoria,
  type AcaoAuditoria,
} from "@/lib/financeiro/services/auditoria-financeira-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  await prismaEnsureConnected()
  const storeId = opsLojaIdFromRequest(req) || "loja-1"
  const url = new URL(req.url)

  const entidade = (url.searchParams.get("entidade") ?? undefined) as EntidadeAuditoria | undefined
  const acao = (url.searchParams.get("acao") ?? undefined) as AcaoAuditoria | undefined
  const dataInicial = url.searchParams.get("dataInicial") ?? undefined
  const dataFinal = url.searchParams.get("dataFinal") ?? undefined
  const take = parseInt(url.searchParams.get("take") ?? "50", 10)
  const skip = parseInt(url.searchParams.get("skip") ?? "0", 10)

  try {
    const result = await listarAuditoriaFinanceira(storeId, {
      entidade, acao, dataInicial, dataFinal,
      take: Number.isFinite(take) ? take : 50,
      skip: Number.isFinite(skip) ? skip : 0,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 503 })
  }
}
