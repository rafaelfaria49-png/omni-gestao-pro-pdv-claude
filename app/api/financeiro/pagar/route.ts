import { NextResponse } from "next/server"
import { z } from "zod"
import { prismaEnsureConnected, prisma } from "@/lib/prisma"
import { requireOpsSubscription, opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { requireAdmin } from "@/lib/require-admin"
import {
  buildContaPagarAuditTrail,
  buildContaPagarSummary,
  liquidarContaPagar,
  registrarPagamentoParcialContaPagar,
  estornarContaPagar,
  upsertContaPagar,
} from "@/lib/financeiro/services"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const postSchema = z.object({
  lojaId: z.string().min(1).max(120).optional(),
  fornecedor: z.string().min(1).max(240),
  descricao: z.string().min(1).max(240),
  valor: z.number().finite().nonnegative(),
  vencimento: z.string().min(1).max(32),
  categoria: z.string().max(120).optional(),
})

const patchSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("liquidar"), lojaId: z.string().min(1).max(120).optional(), localKey: z.string().min(1).max(260), observacao: z.string().max(2000).optional() }),
  z.object({ op: z.literal("parcial"), lojaId: z.string().min(1).max(120).optional(), localKey: z.string().min(1).max(260), valor: z.number().finite().positive(), observacao: z.string().max(2000).optional() }),
  z.object({ op: z.literal("estornar"), lojaId: z.string().min(1).max(120).optional(), localKey: z.string().min(1).max(260), motivo: z.string().max(2000).optional() }),
])

function parseHistoricoPagar(payload: unknown): { at?: string; tipo?: string; userLabel?: string; valor?: number; observacao?: string }[] {
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

    // Detalhe de um título específico (para HistoricoPagarModal)
    if (localKeyParam) {
      const titulo = await prisma.contaPagarTitulo.findUnique({
        where: { storeId_localKey: { storeId, localKey: localKeyParam } },
      })
      if (!titulo) return NextResponse.json({ ok: false, error: "Não encontrado" }, { status: 404 })
      const p = titulo.payload && typeof titulo.payload === "object" ? (titulo.payload as Record<string, unknown>) : {}
      return NextResponse.json({
        ok: true,
        titulo: {
          id: titulo.id,
          localKey: titulo.localKey,
          descricao: titulo.descricao,
          fornecedor: String(p.fornecedorNome ?? "") || "Fornecedor",
          valor: titulo.valor,
          vencimento: titulo.vencimento,
          status: titulo.status,
          historico: parseHistoricoPagar(titulo.payload),
        },
      })
    }

    const titulos = await prisma.contaPagarTitulo.findMany({
      where: { storeId },
      orderBy: { updatedAt: "desc" },
    })

    const rows = titulos.map((t) => ({
      id: (t.localKey?.trim() || t.id) as string,
      descricao: t.descricao,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fornecedor: (t.payload && typeof t.payload === "object" ? String((t.payload as any).fornecedorNome ?? "") : "") || "Fornecedor",
      valor: t.valor,
      vencimento: t.vencimento,
      status: t.status,
    }))

    return NextResponse.json({
      ok: true,
      rows,
      summary: buildContaPagarSummary(titulos),
      audit: buildContaPagarAuditTrail(titulos),
      metadata: { source: "server", storeId, generatedAt: new Date().toISOString() },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[financeiro/pagar]", msg)
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
  const localKey = `pagar:manual:${storeId}:${uuid}`

  const titulo = await upsertContaPagar({
    storeId,
    localKey,
    descricao: parsed.data.descricao,
    valor: parsed.data.valor,
    vencimento: parsed.data.vencimento,
    status: "pendente",
    payloadPatch: {
      origem: "manual",
      referencia: `CP manual ${uuid}`,
      fornecedorNome: parsed.data.fornecedor,
      categoria: parsed.data.categoria ?? "Outros",
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
    const res = await liquidarContaPagar({ storeId, localKey: parsed.data.localKey, observacao: parsed.data.observacao, userLabel: "financeiro_hub" })
    if (!res.ok) return NextResponse.json({ ok: false, error: res.reason }, { status: 400 })
    return NextResponse.json({ ok: true })
  }
  if (parsed.data.op === "parcial") {
    const res = await registrarPagamentoParcialContaPagar({ storeId, localKey: parsed.data.localKey, valorPago: parsed.data.valor, observacao: parsed.data.observacao, userLabel: "financeiro_hub" })
    if (!res.ok) return NextResponse.json({ ok: false, error: res.reason }, { status: 400 })
    return NextResponse.json({ ok: true })
  }
  const res = await estornarContaPagar({ storeId, localKey: parsed.data.localKey, modo: "ultimo_pagamento", motivo: parsed.data.motivo, userLabel: "financeiro_hub" })
  if (!res.ok) return NextResponse.json({ ok: false, error: res.reason }, { status: 400 })
  return NextResponse.json({ ok: true })
}

