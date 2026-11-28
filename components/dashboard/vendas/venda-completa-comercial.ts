/**
 * Venda Completa Enterprise — lógica comercial PURA (OMNI-COMMERCIAL-ENTERPRISE-EVOLUTION-001 · ADR-0026).
 *
 * - Características da venda NÃO são excludentes (crediário da loja ≠ cartão de crédito parcelado;
 *   garantia, pagamento misto, retroativa, brinde e "originada de orçamento" convivem).
 * - `buildComercialPayload` monta `sale.comercial` ({ retroativa?, brindes? }) espelhando a validação do
 *   servidor (`lib/comercial/venda/contrato.ts`) — o servidor continua sendo a autoridade.
 *
 * Sem React, sem I/O: testável em `venda-completa-comercial.test.ts`.
 */
import { diaCivilValidoV3, hojeNaLojaV3, somarDiasCivisV3 } from "@/lib/operacoes-v3/datas-operacionais-model"
import { RETROACTIVE_SALE_LIMIT_DEFAULT_DAYS, RETROACTIVE_SALE_LIMIT_MAX_DAYS } from "@/lib/capabilities-persistence-v1"
import type { SaleComercialRequest } from "@/lib/operations-store"

export const FUSO_COMERCIAL = "America/Sao_Paulo"

export const RETROATIVA_CENARIO_A_TEXTO =
  "A venda será registrada hoje, no caixa de hoje. A data efetiva vale para a competência comercial (relatório comercial); recebimento e garantia contam a partir de hoje, sem reduzir o prazo do consumidor."

export const JUSTIFICATIVA_MIN = 10
export const JUSTIFICATIVA_MAX = 300
export const BRINDE_MOTIVO_MIN = 3
export const BRINDE_MOTIVO_MAX = 160

/** Marca de brinde numa linha do carrinho (preço original guardado para desfazer). */
export type BrindeLinha = { motivo: string; precoOriginal: number; descontoOriginal: number }

/** Recorte da linha do carrinho que a lógica comercial precisa. */
export type ComercialCartLine = {
  lineId: string
  isAvulso?: boolean
  /** Aparelho individualizado (IMEI). */
  isAparelho?: boolean
  /** Serviço (não é produto de estoque). */
  isServico?: boolean
  garantiaDias?: number
  brinde?: BrindeLinha
}

export type RetroativaForm = {
  ativa: boolean
  dataEfetivaVenda: string
  dataEfetivaEntrega: string
  justificativa: string
}

export const RETROATIVA_FORM_VAZIA: RetroativaForm = {
  ativa: false,
  dataEfetivaVenda: "",
  dataEfetivaEntrega: "",
  justificativa: "",
}

/** Lê a retroativa de um rascunho local (dado não confiável): forma inválida = nada. */
export function retroativaFormDoRascunho(raw: unknown): RetroativaForm | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const s = (v: unknown) => (typeof v === "string" ? v : "")
  return {
    ativa: o.ativa === true,
    dataEfetivaVenda: s(o.dataEfetivaVenda).slice(0, 10),
    dataEfetivaEntrega: s(o.dataEfetivaEntrega).slice(0, 10),
    justificativa: s(o.justificativa).slice(0, JUSTIFICATIVA_MAX),
  }
}

export type ComercialFalha = { ok: false; error: string; field?: string }

// ── Brindes ──────────────────────────────────────────────────────────────────

/** Brinde só em produto do estoque: nunca avulso, aparelho por IMEI ou serviço. */
export function linhaPodeSerBrinde(line: Pick<ComercialCartLine, "isAvulso" | "isAparelho" | "isServico">): boolean {
  return line.isAvulso !== true && line.isAparelho !== true && line.isServico !== true
}

/** Liga o brinde: preço 0 e desconto 0, guardando os originais. Idempotente. */
export function aplicarBrinde<T extends { price: number; discountPct: number; brinde?: BrindeLinha }>(line: T): T {
  if (line.brinde) return line
  return { ...line, price: 0, discountPct: 0, brinde: { motivo: "", precoOriginal: line.price, descontoOriginal: line.discountPct } }
}

/** Desliga o brinde: restaura preço e desconto originais. */
export function removerBrinde<T extends { price: number; discountPct: number; brinde?: BrindeLinha }>(line: T): T {
  if (!line.brinde) return line
  const { brinde, ...rest } = line
  return { ...(rest as T), price: brinde.precoOriginal, discountPct: brinde.descontoOriginal }
}

// ── Retroativa ───────────────────────────────────────────────────────────────

