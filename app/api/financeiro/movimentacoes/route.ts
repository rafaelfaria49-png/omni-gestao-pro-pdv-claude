/**
 * /api/financeiro/movimentacoes
 *
 * GET   → lista movimentações com filtros opcionais
 * POST  → cria movimentação manual
 * DELETE → remove movimentação (hard-delete, somente manual)
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { prismaEnsureConnected, prisma } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { apiGuardFinanceiroEditEnterpriseOrLegacy, apiGuardFinanceiroViewOrOps } from "@/lib/auth/api-enterprise-guard"
import {
  listMovimentacoes,
  createMovimentacao,
  deleteMovimentacao,
  getResumoMovimentacoes,
} from "@/lib/financeiro/services/movimentacoes-service"
import { verificarPeriodoFechado } from "@/lib/financeiro/services/fechamento-service"
import { recalcularSaldoCarteira } from "@/lib/financeiro/services/carteiras-service"
import { auth } from "@/auth"
import { extractAuditoriaActor, logAuditoriaFinanceira } from "@/lib/financeiro/services/auditoria-actor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

// ─── helpers ──────────────────────────────────────────────────────────────────

function storeIdFromReq(req: Request): string | null {
  return opsLojaIdFromRequest(req)
}

// ─── Schemas Zod ──────────────────────────────────────────────────────────────

const postSchema = z.object({
  tipo: z.enum(["entrada", "saida"]),
  descricao: z.string().min(1, "Descrição obrigatória").max(240),
  valor: z.number({ required_error: "Valor obrigatório" }).finite().positive("Valor deve ser positivo"),
  origem: z
    .enum(["os", "venda", "manual", "pagar", "receber"])
    .or(z.string().max(64))
    .optional()
    .default("manual"),
  referenciaId: z.string().max(128).optional(),
  /** yyyy-mm-dd — define data do lançamento (meio-dia local ISO). */
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  carteiraId: z.string().min(1).max(64).optional(),
  observacao: z.string().max(2000).optional(),
})

const deleteSchema = z.object({
  id: z.string().min(1, "id obrigatório"),
})

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const sid = storeIdFromReq(req)
  if (!sid) return NextResponse.json({ error: "storeId obrigatório" }, { status: 400 })
  const denied = await apiGuardFinanceiroViewOrOps(sid)
  if (denied) return denied
  const url = new URL(req.url)

  const tipo = url.searchParams.get("tipo")
  const origem = url.searchParams.get("origem") ?? undefined
  const referenciaId = url.searchParams.get("referenciaId") ?? undefined
  const q = url.searchParams.get("q") ?? undefined
  const dataInicial = url.searchParams.get("dataInicial") ?? undefined
  const dataFinal = url.searchParams.get("dataFinal") ?? undefined
  const take = parseInt(url.searchParams.get("take") ?? "200", 10)
  const skip = parseInt(url.searchParams.get("skip") ?? "0", 10)
  const resumo = url.searchParams.get("resumo") === "1"

  try {
    await prismaEnsureConnected()

    if (resumo) {
      const res = await getResumoMovimentacoes(sid, { dataInicial, dataFinal })
      return NextResponse.json({ ok: true, resumo: res })
    }

    const rows = await listMovimentacoes(sid, {
      tipo: (tipo === "entrada" || tipo === "saida" ? tipo : undefined),
      origem,
      referenciaId,
      q,
      dataInicial,
      dataFinal,
      take: Number.isFinite(take) ? take : 200,
      skip: Number.isFinite(skip) ? skip : 0,
    })

    return NextResponse.json({ ok: true, rows, total: rows.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[financeiro/movimentacoes GET]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 503 })
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const parsed = postSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Dados inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const sid = storeIdFromReq(req)
  if (!sid) return NextResponse.json({ error: "storeId obrigatório" }, { status: 400 })
  const denied = await apiGuardFinanceiroEditEnterpriseOrLegacy(sid)
  if (denied) return denied

  try {
    await prismaEnsureConnected()

    const dataRef = parsed.data.data
      ? new Date(`${parsed.data.data}T12:00:00`)
      : new Date()
    const lock = await verificarPeriodoFechado(sid, dataRef)
    if (lock.fechado) {
      return NextResponse.json(
        { ok: false, error: "Período financeiro fechado. Reabra o fechamento para alterar lançamentos.", code: "periodo_fechado" },
        { status: 409 },
      )
    }

    const obs = parsed.data.observacao?.trim()
    const descBase = parsed.data.descricao.trim()
    const descricaoFinal = obs ? `${descBase} — ${obs}` : descBase

    const mov = await createMovimentacao({
      storeId: sid,
      tipo: parsed.data.tipo,
      descricao: descricaoFinal,
      valor: parsed.data.valor,
      origem: parsed.data.origem,
      referenciaId: parsed.data.referenciaId,
      carteiraId: parsed.data.carteiraId,
      createdAt: parsed.data.data ? dataRef : undefined,
    })
    void logAuditoriaFinanceira({
      storeId: sid, entidade: "movimentacao", entidadeId: mov.id, acao: "criar",
      actor: extractAuditoriaActor(await auth(), req),
      depois: { tipo: mov.tipo, valor: mov.valor, descricao: mov.descricao, origem: mov.origem, carteiraId: mov.carteiraId },
    })
    return NextResponse.json({ ok: true, movimentacao: mov }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[financeiro/movimentacoes POST]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 503 })
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const idParam = url.searchParams.get("id")

  // Aceita tanto via query param quanto via body JSON
  let id = idParam ?? ""
  if (!id) {
    try {
      const body = await req.json()
      const parsed = deleteSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { ok: false, error: "Informe id via query ?id= ou no body JSON" },
          { status: 400 },
        )
      }
      id = parsed.data.id
    } catch {
      return NextResponse.json(
        { ok: false, error: "id obrigatório: use query ?id=<id> ou body JSON { id }" },
        { status: 400 },
      )
    }
  }

  const sid = storeIdFromReq(req)
  if (!sid) return NextResponse.json({ error: "storeId obrigatório" }, { status: 400 })
  const denied = await apiGuardFinanceiroEditEnterpriseOrLegacy(sid)
  if (denied) return denied

  try {
    await prismaEnsureConnected()

    const existing = await prisma.movimentacaoFinanceira.findFirst({
      where: { id, storeId: sid },
      select: { createdAt: true, carteiraId: true },
    })
    if (!existing) {
      return NextResponse.json({ ok: false, error: `movimentacoes-service: movimentação "${id}" não encontrada` }, { status: 404 })
    }
    const lock = await verificarPeriodoFechado(sid, existing.createdAt)
    if (lock.fechado) {
      return NextResponse.json(
        { ok: false, error: "Período financeiro fechado. Reabra o fechamento para excluir lançamentos.", code: "periodo_fechado" },
        { status: 409 },
      )
    }

    const carteiraId = existing.carteiraId?.trim()
    await deleteMovimentacao(id, sid)
    if (carteiraId) {
      await recalcularSaldoCarteira(carteiraId, sid)
    }
    void logAuditoriaFinanceira({
      storeId: sid, entidade: "movimentacao", entidadeId: id, acao: "excluir",
      actor: extractAuditoriaActor(await auth(), req),
      antes: { carteiraId, createdAt: existing.createdAt },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[financeiro/movimentacoes DELETE]", msg)
    const status = msg.includes("não encontrada") ? 404 : 503
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}
