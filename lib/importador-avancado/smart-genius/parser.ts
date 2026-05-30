// ============================================================
// lib/importador-avancado/smart-genius/parser.ts
// Parser server-side dos dois relatórios Smart Genius.
// buffer .xls/.xlsx → grade (AOA) → detecção → linhas normalizadas.
//
// Server-only: importa "xlsx" dinamicamente (igual aos parsers existentes).
// ============================================================

import { detectarSmartLayout } from "./detectar"
import { celula, numero, telefone, dataIso } from "./normalizar"
import type {
  SmartClienteNormalizado,
  SmartContaReceberNormalizada,
  SmartClientesParse,
  SmartContasReceberParse,
  SmartLinhaInvalida,
  SmartDeteccao,
} from "./tipos"

/** Lê a primeira aba como AOA (array-of-arrays), preservando posição de coluna. */
export async function lerGradeXls(buffer: Buffer): Promise<unknown[][]> {
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

/**
 * Normaliza rótulo de coluna → chave de match. Colapsa toda pontuação
 * (incluindo ":" final dos rótulos de Contas e o "." interno de "Tot. Reaj")
 * em espaço, para que aliases sem pontuação casem de forma estável.
 */
function normRot(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/**
 * Constrói mapa rótuloNormalizado → índiceColuna a partir de uma (ou duas)
 * linhas de cabeçalho. Quando o mesmo rótulo aparece 2x, mantém o primeiro.
 */
function mapaColunas(grade: unknown[][], deteccao: SmartDeteccao): Map<string, number> {
  const mapa = new Map<string, number>()
  const linhas = [grade[deteccao.headerRow] ?? []]
  if (deteccao.headerRowExtra != null) linhas.push(grade[deteccao.headerRowExtra] ?? [])
  for (const linha of linhas) {
    for (let c = 0; c < linha.length; c++) {
      const r = normRot(linha[c])
      if (r && !mapa.has(r)) mapa.set(r, c)
    }
  }
  return mapa
}

/** Resolve o índice da coluna por uma lista de aliases (primeiro que casar). */
function col(mapa: Map<string, number>, ...aliases: string[]): number {
  for (const a of aliases) {
    const i = mapa.get(normRot(a))
    if (i != null) return i
  }
  return -1
}

/** Última linha de cabeçalho (dados começam depois dela). */
function primeiraLinhaDados(deteccao: SmartDeteccao): number {
  return Math.max(deteccao.headerRow, deteccao.headerRowExtra ?? -1) + 1
}

// ── Clientes ─────────────────────────────────────────────────

export function parsearClientesDaGrade(
  grade: unknown[][],
  deteccao: SmartDeteccao,
): SmartClientesParse {
  const mapa = mapaColunas(grade, deteccao)
  const cCodigo = col(mapa, "codigo")
  const cNome = col(mapa, "nome")
  const cTelefone = col(mapa, "telefone")
  const cCidade = col(mapa, "cidade")

  const validos: SmartClienteNormalizado[] = []
  const invalidos: SmartLinhaInvalida[] = []
  const inicio = primeiraLinhaDados(deteccao)
  let lidas = 0

  for (let i = inicio; i < grade.length; i++) {
    const linha = grade[i] ?? []
    // Pula linhas totalmente vazias.
    if (linha.every((c) => celula(c) === "")) continue
    lidas++
    const linhaPlanilha = i + 1
    const nome = cNome >= 0 ? celula(linha[cNome]) : ""
    if (!nome) {
      invalidos.push({ linha: linhaPlanilha, motivos: ["nome vazio"] })
      continue
    }
    validos.push({
      linha: linhaPlanilha,
      codigoLegado: cCodigo >= 0 ? celula(linha[cCodigo]) : "",
      nome,
      telefone: cTelefone >= 0 ? telefone(linha[cTelefone]) : "",
      cidade: cCidade >= 0 ? celula(linha[cCidade]) : "",
    })
  }

  return { layout: "smart_clientes", validos, invalidos, totalLinhasLidas: lidas }
}

// ── Contas a Receber ─────────────────────────────────────────

export function parsearContasReceberDaGrade(
  grade: unknown[][],
  deteccao: SmartDeteccao,
): SmartContasReceberParse {
  const mapa = mapaColunas(grade, deteccao)
  const cCodigo = col(mapa, "codigo")
  const cNome = col(mapa, "nome")
  const cTelefone = col(mapa, "telefone")
  const cMenorVenc = col(mapa, "menor venc", "menor vencimento")
  const cEmAtraso = col(mapa, "em atraso")
  const cAVencer = col(mapa, "a vencer")
  const cTotal = col(mapa, "total")
  const cReaj = col(mapa, "reaj")
  const cTotReaj = col(mapa, "tot reaj", "total reaj")

  const validos: SmartContaReceberNormalizada[] = []
  const invalidos: SmartLinhaInvalida[] = []
  const inicio = primeiraLinhaDados(deteccao)
  let lidas = 0

  for (let i = inicio; i < grade.length; i++) {
    const linha = grade[i] ?? []
    if (linha.every((c) => celula(c) === "")) continue
    lidas++
    const linhaPlanilha = i + 1
    const cliente = cNome >= 0 ? celula(linha[cNome]) : ""
    const emAtraso = cEmAtraso >= 0 ? numero(linha[cEmAtraso]) : 0
    const aVencer = cAVencer >= 0 ? numero(linha[cAVencer]) : 0

    // Linha sem nome E sem saldo → ruído (não reporta como erro).
    if (!cliente && emAtraso === 0 && aVencer === 0) continue
    if (!cliente) {
      invalidos.push({ linha: linhaPlanilha, motivos: ["cliente vazio"] })
      continue
    }

    validos.push({
      linha: linhaPlanilha,
      codigoLegado: cCodigo >= 0 ? celula(linha[cCodigo]) : "",
      cliente,
      telefone: cTelefone >= 0 ? telefone(linha[cTelefone]) : "",
      menorVencimento: cMenorVenc >= 0 ? dataIso(linha[cMenorVenc]) : "",
      emAtraso,
      aVencer,
      total: cTotal >= 0 ? numero(linha[cTotal]) : 0,
      reaj: cReaj >= 0 ? numero(linha[cReaj]) : 0,
      totalReaj: cTotReaj >= 0 ? numero(linha[cTotReaj]) : 0,
    })
  }

  return { layout: "smart_contas_receber", validos, invalidos, totalLinhasLidas: lidas }
}

// ── Entry point ──────────────────────────────────────────────

export type SmartParseResult =
  | { ok: true; clientes: SmartClientesParse }
  | { ok: true; contas: SmartContasReceberParse }
  | { ok: false; motivo: "nao_e_smart" }

/**
 * Pipeline: buffer → grade → detecta → parseia.
 * Retorna `{ ok:false, motivo:"nao_e_smart" }` quando o arquivo não é um dos
 * dois relatórios Smart (o chamador então segue com o fluxo genérico).
 */
export async function parsearArquivoSmart(buffer: Buffer, nomeArquivo: string): Promise<SmartParseResult> {
  const grade = await lerGradeXls(buffer)
  const deteccao = detectarSmartLayout(grade, nomeArquivo)
  if (!deteccao) return { ok: false, motivo: "nao_e_smart" }
  if (deteccao.layout === "smart_clientes") {
    return { ok: true, clientes: parsearClientesDaGrade(grade, deteccao) }
  }
  return { ok: true, contas: parsearContasReceberDaGrade(grade, deteccao) }
}
