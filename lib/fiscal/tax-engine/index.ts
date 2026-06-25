/**
 * Motor Tributário (Tax Engine) — Fase F2 do MASTER_FISCAL_EXECUTION_PLAN · ponto único de import.
 *
 * Camada PURA e DESACOPLADA (ADR-0008 P3/P5): `calculateTax(input)` recebe uma venda fiscal e
 * devolve o cálculo tributário (ICMS/PIS/COFINS/base/total). Sem Prisma, Next, React, rede ou
 * estado. Determinístico e 100% testável. NÃO emite, NÃO gera XML, NÃO toca PDV/Caixa/Financeiro.
 *
 * Escopo F2: Simples Nacional · NFC-e · consumidor final · operação interna · sem ST/DIFAL/FCP/IPI/ISS.
 */
export { calculateTax } from "./calculator"
export {
  resolveIcms,
  resolvePis,
  resolveCofins,
  isSimplesRegime,
  isCsosnSuportado,
  isCsosnComST,
  normalizeCsosn,
  CSOSN_DEFAULT_SIMPLES,
} from "./rules"
export { validateInput } from "./validators"
export {
  DEFAULT_ROUNDING,
  resolveRounding,
  roundTo,
  roundMoney,
  roundRate,
} from "./rounding"
export {
  applyAliquota,
  rateioProporcional,
  resolverAcessorioPorItem,
  num as taxNum,
} from "./helpers"
export { TAX_ENGINE_VERSION } from "./types"
export type {
  TaxRegime,
  TaxAmbito,
  TaxDestino,
  TaxSituacao,
  RoundingMode,
  RoundingConfig,
  TaxUnsupportedFlags,
  TaxEngineItemInput,
  TaxEngineInput,
  TaxComponentResult,
  TaxIcmsResult,
  TaxEngineItemResult,
  TaxEngineTotais,
  TaxEngineErrorCode,
  TaxEngineError,
  TaxEngineResult,
} from "./types"
