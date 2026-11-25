import { requireModuleApi } from "@/lib/auth/module-access"
/**
 * GET /api/financeiro/relatorios/indicadores
 *
 * Retorna indicadores executivos + comparativos mensais e anuais.
 */
import { apiGuardLeituraFinanceira, respostaFinanceiraPrivada } from "@/lib/gastos/read-scope"
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
  // Reconciliação main × G003: módulo finance por loja (main) + guard de leitura privada (G003).
  const moduleDenied = await requireModuleApi(req, "finance")
  if (moduleDenied) return respostaFinanceiraPrivada(moduleDenied)
  const storeId = opsLojaIdFromRequest(req)
  if (!storeId) return respostaFinanceiraPrivada(NextResponse.json({ error: "storeId obrigatório" }, { status: 400 }))
  const denied = await apiGuardLeituraFinanceira(storeId, undefined, req)
  if (denied) return respostaFinanceiraPrivada(denied)
  const url = new URL(req.url)

  const preset = url.searchParams.get("preset")
  let filtro: PeriodoFiltro = preset ? buildFiltroPreset(preset) : {}
  if (url.searchParams.get("dataInicio")) filtro.dataInicio = url.searchParams.get("dataInicio")!
  if (url.searchParams.get("dataFim")) filtro.dataFim = url.searchParams.get("dataFim")!

  const meses = parseInt(url.searchParams.get("meses") ?? "12", 10)

  try {
    await prismaEnsureConnected()
    const [indicadores, comparativoMensal, comparativoAnual] = await Promise.all([
      getIndicadoresExecutivos(storeId, filtro),
      getComparativoMensal(storeId, Math.min(meses, 24)),
      getComparativoAnual(storeId, 3),
    ])
    return respostaFinanceiraPrivada(NextResponse.json({ ok: true, indicadores, comparativoMensal, comparativoAnual }))
  } catch {
    return respostaFinanceiraPrivada(NextResponse.json({ ok: false, error: "Não foi possível consultar os dados financeiros." }, { status: 503 }))
  }
}
