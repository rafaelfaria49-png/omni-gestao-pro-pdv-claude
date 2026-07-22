/**
 * Tipos canônicos do Motor Tributário (Tax Engine) — Fase F2 do MASTER_FISCAL_EXECUTION_PLAN.
 *
 * Camada PURA e DESACOPLADA (ADR-0008 P3/P5): recebe uma venda fiscal já congelada e devolve o
 * cálculo tributário. NÃO importa Prisma, Next, React, fetch nem estado global. Toda entrada vem
 * por parâmetro; toda saída é este objeto tipado. Determinístico (sem Date.now/Math.random).
 *
 * Escopo (NFC-e Simples Nacional B2C, conforme ROADMAP_FISCAL §8 / plano §3 F2 + GOAL-006):
 *   - Regime: Simples Nacional (e SN excesso de sublimite).
 *   - Operação: interna (mesma UF), consumidor final.
 *   - ST: CSOSN 500 (ICMS já retido anteriormente — substituído) SUPORTADO; CSOSN 201/202/203/900
 *     e DIFAL/FCP-próprio/IPI/ISS permanecem rejeitados de forma explícita pelos validators.
 * Tudo preparado para expansão (regime normal/CST, interestadual) sem reescrever o contrato.
 */

/** Versão do motor — congela a forma do resultado para snapshots/auditoria. */
export const TAX_ENGINE_VERSION = "1.0.0"

// ── Enums (string unions locais; ESPELHAM os enums Prisma sem importá-los) ──────────────

/** Espelha `RegimeTributario` do schema (valores idênticos), mantendo o motor sem Prisma. */
export type TaxRegime =
  | "SIMPLES_NACIONAL"
  | "SIMPLES_NACIONAL_EXCESSO"
  | "REGIME_NORMAL"
  | "MEI"

/** Âmbito da operação. Baseline F2 = `interna`. */
export type TaxAmbito = "interna" | "interestadual"

/** Destino/indicador de consumidor. Baseline F2 = `consumidor_final`. */
export type TaxDestino = "consumidor_final" | "contribuinte" | "nao_contribuinte"

/** Situação tributária resolvida por imposto (para diagnóstico/expansão). */
export type TaxSituacao =
  | "tributado" // imposto destacado (base × alíquota) — caminho de expansão (regime normal)
  | "nao_destacado" // Simples Nacional: imposto no DAS, não destacado na NFC-e (ex.: CSOSN 102)
  | "isento" // CSOSN 103/300/400 — isento/imune/não tributada
  | "com_credito_simples" // CSOSN 101 — permite crédito (pCredSN/vCredICMSSN), ICMS próprio não destacado
  | "st" // CSOSN 500 — ICMS cobrado anteriormente por ST (substituído); ICMS próprio não destacado

// ── Entrada ─────────────────────────────────────────────────────────────────────────────

/** Item de venda fiscal (entrada). Valores em reais; quantidades podem ter casas decimais. */
export type TaxEngineItemInput = {
  /** Identificador opcional (eco no resultado, p/ correlação com o item da venda). */
  id?: string
  descricao?: string
  quantidade: number
  valorUnitario: number

  /** Acessórios no nível do ITEM (precedência sobre o rateio do cabeçalho — ver TaxEngineInput). */
  descontoValor?: number
  freteValor?: number
  seguroValor?: number
  outrasDespesasValor?: number

  /** Identidade fiscal congelada do item (vinda de getProdutoFiscal/snapshot). */
  cfop?: string
  csosn?: string
  /** Reservado p/ expansão (regime normal). Ignorado no baseline Simples. */
  cst?: string
  origemMercadoria?: string

  /** Alíquotas (%) — usadas SOMENTE quando a regra do CSOSN/CST manda destacar. */
  aliquotaIcms?: number
  /** % de crédito do Simples (CSOSN 101). */
  pCredSN?: number
  aliquotaPis?: number
  aliquotaCofins?: number

  /**
   * Substituição Tributária já retida (CSOSN 500 — substituído). Valores CONGELADOS da nota de
   * entrada / cadastro fiscal; o motor NÃO os inventa, apenas normaliza e ecoa. Todos opcionais.
   * Mapeiam o grupo `ICMSSN500` do leiaute NFC-e 4.00 (ver rules.resolveIcmsST):
   *   vBCSTRet/pST/vICMSSubstituto/vICMSSTRet + FCP-ST retido (vBCFCPSTRet/pFCPSTRet/vFCPSTRet).
   */
  vBCSTRet?: number
  pST?: number
  vICMSSubstituto?: number
  vICMSSTRet?: number
  vBCFCPSTRet?: number
  pFCPSTRet?: number
  vFCPSTRet?: number
  /**
   * ICMS Efetivo (NFC-e consumidor final — NT 2016.002/2018.005). Obrigatório em algumas UFs
   * quando CSOSN 500 e indFinal=1. `vICMSEfet` é derivado de `vBCEfet × pICMSEfet` quando ausente.
   */
  pRedBCEfet?: number
  vBCEfet?: number
  pICMSEfet?: number
  vICMSEfet?: number

  /** Lei da Transparência (IBPT) — % aproximado de tributos sobre o valor tributável. */
  aproximadoTributosPercent?: number
}

/**
 * Flags de operações ainda NÃO suportadas. Existem para serem REJEITADAS explicitamente
 * (fronteira clara do escopo F2). Default = false. Qualquer true → erro de validação.
 */
export type TaxUnsupportedFlags = {
  temSubstituicaoTributaria?: boolean
  temDifal?: boolean
  temFcp?: boolean
  temIpi?: boolean
  temIss?: boolean
}

