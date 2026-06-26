/**
 * Helper compartilhado — registra um recebimento de Conta a Receber como
 * `CaixaOperacao(tipo:"recebimento_cr")` na SESSÃO DE CAIXA ABERTA da loja,
 * para que o recebimento entre no **fechamento do caixa**.
 *
 * Contexto (GOAL CAIXA-FIX-001 / auditoria CAIXA-AUDIT-001):
 *  - O fechamento (`lib/caixa-fechamento-resumo.ts` → `aggregateCaixaOperacoes`)
 *    só enxerga `CaixaOperacao(tipo:"recebimento_cr")` vinculada à `sessaoId`.
 *  - O PDV F5 (`/api/pdv/receber-conta`) já cria essa operação; a tela
 *    Financeiro → Contas a Receber baixava o título sem criá-la, então o
 *    recebimento sumia do fechamento. Este helper centraliza a MESMA regra
 *    para não duplicar lógica.
 *
 * Regras de negócio:
 *  - Só cria a operação se HOUVER `SessaoCaixa` ABERTA (loja / sessão / terminal).
 *  - Sem caixa aberto: NÃO finge sucesso — retorna `{ vinculado:false, motivo:"sem_caixa_aberto" }`.
 *  - Idempotente por `idempotencyKey` (ex.: `movimentoId` da baixa): grava
 *    `payload.localId = "rc-caixa:<storeId>:<idempotencyKey>"` e nunca duplica.
 *  - NÃO cria `MovimentacaoFinanceira` nem altera o título — apenas a `CaixaOperacao`.
 *
 * Mantém o mesmo formato de `payload.formaPagamento` (lowercase) consumido por
 * `aggregateCaixaOperacoes` para que recebimentos em dinheiro entrem na gaveta.
 */
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"

export type RegistrarRecebimentoCrInput = {
  storeId: string
  valor: number
  formaPagamento?: string
  /** Origem da baixa: "financeiro" | "pdv" | ... (gravado em payload.origem). */
  origem?: string
  tituloId?: string
  localKey?: string
  cliente?: string
  descricao?: string
  operador?: string
  /** Chave de idempotência (ex.: movimentoId). Sem ela, não há proteção contra duplicidade. */
  idempotencyKey?: string
  /** Quando informado, exige que ESTA sessão esteja aberta para a loja. */
  sessaoId?: string
  /** Quando informado (sem sessaoId), restringe a busca da sessão aberta ao terminal. */
  terminalId?: string
}

export type RegistrarRecebimentoCrResult =
  | { vinculado: true; sessaoId: string; jaRegistrado: boolean }
  | { vinculado: false; motivo: "sem_caixa_aberto" | "valor_invalido" | "erro" }

function money(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"))
  return Number.isFinite(n) ? Math.abs(Math.round(n * 100) / 100) : 0
}

/**
 * Resolve a sessão de caixa ABERTA da loja.
 * - Com `sessaoId`: valida que aquela sessão está aberta na loja.
 * - Sem `sessaoId`: pega a sessão aberta mais recente (filtra por `terminalId` se informado).
 */
export async function resolveSessaoCaixaAberta(
  storeId: string,
  opts?: { sessaoId?: string; terminalId?: string },
): Promise<{ id: string } | null> {
  const sid = (storeId || "").trim()
  if (!sid) return null

  const sessaoId = opts?.sessaoId?.trim()
  if (sessaoId) {
    return prisma.sessaoCaixa.findFirst({
      where: { id: sessaoId, storeId: sid, status: "ABERTA" },
      select: { id: true },
    })
  }

  const terminalId = opts?.terminalId?.trim()
  return prisma.sessaoCaixa.findFirst({
    where: { storeId: sid, status: "ABERTA", ...(terminalId ? { terminalId } : {}) },
    orderBy: { abertaEm: "desc" },
    select: { id: true },
  })
}

export async function registrarRecebimentoCrSeCaixaAberto(
  input: RegistrarRecebimentoCrInput,
): Promise<RegistrarRecebimentoCrResult> {
  try {
    const storeId = (input.storeId || "").trim()
    if (!storeId) return { vinculado: false, motivo: "erro" }

    const valor = money(input.valor)
    if (!(valor > 0)) return { vinculado: false, motivo: "valor_invalido" }

    const sessao = await resolveSessaoCaixaAberta(storeId, {
      sessaoId: input.sessaoId,
      terminalId: input.terminalId,
    })
    if (!sessao) return { vinculado: false, motivo: "sem_caixa_aberto" }

    const idemKey = (input.idempotencyKey || "").trim()
    const localId = `rc-caixa:${storeId}:${idemKey || `${input.localKey ?? input.tituloId ?? "?"}:${valor}`}`

    // Idempotência: não duplica a operação para o mesmo recebimento (retry / clique duplo).
    const existing = await prisma.caixaOperacao.findFirst({
      where: { storeId, tipo: "recebimento_cr", payload: { path: ["localId"], equals: localId } },
      select: { id: true, sessaoId: true },
    })
    if (existing) return { vinculado: true, sessaoId: existing.sessaoId, jaRegistrado: true }

    const forma = ((input.formaPagamento || "dinheiro").trim().toLowerCase()) || "dinheiro"
    const origem = (input.origem || "financeiro").trim() || "financeiro"
    const ref = (input.cliente?.trim() || input.descricao?.trim() || "Recebimento").slice(0, 180)

    await prisma.caixaOperacao.create({
      data: {
        sessaoId: sessao.id,
        storeId,
        tipo: "recebimento_cr",
        valor,
        motivo: `Recebimento CR — ${ref} (${forma})`,
        operador: (input.operador || "").trim(),
        payload: {
          localId,
          origem,
          formaPagamento: forma,
          ...(input.tituloId ? { tituloId: input.tituloId } : {}),
          ...(input.localKey ? { localKey: input.localKey } : {}),
        } as Prisma.InputJsonValue,
      },
    })

    return { vinculado: true, sessaoId: sessao.id, jaRegistrado: false }
  } catch (e) {
    console.error(
      "[registrarRecebimentoCrSeCaixaAberto]",
      e instanceof Error ? e.message : String(e),
    )
    return { vinculado: false, motivo: "erro" }
  }
}
