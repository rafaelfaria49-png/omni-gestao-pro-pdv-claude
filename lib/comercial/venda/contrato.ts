/**
 * Contrato comercial da venda — `Venda.payload.comercial` (OMNI-COMMERCIAL-ENTERPRISE-EVOLUTION-001 · ADR-0026).
 *
 * O cliente NUNCA é autoridade deste namespace: o motor só grava o que o servidor validou aqui
 * (`UpsertVendaOptions.comercial`); qualquer `comercial` cru do cliente é descartado.
 *
 * Venda retroativa (recurso `sales.retroactive`, permissão de gerente `pdv.cancelarVenda`):
 * - `pagamento_hoje` (cenário A): a venda ocorreu antes, o pagamento acontece AGORA. A venda é
 *   registrada normalmente (data/hora real, caixa aberto de hoje); a data efetiva é atributo
 *   comercial (competência), nunca altera numeração, `Venda.at`, o caixa nem o recebimento.
 * - `regularizacao` (cenário B): venda E pagamento ocorreram na data efetiva. Usa o contrato já
 *   existente do motor de lançar na SESSÃO ORIGINAL FECHADA (sem reabrir caixa), validado aqui:
 *   sessão da loja, fechada e cobrindo o instante informado. Venda com aparelho não regulariza
 *   (a garantia conta da entrega efetiva e o termo exige relógio do servidor).
 * - Cenário C (pagamento já registrado sem venda) e D (aparelho vendido antes da implantação) NÃO
 *   são aceitos por este contrato: exigem vínculo financeiro explícito (fail-closed).
 *
 * Brindes (recurso `sales.gifts`): linha da venda com preço ZERO, produto do estoque, motivo.
 * Baixa de estoque e custo histórico vêm do motor canônico (saída do ledger pelo custo médio);
 * não há receita fictícia.
 */
import {
  diaCivilValidoV3, diaNaLojaV3, fimDoDiaLojaIsoV3, hojeNaLojaV3, inicioDoDiaLojaIsoV3, somarDiasCivisV3,
} from "@/lib/operacoes-v3/datas-operacionais-model"
import { RETROACTIVE_SALE_LIMIT_DEFAULT_DAYS, RETROACTIVE_SALE_LIMIT_MAX_DAYS } from "@/lib/capabilities-persistence-v1"

export const FUSO_LOJA_COMERCIAL = "America/Sao_Paulo"

export type ModoRetroativa = "pagamento_hoje" | "regularizacao"

export type RetroativaV1 = {
  modo: ModoRetroativa
  dataEfetivaVenda: string
  dataEfetivaEntrega: string
  justificativa: string
  limiteDias: number
  /** Servidor: instante real do registro (imutável) e operador autenticado. */
  registradoEm: string
  operador: string
  fuso: string
  /** Só em regularizacao: sessão original fechada validada. */
  sessaoOriginalId?: string
}

export type BrindeV1 = { lineIndex: number; motivo: string; produtoRef: string; quantidade: number }

export type CaracteristicasV1 = {
  aPrazo: boolean
  crediarioLoja: boolean
  cartaoCredito: boolean
  comGarantia: boolean
  pagamentoMisto: boolean
  retroativa: boolean
  comBrinde: boolean
}

export type ComercialVendaV1 = {
  versao: 1
  caracteristicas: CaracteristicasV1
  retroativa?: RetroativaV1
  brindes?: BrindeV1[]
}

export type ComercialFail = { ok: false; status: number; code: string; error: string; field?: string }

/**
 * Recusas ESTRUTURAIS do contrato comercial: dependem só do conteúdo da venda (nunca do relógio,
 * da sessão do operador ou de flag). A rota confere o replay ANTES de validar (revisão P1-2), então
 * uma venda já gravada nunca recebe estas recusas — o classificador as trata como REJECTED.
 */
export const COMERCIAL_REJECTION_CODES = [
  "COMERCIAL_INVALIDO",
  "BRINDES_INVALIDOS", "BRINDE_LINHA_INVALIDA", "BRINDE_MOTIVO_OBRIGATORIO",
  "BRINDE_COM_PRECO", "BRINDE_AVULSO", "BRINDE_APARELHO", "BRINDE_SEM_PRODUTO",
  "RETROATIVA_MODO_INVALIDO", "RETROATIVA_DATA_INVALIDA", "RETROATIVA_NAO_PASSADA", "RETROATIVA_JUSTIFICATIVA",
  "RETROATIVA_APARELHO", "RETROATIVA_HORARIO",
  "REGULARIZACAO_SEM_SESSAO", "REGULARIZACAO_HORARIO", "REGULARIZACAO_FORA_DA_SESSAO",
] as const

