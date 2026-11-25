/**
 * GET /api/ops/trocas/buscar?q=&dias=&take=&skip= — busca de vendas para troca/devolução
 * no PostgreSQL (vendas persistidas da loja), paginada e por período.
 */
import { requireModuleApi } from "@/lib/auth/module-access"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { canAccessStore } from "@/lib/auth/enterprise-permissions"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import { buscarVendasParaTroca } from "@/lib/pdv/trocas/troca-consulta"

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
    "Sem permissão para consultar vendas para troca.",
  )
  if (denied) return denied

  const url = new URL(req.url)
  const q = (url.searchParams.get("q") ?? "").slice(0, 120)
  const diasRaw = Number(url.searchParams.get("dias") ?? "90")
  const dias = [0, 7, 30, 90, 180, 365].includes(diasRaw) ? diasRaw : 90
  try {
    const r = await buscarVendasParaTroca({
      storeId: lojaId,
      q,
      dias,
      take: Number(url.searchParams.get("take") ?? "10"),
      skip: Number(url.searchParams.get("skip") ?? "0"),
    })
    return NextResponse.json({ ok: true, ...r }, { headers: NO_STORE })
  } catch (e) {
    console.error("[ops/trocas/buscar]", e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: "Falha na busca de vendas." }, { status: 500, headers: NO_STORE })
  }
}
