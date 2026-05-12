import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { transferirEntreCarteiras } from "@/lib/financeiro/services/carteiras-service"

function getStoreId(req: NextRequest): string {
  return (
    req.headers.get("x-assistec-loja-id") ??
    req.nextUrl.searchParams.get("storeId") ??
    "loja-1"
  )
}

function err(msg: string, code: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg, code }, { status })
}

const schema = z.object({
  origemId: z.string().min(1),
  destinoId: z.string().min(1),
  valor: z.number().positive("Valor deve ser maior que zero."),
  descricao: z.string().max(200).optional(),
})

// ─── POST /api/financeiro/carteiras/transferencia ─────────────────────────────

export async function POST(req: NextRequest) {
  const storeId = getStoreId(req)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return err("Body inválido.", "INVALID_BODY")
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return err(parsed.error.errors[0]?.message ?? "Dados inválidos.", "VALIDATION_ERROR")
  }

  const result = await transferirEntreCarteiras({ storeId, ...parsed.data })

  if (!result.ok) {
    return err(result.error ?? "Erro na transferência.", "TRANSFER_ERROR", 422)
  }

  const { ok: _ok, ...rest } = result
  return NextResponse.json({ ok: true, ...rest }, { status: 201 })
}
