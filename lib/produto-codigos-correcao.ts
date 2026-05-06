import { cellToTrimmedString, normalizeNameForMatch } from "@/lib/import-normalize"

export type CorrecaoMapTarget =
  | "correcao.nome"
  | "correcao.sku"
  | "correcao.codigo"
  | "correcao.barcode"
  | "correcao.codigoBarras"
  | "correcao.ean"
  | "correcao.gtin"
  | "correcao.imei"
  | "correcao.numeroSerie"

export type CorrecaoMappingState = Partial<Record<CorrecaoMapTarget, string>>

export type ProdutoCatalogoCorrecao = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
}

export type CorrecaoCodigosStatus =
  | "seguro"
  | "duvida"
  | "nao_encontrado"
  | "sem_mudanca"
  | "sem_dados_planilha"

export type CorrecaoCodigosPreviewRow = {
  /** Índice da linha na planilha (1-based, excluindo cabeçalho). */
  linhaPlanilha: number
  nomePlanilha: string
  nomePlanilhaNorm: string
  imeiPlanilha: string
  /** Valores crus da planilha (colunas detectadas) — só diagnóstico na UI. */
  skuPlanilha: string
  barcodePlanilha: string
  produtoId: string | null
  nomeDb: string
  skuDb: string
  barcodeDb: string
  skuNovo: string | null
  /** Valor que será gravado em Produto.barcode (EAN/GTIN). */
  barcodeNovo: string | null
  status: CorrecaoCodigosStatus
  motivo: string
}

function normHeader(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function bestMatch(headers: string[], candidates: string[]): string | undefined {
  const hNorm = headers.map((h) => ({ h, n: normHeader(h) }))
  for (const c of candidates) {
    const cn = normHeader(c)
    const exact = hNorm.find((x) => x.n === cn)
    if (exact) return exact.h
  }
  for (const c of candidates) {
    const cn = normHeader(c)
    const partial = hNorm.find((x) => x.n.includes(cn) || cn.includes(x.n))
    if (partial) return partial.h
  }
  return undefined
}

function pickCol(map: CorrecaoMappingState, key: CorrecaoMapTarget, headers: string[], fallbacks: string[]): string {
  const m = map[key]
  if (m && String(m).trim() !== "" && headers.includes(m)) return m
  return bestMatch(headers, fallbacks) ?? ""
}

function cell(row: Record<string, unknown>, col: string): string {
  if (!col) return ""
  return cellToTrimmedString(row[col])
}

/** Primeiro valor não vazio, por ordem de prioridade nas colunas distintas. */
function firstNonEmpty(row: Record<string, unknown>, cols: string[]): string {
  for (const c of cols) {
    if (!c) continue
    const v = cell(row, c)
    if (v) return v
  }
  return ""
}

/** Dígitos típicos de EAN/GTIN (8 a 14), ignorando espaços e pontuação leve. */
export function looksLikeEanGtin(raw: string): boolean {
  const d = String(raw ?? "").replace(/\D/g, "")
  return d.length >= 8 && d.length <= 14
}

/** Normaliza código de barras para gravação (EAN numérico → só dígitos). */
export function normalizeBarcodeDigits(raw: string): string {
  const t = String(raw ?? "").trim()
  if (!t) return ""
  const d = t.replace(/\D/g, "")
  if (looksLikeEanGtin(t)) return d
  return t
}

/**
 * Comparação estável planilha ↔ banco: só dígitos, sem espaços nem separadores.
 * Útil também para números do Excel convertidos em string sem perder dígitos (via cellToTrimmedString na leitura da célula).
 */
export function barcodeDigitsComparable(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "")
}

