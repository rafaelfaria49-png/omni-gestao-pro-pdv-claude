/**
 * Extração determinística de texto livre de Produto (CAD-R2-016).
 *
 * Módulo PURO: sem rede, sem banco, sem LLM, sem Prisma, sem StockLedger.
 * Extrai SOMENTE valores com evidência textual (keyword + formato), que viram
 * campos "extraido". Tudo que não tem evidência inequívoca fica ausente ou
 * ambíguo — a IA (camada `interpretar.ts`) nunca recebe autoridade sobre
 * campos sensíveis sem esta âncora.
 *
 * Convenções pt-BR cobertas:
 * - dinheiro: "R$ 25", "4 reais", "39,90", "1.299,90", "vendo por 25";
 * - custo: "custa", "custo", "paguei", "comprei por", "me saiu por";
 * - venda: "vendo/vende/venda por", "preço", "por" próximo ao valor;
 * - estoque: "estoque (inicial) 10", "10 unidades/un/unid/peças";
 * - garantia: "garantia (de) 90 dias / 3 meses / 1 ano" (→ dias);
 * - ean: sequências soltas de 8/12/13/14 dígitos (+ validarGtin quando há);
 * - sku: "SKU <token>";
 * - fornecedor: "fornecedor <nome>" (até vírgula/quebra ou fim);
 * - ncm/cest: "NCM <8 dígitos>" / "CEST <7 dígitos>" (explícitos apenas).
 */

import { normalizeProdutoIdentifier } from "@/lib/cadastros/produto-upsert-metadata"
import { validarGtin } from "@/lib/cadastros/gtin"
import { LIMITES_TEXTO_LIVRE } from "./types"

/** Valor sensível com a evidência textual que o ancora (trecho do texto). */
export type ExtracaoSensivel<T> = {
  valor: T
  /** Trecho do texto do operador que ancora o valor (para avisos/auditoria
   * em memória — nunca persistido). */
  evidencia: string
  /** true quando a atribuição é inequívoca; false = exige confirmação. */
  rotulado: boolean
}

export type ExtracaoDeterministica = {
  preco: ExtracaoSensivel<number> | null
  custo: ExtracaoSensivel<number> | null
  estoque: ExtracaoSensivel<number> | null
  garantiaDias: ExtracaoSensivel<number> | null
  fornecedor: ExtracaoSensivel<string> | null
  sku: ExtracaoSensivel<string> | null
  ean: ExtracaoSensivel<string> | null
  ncm: ExtracaoSensivel<string> | null
  cest: ExtracaoSensivel<string> | null
  /** Campos com evidência mas sem atribuição clara → estado "ambiguo". */
  ambiguos: Array<"preco" | "custo" | "estoque" | "garantiaDias" | "sku" | "ean">
  /** Números monetários soltos sem rótulo (para avisos de ambiguidade). */
  valoresSoltos: number[]
  avisos: string[]
}

/** Palavras de moeda pt-BR (licenciam um número como dinheiro). */
const MOEDA_PALAVRA = String.raw`(?:reais?\b|contos?\b|pilas?\b|mangos?\b)`
/** Número monetário: milhares pt-BR, decimal com vírgula, ou inteiro/decimal ponto. */
const NUMERO_MOEDA = String.raw`(?:\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{1,2}|\d+(?:\.\d{1,2})?)`

function parseDinheiro(digitos: string): number | null {
  const t = digitos.trim()
  if (!t) return null
  // Milhares "1.299,90" ou decimal "39,90": remove pontos de milhar, vírgula vira ponto.
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t
  const n = Number(normalizado)
  if (!Number.isFinite(n) || n < 0 || n > LIMITES_TEXTO_LIVRE.precoMax) return null
  return Math.round(n * 100) / 100
}

const RE_CUSTO = /cust(?:o|a|ou)?\b|me\s+custou?\b|paguei\b|pago\b|comprei?\b|adquiri\b|me\s+saiu\b|saiu\b/i
const RE_VENDA =
  /vend(?:o|e|a|endo)?\b|pre[cç]o\b|por\b|sai\b|saindo\b|oferta\b|tabela\b|a\s+vista\b|no\s+cart[aã]o\b/i

