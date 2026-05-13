/**
 * GET /api/financeiro/relatorios/rankings
 *
 * Retorna top receitas, top despesas e análise de carteiras.
 *
 * Query params:
 *   dataInicio, dataFim, preset, carteiraId, take (padrão 10)
 */
import { NextResponse } from "next/server"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { apiGuardFinanceiroViewOrOps } from "@/lib/auth/api-enterprise-guard"
import { prismaEnsureConnected } from "@/lib/prisma"
import {
  getTopReceitas,
  getTopDespesas,
  getAnaliseCarteiras,
  buildFiltroPreset,
  type PeriodoFiltro,
} from "@/lib/financeiro/services/relatorios-financeiros-service"

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
  const take = parseInt(url.searchParams.get("take") ?? "10", 10)

  try {
    const [topReceitas, topDespesas, carteiras] = await Promise.all([
      getTopReceitas(storeId, filtro, take),
      getTopDespesas(storeId, filtro, take),
      getAnaliseCarteiras(storeId, filtro),
    ])
    return NextResponse.json({ ok: true, topReceitas, topDespesas, carteiras })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 503 })
  }
}
