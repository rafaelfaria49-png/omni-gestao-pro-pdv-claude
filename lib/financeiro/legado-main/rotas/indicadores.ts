// LEGADO-MAIN (cópia fiel de origin/main 2b0239d: app/api/financeiro/relatorios/indicadores/route.ts).
// Ativação controlada do Gestor Money: com GESTOR_MONEY_ENABLED desligado, relatórios/KPIs/exportações
// usam esta implementação da main (consultas limitadas ao período, tolerante a registros legados).
// Com o Gestor Money ligado, a autoridade é lib/gastos/query.ts (G005). Não editar aqui sem espelhar a main.

import { requireModuleApi } from "@/lib/auth/module-access"
/**
 * GET /api/financeiro/relatorios/indicadores
 *
 * Retorna indicadores executivos + comparativos mensais e anuais.
 */
import { NextResponse } from "next/server"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { apiGuardFinanceiroViewOrOps } from "@/lib/auth/api-enterprise-guard"
import { prismaEnsureConnected } from "@/lib/prisma"
import {
  getIndicadoresExecutivos,
  getComparativoMensal,
  getComparativoAnual,
  buildFiltroPreset,
  type PeriodoFiltro,
} from "@/lib/financeiro/legado-main/relatorios-financeiros"





export async function GET(req: Request) {
  const moduleDenied = await requireModuleApi(req, "finance")
  if (moduleDenied) return moduleDenied

  await prismaEnsureConnected()
  const storeId = opsLojaIdFromRequest(req)
  if (!storeId) return NextResponse.json({ error: "storeId obrigatório" }, { status: 400 })
  const denied = await apiGuardFinanceiroViewOrOps(storeId)
  if (denied) return denied
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