type RotuloDinheiro = "custo" | "venda" | null

/** Classifica o contexto anterior ao valor: keyword mais próxima vence. */
function rotularDinheiro(contextoAntes: string): RotuloDinheiro {
  const ctx = contextoAntes.toLowerCase()
  // Janela curta: só o que está colado ao valor manda (evita vazar rótulo
  // de outro valor na mesma frase longa).
  const janela = ctx.slice(-48)
  const idxCusto = ultimaOcorrencia(janela, RE_CUSTO)
  const idxVenda = ultimaOcorrencia(janela, RE_VENDA)
  if (idxCusto === null && idxVenda === null) return null
  if (idxCusto !== null && (idxVenda === null || idxCusto >= idxVenda)) return "custo"
  return "venda"
}

function ultimaOcorrencia(texto: string, re: RegExp): number | null {
  const global = new RegExp(re.source, "gi")
  let ultimo: number | null = null
  let m: RegExpExecArray | null
  for (;;) {
    m = global.exec(texto)
    if (!m) break
    ultimo = m.index
    if (m[0].length === 0) global.lastIndex += 1
  }
  return ultimo
}

function extrairDinheiro(texto: string): {
  rotulados: Array<{ papel: "custo" | "venda"; valor: number; evidencia: string }>
  soltos: Array<{ valor: number; evidencia: string }>
} {
  const rotulados: Array<{ papel: "custo" | "venda"; valor: number; evidencia: string }> = []
  const soltos: Array<{ valor: number; evidencia: string }> = []
  // R$ prefixado OU número com sufixo de moeda OU número licenciado por keyword.
  const re = new RegExp(
    String.raw`(?<![\d\w.,])(R\$\s*)?(${NUMERO_MOEDA})(\s*${MOEDA_PALAVRA})?(?![\d\w])`,
    "gi",
  )
  let m: RegExpExecArray | null
  for (;;) {
    m = re.exec(texto)
    if (!m) break
    const prefixoRs = (m[1] ?? "").length > 0
    const digitos = m[2] ?? ""
    const sufixoMoeda = (m[3] ?? "").trim().length > 0
    const temDecimalVirgula = digitos.includes(",")
    const antes = texto.slice(Math.max(0, m.index - 48), m.index)
    const rotulo = rotularDinheiro(antes)
    const valor = parseDinheiro(digitos)
    if (valor === null) continue
    const evidencia = texto.slice(Math.max(0, m.index - 24), m.index + m[0].length).trim()
    if (rotulo) {
      rotulados.push({ papel: rotulo, valor, evidencia })
    } else if (prefixoRs || sufixoMoeda || temDecimalVirgula) {
      // Dinheiro inequívoco (moeda marcada) mas sem papel custo/venda.
      soltos.push({ valor, evidencia })
    }
    // Inteiro sem moeda e sem keyword (ex.: "iPhone 15", "10 unidades") NÃO é dinheiro.
    if (m[0].length === 0) re.lastIndex += 1
  }
  return { rotulados, soltos }
}

function escolherUnico<T>(
  candidatos: T[],
  iguais: (a: T, b: T) => boolean,
  rotulo: string,
  avisos: string[],
): T | null | "ambiguo" {
  if (candidatos.length === 0) return null
  const primeiro = candidatos[0]
  if (candidatos.every((c) => iguais(c, primeiro))) return primeiro
  avisos.push(`${rotulo} com valores conflitantes no texto — confirme antes de aplicar.`)
  return "ambiguo"
}

