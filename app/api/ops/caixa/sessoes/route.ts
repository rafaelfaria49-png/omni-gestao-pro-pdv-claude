import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOpsSubscription, opsLojaIdFromRequest } from "@/lib/ops-api-gate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const gate = await requireOpsSubscription()
  if (!gate.ok) return gate.res

  const lojaId = opsLojaIdFromRequest(req)
  if (!lojaId) {
    return NextResponse.json(
      { error: "Unidade obrigatória: envie o header x-assistec-loja-id." },
      { status: 400 }
    )
  }

  const url = new URL(req.url)
  const status = url.searchParams.get("status") ?? undefined
  const take = Math.min(parseInt(url.searchParams.get("take") ?? "50", 10), 200)

  try {
    const sessoes = await prisma.sessaoCaixa.findMany({
      where: {
        storeId: lojaId,
        ...(status === "ABERTA" || status === "FECHADA" ? { status } : {}),
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
