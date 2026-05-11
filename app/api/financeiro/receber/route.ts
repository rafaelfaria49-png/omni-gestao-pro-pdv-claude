import { NextResponse } from "next/server"
import { z } from "zod"
import { prismaEnsureConnected, prisma } from "@/lib/prisma"
import { requireOpsSubscription, opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { requireAdmin } from "@/lib/require-admin"
import {
  buildContaReceberAuditTrail,
  buildContaReceberSummary,
  liquidarContaReceber,
  registrarPagamentoParcial,
  estornarContaReceber,
  upsertContaReceber,
} from "@/lib/financeiro/services"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const postSchema = z.object({
  lojaId: z.string().min(1).max(120).optional(),
  descricao: z.string().min(1).max(240),
  cliente: z.string().min(1).max(240),
  valor: z.number().finite().nonnegative(),
  vencimento: z.string().min(1).max(32),
})

const patchSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("liquidar"), lojaId: z.string().min(1).max(120).optional(), localKey: z.string().min(1).max(260), observacao: z.string().max(2000).optional() }),
  z.object({ op: z.literal("parcial"), lojaId: z.string().min(1).max(120).optional(), localKey: z.string().min(1).max(260), valor: z.number().finite().positive(), observacao: z.string().max(2000).optional() }),
  z.object({ op: z.literal("estornar"), lojaId: z.string().min(1).max(120).optional(), localKey: z.string().min(1).max(260), modo: z.enum(["titulo_completo", "ultimo_pagamento"]), motivo: z.string().max(2000).optional() }),
])

function parseHistorico(payload: unknown): { at?: string; tipo?: string; userLabel?: string; valor?: number; observacao?: string }[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return []
  const hist = (payload as Record<string, unknown>).historico
  if (!Array.isArray(hist)) return []
  return hist.filter((e) => e && typeof e === "object") as { at?: string; tipo?: string; userLabel?: string; valor?: number; observacao?: string }[]
}

export async function GET(req: Request) {
  const gate = await requireOpsSubscription()
  if (!gate.ok) {
    const dev = process.env.NODE_ENV === "development"
    if (!dev) return gate.res
  }

  const storeId = opsLojaIdFromRequest(req)
  const url = new URL(req.url)
  const localKeyParam = url.searchParams.get("localKey")?.trim()

  try {
    await prismaEnsureConnected()

    // Detalhe de um título específico (para HistoricoModal)
    if (localKeyParam) {
      const titulo = await prisma.contaReceberTitulo.findUnique({
        where: { storeId_localKey: { storeId, localKey: localKeyParam } },
      })
      if (!titulo) return NextResponse.json({ ok: false, error: "Não encontrado" }, { status: 404 })
      return NextResponse.json({
        ok: true,
        titulo: {
          id: titulo.id,
          localKey: titulo.localKey,
          descricao: titulo.descricao,
          cliente: titulo.cliente,
          valor: titulo.valor,
          vencimento: titulo.vencimento,
          status: titulo.status,
          historico: parseHistorico(titulo.payload),
        },
      })
    }

    const titulos = await prisma.contaReceberTitulo.findMany({
      where: { storeId },
      orderBy: { updatedAt: "desc" },
    })

    const rows = titulos.map((t) => ({
      id: (t.localKey?.trim() || t.id) as string,
      descricao: t.descricao,
      cliente: t.cliente,
      valor: t.valor,
      vencimento: t.vencimento,
      status: t.status,
    }))

    return NextResponse.json({
      ok: true,
      rows,
      summary: buildContaReceberSummary(titulos),
      audit: buildContaReceberAuditTrail(titulos),
      metadata: { source: "server", storeId, generatedAt: new Date().toISOString() },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[financeiro/receber]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 503 })
  }
}

export async function POST(req: Request) {
  const adminGate = await requireAdmin()
  if (!adminGate.ok) return adminGate.res

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }
  const parsed = postSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Dados inválidos", issues: parsed.error.flatten() }, { status: 400 })
  }

  const storeId = storeIdFromAssistecRequestForWrite(req)
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "Unidade obrigatória (x-assistec-loja-id)." }, { status: 400 })
  }
  if (parsed.data.lojaId && parsed.data.lojaId !== storeId) {
    return NextResponse.json({ ok: false, error: "Unidade inconsistente (body vs header)." }, { status: 400 })
  }

  const uuid = crypto.randomUUID()
  const localKey = `receber:manual:${storeId}:${uuid}`

  const titulo = await upsertContaReceber({
    storeId,
    localKey,
    descricao: parsed.data.descricao,
    cliente: parsed.data.cliente,
    valor: parsed.data.valor,
    vencimento: parsed.data.vencimento,
    status: "pendente",
    payloadPatch: {
      origem: "manual",
      referencia: `CR manual ${uuid}`,
      createdFrom: "financeiro_hub",
    },
  })

  return NextResponse.json({ ok: true, id: titulo.id, localKey })
}

export async function PATCH(req: Request) {
  const adminGate = await requireAdmin()
  if (!adminGate.ok) return adminGate.res

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Dados inválidos", issues: parsed.error.flatten() }, { status: 400 })
  }

  const storeId = storeIdFromAssistecRequestForWrite(req)
  if (!storeId) return NextResponse.json({ ok: false, error: "Unidade obrigatória (x-assistec-loja-id)." }, { status: 400 })
  if (parsed.data.lojaId && parsed.data.lojaId !== storeId) {
    return NextResponse.json({ ok: false, error: "Unidade inconsistente (body vs header)." }, { status: 400 })
  }

  if (parsed.data.op === "liquidar") {
    const res = await liquidarContaReceber({ storeId, localKey: parsed.data.localKey, observacao: parsed.data.observacao, userLabel: "financeiro_hub" })
    if (!res.ok) return NextResponse.json({ ok: false, error: res.reason }, { status: 400 })
    return NextResponse.json({ ok: true })
  }
  if (parsed.data.op === "parcial") {
    const res = await registrarPagamentoParcial({ storeId, localKey: parsed.data.localKey, valorPago: parsed.data.valor, observacao: parsed.data.observacao, userLabel: "financeiro_hub" })
    if (!res.ok) return NextResponse.json({ ok: false, error: res.reason }, { status: 400 })
    return NextResponse.json({ ok: true })
  }
  const res = await estornarContaReceber({ storeId, localKey: parsed.data.localKey, modo: parsed.data.modo, motivo: parsed.data.motivo, userLabel: "financeiro_hub" })
  if (!res.ok) return NextResponse.json({ ok: false, error: res.reason }, { status: 400 })
  return NextResponse.json({ ok: true })
}

