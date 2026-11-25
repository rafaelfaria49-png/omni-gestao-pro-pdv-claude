/**
 * GET /api/ops/trocas/venda?pedidoId= — venda com disponibilidade de devolução calculada
 * no servidor, códigos por item (snapshot × cadastro atual) e histórico de trocas.
 */
import { requireModuleApi } from "@/lib/auth/module-access"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { canAccessStore } from "@/lib/auth/enterprise-permissions"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import { detalheVendaParaTroca } from "@/lib/pdv/trocas/troca-consulta"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const NO_STORE = { "Cache-Control": "no-store, private" }

export async function GET(req: Request) {
  const moduleDenied = await requireModuleApi(req, "sharedPayment")
  if (moduleDenied) return moduleDenied
  const session = await auth()
  const lojaId = opsLojaIdFromRequest(req)
  if (!lojaId) return NextResponse.json({ error: "Unidade obrigatória." }, { status: 400 })
  if (!session?.user || !canAccessStore(session, lojaId)) return NextResponse.json({ error: "Sem acesso à loja" }, { status: 403 })
  const denied = await apiGuardEnterpriseOrOps(
    lojaId,
    (p) => p.pdv.devolucao || p.hubs.vendas,
    "Sem permissão para consultar a venda.",
  )
  if (denied) return denied

  const pedidoId = (new URL(req.url).searchParams.get("pedidoId") ?? "").trim().slice(0, 80)
  if (!pedidoId) return NextResponse.json({ error: "pedidoId obrigatório" }, { status: 400 })
  try {
    const venda = await detalheVendaParaTroca(lojaId, pedidoId)
    if (!venda) return NextResponse.json({ error: "Venda não encontrada nesta loja.", code: "VENDA_NAO_ENCONTRADA" }, { status: 404, headers: NO_STORE })
    return NextResponse.json({ ok: true, venda }, { headers: NO_STORE })
  } catch (e) {
    console.error("[ops/trocas/venda]", e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: "Falha ao carregar a venda." }, { status: 500, headers: NO_STORE })
  }
}