export function defaultCorrecaoMapping(headers: string[]): CorrecaoMappingState {
  return {
    "correcao.nome": pickCol({}, "correcao.nome", headers, [
      "nome",
      "produto",
      "descricao",
      "descrição",
      "item",
      "descrição do produto",
    ]),
    "correcao.sku": pickCol({}, "correcao.sku", headers, [
      "sku",
      "codigo sku",
      "código sku",
      "ref sku",
      "cod sku",
    ]),
    /** Só código interno explícito — nunca "codigo/código" genérico (costuma ser EAN). */
    "correcao.codigo": pickCol({}, "correcao.codigo", headers, [
      "codigo interno",
      "código interno",
      "cod interno",
      "cód interno",
      "codigo interno produto",
      "ref interna",
      "referencia interna",
      "referência interna",
    ]),
    "correcao.barcode": pickCol({}, "correcao.barcode", headers, [
      "barcode",
      "codigo de barras",
      "código de barras",
      "codigo barras",
      "código barras",
    ]),
    "correcao.codigoBarras": pickCol({}, "correcao.codigoBarras", headers, [
      "codigoBarras",
      "codigo_barras",
      "cod barras",
      "codigobarras",
    ]),
    "correcao.ean": pickCol({}, "correcao.ean", headers, ["ean", "ean13", "ean-13"]),
    "correcao.gtin": pickCol({}, "correcao.gtin", headers, ["gtin", "gtin13", "gtin-13"]),
    "correcao.imei": pickCol({}, "correcao.imei", headers, ["imei", "imei1", "imei 1"]),
    "correcao.numeroSerie": pickCol({}, "correcao.numeroSerie", headers, [
      "numero serie",
      "número serie",
      "numserie",
      "serial",
      "nº serie",
      "n serie",
    ]),
  }
}

const FALLBACK_BARCODE = ["barcode", "codigo de barras", "código de barras", "codigo barras", "código barras"]
const FALLBACK_CODIGO_BARRAS = ["codigoBarras", "codigo_barras", "cod barras", "codigobarras"]
const FALLBACK_EAN = ["ean", "ean13", "ean-13"]
const FALLBACK_GTIN = ["gtin", "gtin13", "gtin-13"]
const FALLBACK_SKU = ["sku", "codigo sku", "código sku", "ref sku", "cod sku"]
const FALLBACK_INTERNO = [
  "codigo interno",
  "código interno",
  "cod interno",
  "cód interno",
  "codigo interno produto",
  "ref interna",
  "referencia interna",
  "referência interna",
]

/**
 * Valor para Produto.barcode (EAN/GTIN real).
 * Prioridade: barcode → codigoBarras → ean → gtin → coluna interno só se valor for EAN-like → heurística em "codigo"/"código"/… só se parecer EAN.
 */
export function resolveBarcodeEanFromRow(
  row: Record<string, unknown>,
  map: CorrecaoMappingState,
  headers: string[]
): string {
  const cB = pickCol(map, "correcao.barcode", headers, FALLBACK_BARCODE)
  const cCb = pickCol(map, "correcao.codigoBarras", headers, FALLBACK_CODIGO_BARRAS)
  const cEan = pickCol(map, "correcao.ean", headers, FALLBACK_EAN)
  const cGtin = pickCol(map, "correcao.gtin", headers, FALLBACK_GTIN)
  const used = new Set<string>()
  const ordered = [cB, cCb, cEan, cGtin].filter((c) => {
    if (!c || used.has(c)) return false
    used.add(c)
    return true
  })
  let v = firstNonEmpty(row, ordered)
  if (v) return normalizeBarcodeDigits(v)

  const cInt = pickCol(map, "correcao.codigo", headers, FALLBACK_INTERNO)
  if (cInt) used.add(cInt)
  if (cInt) {
    const t = cell(row, cInt)
    if (looksLikeEanGtin(t)) {
      return normalizeBarcodeDigits(t)
    }
  }

  const ambiguous = ["codigo", "código", "cod", "referencia", "referência", "ref"]
  for (const label of ambiguous) {
    const h = bestMatch(headers, [label])
    if (!h || used.has(h)) continue
    const t = cell(row, h)
    if (looksLikeEanGtin(t)) return normalizeBarcodeDigits(t)
  }
  return ""
}

