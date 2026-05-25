import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const lojaId = opsLojaIdFromRequest(req)
  if (!lojaId) {
    return NextResponse.json(
      { error: "Unidade obrigatória: envie o header x-assistec-loja-id." },
      { status: 400 }
    )
  }

  const denied = await apiGuardEnterpriseOrOps(
    lojaId,
    (p) => p.hubs.caixaHistorico,
    "Sem permissão para consultar o histórico de caixa.",
  )
  if (denied) return denied

  const url = new URL(req.url)
  const status = url.searchParams.get("status") ?? undefined
  const take = Math.min(parseInt(url.searchParams.get("take") ?? "50", 10), 200)
  // Filtro por terminal: id, "sem" (sessões sem terminal) ou ausente.
  const terminalIdParam = url.searchParams.get("terminalId")?.trim() ?? ""
  const terminalWhere =
    terminalIdParam === "sem"
      ? { terminalId: null as string | null }
      : terminalIdParam
        ? { terminalId: terminalIdParam }
        : {}

  try {
    const sessoes = await prisma.sessaoCaixa.findMany({
      where: {
        storeId: lojaId,
        ...(status === "ABERTA" || status === "FECHADA" ? { status } : {}),
        ...terminalWhere,
      },
      orderBy: { abertaEm: "desc" },
      take,
      select: {
        id: true,
        storeId: true,
        operador: true,
        saldoInicial: true,
        saldoFinal: true,
        saldoContado: true,
        observacao: true,
        status: true,
        abertaEm: true,
        fechadaEm: true,
        terminalId: true,
        _count: { select: { operacoes: true } },
      },
    })

    return NextResponse.json({ ok: true, sessoes })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ops/caixa/sessoes]", msg)
    return NextResponse.json({ error: "Falha ao listar sessões de caixa" }, { status: 500 })
  }
}
