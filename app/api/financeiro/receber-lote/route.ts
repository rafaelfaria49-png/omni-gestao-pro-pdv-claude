import { requireModuleApi } from "@/lib/auth/module-access"
/**
 * POST /api/financeiro/receber-lote
 *
 * Recebimento de 1..N títulos do MESMO cliente pelo Financeiro HUB — atômico e
 * idempotente (`idempotencyKey` = identidade da operação). Ver
 * `lib/financeiro/services/recebimento-financeiro-service.ts`.
 *
 * Mesmos guardas da baixa existente (`PATCH /api/financeiro/receber`): módulo finance,
 * loja pelo header (body coerente), permissão de edição financeira e período fechado.
 * O cliente não envia total: o servidor soma o que de fato aplicou.
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { auth } from "@/auth"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import { apiGuardFinanceiroEditEnterpriseOrLegacy } from "@/lib/auth/api-enterprise-guard"
import { extractAuditoriaActor, logAuditoriaFinanceira } from "@/lib/financeiro/services/auditoria-actor"
import { verificarPeriodoFechado } from "@/lib/financeiro/services/fechamento-service"
import {
  RECEBIMENTO_LOTE_MAX_ITENS,
  isRecebimentoLoteError,
  validarRecebimentoLote,
} from "@/lib/financeiro/services/recebimento-lote-service"
import { executarRecebimentoFinanceiro, operacaoJaRegistrada } from "@/lib/financeiro/services/recebimento-financeiro-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const TX_OPTS = { maxWait: 5_000, timeout: 15_000 } as const

const itemSchema = z.object({
  tituloId: z.string().max(200).optional(),
  localKey: z.string().min(1).max(260),
  saldoEsperado: z.number().finite().nonnegative().max(1e12),
  valorReceber: z.number().finite().positive().max(1e12),
})

const bodySchema = z.object({
  lojaId: z.string().min(1).max(120).optional(),
  formaPagamento: z.string().trim().min(1, "Informe a forma de recebimento").max(80),
  observacao: z.string().max(2000).optional(),
  idempotencyKey: z.string().min(1).max(160),
  itens: z.array(itemSchema).min(1).max(RECEBIMENTO_LOTE_MAX_ITENS),
})

export async function POST(request: Request) {
  const moduleDenied = await requireModuleApi(request, "finance")
  if (moduleDenied) return moduleDenied

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido", code: "invalid_json" }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Dados inválidos", code: "validation_error", issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const storeId = storeIdFromAssistecRequestForWrite(request)
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "Unidade obrigatória (x-assistec-loja-id)", code: "store_missing" }, { status: 400 })
  }
  if (parsed.data.lojaId && parsed.data.lojaId !== storeId) {
    return NextResponse.json({ ok: false, error: "storeId inconsistente (body vs header)", code: "store_mismatch" }, { status: 400 })
  }
  const denied = await apiGuardFinanceiroEditEnterpriseOrLegacy(storeId)
  if (denied) return denied

  const validacao = validarRecebimentoLote({ idempotencyKey: parsed.data.idempotencyKey, itens: parsed.data.itens })
  if (!validacao.ok) {
    return NextResponse.json(
      { ok: false, error: validacao.mensagem, code: validacao.code, detalhes: validacao.detalhes },
      { status: 400 },
    )
  }

  const session = await auth()
  const userLabel = getOperatorLabelFromSession(session)
  const actor = extractAuditoriaActor(session, request)

  try {
    await prismaEnsureConnected()
    const lock = await verificarPeriodoFechado(storeId, new Date())
    // Período fechado bloqueia operação NOVA; o retry de uma já gravada segue para o replay
    // (que não escreve nada) e devolve o resultado original.
    if (lock.fechado && !(await operacaoJaRegistrada(prisma, storeId, parsed.data.idempotencyKey))) {
      return NextResponse.json(
        { ok: false, error: "Período financeiro fechado. Reabra o fechamento para alterar lançamentos.", code: "periodo_fechado" },
        { status: 409 },
      )
    }

    const outcome = await prisma.$transaction(
      (tx) =>
        executarRecebimentoFinanceiro(
          tx,
          {
            storeId,
            formaPagamento: parsed.data.formaPagamento,
            observacao: parsed.data.observacao,
            idempotencyKey: parsed.data.idempotencyKey.trim(),
            userLabel,
          },
          validacao.itens,
        ),
      TX_OPTS,
    )

    if (!outcome.jaRegistrado) {
      for (const item of outcome.itens) {
        void logAuditoriaFinanceira({
          storeId,
          entidade: "receber",
          entidadeId: item.tituloId,
          acao: "liquidar",
          actor,
          depois: {
            localKey: item.localKey,
            valor: item.valorRecebido,
            saldoDepois: item.saldoDepois,
            statusFinal: item.statusFinal,
            formaPagamento: outcome.formaPagamento,
            operacao: outcome.operacaoId,
            origem: "financeiro_hub",
          },
        })
      }
    }

    return NextResponse.json({ ok: true, ...outcome })
  } catch (e) {
    if (isRecebimentoLoteError(e)) {
      return NextResponse.json({ ok: false, error: e.message, code: e.code, detalhes: e.detalhes }, { status: e.status })
    }
    const msg = e instanceof Error ? e.message : "Falha interna"
    console.error("[financeiro/receber-lote]", msg)
    return NextResponse.json({ ok: false, error: "Falha ao registrar o recebimento. Nada foi gravado.", code: "db_error" }, { status: 503 })
  }
}
