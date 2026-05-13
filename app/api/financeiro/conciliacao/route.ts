/**
 * /api/financeiro/conciliacao
 *
 * GET  → lista conciliações (filtro opcional: status=conciliado|divergente|pendente)
 * POST → cria conciliação para uma carteira
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import { prismaEnsureConnected } from "@/lib/prisma"
import {
  listarConciliacoes,
  criarConciliacao,
  getResumoConciliacao,
  type StatusConciliacao,
} from "@/lib/financeiro/services/conciliacao-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function err(msg: string, code: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg, code }, { status })
}

const postSchema = z.object({
  carteiraId: z.string().min(1, "carteiraId obrigatório"),
  saldoInformado: z.number({ required_error: "saldoInformado obrigatório" }),
  dataReferencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  observacao: z.string().max(500).optional(),
  conciliadoPor: z.string().max(100).optional(),
})

export async function GET(req: Request) {
  await prismaEnsureConnected()
  const storeId = opsLojaIdFromRequest(req) || "loja-1"
  const denied = await apiGuardEnterpriseOrOps(
    storeId,
    (p) => p.financeiro.conciliacao,
    "Sem permissão para conciliação financeira.",
    { errorBody: "okFalse" },
  )
  if (denied) return denied
  const url = new URL(req.url)
  const status = (url.searchParams.get("status") ?? undefined) as StatusConciliacao | undefined
  const resumo = url.searchParams.get("resumo") === "1"

  try {
    if (resumo) {
      const res = await getResumoConciliacao(storeId)
      return NextResponse.json({ ok: true, resumo: res })
    }

    const items = await listarConciliacoes(storeId, status)
    return NextResponse.json({ ok: true, items, total: items.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 503 })
  }
}

export async function POST(req: Request) {
  await prismaEnsureConnected()
  const storeId = opsLojaIdFromRequest(req) || "loja-1"
  const denied = await apiGuardEnterpriseOrOps(
    storeId,
    (p) => p.financeiro.conciliacao,
    "Sem permissão para conciliação financeira.",
    { errorBody: "okFalse" },
  )
  if (denied) return denied

  let body: unknown
  try { body = await req.json() } catch { return err("Body inválido", "invalid_body") }

  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.errors[0]?.message ?? "Dados inválidos", "validation_error")

  try {
    const conciliacao = await criarConciliacao({ storeId, ...parsed.data })
    return NextResponse.json({ ok: true, conciliacao }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg, code: "service_error" }, { status: 422 })
  }
}
