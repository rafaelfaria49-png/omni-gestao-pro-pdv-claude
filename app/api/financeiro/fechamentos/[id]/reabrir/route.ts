/**
 * POST /api/financeiro/fechamentos/[id]/reabrir
 *
 * Body:
 *   motivo     — string obrigatório
 *   reabertoPor? — nome do usuário
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { prismaEnsureConnected } from "@/lib/prisma"
import { reabrirFechamento } from "@/lib/financeiro/services/fechamento-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const schema = z.object({
  motivo: z.string().min(5, "Motivo deve ter pelo menos 5 caracteres").max(500),
  reabertoPor: z.string().max(100).optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await prismaEnsureConnected()
  const { id } = await params
  const storeId = opsLojaIdFromRequest(req) || "loja-1"

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "Body inválido", code: "invalid_body" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.errors[0]?.message ?? "Dados inválidos", code: "validation_error" }, { status: 400 })
  }

  try {
    const fechamento = await reabrirFechamento(id, storeId, parsed.data.motivo, parsed.data.reabertoPor)
    return NextResponse.json({ ok: true, fechamento })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg, code: "service_error" }, { status: 422 })
  }
}
