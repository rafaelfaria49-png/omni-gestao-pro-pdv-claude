/**
 * POST /api/pdv/receber-conta
 *
 * Recebimento de título no PDV (F5): baixa financeira + movimentação + vínculo à sessão de caixa.
 * Reusa services existentes — sem alteração de schema.
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { auth } from "@/auth"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import { apiGuardFinanceiroEditEnterpriseOrLegacy } from "@/lib/auth/api-enterprise-guard"
import {
  buildContaReceberAuditTrail,
  liquidarContaReceber,
  registrarPagamentoParcial,
} from "@/lib/financeiro/services"
import { createMovimentacaoEntradaFromReceber } from "@/lib/financeiro/services/movimentacoes-service"
import { verificarPeriodoFechado } from "@/lib/financeiro/services/fechamento-service"
import { logAuditoriaFinanceira, extractAuditoriaActor } from "@/lib/financeiro/services/auditoria-actor"
import type { Prisma } from "@/generated/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

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

const bodySchema = z.object({
  lojaId: z.string().min(1).max(120).optional(),
  op: z.enum(["liquidar", "parcial"]),
  tituloId: z.union([z.string(), z.number()]).optional(),
  localKey: z.string().min(1).max(260).optional(),
  valor: z.number().finite().positive().max(1e12).optional(),
  formaPagamento: z.string().max(120).optional(),
  observacao: z.string().max(2000).optional(),
  sessaoId: z.string().min(1).max(120),
})

function pickTituloRef(input: { tituloId?: string | number; localKey?: string }): { id?: string; localKey?: string } {
  const idRaw = input.tituloId != null ? String(input.tituloId).trim() : ""
  const lk = (input.localKey ?? "").trim()
  if (idRaw) return { id: idRaw }
  if (lk) return { localKey: lk }
  return {}
}

export async function POST(request: Request) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Dados inválidos", issues: parsed.error.flatten() }, { status: 400 })
  }

  const storeId = storeIdFromAssistecRequestForWrite(request)
  if (!storeId) {
    return NextResponse.json(
      { ok: false, error: "Unidade obrigatória: envie o header x-assistec-loja-id." },
      { status: 400 },
    )
  }
  if (parsed.data.lojaId && parsed.data.lojaId !== storeId) {
    return NextResponse.json({ ok: false, error: "Unidade inconsistente (body vs header)." }, { status: 400 })
  }

  const denied = await apiGuardFinanceiroEditEnterpriseOrLegacy(storeId)
  if (denied) return denied

  const ref = pickTituloRef(parsed.data)
  if (!ref.id && !ref.localKey) {
    return NextResponse.json({ ok: false, error: "Informe tituloId ou localKey." }, { status: 400 })
  }

  if (parsed.data.op === "parcial" && !(parsed.data.valor != null && parsed.data.valor > 0)) {
    return NextResponse.json({ ok: false, error: "Valor parcial obrigatório." }, { status: 400 })
  }

  const session = await auth()
  const userLabel = getOperatorLabelFromSession(session)
  const actor = extractAuditoriaActor(session, request)
  const forma = (parsed.data.formaPagamento ?? "dinheiro").trim() || "dinheiro"
  const obsBase = (parsed.data.observacao ?? "").trim()
  const observacao = obsBase
    ? `${obsBase} · PDV · ${forma}`
    : `Recebimento PDV · ${forma}`

  try {
    await prismaEnsureConnected()

    const lock = await verificarPeriodoFechado(storeId, new Date())
    if (lock.fechado) {
      return NextResponse.json(
        { ok: false, error: "Período financeiro fechado. Reabra o fechamento para receber.", code: "periodo_fechado" },
        { status: 409 },
      )
    }

    const sessao = await prisma.sessaoCaixa.findFirst({
      where: { id: parsed.data.sessaoId, storeId, status: "ABERTA" },
      select: { id: true },
    })
    if (!sessao) {
      return NextResponse.json(
        { ok: false, error: "Sessão de caixa não encontrada ou já fechada. Abra o caixa no PDV.", code: "caixa_fechado" },
        { status: 409 },
      )
    }

    let res: Awaited<ReturnType<typeof liquidarContaReceber>>
    let valorMov = 0
    let parcial = false

    if (parsed.data.op === "liquidar") {
      res = await liquidarContaReceber({
        storeId,
        id: ref.id,
        localKey: ref.localKey,
        observacao,
        userLabel,
      })
      if (!res.ok) {
        const status = res.reason === "not_found" ? 404 : 422
        return NextResponse.json({ ok: false, error: res.reason, code: res.reason }, { status })
      }
      valorMov = res.data.valor
      parcial = false
    } else {
      res = await registrarPagamentoParcial({
        storeId,
        id: ref.id,
        localKey: ref.localKey,
        valorPago: parsed.data.valor!,
        observacao,
        userLabel,
      })
      if (!res.ok) {
        const status = res.reason === "not_found" ? 404 : 422
        return NextResponse.json({ ok: false, error: res.reason, code: res.reason }, { status })
      }
      valorMov = parsed.data.valor!
      parcial = true
    }

    const carteiraId = await resolveCarteiraIdFromPayload(res.data.payload, storeId)
    await createMovimentacaoEntradaFromReceber(
      { id: res.data.id, storeId: res.data.storeId, descricao: res.data.descricao, cliente: res.data.cliente },
      valorMov,
      { parcial, carteiraId },
    ).catch((e) => console.error("[pdv/receber-conta mov]", e))

    const localId = `pdv-rc:${sessao.id}:${res.data.id}:${parsed.data.op}:${Date.now()}`
    await prisma.caixaOperacao.create({
      data: {
        sessaoId: sessao.id,
        storeId,
        tipo: "recebimento_cr",
        valor: valorMov,
        motivo: `Recebimento CR — ${res.data.cliente || res.data.descricao} (${forma})`,
        operador: userLabel,
        payload: {
          localId,
          tituloId: res.data.id,
          localKey: res.data.localKey,
          formaPagamento: forma,
          op: parsed.data.op,
        } as Prisma.InputJsonValue,
      },
    })

    void logAuditoriaFinanceira({
      storeId,
      entidade: "receber",
      entidadeId: res.data.id,
      acao: "liquidar",
      actor,
      depois: { localKey: res.data.localKey, valor: valorMov, formaPagamento: forma, sessaoId: sessao.id, parcial },
    })

    const audit = buildContaReceberAuditTrail([res.data])[0] ?? null

    return NextResponse.json({
      ok: true,
      op: parsed.data.op,
      valorRecebido: valorMov,
      titulo: {
        id: res.data.id,
        localKey: res.data.localKey,
        status: res.data.status,
        valor: res.data.valor,
        vencimento: res.data.vencimento,
        cliente: res.data.cliente,
        descricao: res.data.descricao,
      },
      audit,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha interna"
    console.error("[pdv/receber-conta]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 503 })
  }
}
