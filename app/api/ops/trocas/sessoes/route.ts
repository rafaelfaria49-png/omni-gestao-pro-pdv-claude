/**
 * GET /api/ops/trocas/sessoes?dia=AAAA-MM-DD — sessões de caixa FECHADAS da loja que
 * cobrem o dia (fuso America/Sao_Paulo), para a regularização de troca já realizada
 * escolher a sessão que recebeu o dinheiro na época. Somente leitura.
 */
import { requireModuleApi } from "@/lib/auth/module-access"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { canAccessStore } from "@/lib/auth/enterprise-permissions"
import { prisma } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"

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
    (p) => p.pdv.devolucao && p.pdv.cancelarVenda,
    "Sem permissão para regularizar trocas.",
  )
  if (denied) return denied

  const dia = (new URL(req.url).searchParams.get("dia") ?? "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return NextResponse.json({ error: "dia inválido (AAAA-MM-DD)." }, { status: 400 })
  const inicio = new Date(`${dia}T00:00:00-03:00`)
  const fim = new Date(`${dia}T23:59:59.999-03:00`)
  const sessoes = await prisma.sessaoCaixa.findMany({
    where: { storeId: lojaId, status: "FECHADA", abertaEm: { lte: fim }, fechadaEm: { gte: inicio } },
    select: { id: true, abertaEm: true, fechadaEm: true, operador: true, terminalId: true },
    orderBy: { abertaEm: "asc" },
    take: 50,
  })
  return NextResponse.json({ ok: true, sessoes }, { headers: NO_STORE })
}