/**
 * Valor para Produto.sku: só coluna mapeada como SKU; nunca reaproveita EAN nem coluna "código" genérica.
 */
export function resolveSkuExplicitFromRow(
  row: Record<string, unknown>,
  map: CorrecaoMappingState,
  headers: string[],
  eanForBarcode: string
): string {
  const cSku = pickCol(map, "correcao.sku", headers, FALLBACK_SKU)
  if (!cSku) return ""
  const v = cell(row, cSku).trim()
  if (!v) return ""
  if (looksLikeEanGtin(v)) return ""
  const eanN = normalizeBarcodeDigits(eanForBarcode)
  const vN = normalizeBarcodeDigits(v)
  if (eanN && vN && eanN === vN) return ""
  return v
}

/**
 * Código interno explícito → grava em Produto.sku apenas se diferente do EAN e não for só dígitos EAN.
 */
export function resolveCodigoInternoForSkuRow(
  row: Record<string, unknown>,
  map: CorrecaoMappingState,
  headers: string[],
  eanForBarcode: string
): string {
  const cInt = pickCol(map, "correcao.codigo", headers, FALLBACK_INTERNO)
  if (!cInt) return ""
  const v = cell(row, cInt).trim()
  if (!v) return ""
  const eanN = normalizeBarcodeDigits(eanForBarcode)
  const vN = normalizeBarcodeDigits(v)
  if (eanN && vN && eanN === vN) return ""
  if (looksLikeEanGtin(v)) return ""
  return v
}

/** SKU final para gravar: prioriza coluna SKU; senão código interno válido (não-EAN). */
export function resolveSkuForDbRow(
  row: Record<string, unknown>,
  map: CorrecaoMappingState,
  headers: string[],
  eanForBarcode: string
): string {
  const fromSku = resolveSkuExplicitFromRow(row, map, headers, eanForBarcode)
  if (fromSku) return fromSku
  return resolveCodigoInternoForSkuRow(row, map, headers, eanForBarcode)
}

function resolveImeiFromRow(row: Record<string, unknown>, map: CorrecaoMappingState, headers: string[]): string {
  const cImei = pickCol(map, "correcao.imei", headers, ["imei"])
  const cSer = pickCol(map, "correcao.numeroSerie", headers, ["serial", "numero serie", "número serie"])
  const a = cImei ? cell(row, cImei) : ""
  if (a) return a
  return cSer ? cell(row, cSer) : ""
}

export const CORRECAO_CODIGOS_MAP_LABELS: { key: CorrecaoMapTarget; label: string }[] = [
  { key: "correcao.nome", label: "Nome do produto (obrigatório para casar)" },
  { key: "correcao.sku", label: "SKU (só esta coluna atualiza SKU)" },
  { key: "correcao.codigo", label: "Código interno (não use coluna genérica “Código” se for EAN)" },
  { key: "correcao.barcode", label: "Código de barras (EAN) — campo do PDV" },
  { key: "correcao.codigoBarras", label: "codigoBarras / outro barras → mesmo campo EAN" },
  { key: "correcao.ean", label: "EAN → Produto.barcode" },
  { key: "correcao.gtin", label: "GTIN → Produto.barcode" },
  { key: "correcao.imei", label: "IMEI (só prévia — não há campo no produto)" },
  { key: "correcao.numeroSerie", label: "Número de série (só prévia)" },
]

function indexByNameNorm(products: ProdutoCatalogoCorrecao[]): Map<string, ProdutoCatalogoCorrecao[]> {
  const m = new Map<string, ProdutoCatalogoCorrecao[]>()
  for (const p of products) {
    const k = normalizeNameForMatch(p.name)
    if (!k) continue
    const arr = m.get(k) ?? []
    arr.push(p)
    m.set(k, arr)
  }
  return m
}

