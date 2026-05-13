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
import { NextResponse } from "next/server"
import { prismaEnsureConnected, withPrismaSafe } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { apiGuardFinanceiroViewOrOps } from "@/lib/auth/api-enterprise-guard"
import { getFluxoCaixaResumo } from "@/lib/financeiro/services/fluxo-caixa-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function err(error: string, code: string, status = 400) {
  return NextResponse.json({ ok: false, error, code }, { status })
}

export async function GET(req: Request) {
  const storeId = opsLojaIdFromRequest(req) || "loja-1"
  const denied = await apiGuardFinanceiroViewOrOps(storeId)
  if (denied) return denied

  try {
    await prismaEnsureConnected()

    const resumo = await withPrismaSafe(
      () => getFluxoCaixaResumo(storeId),
      null,
    )

    if (!resumo) {
      return err("Não foi possível calcular fluxo de caixa", "db_error", 503)
    }

    return NextResponse.json({ ok: true, ...resumo })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha interna"
    console.error("[financeiro/fluxo-caixa GET]", msg)
    return err(msg, "db_error", 503)
  }
}
