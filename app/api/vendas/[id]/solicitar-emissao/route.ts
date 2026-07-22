/**
 * POST /api/vendas/[id]/solicitar-emissao  — GOAL-005 (snapshot runtime integration)
 *
 * Rota admin-guarded que dá caller REAL ao snapshot fiscal da venda. Congela o
 * snapshot, registra versão do contrato + hash determinístico SHA-256, e
 * transiciona `Venda.fiscalStatus` NAO_FISCAL → PENDENTE.
 *
 * Comportamento:
 *  - FAIL-CLOSED: loja sem `fiscalEnabled = true` → 423 Locked (não ativa loja).
 *  - IDEMPOTENTE: mesma venda → mesmo `localKey` → mesma NotaFiscal vigente.
 *  - DEFAULT-OFF: em produção (sem loja habilitada), retorna 423 sem efeitos.
 *  - ZERO job, ZERO emissão, ZERO SEFAZ, ZERO certificado, ZERO ativação.
 *
 * Única escrita de negócio: `Venda.fiscalStatus` (NAO_FISCAL → PENDENTE).
 * Nenhuma mudança de schema. Nenhuma chamada a emission/provider/dry-run/numbering.
 */
import { NextResponse } from "next/server"
import { opsLojaIdFromRequestForWrite } from "@/lib/ops-api-gate"
import { requireFiscalAdmin } from "@/lib/fiscal/guard-fiscal-admin"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import { solicitarEmissaoVenda } from "@/lib/fiscal/venda-fiscal-snapshot-runtime"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1) Escopo de loja — mutação exige header ou query (sem cookie sozinho).
  const storeId = opsLojaIdFromRequestForWrite(req)
  if (!storeId) {
    return NextResponse.json(
      { ok: false, error: "storeId obrigatório (header x-assistec-loja-id)" },
      { status: 400 },
    )
  }

  // 2) Admin guard — apenas SUPER_ADMIN/ADMIN com acesso à loja.
  //    NÃO cria segundo sistema de permissão: compõe `auth()` + `canAccessStore`
  //    + `enterpriseRoleFromUserRole === "admin"` (mesmo padrão das rotas
  //    `/api/fiscal/*`).
  const acl = await requireFiscalAdmin(storeId)
  if (!acl.ok) {
    return NextResponse.json({ ok: false, error: acl.error }, { status: acl.status })
  }

  // 3) ID da venda da URL — `pedidoId` (chave de negócio, ex.: VDA-2026-0001).
  const { id: rawId } = await params
  const pedidoId = rawId?.trim()
  if (!pedidoId) {
    return NextResponse.json(
      { ok: false, error: "ID da venda obrigatório" },
      { status: 400 },
    )
  }

  // 4) Rótulo do operador (da sessão NextAuth) para auditoria.
  const operador = getOperatorLabelFromSession(acl.session) || "Admin"

  // 5) Delega ao runtime service (fail-closed + snapshot + transição).
  try {
    const result = await solicitarEmissaoVenda({ storeId, pedidoId, operador })

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          code: result.code,
          pendencias: result.pendencias,
        },
        { status: result.status },
      )
    }

    return NextResponse.json({
      ok: true,
      pedidoId: result.pedidoId,
      vendaId: result.vendaId,
      notaFiscalId: result.notaFiscalId,
      localKey: result.localKey,
      snapshotHash: result.snapshotHash,
      hashAlgoritmo: "sha256",
      hashContratoVersao: result.hashContratoVersao,
      contratoVersao: result.contratoVersao,
      created: result.created,
      transitioned: result.transitioned,
      diagnostico: result.diagnostico,
      // Confirmação explícita das invariantes do GOAL-005 (auditoria).
      zeroJob: true,
      zeroEmissao: true,
      zeroSefaz: true,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[vendas/solicitar-emissao]", msg)
    return NextResponse.json(
      {
        ok: false,
        error: "Falha ao solicitar emissão fiscal",
        detail: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 503 },
    )
  }
}
