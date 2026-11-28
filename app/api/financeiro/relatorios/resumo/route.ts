import { requireModuleApi } from "@/lib/auth/module-access"
import { erroConsultaFinanceira } from "@/lib/gastos/query"
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
import { apiGuardLeituraFinanceira, respostaFinanceiraPrivada } from "@/lib/gastos/read-scope"
import { NextResponse } from "next/server"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { prismaEnsureConnected } from "@/lib/prisma"
import { getResumoExecutivo, buildFiltroPreset, type PeriodoFiltro } from "@/lib/financeiro/services/relatorios-financeiros-service"

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
  try {
  let filtro: PeriodoFiltro = preset ? buildFiltroPreset(preset) : {}
  if (url.searchParams.get("dataInicio")) filtro.dataInicio = url.searchParams.get("dataInicio")!
  if (url.searchParams.get("dataFim")) filtro.dataFim = url.searchParams.get("dataFim")!
  if (url.searchParams.get("carteiraId")) filtro.carteiraId = url.searchParams.get("carteiraId")!

    await prismaEnsureConnected()
    const resumo = await getResumoExecutivo(storeId, filtro)
    return respostaFinanceiraPrivada(NextResponse.json({ ok: true, ...resumo }))
  } catch (e) {
    const erro=erroConsultaFinanceira(e)
    return respostaFinanceiraPrivada(NextResponse.json(erro.body,{status:erro.status}))
  }
}