/**
 * Recusas CONTEXTUAIS: dependem do dia, da permissão de quem envia, de flag ou do estado da sessão.
 * Só encerram (FAILED) a finalização AO VIVO de identidade criada agora; no reenvio automático ficam
 * pendentes com ação do operador (nunca "recusada" de uma venda que pode já ter sido gravada).
 */
export const COMERCIAL_CONTEXTUAL_REJECTION_CODES = [
  "BRINDES_DESATIVADOS", "RETROATIVA_DESATIVADA", "RETROATIVA_SEM_PERMISSAO",
  "RETROATIVA_FORA_DO_LIMITE", "RETROATIVA_ENTREGA_INVALIDA", "REGULARIZACAO_SESSAO_ABERTA",
] as const
const nope = (status: number, code: string, error: string, field?: string): ComercialFail => ({ ok: false, status, code, error, ...(field ? { field } : {}) })

type LinhaLike = {
  inventoryId?: unknown
  produtoId?: unknown
  quantity?: unknown
  unitPrice?: unknown
  isAvulso?: unknown
  deviceSale?: unknown
  warrantyDays?: unknown
}
type SaleLike = {
  at?: unknown
  sessaoId?: unknown
  lines?: unknown
  paymentBreakdown?: Record<string, unknown> | null
  comercial?: unknown
}

export type ContextoComercial = {
  agora: Date
  operador: string
  /** Recursos já resolvidos (operacionais) da loja. */
  recursos: { retroativa: boolean; brindes: boolean }
  limiteDias: number | null
  /** Permissão de gerente para retroativa (pdv.cancelarVenda). */
  podeRetroativa: boolean
  /** Sessão de caixa informada pela venda (lida pelo servidor), quando houver. */
  sessao: { id: string; status: string; abertaEm: Date; fechadaEm: Date | null } | null
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v ?? 0) || 0)

export function caracteristicasDaVenda(sale: SaleLike, extra: { retroativa: boolean; comBrinde: boolean }): CaracteristicasV1 {
  const pb = sale.paymentBreakdown ?? {}
  const formas = ["dinheiro", "pix", "cartaoDebito", "cartaoCredito", "aPrazo", "carne", "creditoVale"].filter((k) => num(pb[k]) > 0)
  const lines = Array.isArray(sale.lines) ? (sale.lines as LinhaLike[]) : []
  return {
    // Crediário da loja (a prazo/carnê) NUNCA se confunde com parcelamento no cartão.
    aPrazo: num(pb.aPrazo) > 0 || num(pb.carne) > 0,
    crediarioLoja: num(pb.aPrazo) > 0 || num(pb.carne) > 0,
    cartaoCredito: num(pb.cartaoCredito) > 0,
    comGarantia: lines.some((l) => num(l.warrantyDays) > 0 || (l.deviceSale !== undefined && l.deviceSale !== null)),
    pagamentoMisto: formas.length > 1,
    retroativa: extra.retroativa,
    comBrinde: extra.comBrinde,
  }
}

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}

/**
 * Valida o `comercial` enviado pelo cliente e devolve o objeto CANÔNICO (com campos do servidor).
 * Sem `comercial` no pedido → só características derivadas (nunca falha).
 */
