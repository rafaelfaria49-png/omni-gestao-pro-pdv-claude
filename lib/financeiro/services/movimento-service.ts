import { FINANCEIRO_ORIGEM, type FinanceiroOrigem } from "@/lib/financeiro/contracts/origem"
import { MOVIMENTO_STATUS, normalizeMovimentoStatus } from "@/lib/financeiro/contracts/status"
import { safeMoney } from "@/lib/financeiro/contracts/valores"
import { buildMovimentoLocalKey } from "@/lib/financeiro/contracts/local-key"
import type { Movimento, MovimentoBuildInput, MovimentoTipo } from "@/lib/financeiro/types/movimento"

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `mov-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function buildMovimentoInput(input: MovimentoBuildInput & { descricao?: string; referencia?: string; localKey?: string }): Omit<Movimento, "id" | "createdAt"> {
  const descricao = (input.descricao ?? "").trim() || "Movimento"
  const referencia = (input.referencia ?? "").trim() || "sem-referencia"
  const localKey =
    input.localKey?.trim() ||
    buildMovimentoLocalKey(input.storeId, (input.origem as string) || FINANCEIRO_ORIGEM.SISTEMA, referencia)

  const statusRaw = input.status ?? MOVIMENTO_STATUS.PREVISTO
  const statusNorm = normalizeMovimentoStatus(String(statusRaw)) ?? String(statusRaw)

  return {
    storeId: input.storeId,
    tipo: input.tipo,
    status: statusNorm,
    origem: input.origem ?? FINANCEIRO_ORIGEM.SISTEMA,
    valor: safeMoney(input.valor),
    descricao,
    referencia,
    localKey,
    carteiraId: input.carteiraId,
  }
}

export function normalizeMovimento(m: Movimento): Movimento {
  const st = normalizeMovimentoStatus(m.status) ?? m.status
  return {
    ...m,
    status: st,
    valor: safeMoney(m.valor),
    descricao: m.descricao.trim(),
    referencia: m.referencia.trim(),
    localKey: m.localKey.trim(),
  }
}

export function isMovimentoConfirmado(m: Pick<Movimento, "status">): boolean {
  return normalizeMovimentoStatus(m.status) === MOVIMENTO_STATUS.CONFIRMADO
}

export function canReverseMovimento(m: Pick<Movimento, "status">): boolean {
  const s = normalizeMovimentoStatus(m.status)
  return s === MOVIMENTO_STATUS.CONFIRMADO
}

export function finalizeMovimentoDraft(draft: ReturnType<typeof buildMovimentoInput>): Movimento {
  return {
    ...draft,
    id: newId(),
    createdAt: new Date().toISOString(),
  }
}

/**
 * Projeta um movimento futuro a partir de um título a receber materializado (ex.: após adapter OS).
 * Não persiste nada — apenas estrutura para integração futura OS/PDV → caixa.
 */
export function buildMovimentoFromContaReceber(params: {
  conta: {
    storeId: string
    localKey: string
    valor: number
    descricao: string
    cliente?: string
  }
  carteiraId: string
  /** Quando a receita for creditada de fato (baixa); até lá permanece previsto. */
  status?: typeof MOVIMENTO_STATUS.PREVISTO | typeof MOVIMENTO_STATUS.CONFIRMADO
  tipo?: MovimentoTipo
  /** Padrão OS; usar `pdv` para título originado no PDV à prazo. */
  origem?: FinanceiroOrigem
}): Movimento {
  const origem = params.origem ?? FINANCEIRO_ORIGEM.OS
  const status = params.status ?? MOVIMENTO_STATUS.PREVISTO
  const tipo = params.tipo ?? "entrada"
  const draft = buildMovimentoInput({
    storeId: params.conta.storeId,
    tipo,
    valor: params.conta.valor,
    carteiraId: params.carteiraId,
    origem,
    status,
    descricao: params.conta.descricao,
    referencia: params.conta.localKey,
    localKey: buildMovimentoLocalKey(params.conta.storeId, origem, `cr:${params.conta.localKey}`),
  })
  const nomeCliente = (params.conta.cliente ?? "").trim()
  const descricaoFinal = nomeCliente ? `${draft.descricao} · ${nomeCliente}` : draft.descricao
  return finalizeMovimentoDraft({ ...draft, descricao: descricaoFinal })
}
