import { requireModuleApi } from "@/lib/auth/module-access"
/**
 * /api/financeiro/fluxo-caixa
 *
 * GET → resumo operacional de caixa em tempo real.
 *
 * Retorna:
 *  - saldoAtual (MovimentacaoFinanceira)
 *  - entradas/saídas hoje e do mês
 *  - receber/pagar aberto, vencido, próximos 7 dias
 *  - fluxo diário dos últimos 30 dias
 *  - alertas financeiros
 */
import { apiGuardLeituraFinanceira, respostaFinanceiraPrivada } from "@/lib/gastos/read-scope"
import { NextResponse } from "next/server"
import { prismaEnsureConnected, withPrismaSafe } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { getFluxoCaixaResumo } from "@/lib/financeiro/services/fluxo-caixa-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function err(error: string, code: string, status = 400) {
  return NextResponse.json({ ok: false, error, code }, { status })
}

export async function GET(req: Request) {
  const moduleDenied = await requireModuleApi(req, "finance")
  if (moduleDenied) return moduleDenied

  const storeId = opsLojaIdFromRequest(req)
  if (!storeId) return respostaFinanceiraPrivada(NextResponse.json({ error: "storeId obrigatório" }, { status: 400 }))
  const denied = await apiGuardLeituraFinanceira(storeId, undefined, req)
  if (denied) return respostaFinanceiraPrivada(denied)

  try {
    await prismaEnsureConnected()

    const resumo = await withPrismaSafe(
      () => getFluxoCaixaResumo(storeId),
      null,
    )

    if (!resumo) {
      return respostaFinanceiraPrivada(err("Não foi possível calcular fluxo de caixa", "db_error", 503))
    }

    return respostaFinanceiraPrivada(NextResponse.json({ ok: true, ...resumo }))
  } catch {
    return respostaFinanceiraPrivada(NextResponse.json({ ok: false, error: "Não foi possível consultar os dados financeiros." }, { status: 503 }))
  }
}