/** `limiteDias` do override `sales.retroactive` (null = default do servidor). */
export function limiteDiasDoOverride(override: unknown): number | null {
  if (!override || typeof override !== "object") return null
  const v = (override as { limiteDias?: unknown }).limiteDias
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

/** Mesmo clamp do servidor: [1, 365], default 30. */
export function limiteDiasEfetivo(limiteDias: number | null | undefined): number {
  return Math.min(Math.max(limiteDias ?? RETROACTIVE_SALE_LIMIT_DEFAULT_DAYS, 1), RETROACTIVE_SALE_LIMIT_MAX_DAYS)
}

/** Faixa aceita no fuso da loja: venda em [hoje − limite, ontem]; entrega até hoje. */
export function limitesRetroativa(agora: Date, limiteDias: number | null | undefined) {
  const hoje = hojeNaLojaV3(agora, FUSO_COMERCIAL)
  const limite = limiteDiasEfetivo(limiteDias)
  return { hoje, ontem: somarDiasCivisV3(hoje, -1), minVenda: somarDiasCivisV3(hoje, -limite), limiteDias: limite }
}

export function validarRetroativa(
  form: RetroativaForm,
  agora: Date,
  limiteDias: number | null | undefined,
): { ok: true; retroativa: NonNullable<SaleComercialRequest["retroativa"]> } | ComercialFalha {
  const { hoje, minVenda, limiteDias: limite } = limitesRetroativa(agora, limiteDias)
  const venda = form.dataEfetivaVenda.trim()
  if (!diaCivilValidoV3(venda)) return { ok: false, error: "Informe a data efetiva da venda.", field: "dataEfetivaVenda" }
  if (venda >= hoje) {
    return { ok: false, error: "A data efetiva precisa ser anterior a hoje. Para hoje, registre a venda normalmente.", field: "dataEfetivaVenda" }
  }
  if (venda < minVenda) return { ok: false, error: `A loja permite registrar vendas de até ${limite} dias atrás.`, field: "dataEfetivaVenda" }
  const entrega = form.dataEfetivaEntrega.trim()
  if (entrega && (!diaCivilValidoV3(entrega) || entrega < venda || entrega > hoje)) {
    return { ok: false, error: "A entrega efetiva deve estar entre a data da venda e hoje.", field: "dataEfetivaEntrega" }
  }
  const justificativa = form.justificativa.trim().slice(0, JUSTIFICATIVA_MAX)
  if (justificativa.length < JUSTIFICATIVA_MIN) {
    return { ok: false, error: `Justifique o registro retroativo (mínimo ${JUSTIFICATIVA_MIN} caracteres).`, field: "justificativa" }
  }
  return {
    ok: true,
    retroativa: {
      // Cenário A apenas: a UI não move a venda para um caixa antigo (regularização é só via API).
      modo: "pagamento_hoje",
      dataEfetivaVenda: venda,
      ...(entrega ? { dataEfetivaEntrega: entrega } : {}),
      justificativa,
    },
  }
}

// ── Payload ──────────────────────────────────────────────────────────────────

export type BuildComercialInput = {
  cart: readonly ComercialCartLine[]
  /** `lineId` de cada linha EXATAMENTE na ordem do `saleLines` enviado ao motor. */
  sentLineIds: readonly string[]
  /** `unitPrice` de cada linha enviada (mesma ordem de `sentLineIds`). */
  sentUnitPrices: readonly number[]
  retroativa: RetroativaForm
  recursos: { retroativa: boolean; brindes: boolean }
  podeRetroativa: boolean
  agora: Date
  limiteDias: number | null | undefined
}

/**
 * `sale.comercial` da venda, ou `undefined` (venda comum: nenhum campo novo no corpo).
 * `lineIndex` aponta para o índice da linha no `saleLines` REALMENTE enviado.
 */
export function buildComercialPayload(input: BuildComercialInput): { ok: true; comercial?: SaleComercialRequest } | ComercialFalha {
  const comercial: SaleComercialRequest = {}

  const comBrinde = input.cart.filter((l) => l.brinde)
  if (comBrinde.length > 0) {
    if (!input.recursos.brindes) return { ok: false, error: "Brindes estão desligados nesta unidade. Remova a marcação de brinde." }
    const brindes: NonNullable<SaleComercialRequest["brindes"]> = []
    for (const line of comBrinde) {
      if (!linhaPodeSerBrinde(line)) {
        return { ok: false, error: "Brinde precisa ser um produto do estoque (não avulso, serviço nem aparelho por IMEI).", field: "brindes" }
      }
      const motivo = (line.brinde?.motivo ?? "").trim().slice(0, BRINDE_MOTIVO_MAX)
      if (motivo.length < BRINDE_MOTIVO_MIN) return { ok: false, error: "Informe o motivo do brinde (mínimo 3 caracteres).", field: "brindes" }
      const lineIndex = input.sentLineIds.indexOf(line.lineId)
      if (lineIndex < 0) return { ok: false, error: "Linha do brinde não está entre os itens enviados.", field: "brindes" }
      if (input.sentUnitPrices[lineIndex] !== 0) {
        return { ok: false, error: "Brinde é entregue sem cobrança: o preço da linha deve ser zero.", field: "brindes" }
      }
      brindes.push({ lineIndex, motivo })
    }
    comercial.brindes = brindes
  }

  if (input.retroativa.ativa) {
    if (!input.recursos.retroativa) return { ok: false, error: "Venda retroativa está desligada nesta unidade." }
    if (!input.podeRetroativa) return { ok: false, error: "Somente gerente ou proprietário registra venda retroativa." }
    const r = validarRetroativa(input.retroativa, input.agora, input.limiteDias)
    if (!r.ok) return r
    comercial.retroativa = r.retroativa
  }

  return comercial.brindes || comercial.retroativa ? { ok: true, comercial } : { ok: true }
}

// ── Características (chips) ─────────────────────────────────────────────────

export type CaracteristicasVendaCompleta = {
  crediarioLoja: boolean
  cartaoCredito: boolean
  comGarantia: boolean
  pagamentoMisto: boolean
  retroativa: boolean
  comBrinde: boolean
  origemOrcamento: boolean
}

export function derivarCaracteristicas(input: {
  cart: readonly ComercialCartLine[]
  /** Formas de pagamento (vazio antes do modal de pagamento). */
  payments: readonly { type: string; value: number }[]
  retroativa: boolean
  origemOrcamento: boolean
}): CaracteristicasVendaCompleta {
  const pagas = input.payments.filter((p) => Number.isFinite(p.value) && p.value > 0)
  const tipos = new Set(pagas.map((p) => p.type))
  return {
    // Crediário da loja (a prazo/carnê) NUNCA se confunde com parcelamento no cartão.
    crediarioLoja: tipos.has("a_prazo") || tipos.has("carne"),
    cartaoCredito: tipos.has("cartao_credito"),
    comGarantia: input.cart.some((l) => l.isAparelho === true || (l.garantiaDias ?? 0) > 0),
    pagamentoMisto: tipos.size > 1,
    retroativa: input.retroativa,
    comBrinde: input.cart.some((l) => !!l.brinde),
    origemOrcamento: input.origemOrcamento,
  }
}

const ROTULOS: { key: keyof CaracteristicasVendaCompleta; label: string }[] = [
  { key: "crediarioLoja", label: "A prazo (crediário da loja)" },
  { key: "cartaoCredito", label: "Cartão de crédito" },
  { key: "pagamentoMisto", label: "Pagamento misto" },
  { key: "comGarantia", label: "Com garantia" },
  { key: "retroativa", label: "Retroativa" },
  { key: "comBrinde", label: "Com brinde" },
  { key: "origemOrcamento", label: "Originada de orçamento" },
]

export function rotulosCaracteristicas(c: CaracteristicasVendaCompleta): string[] {
  return ROTULOS.filter((r) => c[r.key]).map((r) => r.label)
}

/** `YYYY-MM-DD` → `DD/MM/AAAA` (texto cru quando inválido). */
export function diaBr(dia: string): string {
  return diaCivilValidoV3(dia) ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}` : dia
}

/** Rótulo do cupom (o antigo "Tipo"): características combinadas; ausente = venda comum. */
export function rotuloTipoCupom(c: CaracteristicasVendaCompleta, dataEfetivaVenda?: string): string | undefined {
  const r = rotulosCaracteristicas(c).map((label) =>
    label === "Retroativa" && dataEfetivaVenda ? `Retroativa (data efetiva ${diaBr(dataEfetivaVenda)})` : label,
  )
  return r.length > 0 ? r.join(" · ") : undefined
}

/** Compat com `payload.enterprise.tipoVenda` legado ("comum" | "garantia" | "a_prazo" | "orcamento"). */
export function tipoVendaLegado(c: CaracteristicasVendaCompleta): "comum" | "garantia" | "a_prazo" | "orcamento" {
  if (c.origemOrcamento) return "orcamento"
  if (c.crediarioLoja) return "a_prazo"
  if (c.comGarantia) return "garantia"
  return "comum"
}