function extrairEstoque(texto: string, avisos: string[]): ExtracaoSensivel<number> | null | "ambiguo" {
  const candidatos: Array<{ valor: number; evidencia: string }> = []
  const reEstoque = /estoque(?:\s+(?:inicial|atual|de))?\s*(?:de\s*|:\s*)?(\d{1,6})\b/gi
  let m: RegExpExecArray | null
  for (;;) {
    m = reEstoque.exec(texto)
    if (!m) break
    const valor = Number.parseInt(m[1], 10)
    if (Number.isFinite(valor) && valor >= 0 && valor <= LIMITES_TEXTO_LIVRE.estoqueMax) {
      candidatos.push({ valor, evidencia: m[0].trim() })
    }
  }
  const reUn = /(?<![\d\w.,])(\d{1,6})\s*(?:unidades?|uns?\b|unid(?:ades?)?\.?\b|pe[cç]as?|p[cç]s?\.?\b|itens?|caixas?)\b/gi
  for (;;) {
    m = reUn.exec(texto)
    if (!m) break
    const valor = Number.parseInt(m[1], 10)
    if (Number.isFinite(valor) && valor >= 0 && valor <= LIMITES_TEXTO_LIVRE.estoqueMax) {
      candidatos.push({ valor, evidencia: m[0].trim() })
    }
  }
  const unico = escolherUnico(candidatos, (a, b) => a.valor === b.valor, "Estoque", avisos)
  if (unico === "ambiguo" || unico === null) return unico
  return { valor: unico.valor, evidencia: unico.evidencia, rotulado: true }
}

function extrairGarantia(texto: string, avisos: string[]): ExtracaoSensivel<number> | null | "ambiguo" {
  const re = /garantia(?:\s+de)?\s*(\d{1,4})\s*(dias?|meses?|m[eê]s|anos?)\b/gi
  const candidatos: Array<{ valor: number; evidencia: string }> = []
  let m: RegExpExecArray | null
  for (;;) {
    m = re.exec(texto)
    if (!m) break
    const n = Number.parseInt(m[1], 10)
    const unidade = (m[2] ?? "").toLowerCase()
    const mult = unidade.startsWith("mes") || unidade.startsWith("mês") ? 30 : unidade.startsWith("ano") ? 365 : 1
    const dias = n * mult
    if (Number.isFinite(dias) && dias >= 0 && dias <= LIMITES_TEXTO_LIVRE.garantiaDiasMax) {
      candidatos.push({ valor: dias, evidencia: m[0].trim() })
    }
  }
  if (candidatos.length === 0) {
    if (/garantia/i.test(texto)) {
      avisos.push("Garantia mencionada sem prazo — informe os dias.")
    }
    return null
  }
  const unico = escolherUnico(candidatos, (a, b) => a.valor === b.valor, "Garantia", avisos)
  if (unico === "ambiguo" || unico === null) return unico
  return { valor: unico.valor, evidencia: unico.evidencia, rotulado: true }
}

function extrairEan(texto: string, avisos: string[]): ExtracaoSensivel<string> | null | "ambiguo" {
  const re = /(?<!\d)(\d{8}|\d{12}|\d{13}|\d{14})(?!\d)/g
  const achados: string[] = []
  let m: RegExpExecArray | null
  for (;;) {
    m = re.exec(texto)
    if (!m) break
    if (!achados.includes(m[1])) achados.push(m[1])
  }
  if (achados.length === 0) return null
  if (achados.length > 1) {
    avisos.push("Mais de um código de barras no texto — confirme qual é o EAN.")
    return "ambiguo"
  }
  const codigo = achados[0]
  if (codigo.length === 14) {
    // Sem validador determinístico de GTIN-14 no repo: aceita como explícito.
    return { valor: codigo, evidencia: codigo, rotulado: true }
  }
  const validacao = validarGtin(codigo)
  if (!validacao.valid) {
    // Explícito no texto, mas o dígito verificador não confere: mantém o valor
    // (é o que o operador declarou) e exige revisão.
    avisos.push("Código de barras com dígito verificador inválido — confira os números.")
    return { valor: codigo, evidencia: codigo, rotulado: true }
  }
  return { valor: validacao.gtin, evidencia: codigo, rotulado: true }
}

