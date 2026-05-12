/**
 * PATCH /api/financeiro/conciliacao/[id]
 *
 * Atualiza status/observação de uma conciliação.
 * Permite marcar como divergente ou atualizar observação.
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { prismaEnsureConnected } from "@/lib/prisma"
import { marcarDivergente } from "@/lib/financeiro/services/conciliacao-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const patchSchema = z.object({
  acao: z.enum(["divergente"]),
  observacao: z.string().max(500).optional(),
})

export async function PATCH(
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

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Dados inválidos", code: "validation_error" }, { status: 400 })
  }

  try {
    if (parsed.data.acao === "divergente") {
      const conciliacao = await marcarDivergente(id, storeId, parsed.data.observacao)
      return NextResponse.json({ ok: true, conciliacao })
    }

    return NextResponse.json({ ok: false, error: "Ação não suportada", code: "unsupported_action" }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg, code: "service_error" }, { status: 422 })
  }
}
