/**
 * Utilitários PUROS do XML Builder da NFC-e (GOAL_009).
 *
 * Tudo aqui é determinístico e sem efeitos: escape, formatação numérica fixa, tabelas de
 * código (UF→cUF, modelo→mod, ambiente→tpAmb, forma→tPag), montadores de nó e o hash interno.
 * Sem Prisma, sem rede, sem Date.now — nada que quebre "mesmo snapshot → mesmo XML".
 */
import { onlyDigits } from "../fiscal-validators"
import type { NfcePagamentoLinha, NfceXmlPagamentoSnapshot } from "./xml-types"

export { onlyDigits }

export function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim()
}

export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Money fixo em 2 casas (ponto decimal — padrão NFe). */
export function money(v: unknown): string {
  return num(v).toFixed(2)
}

/** Quantidade fixa em 4 casas (padrão NFe). */
export function qty(v: unknown): string {
  return num(v).toFixed(4)
}

/** Valor unitário fixo em 2 casas (determinístico nesta fase dormente). */
export function unit(v: unknown): string {
  return num(v).toFixed(2)
}

/** Escapa os 5 caracteres especiais de XML, de forma estável. */
export function escapeXml(v: unknown): string {
  return s(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** Nó com filhos já serializados (sem escapar — `inner` é XML). */
export function node(name: string, inner: string): string {
  return `<${name}>${inner}</${name}>`
}

/** Folha com texto (escapado). Emitida MESMO vazia (campos podem ficar vazios nesta fase). */
export function leaf(name: string, value: unknown): string {
  return `<${name}>${escapeXml(value)}</${name}>`
}

/** Folha OPCIONAL: omitida quando o valor é vazio. */
export function optLeaf(name: string, value: unknown): string {
  const t = escapeXml(value)
  return t ? `<${name}>${t}</${name}>` : ""
}

// ── Tabelas de código (determinísticas) ─────────────────────────────────────────────────

const UF_CODIGO: Record<string, string> = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17",
  MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27", SE: "28", BA: "29",
  MG: "31", ES: "32", RJ: "33", SP: "35",
  PR: "41", SC: "42", RS: "43",
  MS: "50", MT: "51", GO: "52", DF: "53",
}

/** Código IBGE da UF (2 dígitos) a partir da sigla. Vazio quando desconhecida. */
export function ufToCodigo(uf: unknown): string {
  return UF_CODIGO[s(uf).toUpperCase()] ?? ""
}

/** Modelo do documento: NFC-e → 65, NF-e → 55. */
export function modeloToMod(modelo: unknown): string {
  const m = s(modelo).toUpperCase()
  if (m === "NFCE" || m === "NFC-E" || m === "65") return "65"
  if (m === "NFE" || m === "NF-E" || m === "55") return "55"
  return ""
}

/** Ambiente: PRODUCAO → 1, HOMOLOGACAO → 2 (default 2 — seguro). */
export function ambienteToTpAmb(ambiente: unknown): string {
  return s(ambiente).toUpperCase().startsWith("PROD") ? "1" : "2"
}

// ── Pagamentos ────────────────────────────────────────────────────────────────────────

const TPAG: Record<string, string> = {
  dinheiro: "01",
  cheque: "02",
  cartao_credito: "03",
  credito: "03",
  cartao: "03",
  cartao_debito: "04",
  debito: "04",
  credito_loja: "05",
  vale_alimentacao: "10",
  vale_refeicao: "11",
  vale_presente: "12",
  vale: "12",
  vale_combustivel: "13",
  boleto: "15",
  deposito: "16",
  pix: "17",
  transferencia: "18",
  ted: "18",
  cashback: "19",
  sem_pagamento: "90",
  outros: "99",
}

/** Normaliza a chave de forma de pagamento (minúsculas, sem acento, separadores → "_"). */
function normFormaKey(k: string): string {
  return s(k)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}

/** Mapeia uma forma de pagamento para o código `tPag` (default 99 = outros). */
export function formaToTPag(forma: string): string {
  return TPAG[normFormaKey(forma)] ?? "99"
}

/** Extrai um valor numérico de uma entrada do paymentBreakdown (número direto ou {valor/value/amount}). */
function valorDaEntrada(v: unknown): number {
  if (typeof v === "number") return v
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    return num(o.valor ?? o.value ?? o.amount ?? o.total)
  }
  return num(v)
}

/**
 * Linhas de pagamento DETERMINÍSTICAS a partir do snapshot congelado:
 *  - usa `pagamento.venda.paymentBreakdown` (entradas com valor > 0), ordenadas por (tPag, origem);
 *  - sem breakdown utilizável: 1 linha dinheiro (01) com o total quando há total; senão sem pagamento (90).
 */
export function extrairPagamentos(
  pagamento: NfceXmlPagamentoSnapshot,
  totalFallback: number,
): NfcePagamentoLinha[] {
  const breakdown = pagamento?.venda?.paymentBreakdown
  const linhas: NfcePagamentoLinha[] = []
  if (breakdown && typeof breakdown === "object" && !Array.isArray(breakdown)) {
    for (const [k, raw] of Object.entries(breakdown)) {
      const vPag = num(valorDaEntrada(raw))
      if (vPag > 0) linhas.push({ tPag: formaToTPag(k), vPag, origem: normFormaKey(k) })
    }
  }
  if (linhas.length === 0) {
    const total = num(totalFallback)
    return total > 0
      ? [{ tPag: "01", vPag: total, origem: "dinheiro" }]
      : [{ tPag: "90", vPag: 0, origem: "sem_pagamento" }]
  }
  // Ordem determinística: por código e depois por origem.
  return linhas.sort((a, b) => (a.tPag === b.tPag ? a.origem.localeCompare(b.origem) : a.tPag.localeCompare(b.tPag)))
}

// ── Hash interno (FNV-1a 32-bit) — determinístico, sem dependências ──────────────────────

export function xmlHash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}
