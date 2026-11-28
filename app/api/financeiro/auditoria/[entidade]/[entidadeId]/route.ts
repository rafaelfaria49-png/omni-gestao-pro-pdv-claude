import { requireModuleApi } from "@/lib/auth/module-access"
/**
 * GET /api/financeiro/auditoria/[entidade]/[entidadeId]
 *
 * Retorna o histórico de auditoria de uma entidade específica.
 */
import { apiGuardLeituraFinanceira, respostaFinanceiraPrivada } from "@/lib/gastos/read-scope"
import { NextResponse } from "next/server"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { prismaEnsureConnected } from "@/lib/prisma"
import {
  getAuditoriaPorEntidade,
  type EntidadeAuditoria,
} from "@/lib/financeiro/services/auditoria-financeira-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const ENTIDADES_VALIDAS: EntidadeAuditoria[] = [
  "movimentacao", "receber", "pagar", "carteira", "dre", "fechamento", "conciliacao",
]

export async function GET(
  req: Request,
  { params }: { params: Promise<{ entidade: string; entidadeId: string }> },
) {
  // Reconciliação main × G003: módulo finance por loja (main) + guard de leitura privada (G003).
  const moduleDenied = await requireModuleApi(req, "finance")
  if (moduleDenied) return respostaFinanceiraPrivada(moduleDenied)
  const { entidade, entidadeId } = await params
  const storeId = opsLojaIdFromRequest(req)
  if (!storeId) return respostaFinanceiraPrivada(NextResponse.json({ error: "storeId obrigatório" }, { status: 400 }))
  const denied = await apiGuardLeituraFinanceira(storeId, (p) => p.auditoria, req)
  if (denied) return respostaFinanceiraPrivada(denied)

  if (!ENTIDADES_VALIDAS.includes(entidade as EntidadeAuditoria)) {
    return respostaFinanceiraPrivada(NextResponse.json({ ok: false, error: "Entidade inválida", code: "invalid_entidade" }, { status: 400 }))
  }

  try {
    await prismaEnsureConnected()
    const items = await getAuditoriaPorEntidade(storeId, entidade as EntidadeAuditoria, entidadeId)
    return respostaFinanceiraPrivada(NextResponse.json({ ok: true, items, total: items.length }))
  } catch {
    return respostaFinanceiraPrivada(NextResponse.json({ ok: false, error: "Não foi possível consultar os dados financeiros." }, { status: 503 }))
  }
}
