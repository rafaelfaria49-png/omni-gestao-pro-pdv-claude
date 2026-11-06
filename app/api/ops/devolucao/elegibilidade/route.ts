import { requireModuleApi } from "@/lib/auth/module-access"
import { NextResponse } from "next/server"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { auth } from "@/auth"
import { canAccessStore } from "@/lib/auth/enterprise-permissions"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import { buscarVendasElegiveis } from "@/lib/pdv/devolucao/elegibilidade"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * GET /api/ops/devolucao/elegibilidade?q=<venda | código/SKU/ID do produto | cliente>
 * Últimas vendas da loja com o saldo devolvível por item calculado no servidor.
 */
export async function GET(req: Request) {
  const moduleDenied = await requireModuleApi(req, "sharedPayment")
  if (moduleDenied) return moduleDenied

  // Mesmo padrão da `/api/ops/vendas-list`: loja do header é seleção, a sessão autoriza.
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  const lojaId = opsLojaIdFromRequest(req)
  if (!lojaId) return NextResponse.json({ error: "storeId obrigatório" }, { status: 400 })
  if (!canAccessStore(session, lojaId)) return NextResponse.json({ error: "Sem acesso à loja" }, { status: 403 })
  const denied = await apiGuardEnterpriseOrOps(lojaId, (p) => p.pdv.devolucao, "Sem permissão para devoluções.")
  if (denied) return denied

  const q = new URL(req.url).searchParams.get("q") ?? ""
  if (q.trim().length === 0 || q.length > 120) {
    return NextResponse.json({ error: "Informe a venda, o código do produto ou o cliente." }, { status: 422 })
  }

  try {
    await prismaEnsureConnected()
    const result = await buscarVendasElegiveis(prisma, lojaId, q)
    return NextResponse.json(result)
  } catch (e) {
    console.error("[ops/devolucao/elegibilidade]", e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: "Falha ao consultar vendas" }, { status: 503 })
  }
}
