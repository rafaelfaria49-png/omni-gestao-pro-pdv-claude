import { gestorMoneyAtivo } from "@/lib/gastos/ativacao"
import { GET as getLegadoMain } from "@/lib/financeiro/legado-main/rotas/indicadores"
import { requireModuleApi } from "@/lib/auth/module-access"
import { erroConsultaFinanceira } from "@/lib/gastos/query"
/**
 * GET /api/financeiro/relatorios/indicadores
 *
 * Retorna indicadores executivos + comparativos mensais e anuais.
 */
import { apiGuardLeituraFinanceira, respostaFinanceiraPrivada } from "@/lib/gastos/read-scope"
import { NextResponse } from "next/server"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { prismaEnsureConnected } from "@/lib/prisma"
import { consultarFinanceiroEmpresa } from "@/lib/gastos/query"
import { apuracaoConsulta, projetarIndicadoresConsulta, projetarComparativoMensalConsulta, projetarComparativoAnualConsulta, buildFiltroPreset, type PeriodoFiltro } from "@/lib/financeiro/services/relatorios-financeiros-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  // Ativação controlada: desligado, a rota é a da main (consulta limitada ao período, tolerante ao legado).
  if (!gestorMoneyAtivo()) return respostaFinanceiraPrivada(await getLegadoMain(req as never))
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

  const meses = parseInt(url.searchParams.get("meses") ?? "12", 10)

    await prismaEnsureConnected()
    const q=await consultarFinanceiroEmpresa(storeId,filtro)
    const indicadores=projetarIndicadoresConsulta(q),comparativoMensal=projetarComparativoMensalConsulta(q,Math.min(meses,24)),comparativoAnual=projetarComparativoAnualConsulta(q,3)
    return respostaFinanceiraPrivada(NextResponse.json({ok:true,indicadores,comparativoMensal,comparativoAnual,apuracao:apuracaoConsulta(q)}))
  } catch (e) {
    const erro=erroConsultaFinanceira(e)
    return respostaFinanceiraPrivada(NextResponse.json(erro.body,{status:erro.status}))
  }
}
