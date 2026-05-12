/**
 * GET /api/financeiro/relatorios/indicadores
 *
 * Retorna indicadores executivos + comparativos mensais e anuais.
 */
import { NextResponse } from "next/server"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { prismaEnsureConnected } from "@/lib/prisma"
import {
  getIndicadoresExecutivos,
  getComparativoMensal,
  getComparativoAnual,
  buildFiltroPreset,
  type PeriodoFiltro,
} from "@/lib/financeiro/services/relatorios-financeiros-service"

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

  const meses = parseInt(url.searchParams.get("meses") ?? "12", 10)

  try {
    const [indicadores, comparativoMensal, comparativoAnual] = await Promise.all([
      getIndicadoresExecutivos(storeId, filtro),
      getComparativoMensal(storeId, Math.min(meses, 24)),
      getComparativoAnual(storeId, 3),
    ])
    return NextResponse.json({ ok: true, indicadores, comparativoMensal, comparativoAnual })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 503 })
  }
}
