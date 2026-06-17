/**
 * Validadores PUROS das regras de Cliente e Conta a Receber na correção de venda (F3).
 *
 * Não tocam o banco — só decidem. As rotas (`corrigir`, `corrigir-titulo`) executam.
 *
 * Regras cobertas:
 *  - venda à prazo SEMPRE exige cliente;
 *  - não limpar cliente quando há título à prazo aberto;
 *  - título pago/parcial/cancelado/estornado NÃO pode ter cliente trocado nem
 *    vencimento/observação editados aqui (exige fluxo futuro / estorno no Financeiro);
 *  - vencimento informado deve ser DD/MM/YYYY válido.
 */

import { RECEBER_STATUS, normalizeReceberStatus } from "@/lib/financeiro/contracts/status"

const EPS = 0.005

export type ValidationResult = { ok: true } | { ok: false; error: string; code: string }

/** Venda com valor à prazo > 0 exige um cliente (nome) vinculado. */
export function aPrazoExigeCliente(newAPrazo: number, clienteNome: string | null | undefined): ValidationResult {
  const aprazo = Number(newAPrazo) || 0
  if (aprazo <= EPS) return { ok: true }
  const nome = typeof clienteNome === "string" ? clienteNome.trim() : ""
  if (!nome) {
    return {
      ok: false,
      code: "aprazo_sem_cliente",
      error: "Venda à prazo exige um cliente. Vincule um cliente (aba Cliente) antes de lançar saldo a prazo.",
    }
  }
  return { ok: true }
}

/** Não é permitido limpar (desvincular) o cliente quando há título à prazo aberto. */
export function podeLimparCliente(temAPrazoAberto: boolean): ValidationResult {
  if (temAPrazoAberto) {
    return {
      ok: false,
      code: "cliente_obrigatorio_aprazo",
      error: "Esta venda tem saldo a prazo em aberto — não é possível remover o cliente. Troque por outro cliente.",
    }
  }
  return { ok: true }
}

/**
 * Um status de título "encerrado/movimentado" bloqueia edição de cliente/vencimento/observação.
 * Permitido: PENDENTE, VENCIDO. Bloqueado: PAGO, PARCIAL, CANCELADO, ESTORNADO.
 */
export function tituloEditavel(status: string | null | undefined): ValidationResult {
  const st = normalizeReceberStatus(status ?? "")
  if (st === RECEBER_STATUS.PAGO || st === RECEBER_STATUS.PARCIAL) {
    return {
      ok: false,
      code: "titulo_recebido",
      error: "Título já recebido (total/parcial). Estorne o recebimento no Contas a Receber antes de editar.",
    }
  }
  if (st === RECEBER_STATUS.CANCELADO || st === RECEBER_STATUS.ESTORNADO) {
    return { ok: false, code: "titulo_encerrado", error: "Título cancelado/estornado não pode ser editado." }
  }
  return { ok: true }
}

/** Valida e normaliza um vencimento DD/MM/YYYY. */
export function parseVencimentoBr(s: string | null | undefined): { ok: boolean; vencimento?: string; date?: Date; error?: string } {
  const raw = typeof s === "string" ? s.trim() : ""
  if (!raw) return { ok: false, error: "Vencimento obrigatório (DD/MM/AAAA)." }
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return { ok: false, error: "Vencimento inválido. Use DD/MM/AAAA." }
  const dia = Number(m[1])
  const mes = Number(m[2])
  const ano = Number(m[3])
  const d = new Date(ano, mes - 1, dia)
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) {
    return { ok: false, error: "Data de vencimento inexistente." }
  }
  return { ok: true, vencimento: raw, date: d }
}
