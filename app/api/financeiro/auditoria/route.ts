import { requireModuleApi } from "@/lib/auth/module-access"
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
import { apiGuardLeituraFinanceira, respostaFinanceiraPrivada } from "@/lib/gastos/read-scope"
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
  // Reconciliação main × G003: módulo finance por loja (main) + guard de leitura privada (G003).
  const moduleDenied = await requireModuleApi(req, "finance")
  if (moduleDenied) return respostaFinanceiraPrivada(moduleDenied)
  const storeId = opsLojaIdFromRequest(req)
  if (!storeId) return respostaFinanceiraPrivada(NextResponse.json({ error: "storeId obrigatório" }, { status: 400 }))
  const denied = await apiGuardLeituraFinanceira(storeId, (p) => p.auditoria, req)
  if (denied) return respostaFinanceiraPrivada(denied)
  const url = new URL(req.url)

  const entidade = (url.searchParams.get("entidade") ?? undefined) as EntidadeAuditoria | undefined
  const acao = (url.searchParams.get("acao") ?? undefined) as AcaoAuditoria | undefined
  const dataInicial = url.searchParams.get("dataInicial") ?? undefined
  const dataFinal = url.searchParams.get("dataFinal") ?? undefined
  const take = parseInt(url.searchParams.get("take") ?? "50", 10)
  const skip = parseInt(url.searchParams.get("skip") ?? "0", 10)

  try {
    await prismaEnsureConnected()
    const result = await listarAuditoriaFinanceira(storeId, {
      entidade, acao, dataInicial, dataFinal,
      take: Number.isFinite(take) ? take : 50,
      skip: Number.isFinite(skip) ? skip : 0,
    })
    return respostaFinanceiraPrivada(NextResponse.json({ ok: true, ...result }))
  } catch {
    return respostaFinanceiraPrivada(NextResponse.json({ ok: false, error: "Não foi possível consultar os dados financeiros." }, { status: 503 }))
  }
}
