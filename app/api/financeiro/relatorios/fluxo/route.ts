/**
 * GET /api/financeiro/relatorios/fluxo
 *
 * Retorna fluxo de caixa agrupado por dia/semana/mês.
 *
 * Query params:
 *   dataInicio    — yyyy-mm-dd
 *   dataFim       — yyyy-mm-dd
 *   preset        — hoje | 7dias | 30dias | estemes | mespassado
 *   agrupamento   — dia | semana | mes (padrão: dia)
 *   carteiraId    — filtrar por carteira
 */
import { NextResponse } from "next/server"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { apiGuardFinanceiroViewOrOps } from "@/lib/auth/api-enterprise-guard"
import { prismaEnsureConnected } from "@/lib/prisma"
import { getFluxoPorPeriodo, buildFiltroPreset, type PeriodoFiltro } from "@/lib/financeiro/services/relatorios-financeiros-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  await prismaEnsureConnected()
  const storeId = opsLojaIdFromRequest(req) || "loja-1"
  const denied = await apiGuardFinanceiroViewOrOps(storeId)
  if (denied) return denied
  const url = new URL(req.url)

  const preset = url.searchParams.get("preset")
  let filtro: PeriodoFiltro = preset ? buildFiltroPreset(preset) : {}
  if (url.searchParams.get("dataInicio")) filtro.dataInicio = url.searchParams.get("dataInicio")!
  if (url.searchParams.get("dataFim")) filtro.dataFim = url.searchParams.get("dataFim")!
  if (url.searchParams.get("carteiraId")) filtro.carteiraId = url.searchParams.get("carteiraId")!

  const agrupamento = (url.searchParams.get("agrupamento") ?? "dia") as "dia" | "semana" | "mes"

  try {
    const fluxo = await getFluxoPorPeriodo(storeId, filtro, agrupamento)
    return NextResponse.json({ ok: true, fluxo, total: fluxo.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 503 })
  }
}
