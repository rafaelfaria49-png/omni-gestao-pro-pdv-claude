/**
 * /api/financeiro/pagar
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
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { auth } from "@/auth"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import { apiGuardFinanceiroEditEnterpriseOrLegacy, apiGuardFinanceiroViewOrOps } from "@/lib/auth/api-enterprise-guard"
import {
  buildContaPagarAuditTrail,
  buildContaPagarSummary,
  cancelContaPagar,
  liquidarContaPagar,
  registrarPagamentoParcialContaPagar,
  estornarContaPagar,
  upsertContaPagar,
} from "@/lib/financeiro/services"
import {
  createMovimentacaoSaidaFromPagar,
  estornarMovimentacaoPorReferencia,
} from "@/lib/financeiro/services/movimentacoes-service"
import { verificarPeriodoFechado } from "@/lib/financeiro/services/fechamento-service"

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

function fornecedorFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return ""
  const p = payload as Record<string, unknown>
  return String(p.fornecedorNome ?? p.fornecedor ?? "")
}

function pickStringFromPayload(payload: unknown, ...keys: string[]): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  const p = payload as Record<string, unknown>
  for (const k of keys) {
    const v = p[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

function parcelaLabelFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  const parc = (payload as Record<string, unknown>).parcela
  if (!parc || typeof parc !== "object" || Array.isArray(parc)) return null
  const numero = (parc as Record<string, unknown>).numero
  const total = (parc as Record<string, unknown>).total
  if (typeof numero !== "number" || typeof total !== "number") return null
  return `${numero}/${total}`
}

/**
 * Resolve `carteiraId` do payload do título, validando que existe na loja e
 * está ativa. Retorna `null` quando ausente, inválido ou desativado.
 */
