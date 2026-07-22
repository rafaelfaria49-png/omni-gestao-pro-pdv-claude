/**
 * Regras tributárias do Motor (Tax Engine) — Fase F2.
 *
 * Camada que ENCAPSULA a lei: dado o regime + identidade fiscal do item (CSOSN/CST) + a base
 * tributável, decide a situação e os valores de cada imposto. É AQUI que a expansão acontece
 * (regime normal/CST, ST, interestadual) sem tocar o calculador.
 *
 * Baseline — Simples Nacional, NFC-e, consumidor final, operação interna:
 *   - ICMS: CSOSN 102 (e 103/300/400) → NÃO destacado (o imposto está no DAS). CSOSN 101 →
 *     crédito do Simples (pCredSN/vCredICMSSN) informativo, ICMS próprio não destacado.
 *   - ST (GOAL-006): CSOSN 500 → ICMS cobrado anteriormente por ST (substituído); ICMS próprio
 *     não destacado, ST retida carregada em `icms.st` (grupo ICMSSN500). 201/202/203/900 bloqueados.
 *   - PIS/COFINS: recolhidos no DAS → NÃO destacados na NFC-e (CST 49 "Outras operações de saída").
 *
 * Isto NÃO é mock: é o tratamento fiscal correto do Simples Nacional. Destacar ICMS/PIS/COFINS
 * numa NFC-e CSOSN 102 seria ERRADO (e gera rejeição/passivo). O destaque (situacao "tributado")
 * só existe para o caminho de expansão (regime normal), hoje barrado pelos validators.
 */
import type { RoundingConfig, TaxComponentResult, TaxIcmsResult, TaxIcmsStFields, TaxRegime } from "./types"
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
/** CSOSN de ST SUPORTADO (GOAL-006): 500 = ICMS já cobrado anteriormente por ST (substituído). */
const CSOSN_ST_SUPORTADO = new Set<string>(["500"])
/** CSOSN de ST/antecipação NÃO suportados — bloqueados explicitamente (trilha futura). */
const CSOSN_ST_NAO_SUPORTADO = new Set<string>(["201", "202", "203", "900"])

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

/** Envolve Substituição Tributária (suportada OU não) — diagnóstico. */
export function isCsosnComST(csosn: string | undefined | null): boolean {
  const c = normalizeCsosn(csosn)
  return CSOSN_ST_SUPORTADO.has(c) || CSOSN_ST_NAO_SUPORTADO.has(c)
}

/** ST suportada pelo motor (CSOSN 500 — substituído). */
export function isCsosnStSuportado(csosn: string | undefined | null): boolean {
  return CSOSN_ST_SUPORTADO.has(normalizeCsosn(csosn))
}

/** ST/antecipação bloqueada (CSOSN 201/202/203/900) — rejeitada com mensagem clara. */
export function isCsosnStNaoSuportado(csosn: string | undefined | null): boolean {
  return CSOSN_ST_NAO_SUPORTADO.has(normalizeCsosn(csosn))
}

export function isCsosnSuportado(csosn: string | undefined | null): boolean {
  const c = normalizeCsosn(csosn)
  return (
    CSOSN_NAO_DESTACADO.has(c) ||
    CSOSN_ISENTO.has(c) ||
    CSOSN_CREDITO.has(c) ||
    CSOSN_ST_SUPORTADO.has(c)
  )
}

export type IcmsRuleInput = {
  regime: TaxRegime
  csosn?: string
  /** Base tributável já composta (bruto − desconto + frete + seguro + outras). */
  valorTributavel: number
  /** % crédito do Simples (CSOSN 101). */
  pCredSN?: number
  /** ST já retida (CSOSN 500) — valores congelados da entrada; o motor normaliza e ecoa. */
  st?: {
    vBCSTRet?: number
    pST?: number
    vICMSSubstituto?: number
    vICMSSTRet?: number
    vBCFCPSTRet?: number
    pFCPSTRet?: number
    vFCPSTRet?: number
    pRedBCEfet?: number
    vBCEfet?: number
    pICMSEfet?: number
    vICMSEfet?: number
  }
  cfg: RoundingConfig
}

/**
 * Normaliza (arredonda) os campos de ST retida do CSOSN 500. NÃO inventa base/valor: apenas ecoa a
 * entrada congelada. `vICMSEfet`/`vFCPSTRet` são derivados (base × alíquota) SOMENTE quando ausentes.
 */
function buildStFields(st: IcmsRuleInput["st"], cfg: RoundingConfig): TaxIcmsStFields {
  const s = st ?? {}
  const money = (v: unknown) => roundMoney(num(v), cfg)
  const rate = (v: unknown) => roundRate(num(v), cfg)
  const vBCEfet = money(s.vBCEfet)
  const pICMSEfet = rate(s.pICMSEfet)
  const vBCFCPSTRet = money(s.vBCFCPSTRet)
  const pFCPSTRet = rate(s.pFCPSTRet)
  return {
    vBCSTRet: money(s.vBCSTRet),
    pST: rate(s.pST),
    vICMSSubstituto: money(s.vICMSSubstituto),
    vICMSSTRet: money(s.vICMSSTRet),
    vBCFCPSTRet,
    pFCPSTRet,
    vFCPSTRet: num(s.vFCPSTRet) > 0 ? money(s.vFCPSTRet) : money(applyAliquota(vBCFCPSTRet, pFCPSTRet)),
    pRedBCEfet: rate(s.pRedBCEfet),
    vBCEfet,
    pICMSEfet,
    vICMSEfet: num(s.vICMSEfet) > 0 ? money(s.vICMSEfet) : money(applyAliquota(vBCEfet, pICMSEfet)),
  }
}

/**
 * Resolve o ICMS do item. No baseline Simples o ICMS NÃO é destacado (valor 0); CSOSN 101
 * devolve o crédito do Simples (informativo); CSOSN 500 devolve a ST já retida (substituído),
 * com o ICMS próprio também não destacado. Mantém o `codigo` (CSOSN) aplicado.
 */
export function resolveIcms(input: IcmsRuleInput): TaxIcmsResult {
  const csosn = normalizeCsosn(input.csosn)
  const base = num(input.valorTributavel)

  if (CSOSN_ST_SUPORTADO.has(csosn)) {
    // CSOSN 500 — ICMS cobrado anteriormente por ST. ICMS próprio não destacado; carrega a ST retida.
    return {
      situacao: "st",
      codigo: csosn,
      baseCalculo: 0,
      aliquota: 0,
      valor: 0,
      pCredSN: 0,
      valorCreditoSimples: 0,
      st: buildStFields(input.st, input.cfg),
    }
  }

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