function extrairSku(texto: string, avisos: string[]): ExtracaoSensivel<string> | null | "ambiguo" {
  const re = /\bsku\b\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9\-_./]{0,39})/gi
  const achados: string[] = []
  let m: RegExpExecArray | null
  for (;;) {
    m = re.exec(texto)
    if (!m) break
    const token = (m[1] ?? "").replace(/[./-]+$/g, "")
    const normalizado = normalizeProdutoIdentifier(token)
    if (normalizado && normalizado.length <= LIMITES_TEXTO_LIVRE.skuMax && !achados.includes(normalizado)) {
      achados.push(normalizado)
    }
  }
  if (achados.length === 0) return null
  if (achados.length > 1) {
    avisos.push("Mais de um SKU no texto — confirme qual usar.")
    return "ambiguo"
  }
  return { valor: achados[0], evidencia: `SKU ${achados[0]}`, rotulado: true }
}

function extrairFornecedor(texto: string): ExtracaoSensivel<string> | null {
  // Segmenta por vírgula/ponto-e-vírgula/quebra: o nome mora no segmento do keyword.
  const segmentos = texto.split(/[,;\n]+/)
  for (const segmento of segmentos) {
    const m = /fornecedor(?:a|es)?\b\s*(?:é|eh|:|-)?\s*(.+)$/i.exec(segmento.trim())
    if (!m) continue
    let nome = (m[1] ?? "").trim()
    // Corta eventual continuação com outro keyword sensível no mesmo segmento.
    nome = nome
      .split(/\b(?:custo|custa|vendo|venda|pre[cç]o|estoque|garantia|sku|ean|c[oó]digo de barras|ncm|cest)\b/i)[0]
      .trim()
      .replace(/[.\s]+$/g, "")
    const normalizado = normalizeProdutoIdentifier(nome)
    if (normalizado && normalizado.length <= LIMITES_TEXTO_LIVRE.fornecedorMax) {
      return { valor: normalizado, evidencia: `fornecedor ${normalizado}`, rotulado: true }
    }
  }
  return null
}

