/**
 * GET /api/financeiro/relatorios/resumo
 *
 * Retorna resumo executivo com indicadores, top receitas/despesas, categorias.
 *
 * Query params:
 *   dataInicio   — yyyy-mm-dd
 *   dataFim      — yyyy-mm-dd
 *   preset       — hoje | ontem | 7dias | 30dias | estemes | mespassado
 *   carteiraId   — filtrar por carteira
 */
import { NextResponse } from "next/server"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { prismaEnsureConnected } from "@/lib/prisma"
import { getResumoExecutivo, buildFiltroPreset, type PeriodoFiltro } from "@/lib/financeiro/services/relatorios-financeiros-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  await prismaEnsureConnected()
  const storeId = opsLojaIdFromRequest(req) || "loja-1"
  const url = new URL(req.url)

  const preset = url.searchParams.get("preset")
  let filtro: PeriodoFiltro = preset ? buildFiltroPreset(preset) : {}
  if (url.searchParams.get("dataInicio")) filtro.dataInicio = url.searchParams.get("dataInicio")!
  if (url.searchParams.get("dataFim")) filtro.dataFim = url.searchParams.get("dataFim")!
  if (url.searchParams.get("carteiraId")) filtro.carteiraId = url.searchParams.get("carteiraId")!

  try {
    const resumo = await getResumoExecutivo(storeId, filtro)
    return NextResponse.json({ ok: true, ...resumo })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 503 })
  }
}
