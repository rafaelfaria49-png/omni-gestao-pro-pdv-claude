import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import {
  atualizarCarteira,
  recalcularSaldoCarteira,
  TIPOS_CARTEIRA,
} from "@/lib/financeiro/services/carteiras-service"

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

const patchSchema = z.object({
  nome: z.string().min(1).max(80).optional(),
  tipo: z.enum(TIPOS_CARTEIRA).optional(),
  saldoInicial: z.number().min(0).optional(),
  ativo: z.boolean().optional(),
  cor: z.string().optional(),
  icone: z.string().optional(),
  recalcular: z.boolean().optional(),
})

// ─── PATCH /api/financeiro/carteiras/[id] ────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const storeId = getStoreId(req)
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return err("Body inválido.", "INVALID_BODY")
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return err(parsed.error.errors[0]?.message ?? "Dados inválidos.", "VALIDATION_ERROR")
  }

  const { recalcular, ...fields } = parsed.data

  try {
    let carteira = await atualizarCarteira({ id, storeId, ...fields })

    if (recalcular) {
      carteira = await recalcularSaldoCarteira(id, storeId)
    }

    return NextResponse.json({ ok: true, carteira })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("Record to update not found")) {
      return err("Carteira não encontrada.", "NOT_FOUND", 404)
    }
    console.error("[PATCH /api/financeiro/carteiras/[id]]", e)
    return err("Erro ao atualizar carteira.", "INTERNAL_ERROR", 500)
  }
}