function extrairFiscal(texto: string, avisos: string[]): { ncm: ExtracaoSensivel<string> | null; cest: ExtracaoSensivel<string> | null } {
  let ncm: ExtracaoSensivel<string> | null = null
  let cest: ExtracaoSensivel<string> | null = null
  const mNcm = /\bncm\b\s*[:#-]?\s*(\d{8})\b/i.exec(texto)
  if (mNcm) {
    ncm = { valor: mNcm[1], evidencia: mNcm[0].trim(), rotulado: true }
    avisos.push("NCM informado no texto — confira com a contabilidade antes de salvar.")
  }
  const mCest = /\bcest\b\s*[:#-]?\s*(\d{7})\b/i.exec(texto)
  if (mCest) {
    cest = { valor: mCest[1], evidencia: mCest[0].trim(), rotulado: true }
    avisos.push("CEST informado no texto — confira com a contabilidade antes de salvar.")
  }
  return { ncm, cest }
}

/**
 * Extrai valores sensíveis com evidência textual. Nunca inventa: sem evidência,
 * o campo volta null (ausente) ou "ambiguo" (evidência sem atribuição clara).
 */
export function extrairDeterministico(texto: string): ExtracaoDeterministica {
  const avisos: string[] = []
  const { rotulados, soltos } = extrairDinheiro(texto)

  const custos = rotulados.filter((r) => r.papel === "custo")
  const vendas = rotulados.filter((r) => r.papel === "venda")

  const custoUnico = escolherUnico(custos, (a, b) => a.valor === b.valor, "Custo", avisos)
  const vendaUnica = escolherUnico(vendas, (a, b) => a.valor === b.valor, "Preço de venda", avisos)

  let preco: ExtracaoDeterministica["preco"] = null
  const ambiguos: ExtracaoDeterministica["ambiguos"] = []
  if (vendaUnica === "ambiguo") {
    ambiguos.push("preco")
    avisos.push("Preço de venda ambíguo — confirme o valor antes de aplicar.")
  } else if (vendaUnica) {
    preco = { valor: vendaUnica.valor, evidencia: vendaUnica.evidencia, rotulado: true }
  } else if (soltos.length === 1 && custos.length === 0) {
    // Valor monetário único sem rótulo: preserva o número, mas exige confirmação.
    preco = { valor: soltos[0].valor, evidencia: soltos[0].evidencia, rotulado: false }
    ambiguos.push("preco")
    avisos.push("Valor sem rótulo atribuído à venda — confirme se é o preço de venda.")
  } else if (soltos.length > 1 && custos.length === 0 && vendas.length === 0) {
    ambiguos.push("preco")
    avisos.push(
      `Valores ${soltos.map((s) => s.valor).join(" e ")} sem rótulo — informe custo e venda separadamente.`,
    )
  }

  let custo: ExtracaoDeterministica["custo"] = null
  if (custoUnico === "ambiguo") {
    ambiguos.push("custo")
  } else if (custoUnico) {
    custo = { valor: custoUnico.valor, evidencia: custoUnico.evidencia, rotulado: true }
  }

  // Soltos ignorados quando já há atribuição: registra para transparência.
  const valoresSoltos = soltos.map((s) => s.valor)
  if (soltos.length > 0 && (preco?.rotulado || custo)) {
    const usados = new Set([preco?.valor, custo?.valor])
    for (const s of soltos) {
      if (!usados.has(s.valor)) {
        avisos.push(`Valor ${s.valor} sem rótulo claro foi ignorado — confirme custo/venda.`)
        break
      }
    }
  }

  const estoqueRaw = extrairEstoque(texto, avisos)
  const garantiaRaw = extrairGarantia(texto, avisos)
  const eanRaw = extrairEan(texto, avisos)
  const skuRaw = extrairSku(texto, avisos)
  const fornecedor = extrairFornecedor(texto)
  const fiscal = extrairFiscal(texto, avisos)

  if (estoqueRaw === "ambiguo") ambiguos.push("estoque")
  if (garantiaRaw === "ambiguo") ambiguos.push("garantiaDias")
  if (eanRaw === "ambiguo") ambiguos.push("ean")
  if (skuRaw === "ambiguo") ambiguos.push("sku")

  return {
    preco,
    custo,
    estoque: estoqueRaw === "ambiguo" ? null : estoqueRaw,
    garantiaDias: garantiaRaw === "ambiguo" ? null : garantiaRaw,
    fornecedor,
    sku: skuRaw === "ambiguo" ? null : skuRaw,
    ean: eanRaw === "ambiguo" ? null : eanRaw,
    ncm: fiscal.ncm,
    cest: fiscal.cest,
    ambiguos,
    valoresSoltos,
    avisos,
  }
}

/** Keywords por campo sensível — usadas para ancorar gap-fill do LLM (ver interpretar.ts). */
const KEYWORDS_POR_CAMPO: Record<string, RegExp> = {
  preco: /vend|pre[cç]o|\bpor\b|oferta|tabela/i,
  custo: /cust|paguei|pago|comprei|adquiri|saiu/i,
  estoque: /estoque|unidades?|unid|pe[cç]as?|itens?/i,
  garantia: /garantia/i,
  fornecedor: /fornecedor/i,
  sku: /\bsku\b/i,
  ean: /\bean\b|c[oó]digo de barras|\bbarras\b/i,
}

/**
 * O texto ancora este campo? (keyword do campo presente OU dígitos do valor
 * presentes). Gate para aceitar um valor do LLM em campo sensível vazio.
 */
export function textoAncoraCampo(texto: string, campo: string, valor: number | string): boolean {
  const kw = KEYWORDS_POR_CAMPO[campo]
  if (kw && kw.test(texto)) return true
  const digitos = String(valor).replace(/\D/g, "")
  if (digitos.length >= 1) {
    const digitosTexto = texto.replace(/\D/g, "")
    // Número inteiro presente na sequência de dígitos do texto.
    if (digitosTexto.includes(digitos)) return true
  }
  if (typeof valor === "string") {
    const alvo = valor.trim().toLowerCase()
    if (alvo.length >= 3 && texto.toLowerCase().includes(alvo)) return true
  }
  return false
}
