import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  listarCarteiras,
  criarCarteira,
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

// ─── GET /api/financeiro/carteiras ───────────────────────────────────────────

export async function GET(req: NextRequest) {
  const storeId = getStoreId(req)
  const apenasAtivas = req.nextUrl.searchParams.get("ativas") === "1"

  try {
    const carteiras = await listarCarteiras(storeId, apenasAtivas)
    const saldoTotal = carteiras
      .filter((c) => c.ativo)
      .reduce((acc, c) => acc + c.saldoAtual, 0)

    return NextResponse.json({ ok: true, carteiras, saldoTotal })
  } catch (e) {
    console.error("[GET /api/financeiro/carteiras]", e)
    return err("Erro ao listar carteiras.", "INTERNAL_ERROR", 500)
  }
}

// ─── POST /api/financeiro/carteiras ──────────────────────────────────────────

const postSchema = z.object({
  nome: z.string().min(1).max(80),
  tipo: z.enum(TIPOS_CARTEIRA).optional().default("caixa"),
  saldoInicial: z.number().min(0).optional().default(0),
  cor: z.string().optional(),
  icone: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const storeId = getStoreId(req)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return err("Body inválido.", "INVALID_BODY")
  }

  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return err(parsed.error.errors[0]?.message ?? "Dados inválidos.", "VALIDATION_ERROR")
  }

  const duplicada = await prisma.carteiraFinanceira.findFirst({
    where: { storeId, nome: parsed.data.nome.trim() },
  })
  if (duplicada) {
    return err(`Já existe uma carteira com o nome "${parsed.data.nome}".`, "DUPLICATE_NAME", 409)
  }

  try {
    const carteira = await criarCarteira({ storeId, ...parsed.data })
    return NextResponse.json({ ok: true, carteira }, { status: 201 })
  } catch (e) {
    console.error("[POST /api/financeiro/carteiras]", e)
    return err("Erro ao criar carteira.", "INTERNAL_ERROR", 500)
  }
}
