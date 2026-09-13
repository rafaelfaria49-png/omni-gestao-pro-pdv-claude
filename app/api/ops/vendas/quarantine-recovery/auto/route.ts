import { NextResponse } from "next/server"
import { prismaEnsureConnected } from "@/lib/prisma"
import { opsLojaIdFromRequestForWrite } from "@/lib/ops-api-gate"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import { auth } from "@/auth"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import type { QuarantineCandidate } from "@/lib/vendas/quarantine-recovery-planner"
import { QUARANTINE_RECOVERY_CHUNK } from "@/lib/vendas/quarantine-local-reconciliation"
import {
  SALE_WRITER_V1_ACTIVE_CODE,
  executeQuarantineAutoReconcileBatch,
  isRecoveryWriterEnabled,
} from "@/lib/vendas/quarantine-recovery-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/** Teto por requisição = fatia enviada pelo cliente. */
export const MAX_AUTO_CANDIDATES = QUARANTINE_RECOVERY_CHUNK

/**
 * Reconciliação AUTOMÁTICA das vendas preservadas no PDV por conflito de identificação.
 *
 * Chamada pelo próprio PDV, sem operador: é a venda que ele já concluiu, por isso exige a
 * mesma permissão de registrar venda (`/api/ops/venda-persist/v2`), não a de administrador.
 * O núcleo é o MESMO do recovery administrado (`executeQuarantineRecovery` →
 * `persistSaleV2`), com a política automática:
 *
 *  - venda que já existe no servidor (mesma identidade técnica, ou mesma venda gravada
 *    sob outra identidade) é apenas devolvida para reconciliar — nada é criado;
 *  - venda ausente é criada UMA vez, com data original e na sessão de caixa ORIGINAL,
 *    inclusive fechada (lançamento retroativo auditado) — nunca no caixa aberto de hoje;
 *  - o que for ambíguo volta bloqueado, para revisão administrativa.
 *
 * Não despacha automação pós-venda nem emite documento fiscal: é recuperação histórica.
 */
export async function POST(req: Request) {
  const lojaId = opsLojaIdFromRequestForWrite(req)
  if (!lojaId) {
    return NextResponse.json(
      { error: "Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId / lojaId." },
      { status: 400 },
    )
  }

  const denied = await apiGuardEnterpriseOrOps(
    lojaId,
    (p) => p.hubs.vendas,
    "Sem permissão para registrar vendas.",
  )
  if (denied) return denied

  if (!isRecoveryWriterEnabled()) {
    return NextResponse.json(
      { error: "Writer V1 ativo. Reconciliação automática indisponível.", code: SALE_WRITER_V1_ACTIVE_CODE },
      { status: 409 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const rawCandidates = (body as { candidates?: unknown }).candidates
  if (!Array.isArray(rawCandidates) || rawCandidates.length === 0) {
    return NextResponse.json(
      { error: "candidates obrigatório (array não vazio).", code: "CANDIDATES_REQUIRED" },
      { status: 400 },
    )
  }
  if (rawCandidates.length > MAX_AUTO_CANDIDATES) {
    return NextResponse.json(
      { error: `Máximo de ${MAX_AUTO_CANDIDATES} vendas por requisição.`, code: "TOO_MANY_CANDIDATES" },
      { status: 400 },
    )
  }

  const candidates = rawCandidates.filter(
    (item): item is QuarantineCandidate =>
      item !== null && typeof item === "object" && !Array.isArray(item),
  )

  const session = await auth()
  const operadorLabel = session?.user ? getOperatorLabelFromSession(session) : undefined

  await prismaEnsureConnected()

  const { results, summary } = await executeQuarantineAutoReconcileBatch({
    storeId: lojaId,
    candidates,
    operadorLabel,
  })

  // 200 mesmo com itens bloqueados: o resultado é por venda e o cliente reconcilia
  // somente o que tem evidência server-side.
  return NextResponse.json({ ok: true, storeId: lojaId, results, summary })
}