export function validarComercialVenda(sale: SaleLike, ctx: ContextoComercial):
  | { ok: true; comercial: ComercialVendaV1; allowClosedOriginalSession: boolean }
  | ComercialFail {
  const raw = sale.comercial
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  if (raw !== undefined && raw !== null && (typeof raw !== "object" || Array.isArray(raw))) {
    return nope(400, "COMERCIAL_INVALIDO", "Dados comerciais da venda inválidos.")
  }
  const lines = Array.isArray(sale.lines) ? (sale.lines as LinhaLike[]) : []

  // ── Brindes ──
  let brindes: BrindeV1[] | undefined
  if (r.brindes !== undefined) {
    if (!ctx.recursos.brindes) return nope(403, "BRINDES_DESATIVADOS", "Brindes estão desligados nesta unidade. Ative em Configurações → Ramo e recursos.")
    if (!Array.isArray(r.brindes) || r.brindes.length === 0 || r.brindes.length > 50) return nope(400, "BRINDES_INVALIDOS", "Lista de brindes inválida.", "comercial.brindes")
    const vistos = new Set<number>()
    brindes = []
    for (const b of r.brindes as unknown[]) {
      const o = (b && typeof b === "object" ? b : {}) as Record<string, unknown>
      const idx = o.lineIndex
      if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= lines.length || vistos.has(idx)) {
        return nope(400, "BRINDE_LINHA_INVALIDA", "Brinde aponta para uma linha inexistente ou repetida.", "comercial.brindes")
      }
      vistos.add(idx)
      const line = lines[idx]
      const motivo = texto(o.motivo, 160)
      if (motivo.length < 3) return nope(400, "BRINDE_MOTIVO_OBRIGATORIO", "Informe o motivo do brinde.", "comercial.brindes")
      if (num(line.unitPrice) !== 0) return nope(422, "BRINDE_COM_PRECO", "Brinde é entregue sem cobrança: o preço da linha deve ser zero.", "comercial.brindes")
      if (line.isAvulso === true) return nope(422, "BRINDE_AVULSO", "Brinde precisa ser um produto do estoque (custo e baixa rastreáveis).", "comercial.brindes")
      if (line.deviceSale !== undefined && line.deviceSale !== null) return nope(422, "BRINDE_APARELHO", "Aparelho por IMEI não pode ser brinde.", "comercial.brindes")
      const produtoRef = texto(line.produtoId, 64) || texto(line.inventoryId, 64)
      if (!produtoRef) return nope(422, "BRINDE_SEM_PRODUTO", "Brinde sem produto identificado.", "comercial.brindes")
      brindes.push({ lineIndex: idx, motivo, produtoRef, quantidade: Math.max(1, Math.trunc(num(line.quantity))) })
    }
  }

  // ── Retroativa ──
  let retroativa: RetroativaV1 | undefined
  let allowClosedOriginalSession = false
  if (r.retroativa !== undefined) {
    if (!ctx.recursos.retroativa) return nope(403, "RETROATIVA_DESATIVADA", "Venda retroativa está desligada nesta unidade. Ative em Configurações → Ramo e recursos.")
    if (!ctx.podeRetroativa) return nope(403, "RETROATIVA_SEM_PERMISSAO", "Somente gerente ou proprietário registra venda retroativa.")
    const o = (r.retroativa && typeof r.retroativa === "object" ? r.retroativa : {}) as Record<string, unknown>
    const modo = o.modo === "regularizacao" ? "regularizacao" : o.modo === "pagamento_hoje" ? "pagamento_hoje" : null
    if (!modo) return nope(400, "RETROATIVA_MODO_INVALIDO", "Informe se o pagamento é hoje ou se a venda já foi paga na data efetiva.", "comercial.retroativa.modo")
    const hoje = hojeNaLojaV3(ctx.agora, FUSO_LOJA_COMERCIAL)
    const limiteDias = Math.min(Math.max(ctx.limiteDias ?? RETROACTIVE_SALE_LIMIT_DEFAULT_DAYS, 1), RETROACTIVE_SALE_LIMIT_MAX_DAYS)
    const dataEfetivaVenda = texto(o.dataEfetivaVenda, 10)
    if (!diaCivilValidoV3(dataEfetivaVenda)) return nope(400, "RETROATIVA_DATA_INVALIDA", "Data efetiva da venda inválida.", "comercial.retroativa.dataEfetivaVenda")
    if (dataEfetivaVenda >= hoje) return nope(422, "RETROATIVA_NAO_PASSADA", "A data efetiva precisa ser anterior a hoje. Para hoje, registre a venda normalmente.", "comercial.retroativa.dataEfetivaVenda")
    if (dataEfetivaVenda < somarDiasCivisV3(hoje, -limiteDias)) {
      return nope(422, "RETROATIVA_FORA_DO_LIMITE", `A loja permite registrar vendas de até ${limiteDias} dias atrás.`, "comercial.retroativa.dataEfetivaVenda")
    }
    const entregaRaw = texto(o.dataEfetivaEntrega, 10)
    const dataEfetivaEntrega = entregaRaw || dataEfetivaVenda
    if (!diaCivilValidoV3(dataEfetivaEntrega) || dataEfetivaEntrega < dataEfetivaVenda || dataEfetivaEntrega > hoje) {
      return nope(422, "RETROATIVA_ENTREGA_INVALIDA", "A entrega efetiva deve estar entre a data da venda e hoje.", "comercial.retroativa.dataEfetivaEntrega")
    }
    const justificativa = texto(o.justificativa, 300)
    if (justificativa.length < 10) return nope(400, "RETROATIVA_JUSTIFICATIVA", "Justifique o registro retroativo (mínimo 10 caracteres).", "comercial.retroativa.justificativa")
    const temAparelho = lines.some((l) => l.deviceSale !== undefined && l.deviceSale !== null)
    retroativa = {
      modo, dataEfetivaVenda, dataEfetivaEntrega, justificativa, limiteDias,
      registradoEm: ctx.agora.toISOString(), operador: ctx.operador, fuso: FUSO_LOJA_COMERCIAL,
    }
    if (modo === "regularizacao") {
      if (temAparelho) return nope(422, "RETROATIVA_APARELHO", "Venda de aparelho não é regularizada em caixa antigo: registre com pagamento hoje (a garantia conta da entrega efetiva).")
      const s = ctx.sessao
      if (!s) return nope(422, "REGULARIZACAO_SEM_SESSAO", "Selecione a sessão de caixa em que a venda foi recebida.", "sessaoId")
      if (s.status !== "FECHADA" || !s.fechadaEm) return nope(422, "REGULARIZACAO_SESSAO_ABERTA", "A regularização usa a sessão original já fechada. Para pagamento hoje, use \"pagamento hoje\".", "sessaoId")
      const at = typeof sale.at === "string" ? new Date(sale.at) : null
      if (!at || Number.isNaN(at.getTime())) return nope(400, "REGULARIZACAO_HORARIO", "Informe o horário original da venda.", "at")
      if (diaNaLojaV3(at.toISOString(), FUSO_LOJA_COMERCIAL) !== dataEfetivaVenda) {
        return nope(422, "REGULARIZACAO_HORARIO", "O horário informado não pertence à data efetiva da venda.", "at")
      }
      if (at.getTime() < s.abertaEm.getTime() || at.getTime() > s.fechadaEm.getTime()) {
        return nope(422, "REGULARIZACAO_FORA_DA_SESSAO", "O horário informado está fora do período da sessão de caixa selecionada.", "at")
      }
      // Coerência extra: a sessão precisa ser do dia (início/fim do dia civil na loja).
      const inicio = Date.parse(inicioDoDiaLojaIsoV3(dataEfetivaVenda, FUSO_LOJA_COMERCIAL))
      const fim = Date.parse(fimDoDiaLojaIsoV3(dataEfetivaVenda, FUSO_LOJA_COMERCIAL))
      if (!(s.fechadaEm.getTime() >= inicio && s.abertaEm.getTime() <= fim)) {
        return nope(422, "REGULARIZACAO_FORA_DA_SESSAO", "A sessão selecionada não cobre a data efetiva.", "sessaoId")
      }
      retroativa.sessaoOriginalId = s.id
      allowClosedOriginalSession = true
    } else {
      // Cenário A: a venda é registrada AGORA; a data efetiva é só competência comercial.
      const at = typeof sale.at === "string" ? new Date(sale.at) : null
      if (at && !Number.isNaN(at.getTime()) && diaNaLojaV3(at.toISOString(), FUSO_LOJA_COMERCIAL) < dataEfetivaVenda) {
        return nope(422, "RETROATIVA_HORARIO", "O registro não pode ser anterior à data efetiva.")
      }
    }
  }

  const comercial: ComercialVendaV1 = {
    versao: 1,
    caracteristicas: caracteristicasDaVenda(sale, { retroativa: !!retroativa, comBrinde: !!brindes?.length }),
    ...(retroativa ? { retroativa } : {}),
    ...(brindes ? { brindes } : {}),
  }
  return { ok: true, comercial, allowClosedOriginalSession }
}

/** Data de competência comercial da venda: efetiva (retroativa) ou o dia do registro. */
export function dataCompetenciaComercial(payload: unknown, at: Date): string {
  const c = (payload && typeof payload === "object" ? (payload as { comercial?: ComercialVendaV1 }).comercial : undefined)
  const efetiva = c?.versao === 1 ? c.retroativa?.dataEfetivaVenda : undefined
  return efetiva && diaCivilValidoV3(efetiva) ? efetiva : diaNaLojaV3(at.toISOString(), FUSO_LOJA_COMERCIAL)
}
