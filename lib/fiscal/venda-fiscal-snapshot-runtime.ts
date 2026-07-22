/**
 * Runtime de Solicitação de Emissão Fiscal (GOAL-005 — snapshot runtime integration).
 *
 * Caller REAL que conecta o snapshot fiscal dormente ao runtime da venda, por meio
 * de uma rota explícita de solicitação de emissão. NÍVEL N5 declarado para o
 * snapshot (runtime real com caller) — mas DEFAULT-OFF: nada acontece enquanto a
 * loja não estiver fiscalmente habilitada (`fiscalEnabled = true`).
 *
 * O que faz (somente isto):
 *  1. fail-closed: loja sem `fiscalEnabled = true` → 423 Locked (não ativa loja).
 *  2. valida elegibilidade fiscal dos produtos (registra pendências no diagnóstico).
 *  3. CONGELA o snapshot fiscal completo e imutável (idempotente por `localKey`).
 *  4. registra versão do contrato + hash determinístico SHA-256 no JSONB.
 *  5. transiciona `Venda.fiscalStatus` NAO_FISCAL → PENDENTE (única escrita de
 *     negócio). Se já PENDENTE → idempotente (não re-transiciona).
 *
 * O que NÃO faz (blocklist do GOAL-005):
 *  - NÃO cria `FiscalEmissaoJob` (zero job).
 *  - NÃO emite, NÃO chama provider, NÃO chama SEFAZ (zero emissão, zero SEFAZ).
 *  - NÃO ativa loja (`fiscalEnabled` é somente-leitura aqui).
 *  - NÃO altera schema Prisma.
 *  - NÃO re-lê dados vivos após congelar — o snapshot é a fonte única.
 *
 * Invariante de idempotência: mesma (storeId, vendaId) → mesmo `localKey` → mesma
 * `NotaFiscal` vigente. Re-chamar retorna o snapshot existente sem recriar nem
 * re-transicionar.
 */
import { prisma } from "@/lib/prisma"
import { FiscalStatusVenda } from "@/generated/prisma"
import { createVendaFiscalSnapshot } from "./venda-fiscal-snapshot-service"
import { normalizeFiscalStatus } from "./venda-fiscal-state-machine"
import { VENDA_FISCAL_SNAPSHOT_VERSAO, type VendaFiscalSnapshot } from "./venda-fiscal-snapshot"

export type SolicitarEmissaoResult =
  | {
      ok: true
      vendaId: string
      pedidoId: string
      notaFiscalId: string
      localKey: string
      /** Hash SHA-256 determinístico do snapshot congelado. */
      snapshotHash: string
      /** Versão do contrato de canonização/hash (auditoria de versão). */
      hashContratoVersao: number
      /** Versão do contrato do snapshot (`VENDA_FISCAL_SNAPSHOT_VERSAO`). */
      contratoVersao: number
      /** false quando a NotaFiscal já existia (idempotência de snapshot). */
      created: boolean
      /** false quando `Venda.fiscalStatus` já era PENDENTE (idempotência de estado). */
      transitioned: boolean
      /** Diagnóstico congelado no snapshot (pendências de produtos/loja). */
      diagnostico: VendaFiscalSnapshot["diagnostico"] | null
    }
  | {
      ok: false
      status: number
      code: string
      error: string
      pendencias?: string[]
    }

/**
 * Solicita a emissão fiscal de uma venda — CONGELA o snapshot e transiciona
 * `Venda.fiscalStatus` NAO_FISCAL → PENDENTE. Idempotente por `localKey`.
 *
 * @param params.storeId   loja escopada (do header `x-assistec-loja-id`).
 * @param params.pedidoId  chave de negócio da venda (da URL `[id]`).
 * @param params.operador  rótulo do operador (da sessão NextAuth).
 */
