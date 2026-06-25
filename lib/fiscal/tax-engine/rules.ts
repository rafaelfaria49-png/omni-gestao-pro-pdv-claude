/**
 * Regras tributárias do Motor (Tax Engine) — Fase F2.
 *
 * Camada que ENCAPSULA a lei: dado o regime + identidade fiscal do item (CSOSN/CST) + a base
 * tributável, decide a situação e os valores de cada imposto. É AQUI que a expansão acontece
 * (regime normal/CST, ST, interestadual) sem tocar o calculador.
 *
 * Baseline F2 — Simples Nacional, NFC-e, consumidor final, operação interna, SEM ST:
 *   - ICMS: CSOSN 102 (e 103/300/400) → NÃO destacado (o imposto está no DAS). CSOSN 101 →
 *     crédito do Simples (pCredSN/vCredICMSSN) informativo, ICMS próprio não destacado.
 *   - PIS/COFINS: recolhidos no DAS → NÃO destacados na NFC-e (CST 49 "Outras operações de saída").
 *
 * Isto NÃO é mock: é o tratamento fiscal correto do Simples Nacional. Destacar ICMS/PIS/COFINS
 * numa NFC-e CSOSN 102 seria ERRADO (e gera rejeição/passivo). O destaque (situacao "tributado")
 * só existe para o caminho de expansão (regime normal), hoje barrado pelos validators.
 */
import type { RoundingConfig, TaxComponentResult, TaxIcmsResult, TaxRegime } from "./types"
import { applyAliquota, num, onlyDigits } from "./helpers"
import { roundMoney, roundRate } from "./rounding"

/** Regimes da "família Simples" suportados no baseline F2. */
const SIMPLES_REGIMES = new Set<TaxRegime>(["SIMPLES_NACIONAL", "SIMPLES_NACIONAL_EXCESSO"])

/** CSOSN sem destaque de ICMS (imposto no DAS). */
const CSOSN_NAO_DESTACADO = new Set<string>(["102"])
/** CSOSN isento/imune/não tributada. */
const CSOSN_ISENTO = new Set<string>(["103", "300", "400"])
/** CSOSN com permissão de crédito do Simples. */
const CSOSN_CREDITO = new Set<string>(["101"])
/** CSOSN que envolvem Substituição Tributária — FORA do escopo F2. */
const CSOSN_COM_ST = new Set<string>(["201", "202", "203", "500", "900"])

/** CST de PIS/COFINS para saída do Simples (não destacado). */
const CST_PIS_COFINS_SIMPLES = "49"

/** CSOSN default quando o item não traz um (Simples, venda tributada sem crédito). */
export const CSOSN_DEFAULT_SIMPLES = "102"

export function isSimplesRegime(regime: TaxRegime): boolean {
  return SIMPLES_REGIMES.has(regime)
}

export function normalizeCsosn(csosn: string | undefined | null): string {
  const c = onlyDigits(csosn)
  return c || CSOSN_DEFAULT_SIMPLES
}

export function isCsosnComST(csosn: string | undefined | null): boolean {
  return CSOSN_COM_ST.has(normalizeCsosn(csosn))
}

export function isCsosnSuportado(csosn: string | undefined | null): boolean {
  const c = normalizeCsosn(csosn)
  return CSOSN_NAO_DESTACADO.has(c) || CSOSN_ISENTO.has(c) || CSOSN_CREDITO.has(c)
}

export type IcmsRuleInput = {
  regime: TaxRegime
  csosn?: string
  /** Base tributável já composta (bruto − desconto + frete + seguro + outras). */
  valorTributavel: number
  /** % crédito do Simples (CSOSN 101). */
  pCredSN?: number
  cfg: RoundingConfig
}

/**
 * Resolve o ICMS do item. No baseline Simples o ICMS NÃO é destacado (valor 0); CSOSN 101
 * devolve o crédito do Simples (informativo). Mantém o `codigo` (CSOSN) aplicado.
 */
export function resolveIcms(input: IcmsRuleInput): TaxIcmsResult {
  const csosn = normalizeCsosn(input.csosn)
  const base = num(input.valorTributavel)

  if (CSOSN_CREDITO.has(csosn)) {
    const pCredSN = roundRate(num(input.pCredSN), input.cfg)
    const valorCreditoSimples = roundMoney(applyAliquota(base, pCredSN), input.cfg)
    return {
      situacao: "com_credito_simples",
      codigo: csosn,
      baseCalculo: 0, // ICMS próprio não destacado na NFC-e
      aliquota: 0,
      valor: 0,
      pCredSN,
      valorCreditoSimples,
    }
  }

  if (CSOSN_ISENTO.has(csosn)) {
    return {
      situacao: "isento",
      codigo: csosn,
      baseCalculo: 0,
      aliquota: 0,
      valor: 0,
      pCredSN: 0,
      valorCreditoSimples: 0,
    }
  }

  // CSOSN 102 (e default): tributado pelo Simples, sem destaque de ICMS.
  return {
    situacao: "nao_destacado",
    codigo: csosn,
    baseCalculo: 0,
    aliquota: 0,
    valor: 0,
    pCredSN: 0,
    valorCreditoSimples: 0,
  }
}

export type PisCofinsRuleInput = {
  regime: TaxRegime
  valorTributavel: number
  cfg: RoundingConfig
}

/** PIS no Simples: recolhido no DAS → não destacado (CST 49, valor 0). */
export function resolvePis(_input: PisCofinsRuleInput): TaxComponentResult {
  return naoDestacadoPisCofins()
}

/** COFINS no Simples: recolhido no DAS → não destacado (CST 49, valor 0). */
export function resolveCofins(_input: PisCofinsRuleInput): TaxComponentResult {
  return naoDestacadoPisCofins()
}

function naoDestacadoPisCofins(): TaxComponentResult {
  return {
    situacao: "nao_destacado",
    codigo: CST_PIS_COFINS_SIMPLES,
    baseCalculo: 0,
    aliquota: 0,
    valor: 0,
  }
}
