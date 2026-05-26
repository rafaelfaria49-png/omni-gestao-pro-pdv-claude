// ============================================================
// lib/importador-produtos/parser.ts
// Parser server-side (xls/xlsx/csv) → DeteccaoCabecalho + linhas.
// Roda no Node (API route). SheetJS lê BIFF (.xls antigo) sem dep extra.
// ============================================================

import type { DeteccaoCabecalho, LinhaInvalida, ProdutoNormalizado } from "./types"
import {
  celulaParaString,
  mapearHeaders,
  parseNumeroBr,
  pareceBanner,
  pontuarLinhaComoCabecalho,
} from "./normalizar"

const JANELA_DETECCAO_CABECALHO = 20 // linhas
const MAX_AMOSTRA = 20
const MAX_INVALIDAS_REPORTAR = 50

export type ParsedPlanilha = {
  cabecalho: DeteccaoCabecalho
  /** AOA (matrix) crua — primeira linha é a do cabeçalho detectado. */
  matrix: unknown[][]
}

/**
 * Lê o buffer como xls/xlsx/csv e devolve a primeira planilha como AOA.
 * Usa `header: 1` para evitar inferência de header do SheetJS — queremos detectar nós mesmos.
 */
async function lerArquivoComoMatrix(
  buffer: Buffer,
  nomeArquivo: string,
): Promise<unknown[][]> {
  const ext = nomeArquivo.toLowerCase().split(".").pop() ?? ""
  if (ext === "csv" || ext === "tsv") {
    return lerCsvComoMatrix(buffer, ext === "tsv" ? "\t" : null)
  }
  // xls / xlsx / xlsm / ods → SheetJS
  const XLSX = await import("xlsx")
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, cellNF: false, cellText: false })
  const wsName = wb.SheetNames[0]
  if (!wsName) return []
  const ws = wb.Sheets[wsName]
  if (!ws) return []
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  }) as unknown[][]
}

function lerCsvComoMatrix(buffer: Buffer, sepForce: string | null): unknown[][] {
  // Detecta encoding básico (BOM UTF-8 / fallback latin1 se houver caracteres inválidos).
  let text = buffer.toString("utf-8")
  if (text.includes("�")) {
    text = buffer.toString("latin1")
  }
  // BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const linhas = text.split(/\r?\n/)
  // Detecta separador olhando a primeira linha não-vazia
  let sep = sepForce
  if (!sep) {
    const probe = linhas.find((l) => l.trim()) ?? ""
    sep = probe.includes(";") ? ";" : probe.includes("\t") ? "\t" : ","
  }
  const matrix: unknown[][] = []
  for (const raw of linhas) {
    if (!raw && matrix.length === 0) continue
    // Parse CSV com aspas simples (aceita "campo, com vírgula")
    matrix.push(parseLinhaCsv(raw, sep))
  }
  // Remove trailing empty rows
  while (matrix.length > 0 && matrix[matrix.length - 1]!.every((c) => c === "" || c == null)) {
    matrix.pop()
  }
  return matrix
}