export async function solicitarEmissaoVenda(params: {
  storeId: string
  pedidoId: string
  operador: string
}): Promise<SolicitarEmissaoResult> {
  const storeId = String(params.storeId ?? "").trim()
  const pedidoId = String(params.pedidoId ?? "").trim()
  if (!storeId || !pedidoId) {
    return {
      ok: false,
      status: 400,
      code: "parametros_invalidos",
      error: "storeId e pedidoId são obrigatórios.",
    }
  }

  // 1) Carrega a venda (escopada por loja) — somente leitura.
  const venda = await prisma.venda.findFirst({
    where: { pedidoId, storeId },
    select: { id: true, fiscalStatus: true, status: true },
  })
  if (!venda) {
    return {
      ok: false,
      status: 404,
      code: "venda_nao_encontrada",
      error: "Venda não encontrada nesta loja.",
    }
  }

  // 2) Venda cancelada não pode solicitar emissão.
  if (venda.status === "cancelada") {
    return {
      ok: false,
      status: 409,
      code: "venda_cancelada",
      error: "Não é possível solicitar emissão de uma venda cancelada.",
    }
  }

  // 3) Estado fiscal: somente NAO_FISCAL → PENDENTE ou PENDENTE (idempotente).
  //    Estados fiscais avançados (EMITINDO/AUTORIZADA/etc.) não podem ser
  //    re-solicitados por esta rota.
  const fiscalStatus = normalizeFiscalStatus(venda.fiscalStatus)
  if (fiscalStatus !== FiscalStatusVenda.NAO_FISCAL && fiscalStatus !== FiscalStatusVenda.PENDENTE) {
    return {
      ok: false,
      status: 409,
      code: "fiscal_status_invalido",
      error: `Venda em estado fiscal ${fiscalStatus} — solicitação de emissão disponível apenas para NAO_FISCAL ou PENDENTE.`,
    }
  }
  const willTransition = fiscalStatus === FiscalStatusVenda.NAO_FISCAL

  // 4) FAIL-CLOSED: loja sem `fiscalEnabled = true` → 423 Locked.
  //    NÃO ativa a loja. NÃO emite. NÃO cria job. O gate é explícito.
  const config = await prisma.configuracaoFiscalLoja.findUnique({
    where: { storeId },
    select: { fiscalEnabled: true },
  })
  if (!config?.fiscalEnabled) {
    return {
      ok: false,
      status: 423,
      code: "loja_fiscal_desabilitada",
      error:
        "Loja não habilitada fiscalmente. Ative a identidade fiscal da loja no painel administrativo antes de solicitar emissão.",
    }
  }

  // 5) CONGELA o snapshot fiscal (idempotente por localKey).
  //    `createVendaFiscalSnapshot` carrega venda + itens + config + produtos,
  //    monta o snapshot PURO (deepFreeze), calcula o hash SHA-256 determinístico
  //    e persiste UMA NotaFiscal RASCUNHO + itens congelados. Se já existir
  //    NotaFiscal vigente (mesmo localKey), retorna a existente — NÃO recria,
  //    NÃO re-cacula, NÃO re-lê dados vivos após o congelamento.
  const snapshotResult = await createVendaFiscalSnapshot({ storeId, vendaId: venda.id })
  if (!snapshotResult.ok) {
    return {
      ok: false,
      status: 422,
      code: snapshotResult.code,
      error: snapshotResult.error,
      pendencias: snapshotResult.pendencias,
    }
  }

  // 6) Valida elegibilidade fiscal dos produtos (diagnóstico congelado).
  //    Pendências são registradas no snapshot — NÃO bloqueiam a transição
  //    (a emissão futura verificará o diagnóstico antes de emitir).
  //    O diagnóstico vem do snapshot CONGELADO, não de dados vivos.
  const diagnostico = snapshotResult.diagnostico

  // 7) Transiciona Venda.fiscalStatus NAO_FISCAL → PENDENTE.
  //    Esta é a ÚNICA escrita de negócio no runtime. Se já PENDENTE, é no-op.
  if (willTransition) {
    await prisma.venda.update({
      where: { id: venda.id },
      data: { fiscalStatus: FiscalStatusVenda.PENDENTE },
    })
  }

  // 8) Retorna sucesso com hash, versões e diagnóstico congelado.
  return {
    ok: true,
    vendaId: venda.id,
    pedidoId,
    notaFiscalId: snapshotResult.notaFiscalId,
    localKey: snapshotResult.localKey,
    snapshotHash: snapshotResult.snapshotHash ?? "",
    hashContratoVersao: snapshotResult.hashContratoVersao ?? 1,
    contratoVersao: VENDA_FISCAL_SNAPSHOT_VERSAO,
    created: snapshotResult.created,
    transitioned: willTransition,
    diagnostico,
  }
}
