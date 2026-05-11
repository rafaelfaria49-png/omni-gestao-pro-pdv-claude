/**
 * /api/financeiro/receber
 *
 * GET    → lista títulos  (storeId por header)
 * GET    → ?localKey=<k>  detalhe + payload.historico
 * POST   → cria título manual
 * PATCH  → op: liquidar | parcial | estornar | cancelar
 * DELETE → cancelamento seguro (não destrói dados)
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { prismaEnsureConnected, prisma } from "@/lib/prisma"
import { requireOpsSubscription, opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { requireAdmin } from "@/lib/require-admin"
import {
  buildContaReceberAuditTrail,
  buildContaReceberSummary,
  cancelContaReceber,
  liquidarContaReceber,
  registrarPagamentoParcial,
  estornarContaReceber,
  upsertContaReceber,
} from "@/lib/financeiro/services"
import {
  createMovimentacaoEntradaFromReceber,
  estornarMovimentacaoPorReferencia,
} from "@/lib/financeiro/services/movimentacoes-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

// ─── helpers ──────────────────────────────────────────────────────────────────

function err(error: string, code: string, status = 400) {
  return NextResponse.json({ ok: false, error, code }, { status })
}

function readSid(req: Request, forWrite = false): string | null {
  const sid = forWrite
    ? storeIdFromAssistecRequestForWrite(req)
    : opsLojaIdFromRequest(req) || "loja-1"
  return sid || null
}

type HistEntry = { at?: string; tipo?: string; userLabel?: string; valor?: number; observacao?: string }

function parseHistorico(payload: unknown): HistEntry[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return []
  const hist = (payload as Record<string, unknown>).historico
  if (!Array.isArray(hist)) return []
  return hist.filter((e) => e && typeof e === "object") as HistEntry[]
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const postSchema = z.object({
  lojaId: z.string().min(1).max(120).optional(),
  descricao: z.string().min(1, "Descrição obrigatória").max(240),
  cliente: z.string().min(1, "Cliente obrigatório").max(240),
  valor: z.number({ required_error: "Valor obrigatório" }).finite().nonnegative("Valor deve ser ≥ 0"),
  vencimento: z.string().min(1, "Vencimento obrigatório").max(32),
  observacao: z.string().max(2000).optional(),
})

const patchSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("liquidar"),
    lojaId: z.string().max(120).optional(),
    localKey: z.string().min(1).max(260),
    observacao: z.string().max(2000).optional(),
  }),
  z.object({
    op: z.literal("parcial"),
    lojaId: z.string().max(120).optional(),
    localKey: z.string().min(1).max(260),
    valor: z.number().finite().positive("Valor deve ser positivo"),
    observacao: z.string().max(2000).optional(),
  }),
  z.object({
    op: z.literal("estornar"),
    lojaId: z.string().max(120).optional(),
    localKey: z.string().min(1).max(260),
    modo: z.enum(["titulo_completo", "ultimo_pagamento"]),
    motivo: z.string().max(2000).optional(),
  }),
  z.object({
    op: z.literal("cancelar"),
    lojaId: z.string().max(120).optional(),
    localKey: z.string().min(1).max(260),
    motivo: z.string().max(2000).optional(),
  }),
])

const deleteQuerySchema = z.object({
  localKey: z.string().min(1).max(260),
  motivo: z.string().max(2000).optional(),
})

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const gate = await requireOpsSubscription()
  if (!gate.ok && process.env.NODE_ENV !== "development") return gate.res

  const storeId = readSid(req)
  if (!storeId) return err("Unidade obrigatória", "store_missing", 400)

  const url = new URL(req.url)
  const localKeyParam = url.searchParams.get("localKey")?.trim()

  try {
    await prismaEnsureConnected()

    // Detalhe de um título específico
    if (localKeyParam) {
      const titulo = await prisma.contaReceberTitulo.findUnique({
        where: { storeId_localKey: { storeId, localKey: localKeyParam } },
      })
      if (!titulo) return err("Título não encontrado", "not_found", 404)
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

    // Lista paginada
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
    const msg = e instanceof Error ? e.message : "Falha interna"
    console.error("[financeiro/receber GET]", msg)
    return err(msg, "db_error", 503)
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const adminGate = await requireAdmin()
  if (!adminGate.ok) return adminGate.res

  let json: unknown
  try { json = await req.json() } catch {
    return err("JSON inválido", "invalid_json", 400)
  }

  const parsed = postSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Dados inválidos", code: "validation_error", issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const storeId = readSid(req, true)
  if (!storeId) return err("Unidade obrigatória (x-assistec-loja-id)", "store_missing", 400)
  if (parsed.data.lojaId && parsed.data.lojaId !== storeId) {
    return err("storeId inconsistente (body vs header)", "store_mismatch", 400)
  }

  try {
    await prismaEnsureConnected()
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
        ...(parsed.data.observacao ? { observacao: parsed.data.observacao } : {}),
      },
    })
    return NextResponse.json({ ok: true, id: titulo.id, localKey }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha interna"
    console.error("[financeiro/receber POST]", msg)
    return err(msg, "db_error", 503)
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: Request) {
  const adminGate = await requireAdmin()
  if (!adminGate.ok) return adminGate.res

  let json: unknown
  try { json = await req.json() } catch {
    return err("JSON inválido", "invalid_json", 400)
  }

  const parsed = patchSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Dados inválidos", code: "validation_error", issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const storeId = readSid(req, true)
  if (!storeId) return err("Unidade obrigatória (x-assistec-loja-id)", "store_missing", 400)
  if (parsed.data.lojaId && parsed.data.lojaId !== storeId) {
    return err("storeId inconsistente (body vs header)", "store_mismatch", 400)
  }

  try {
    await prismaEnsureConnected()

    if (parsed.data.op === "liquidar") {
      const res = await liquidarContaReceber({ storeId, localKey: parsed.data.localKey, observacao: parsed.data.observacao, userLabel: "financeiro_hub" })
      if (!res.ok) return err(res.reason, `liquidar_${res.reason}`, 422)
      // Gerar movimentação de entrada (idempotente)
      await createMovimentacaoEntradaFromReceber(
        { id: res.data.id, storeId: res.data.storeId, descricao: res.data.descricao, cliente: res.data.cliente },
        res.data.valor,
      ).catch((e) => console.error("[receber/liquidar mov]", e))
      return NextResponse.json({ ok: true, op: "liquidar" })
    }

    if (parsed.data.op === "parcial") {
      const res = await registrarPagamentoParcial({ storeId, localKey: parsed.data.localKey, valorPago: parsed.data.valor, observacao: parsed.data.observacao, userLabel: "financeiro_hub" })
      if (!res.ok) return err(res.reason, `parcial_${res.reason}`, 422)
      // Gerar movimentação de entrada parcial (idempotente por soma total)
      await createMovimentacaoEntradaFromReceber(
        { id: res.data.id, storeId: res.data.storeId, descricao: res.data.descricao, cliente: res.data.cliente },
        parsed.data.valor,
        { parcial: true },
      ).catch((e) => console.error("[receber/parcial mov]", e))
      return NextResponse.json({ ok: true, op: "parcial" })
    }

    if (parsed.data.op === "estornar") {
      const res = await estornarContaReceber({ storeId, localKey: parsed.data.localKey, modo: parsed.data.modo, motivo: parsed.data.motivo, userLabel: "financeiro_hub" })
      if (!res.ok) return err(res.reason, `estornar_${res.reason}`, 422)
      // Estornar movimentação correspondente (idempotente)
      await estornarMovimentacaoPorReferencia(storeId, res.data.id, "receber")
        .catch((e) => console.error("[receber/estornar mov]", e))
      return NextResponse.json({ ok: true, op: "estornar" })
    }

    // cancelar — não gera movimentação nova
    const res = await cancelContaReceber({ storeId, localKey: parsed.data.localKey, motivo: parsed.data.motivo, userLabel: "financeiro_hub" })
    if (!res.ok) return err(res.reason, `cancelar_${res.reason}`, 422)
    return NextResponse.json({ ok: true, op: "cancelar" })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha interna"
    console.error("[financeiro/receber PATCH]", msg)
    return err(msg, "db_error", 503)
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
// Cancelamento seguro — não destrói dados, apenas muda status para "cancelado".

export async function DELETE(req: Request) {
  const adminGate = await requireAdmin()
  if (!adminGate.ok) return adminGate.res

  const storeId = readSid(req, true)
  if (!storeId) return err("Unidade obrigatória (x-assistec-loja-id)", "store_missing", 400)

  const url = new URL(req.url)
  const localKeyParam = url.searchParams.get("localKey")?.trim()
  const motivoParam = url.searchParams.get("motivo")?.trim()

  const body = deleteQuerySchema.safeParse({
    localKey: localKeyParam,
    motivo: motivoParam || undefined,
  })
  if (!body.success) return err("localKey obrigatório via query ?localKey=", "missing_localKey", 400)

  try {
    await prismaEnsureConnected()
    const res = await cancelContaReceber({ storeId, localKey: body.data.localKey, motivo: body.data.motivo, userLabel: "financeiro_hub" })
    if (!res.ok) return err(res.reason, `cancel_${res.reason}`, 422)
    return NextResponse.json({ ok: true, action: "cancelled" })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha interna"
    console.error("[financeiro/receber DELETE]", msg)
    return err(msg, "db_error", 503)
  }
}