function otherOwnerSku(
  sku: string,
  selfId: string,
  products: ProdutoCatalogoCorrecao[]
): ProdutoCatalogoCorrecao | undefined {
  return products.find((p) => p.id !== selfId && p.sku != null && p.sku === sku)
}

function otherOwnerBarcode(
  barcodeDigits: string,
  selfId: string,
  products: ProdutoCatalogoCorrecao[]
): ProdutoCatalogoCorrecao | undefined {
  if (!barcodeDigits) return undefined
  return products.find(
    (p) =>
      p.id !== selfId &&
      p.barcode != null &&
      barcodeDigitsComparable(p.barcode) === barcodeDigits
  )
}

/**
 * Monta prévia linha a linha: match principal por nome normalizado;
 * fallback seguro por SKU exato único na base.
 */
export function buildCorrecaoCodigosPreview(args: {
  rows: Record<string, unknown>[]
  headers: string[]
  map: CorrecaoMappingState
  dbProducts: ProdutoCatalogoCorrecao[]
  /** Linha inicial na planilha (1-based) para exibição — p.ex. 2 se cabeçalho é linha 1. */
  linhaBase: number
}): CorrecaoCodigosPreviewRow[] {
  const { rows, headers, map, dbProducts, linhaBase } = args
  const byName = indexByNameNorm(dbProducts)

  const bySkuExact = new Map<string, ProdutoCatalogoCorrecao[]>()
  for (const p of dbProducts) {
    if (!p.sku || !String(p.sku).trim()) continue
    const k = String(p.sku).trim()
    const arr = bySkuExact.get(k) ?? []
    arr.push(p)
    bySkuExact.set(k, arr)
  }

  const byBarcodeExact = new Map<string, ProdutoCatalogoCorrecao[]>()
  for (const p of dbProducts) {
    if (!p.barcode || !String(p.barcode).trim()) continue
    const k = barcodeDigitsComparable(p.barcode)
    if (!k) continue
    const arr = byBarcodeExact.get(k) ?? []
    arr.push(p)
    byBarcodeExact.set(k, arr)
  }

  const out: CorrecaoCodigosPreviewRow[] = []

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!
    const colNome = pickCol(map, "correcao.nome", headers, [
      "nome",
      "produto",
      "descricao",
      "descrição",
      "item",
      "descrição do produto",
    ])
    const nomePlanilha = colNome ? cell(row, colNome) : ""
    const nomeNorm = normalizeNameForMatch(nomePlanilha)
    const eanForBarcode = resolveBarcodeEanFromRow(row, map, headers)
    const skuForDb = resolveSkuForDbRow(row, map, headers, eanForBarcode)
    const skuLookup = (skuForDb || eanForBarcode).trim()
    const imeiPlanilha = resolveImeiFromRow(row, map, headers)

    /** Exibição: EAN que vai para Produto.barcode. */
    const barcodePlanilha = eanForBarcode
    /** Exibição: valor que iria para Produto.sku (só colunas SKU / código interno explícitas). */
    const skuPlanilha = skuForDb

    const linhaPlanilha = linhaBase + i

    const emptyRow =
      !nomePlanilha.trim() &&
      !skuLookup &&
      !eanForBarcode &&
      !imeiPlanilha
    if (emptyRow) continue

    let status: CorrecaoCodigosStatus = "nao_encontrado"
    let motivo = ""
    let matched: ProdutoCatalogoCorrecao | null = null

    const fromName = nomeNorm ? (byName.get(nomeNorm) ?? []) : []

    if (fromName.length === 1) {
      matched = fromName[0]!
      motivo = "Nome normalizado único na loja."
    } else if (fromName.length > 1) {
      status = "duvida"
      motivo = `${fromName.length} produtos com o mesmo nome na loja após normalização.`
    } else if (skuLookup) {
      let cand = bySkuExact.get(skuLookup) ?? []
      if (cand.length === 0 && looksLikeEanGtin(skuLookup)) {
        cand = byBarcodeExact.get(normalizeBarcodeDigits(skuLookup)) ?? []
      }
      if (cand.length === 1) {
        matched = cand[0]!
        motivo = "Nome não casou; SKU ou EAN da planilha bate com um único produto na loja."
      } else if (cand.length > 1) {
        status = "duvida"
        motivo = "SKU/EAN da planilha coincide com mais de um produto (revisar duplicatas)."
      } else {
        status = "nao_encontrado"
        motivo = "Nome não encontrado e SKU/EAN da planilha não coincide com nenhum produto."
      }
    } else {
      status = "nao_encontrado"
      motivo = "Sem nome para casar e sem SKU nem EAN na planilha para localizar o produto."
    }

    if (!matched) {
      out.push({
        linhaPlanilha,
        nomePlanilha: nomePlanilha || "—",
        nomePlanilhaNorm: nomeNorm,
        imeiPlanilha,
        skuPlanilha,
        barcodePlanilha,
        produtoId: null,
        nomeDb: "—",
        skuDb: "—",
        barcodeDb: "—",
        skuNovo: null,
        barcodeNovo: null,
        status,
        motivo,
      })
      continue
    }

    const skuDb = (matched.sku ?? "").trim()
    const barcodeDb = (matched.barcode ?? "").trim()
    const digitsDb = barcodeDigitsComparable(matched.barcode)
    const digitsPlan = barcodeDigitsComparable(eanForBarcode)
    const skuValor = skuForDb.trim()
    const mudSku = skuValor !== "" && skuValor !== skuDb
    const mudBc = digitsPlan.length > 0 && digitsPlan !== digitsDb

    const barcodeGravar = eanForBarcode ? normalizeBarcodeDigits(eanForBarcode) : ""
    const skuNovo = mudSku ? skuValor : null
    const barcodeNovo = mudBc ? barcodeGravar || digitsPlan : null

    if (digitsPlan.length === 0) {
      if (mudSku) {
        status = "duvida"
        motivo =
          "Coluna de código de barras não foi lida ou está vazia para esta linha. Há alteração sugerida só no SKU/código interno — não aplicada automaticamente sem EAN."
      } else {
        status = "sem_dados_planilha"
        motivo = "Coluna de código de barras não foi lida ou está vazia para esta linha."
      }
    } else if (digitsPlan === digitsDb) {
      if (!mudSku) {
        status = "sem_mudanca"
        motivo =
          "Sem mudança: código de barras (EAN) novo coincide com o atual e o SKU também coincide."
      } else {
        status = "duvida"
        motivo =
          "Código de barras (EAN) já coincide com o cadastro; apenas o SKU difere — não aplicado automaticamente."
      }
    } else {
      status = "seguro"
      if (mudSku && skuNovo && otherOwnerSku(skuNovo, matched.id, dbProducts)) {
        status = "duvida"
        motivo = "O SKU novo já pertence a outro produto na mesma loja (conflito de unicidade)."
      }
      if (otherOwnerBarcode(digitsPlan, matched.id, dbProducts)) {
        status = "duvida"
        motivo =
          status === "duvida"
            ? `${motivo} Além disso, este EAN já está em outro produto.`
            : "Este EAN já está cadastrado em outro produto na mesma loja."
      }
      if (status === "seguro") {
        motivo =
          fromName.length === 1
            ? "Match único: EAN da planilha difere do cadastro e será gravado em Produto.barcode (PDV); sem conflito."
            : "EAN da planilha difere do cadastro e será gravado em Produto.barcode (PDV); sem conflito."
      }
    }

    out.push({
      linhaPlanilha,
      nomePlanilha: nomePlanilha || "—",
      nomePlanilhaNorm: nomeNorm,
      imeiPlanilha,
      skuPlanilha,
      barcodePlanilha,
      produtoId: matched.id,
      nomeDb: matched.name,
      skuDb,
      barcodeDb,
      skuNovo,
      barcodeNovo,
      status,
      motivo,
    })
  }

  return out
}
