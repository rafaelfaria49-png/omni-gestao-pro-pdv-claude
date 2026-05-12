/**
 * GET /api/financeiro/auditoria/[entidade]/[entidadeId]
 *
 * Retorna o histórico de auditoria de uma entidade específica.
 */
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
  await prismaEnsureConnected()
  const { entidade, entidadeId } = await params
  const storeId = opsLojaIdFromRequest(req) || "loja-1"

  if (!ENTIDADES_VALIDAS.includes(entidade as EntidadeAuditoria)) {
    return NextResponse.json({ ok: false, error: "Entidade inválida", code: "invalid_entidade" }, { status: 400 })
  }

  try {
    const items = await getAuditoriaPorEntidade(storeId, entidade as EntidadeAuditoria, entidadeId)
    return NextResponse.json({ ok: true, items, total: items.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 503 })
  }
}