/** Entrada do motor — uma venda fiscal completa. */
export type TaxEngineInput = {
  regime: TaxRegime
  /** Default `interna`. */
  ambito?: TaxAmbito
  /** Default `consumidor_final`. */
  destino?: TaxDestino

  /** Acessórios no nível da NOTA — rateados proporcionalmente ao valor bruto dos itens. */
  descontoTotal?: number
  freteTotal?: number
  seguroTotal?: number
  outrasDespesasTotal?: number

  itens: TaxEngineItemInput[]

  /** Flags de exceção (todas devem ser false no baseline). */
  flags?: TaxUnsupportedFlags

  /** Configuração de arredondamento (default: 2 casas dinheiro / 4 alíquota / half away from zero). */
  rounding?: RoundingConfig
}

// ── Arredondamento ───────────────────────────────────────────────────────────────────────

export type RoundingMode = "half_away_from_zero" | "half_even" | "truncate"

export type RoundingConfig = {
  /** Casas decimais para valores monetários (default 2). */
  money: number
  /** Casas decimais para alíquotas/percentuais (default 4). */
  rate: number
  mode: RoundingMode
}

// ── Saída ─────────────────────────────────────────────────────────────────────────────

/** Resultado de um imposto específico para um item. */
export type TaxComponentResult = {
  situacao: TaxSituacao
  /** Código aplicado (CSOSN para Simples; CST para regime normal — futuro). */
  codigo: string
  baseCalculo: number
  aliquota: number
  valor: number
}

/**
 * Substituição Tributária congelada do item (CSOSN 500) — espelha o grupo `ICMSSN500` do leiaute
 * NFC-e 4.00 + o grupo ICMS Efetivo. Valores em reais; percentuais em %. Todos normalizados
 * (arredondados) a partir da entrada; o motor NÃO inventa base/valor de ST.
 */
export type TaxIcmsStFields = {
  /** ST retido anteriormente (grupo ICMSSN500). */
  vBCSTRet: number
  pST: number
  vICMSSubstituto: number
  vICMSSTRet: number
  vBCFCPSTRet: number
  pFCPSTRet: number
  vFCPSTRet: number
  /** ICMS Efetivo (NT 2016.002/2018.005) — obrigatório em algumas UFs p/ NFC-e consumidor final. */
  pRedBCEfet: number
  vBCEfet: number
  pICMSEfet: number
  vICMSEfet: number
}

/** Resultado do ICMS — pode carregar crédito do Simples (CSOSN 101) ou ST retida (CSOSN 500). */
export type TaxIcmsResult = TaxComponentResult & {
  /** % de crédito do Simples (CSOSN 101), quando aplicável. */
  pCredSN: number
  /** Valor do crédito do Simples (vCredICMSSN) — informativo; não compõe o total da nota. */
  valorCreditoSimples: number
  /** Presente SOMENTE quando situacao === "st" (CSOSN 500). ICMS próprio segue não destacado. */
  st?: TaxIcmsStFields
}

export type TaxEngineItemResult = {
  index: number
  id: string | null
  quantidade: number
  valorUnitario: number
  /** quantidade × valorUnitario (vProd do item). */
  valorBruto: number
  desconto: number
  frete: number
  seguro: number
  outrasDespesas: number
  /** valorBruto − desconto. */
  valorLiquido: number
  /** Valor tributável do item: bruto − desconto + frete + seguro + outras (base potencial). */
  valorTributavel: number
  icms: TaxIcmsResult
  pis: TaxComponentResult
  cofins: TaxComponentResult
  /** Lei da Transparência (IBPT) — aproximado. */
  valorAproximadoTributos: number
  /** Soma dos impostos DESTACADOS do item (icms+pis+cofins). Baseline Simples 102 = 0. */
  tributosDestacados: number
  warnings: string[]
}

export type TaxEngineTotais = {
  valorProdutos: number
  valorDesconto: number
  valorFrete: number
  valorSeguro: number
  valorOutrasDespesas: number
  baseCalculoIcms: number
  valorIcms: number
  valorPis: number
  valorCofins: number
  /** Soma dos impostos destacados (icms+pis+cofins). */
  valorTotalTributos: number
  /** Lei da Transparência (IBPT) — soma dos aproximados por item. */
  valorAproximadoTributos: number
  /** vNF = produtos − desconto + frete + seguro + outras. */
  valorTotalNota: number
}

export type TaxEngineErrorCode =
  | "sem_itens"
  | "regime_nao_suportado"
  | "ambito_nao_suportado"
  | "destino_nao_suportado"
  | "operacao_nao_suportada" // ST/DIFAL/FCP/IPI/ISS sinalizados
  | "csosn_nao_suportado"
  | "st_incompleta" // CSOSN 500 sem identificação mínima de ST retida (fail-closed)
  | "origem_nao_suportada" // origem da mercadoria fora da matriz 0–8
  | "cfop_nao_suportado"
  | "item_invalido"
  | "desconto_maior_que_bruto"
  | "valor_invalido"

export type TaxEngineError = {
  code: TaxEngineErrorCode
  mensagem: string
  /** Índice do item (1-based) quando o erro é por item; null quando é da nota. */
  itemIndex: number | null
  campo?: string | null
}

export type TaxEngineResult = {
  ok: boolean
  regime: TaxRegime
  ambito: TaxAmbito
  destino: TaxDestino
  itens: TaxEngineItemResult[]
  totais: TaxEngineTotais
  warnings: string[]
  errors: TaxEngineError[]
  meta: {
    engineVersion: string
    rounding: RoundingConfig
    /** True se nenhum imposto foi destacado (caso típico do Simples Nacional baseline). */
    semDestaque: boolean
  }
}