function parseLinhaCsv(linha: string, sep: string): string[] {
  const out: string[] = []
  let cur = ""
  let dentroAspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (c === '"') {
      if (dentroAspas && linha[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        dentroAspas = !dentroAspas
      }
    } else if (c === sep && !dentroAspas) {
      out.push(cur)
      cur = ""
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/**
 * Detecta a linha do cabeçalho dentro da janela inicial.
 * Estratégia:
 *  1. Ignora linhas que parecem banner (palavra-chave/coluna única).
 *  2. Pontua cada linha pelo número de aliases conhecidos.
 *  3. Vence a linha com maior pontuação, desde que tenha ao menos
 *     2 colunas conhecidas (inclui 'nome', ou pelo menos 'sku'+'preco').
 *  4. Se nenhuma linha bater, usa a primeira não-banner como fallback
 *     (mantém o fluxo mas o operador verá `nome` ausente no preview).
 */
export function detectarCabecalho(matrix: unknown[][]): DeteccaoCabecalho {
  const janela = matrix.slice(0, JANELA_DETECCAO_CABECALHO)
  let melhor = -1
  let melhorScore = 0
  for (let i = 0; i < janela.length; i++) {
    const linha = janela[i]!
    if (pareceBanner(linha)) continue
    const score = pontuarLinhaComoCabecalho(linha)
    if (score > melhorScore) {
      melhorScore = score
      melhor = i
    }
  }
  // Fallback: primeira linha não-banner
  if (melhor < 0) {
    for (let i = 0; i < janela.length; i++) {
      if (!pareceBanner(janela[i]!)) {
        melhor = i
        break
      }
    }
  }
  if (melhor < 0) {
    return { linha: 0, colunas: [], mapeamento: {} }
  }

  const headers = (matrix[melhor] ?? []).map((c) => celulaParaString(c))
  // Garante unicidade dos headers (Excel pode ter colunas em branco no meio)
  const usados = new Map<string, number>()
  const headersUnicos = headers.map((h, idx) => {
    const base = h || `__coluna_${idx + 1}__`
    const count = usados.get(base) ?? 0
    usados.set(base, count + 1)
    return count === 0 ? base : `${base} (${count + 1})`
  })
  const mapeamento = mapearHeaders(headersUnicos)
  return { linha: melhor, colunas: headersUnicos, mapeamento }
}

/**
 * Constrói um Record<header, valor> para cada linha de dados a partir
 * da AOA e do cabeçalho detectado.
 */
function montarLinhasComoRecord(
  matrix: unknown[][],
  cabecalho: DeteccaoCabecalho,
): Array<{ linhaPlanilha: number; raw: Record<string, unknown> }> {
  const out: Array<{ linhaPlanilha: number; raw: Record<string, unknown> }> = []
  const colunas = cabecalho.colunas
  for (let i = cabecalho.linha + 1; i < matrix.length; i++) {
    const linha = matrix[i]!
    // Pula linhas totalmente vazias
    if (linha.every((c) => celulaParaString(c) === "")) continue
    const rec: Record<string, unknown> = {}
    for (let j = 0; j < colunas.length; j++) {
      rec[colunas[j]!] = linha[j] ?? null
    }
    out.push({ linhaPlanilha: i + 1, raw: rec })
  }
  return out
}

/**
 * Valida e normaliza uma linha em ProdutoNormalizado.
 * Retorna {valido: ProdutoNormalizado} ou {invalido: LinhaInvalida}.
 */
function normalizarLinha(
  linhaPlanilha: number,
  raw: Record<string, unknown>,
  cabecalho: DeteccaoCabecalho,
): { valido: ProdutoNormalizado } | { invalido: LinhaInvalida } {
  const inv = (motivos: string[]): LinhaInvalida => {
    const campos: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) {
      const s = celulaParaString(v)
      if (s) campos[k] = s
    }
    return { linha: linhaPlanilha, motivos, campos }
  }

  // Coleta valores por campo canônico
  const valoresPorCampo: Record<string, string[]> = {
    sku: [],
    barcode: [],
    nome: [],
    custo: [],
    preco: [],
    estoque: [],
    categoria: [],
  }
  for (const [header, campo] of Object.entries(cabecalho.mapeamento)) {
    if (!campo) continue
    const s = celulaParaString(raw[header])
    if (s) valoresPorCampo[campo]!.push(s)
  }

  const nome = (valoresPorCampo.nome[0] ?? "").trim()
  if (!nome) {
    return { invalido: inv(["nome vazio"]) }
  }
  if (nome.length > 500) {
    return { invalido: inv(["nome muito longo (provável termo/contrato)"]) }
  }

  const motivos: string[] = []

  const custoRaw = valoresPorCampo.custo[0]
  const precoRaw = valoresPorCampo.preco[0]
  const estoqueRaw = valoresPorCampo.estoque[0]

  let custo = parseNumeroBr(custoRaw ?? "") ?? 0
  let preco = parseNumeroBr(precoRaw ?? "") ?? 0
  let estoqueNum = parseNumeroBr(estoqueRaw ?? "") ?? 0

  if (custoRaw && parseNumeroBr(custoRaw) === null) motivos.push("custo inválido")
  if (precoRaw && parseNumeroBr(precoRaw) === null) motivos.push("preço inválido")
  if (estoqueRaw && parseNumeroBr(estoqueRaw) === null) motivos.push("estoque inválido")

  // Sanitiza negativos: importadores não criam estoque negativo.
  if (estoqueNum < 0) estoqueNum = 0
  if (custo < 0) custo = 0
  if (preco < 0) preco = 0

  if (motivos.length > 0) {
    return { invalido: inv(motivos) }
  }

  return {
    valido: {
      linha: linhaPlanilha,
      sku: (valoresPorCampo.sku[0] ?? "").trim(),
      barcode: (valoresPorCampo.barcode[0] ?? "").trim(),
      nome,
      custo,
      preco,
      estoque: Math.round(estoqueNum),
      categoria: (valoresPorCampo.categoria[0] ?? "").trim(),
    },
  }
}

export type ProcessamentoArquivo = {
  cabecalho: DeteccaoCabecalho
  totalLinhasLidas: number
  validos: ProdutoNormalizado[]
  invalidos: LinhaInvalida[]
}

/**
 * Pipeline completo: buffer → AOA → detecta cabeçalho → normaliza linhas.
 * Devolve apenas listas — dedupe interno e DB são feitos em camadas
 * separadas (dedupe.ts) para isolar responsabilidades.
 */
export async function processarArquivoProdutos(
  buffer: Buffer,
  nomeArquivo: string,
): Promise<ProcessamentoArquivo> {
  const matrix = await lerArquivoComoMatrix(buffer, nomeArquivo)
  if (matrix.length === 0) {
    return {
      cabecalho: { linha: 0, colunas: [], mapeamento: {} },
      totalLinhasLidas: 0,
      validos: [],
      invalidos: [],
    }
  }

  const cabecalho = detectarCabecalho(matrix)
  if (cabecalho.colunas.length === 0) {
    return { cabecalho, totalLinhasLidas: 0, validos: [], invalidos: [] }
  }

  const linhas = montarLinhasComoRecord(matrix, cabecalho)
  const validos: ProdutoNormalizado[] = []
  const invalidos: LinhaInvalida[] = []
  for (const { linhaPlanilha, raw } of linhas) {
    const res = normalizarLinha(linhaPlanilha, raw, cabecalho)
    if ("valido" in res) validos.push(res.valido)
    else invalidos.push(res.invalido)
  }
  return {
    cabecalho,
    totalLinhasLidas: linhas.length,
    validos,
    invalidos,
  }
}

/** Limita tamanhos para o preview. */
export function recortarParaPreview(
  validos: ProdutoNormalizado[],
  invalidos: LinhaInvalida[],
): {
  amostra: ProdutoNormalizado[]
  invalidasReportadas: LinhaInvalida[]
} {
  return {
    amostra: validos.slice(0, MAX_AMOSTRA),
    invalidasReportadas: invalidos.slice(0, MAX_INVALIDAS_REPORTAR),
  }
}

/** Fatia um array em lotes de tamanho fixo. */
export function fatiarEmLotes<T>(itens: T[], tamanho: number): T[][] {
  if (tamanho <= 0) return [itens]
  const lotes: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho))
  }
  return lotes
}