async function resolveCarteiraIdFromPayload(payload: unknown, storeId: string): Promise<string | null> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  const raw = (payload as Record<string, unknown>).carteiraId
  if (typeof raw !== "string") return null
  const id = raw.trim()
  if (!id) return null
  const c = await prisma.carteiraFinanceira.findFirst({
    where: { id, storeId, ativo: true },
    select: { id: true },
  })
  return c?.id ?? null
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const postSchema = z.object({
  lojaId: z.string().max(120).optional(),
  fornecedor: z.string().min(1, "Fornecedor obrigatório").max(240),
  descricao: z.string().min(1, "Descrição obrigatória").max(240),
  valor: z.number({ required_error: "Valor obrigatório" }).finite().nonnegative("Valor deve ser ≥ 0"),
  vencimento: z.string().min(1, "Vencimento obrigatório").max(32),
  categoria: z.string().max(120).optional(),
  observacao: z.string().max(2000).optional(),
  /** Metadados opcionais — gravados no `payload` (sem colunas Prisma dedicadas). */
  numeroDocumento: z.string().max(120).optional(),
  competencia: z.string().max(32).optional(),
  centroCusto: z.string().max(120).optional(),
  formaPagamento: z.string().max(80).optional(),
  carteiraId: z.string().max(120).optional(),
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
  const storeId = readSid(req)
  if (!storeId) return err("Unidade obrigatória", "store_missing", 400)
  const denied = await apiGuardFinanceiroViewOrOps(storeId, { skipOpsInDev: true })
  if (denied) return denied

  const url = new URL(req.url)
  const localKeyParam = url.searchParams.get("localKey")?.trim()

  try {
    await prismaEnsureConnected()

    // Detalhe de um título específico
    if (localKeyParam) {
      const titulo = await prisma.contaPagarTitulo.findUnique({
        where: { storeId_localKey: { storeId, localKey: localKeyParam } },
      })
      if (!titulo) return err("Título não encontrado", "not_found", 404)
      return NextResponse.json({
        ok: true,
        titulo: {
          id: titulo.id,
          localKey: titulo.localKey,
          descricao: titulo.descricao,
          fornecedor: fornecedorFromPayload(titulo.payload),
          valor: titulo.valor,
          vencimento: titulo.vencimento,
          status: titulo.status,
          categoria: pickStringFromPayload(titulo.payload, "planoContas", "categoria"),
          formaPagamento: pickStringFromPayload(titulo.payload, "formaPagamento"),
          contaBancaria: pickStringFromPayload(titulo.payload, "contaBancaria"),
          observacao: pickStringFromPayload(titulo.payload, "observacoes", "observacao"),
          dataConfirmacao: pickStringFromPayload(titulo.payload, "dataConfirmacao"),
          parcela: parcelaLabelFromPayload(titulo.payload),
          historico: parseHistorico(titulo.payload),
        },
      })
    }

    // Lista paginada
    const titulos = await prisma.contaPagarTitulo.findMany({
      where: { storeId },
      orderBy: { updatedAt: "desc" },
    })

    const rows = titulos.map((t) => ({
      id: (t.localKey?.trim() || t.id) as string,
      descricao: t.descricao,
      fornecedor: fornecedorFromPayload(t.payload),
      valor: t.valor,
      vencimento: t.vencimento,
      status: t.status,
      categoria: pickStringFromPayload(t.payload, "planoContas", "categoria"),
      formaPagamento: pickStringFromPayload(t.payload, "formaPagamento"),
      contaBancaria: pickStringFromPayload(t.payload, "contaBancaria"),
      observacao: pickStringFromPayload(t.payload, "observacoes", "observacao"),
      parcela: parcelaLabelFromPayload(t.payload),
    }))

    return NextResponse.json({
      ok: true,
      rows,
      summary: buildContaPagarSummary(titulos),
      audit: buildContaPagarAuditTrail(titulos),
      metadata: { source: "server", storeId, generatedAt: new Date().toISOString() },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha interna"
    console.error("[financeiro/pagar GET]", msg)
    return err(msg, "db_error", 503)
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
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

  const deniedPost = await apiGuardFinanceiroEditEnterpriseOrLegacy(storeId)
  if (deniedPost) return deniedPost

  try {
    await prismaEnsureConnected()
    const uuid = crypto.randomUUID()
    const localKey = `pagar:manual:${storeId}:${uuid}`
    const titulo = await upsertContaPagar({
      storeId,
      localKey,
      descricao: parsed.data.descricao,
      valor: parsed.data.valor,
      vencimento: parsed.data.vencimento,
      status: "pendente",
      fornecedorNome: parsed.data.fornecedor,
      numeroDocumento: parsed.data.numeroDocumento,
      payloadPatch: {
        origem: "manual",
        referencia: `CP manual ${uuid}`,
        fornecedorNome: parsed.data.fornecedor,
        planoContas: parsed.data.categoria ?? "Outros",
        categoria: parsed.data.categoria ?? "Outros",
        createdFrom: "financeiro_hub",
        ...(parsed.data.observacao ? { observacoes: parsed.data.observacao } : {}),
        ...(parsed.data.competencia ? { competencia: parsed.data.competencia } : {}),
        ...(parsed.data.centroCusto ? { centroCusto: parsed.data.centroCusto } : {}),
        ...(parsed.data.formaPagamento ? { formaPagamento: parsed.data.formaPagamento } : {}),
        ...(parsed.data.carteiraId ? { carteiraId: parsed.data.carteiraId } : {}),
      },
    })
    return NextResponse.json({ ok: true, id: titulo.id, localKey }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha interna"
    console.error("[financeiro/pagar POST]", msg)
    return err(msg, "db_error", 503)
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: Request) {
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

  const deniedPatch = await apiGuardFinanceiroEditEnterpriseOrLegacy(storeId)
  if (deniedPatch) return deniedPatch

  const userLabel = getOperatorLabelFromSession(await auth())

  try {
    await prismaEnsureConnected()

    // Bloqueio de período fechado para operações de mutação
    if (["liquidar", "parcial", "estornar"].includes(parsed.data.op)) {
      const lock = await verificarPeriodoFechado(storeId, new Date())
      if (lock.fechado) {
        return err(
          "Período financeiro fechado. Reabra o fechamento para alterar lançamentos.",
          "periodo_fechado",
          409,
        )
      }
    }

    if (parsed.data.op === "liquidar") {
      const res = await liquidarContaPagar({ storeId, localKey: parsed.data.localKey, observacao: parsed.data.observacao, userLabel })
      if (!res.ok) return err(res.reason, `liquidar_${res.reason}`, 422)
      const carteiraId = await resolveCarteiraIdFromPayload(res.data.payload, storeId)
      // Gerar movimentação de saída (idempotente) — vincula à carteira do título se houver
      await createMovimentacaoSaidaFromPagar(
        { id: res.data.id, storeId: res.data.storeId, descricao: res.data.descricao },
        res.data.valor,
        { carteiraId },
      ).catch((e) => console.error("[pagar/liquidar mov]", e))
      return NextResponse.json({ ok: true, op: "liquidar" })
    }

    if (parsed.data.op === "parcial") {
      const res = await registrarPagamentoParcialContaPagar({ storeId, localKey: parsed.data.localKey, valorPago: parsed.data.valor, observacao: parsed.data.observacao, userLabel })
      if (!res.ok) return err(res.reason, `parcial_${res.reason}`, 422)
      const carteiraId = await resolveCarteiraIdFromPayload(res.data.payload, storeId)
      // Gerar movimentação de saída parcial (idempotente por soma total)
      await createMovimentacaoSaidaFromPagar(
        { id: res.data.id, storeId: res.data.storeId, descricao: res.data.descricao },
        parsed.data.valor,
        { parcial: true, carteiraId },
      ).catch((e) => console.error("[pagar/parcial mov]", e))
      return NextResponse.json({ ok: true, op: "parcial" })
    }

    if (parsed.data.op === "estornar") {
      const res = await estornarContaPagar({ storeId, localKey: parsed.data.localKey, modo: "ultimo_pagamento", motivo: parsed.data.motivo, userLabel })
      if (!res.ok) return err(res.reason, `estornar_${res.reason}`, 422)
      // Estornar movimentação correspondente (idempotente)
      await estornarMovimentacaoPorReferencia(storeId, res.data.id, "pagar")
        .catch((e) => console.error("[pagar/estornar mov]", e))
      return NextResponse.json({ ok: true, op: "estornar" })
    }

    // cancelar — não gera movimentação nova
    const res = await cancelContaPagar({ storeId, localKey: parsed.data.localKey, motivo: parsed.data.motivo, userLabel })
    if (!res.ok) return err(res.reason, `cancelar_${res.reason}`, 422)
    return NextResponse.json({ ok: true, op: "cancelar" })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha interna"
    console.error("[financeiro/pagar PATCH]", msg)
    return err(msg, "db_error", 503)
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
// Cancelamento seguro — não destrói dados, apenas muda status para "cancelado".

export async function DELETE(req: Request) {
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

  const denied = await apiGuardFinanceiroEditEnterpriseOrLegacy(storeId)
  if (denied) return denied

  const userLabel = getOperatorLabelFromSession(await auth())

  try {
    await prismaEnsureConnected()
    const res = await cancelContaPagar({ storeId, localKey: body.data.localKey, motivo: body.data.motivo, userLabel })
    if (!res.ok) return err(res.reason, `cancel_${res.reason}`, 422)
    return NextResponse.json({ ok: true, action: "cancelled" })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha interna"
    console.error("[financeiro/pagar DELETE]", msg)
    return err(msg, "db_error", 503)
  }
}
