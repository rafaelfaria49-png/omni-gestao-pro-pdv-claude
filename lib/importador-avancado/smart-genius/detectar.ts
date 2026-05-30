// ============================================================
// lib/importador-avancado/smart-genius/detectar.ts
// Detecção ESTRITA dos dois layouts Smart Genius desta entrega.
//
// Filosofia anti-falso-positivo: o gatilho é a ASSINATURA DE BANNER que o
// Smart Genius imprime na primeira linha do relatório
// ("Listagem de Clientes" / "Listagem de Contas a Receber"), confirmada por
// rótulos esperados nas primeiras linhas. Gestão Clique e Smart Genius
// Produtos NÃO têm esse banner — portanto não casam aqui e continuam no
// fluxo genérico do Importador Avançado.
// ============================================================

import type { SmartDeteccao, SmartGeniusLayout } from "./tipos"

/** Normaliza texto de célula: trim, lowercase, sem acento, espaços colapsados. */
function norm(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Primeira célula não-vazia de uma linha (Smart imprime o banner deslocado). */
function primeiraCelulaPreenchida(linha: unknown[]): string {
  for (const c of linha) {
    const s = String(c ?? "").trim()
    if (s) return s
  }
  return ""
}

/** Junta todas as células não-vazias de uma linha num texto normalizado. */
function linhaComoTexto(linha: unknown[]): string {
  return linha
    .map((c) => norm(c))
    .filter(Boolean)
    .join(" | ")
}

const JANELA_BANNER = 6 // o banner Smart está sempre nas primeiras linhas

// Assinaturas de banner (normalizadas). Específicas o suficiente para não
// colidir com Gestão Clique ("Relatório de…") nem Smart Produtos.
const BANNER_CLIENTES = "listagem de clientes"
const BANNER_CONTAS_RECEBER = "listagem de contas a receber"

/** Rótulos que confirmam o cabeçalho de Clientes (espalhados em 1-2 linhas). */
const ROTULOS_CLIENTES = ["codigo", "nome"]
/** Rótulos que confirmam o cabeçalho de Contas a Receber (terminados em ":"). */
const ROTULOS_CONTAS = ["nome", "menor venc", "em atraso", "a vencer", "total"]

type Achado = { layout: SmartGeniusLayout; bannerRow: number }

/** Procura a linha de banner Smart na janela inicial. Retorna null se não houver. */
function acharBanner(grade: unknown[][]): Achado | null {
  const max = Math.min(grade.length, JANELA_BANNER)
  for (let i = 0; i < max; i++) {
    const primeira = norm(primeiraCelulaPreenchida(grade[i] ?? []))
    if (!primeira) continue
    if (primeira === BANNER_CONTAS_RECEBER || primeira.startsWith(BANNER_CONTAS_RECEBER)) {
      return { layout: "smart_contas_receber", bannerRow: i }
    }
    if (primeira === BANNER_CLIENTES || primeira.startsWith(BANNER_CLIENTES)) {
      return { layout: "smart_clientes", bannerRow: i }
    }
  }
  return null
}

/**
 * Confirma e localiza o cabeçalho real após o banner.
 * - Clientes: cabeçalho pode estar quebrado em 2 linhas (ex.: "Codigo/Telefone/Cidade"
 *   numa linha e "Nome" na seguinte). Detecta ambas.
 * - Contas a Receber: cabeçalho numa única linha com rótulos terminados em ":".
 */
function localizarCabecalho(
  grade: unknown[][],
  achado: Achado,
): SmartDeteccao | null {
  const rotulos = achado.layout === "smart_clientes" ? ROTULOS_CLIENTES : ROTULOS_CONTAS
  const inicio = achado.bannerRow + 1
  const fim = Math.min(grade.length, inicio + 4)

  let headerRow = -1
  let melhorScore = 0
  for (let i = inicio; i < fim; i++) {
    const txt = linhaComoTexto(grade[i] ?? [])
    if (!txt) continue
    const score = rotulos.filter((r) => txt.includes(r)).length
    if (score > melhorScore) {
      melhorScore = score
      headerRow = i
    }
  }

  if (headerRow < 0 || melhorScore === 0) return null

  // Clientes: o rótulo "nome" às vezes cai na linha seguinte ao "codigo".
  let headerRowExtra: number | null = null
  if (achado.layout === "smart_clientes") {
    const headerTxt = linhaComoTexto(grade[headerRow] ?? [])
    if (!headerTxt.includes("nome")) {
      const prox = headerRow + 1
      const proxTxt = linhaComoTexto(grade[prox] ?? [])
      if (proxTxt.includes("nome")) headerRowExtra = prox
    }
  }

  return { layout: achado.layout, headerRow, headerRowExtra }
}

/**
 * Detecta se a grade (AOA) é um dos dois relatórios Smart Genius desta entrega.
 * Retorna `null` quando NÃO é Smart (deixa o fluxo genérico seguir intacto).
 *
 * @param grade   matriz array-of-arrays (header:1) da primeira aba
 * @param nomeArquivo  usado apenas como reforço fraco; o banner é a fonte primária
 */
export function detectarSmartLayout(
  grade: unknown[][],
  nomeArquivo?: string,
): SmartDeteccao | null {
  if (!Array.isArray(grade) || grade.length === 0) return null

  const achado = acharBanner(grade)
  if (!achado) return null

  const deteccao = localizarCabecalho(grade, achado)
  if (!deteccao) return null

  // Reforço opcional por nome de arquivo (não é obrigatório — banner já decidiu).
  void nomeArquivo
  return deteccao
}
