/**
 * Chave de acesso da NFC-e (44 dígitos) — PURO e DETERMINÍSTICO (BL-FISCAL-004).
 *
 * Composição (NT 2018+):
 *   cUF(2) + AAMM(4) + CNPJ(14) + mod(2) + serie(3) + nNF(9) + tpEmis(1) + cNF(8) + cDV(1)
 *
 * Tudo aqui é cálculo ESTRUTURAL (montagem de identificador + dígito verificador mod-11),
 * NUNCA cálculo tributário. Os componentes que NÃO vêm do snapshot (série, número) são
 * recebidos por parâmetro — ver `NfceXmlContext` no builder.
 */

import { onlyDigits } from "../fiscal-validators"

/** Código IBGE da UF (cUF) — 2 dígitos. */
const CODIGO_UF: Record<string, string> = {
  AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23", DF: "53",
  ES: "32", GO: "52", MA: "21", MT: "51", MS: "50", MG: "31", PA: "15",
  PB: "25", PR: "41", PE: "26", PI: "22", RJ: "33", RN: "24", RS: "43",
  RO: "11", RR: "14", SC: "42", SP: "35", SE: "28", TO: "17",
}

export function codigoUf(uf: string | null | undefined): string | null {
  const v = String(uf ?? "").trim().toUpperCase()
  return CODIGO_UF[v] ?? null
}

function pad(value: string | number, len: number): string {
  return onlyDigits(String(value)).padStart(len, "0").slice(-len)
}

/**
 * Dígito verificador da chave (mod-11, pesos 2..9 ciclando da direita p/ esquerda).
 * Resto 0 ou 1 → DV 0; senão DV = 11 − resto.
 */
export function calcularDigitoVerificadorChave(chave43: string): string {
  const digits = onlyDigits(chave43)
  let soma = 0
  let peso = 2
  for (let i = digits.length - 1; i >= 0; i--) {
    soma += Number(digits[i]) * peso
    peso = peso === 9 ? 2 : peso + 1
  }
  const resto = soma % 11
  const dv = resto === 0 || resto === 1 ? 0 : 11 - resto
  return String(dv)
}

export type ChaveAcessoParams = {
  cUF: string
  /** AAMM da emissão (ano com 2 dígitos + mês). */
  aamm: string
  cnpj: string
  /** Modelo do documento (NFC-e = 65). */
  modelo: string | number
  serie: string | number
  numero: string | number
  /** Tipo de emissão (1 = normal). */
  tpEmis: string | number
  /** Código numérico aleatório/derivado (cNF), 8 dígitos. */
  cNF: string | number
}

/** Monta a chave de 44 dígitos (43 + DV). Componentes são normalizados/preenchidos. */
export function montarChaveAcesso(p: ChaveAcessoParams): string {
  const base =
    pad(p.cUF, 2) +
    pad(p.aamm, 4) +
    pad(p.cnpj, 14) +
    pad(p.modelo, 2) +
    pad(p.serie, 3) +
    pad(p.numero, 9) +
    pad(p.tpEmis, 1) +
    pad(p.cNF, 8)
  return base + calcularDigitoVerificadorChave(base)
}

/**
 * cNF determinístico (8 dígitos) derivado de uma semente (vendaId+serie+numero).
 * NFC-e exige cNF ≠ nNF — garantimos o ajuste. Determinístico (sem Math.random).
 */
export function cNfDeterministico(seed: string, numero: string | number): string {
  let h = 2166136261
  const s = String(seed)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let n = (h >>> 0) % 100000000
  const numeroDigits = Number(onlyDigits(String(numero))) % 100000000
  if (n === numeroDigits) n = (n + 1) % 100000000
  return String(n).padStart(8, "0")
}

/** AAMM (ano 2 díg + mês) na hora local -03:00 (Brasília), determinístico a partir do instante. */
export function aammDe(data: string | Date): string {
  const d = new Date(typeof data === "string" ? data : data.getTime())
  const ms = d.getTime()
  const base = Number.isFinite(ms) ? ms : 0
  const shifted = new Date(base - 3 * 3600 * 1000)
  const yy = String(shifted.getUTCFullYear() % 100).padStart(2, "0")
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  return yy + mm
}

/** dhEmi no formato NFe `YYYY-MM-DDThh:mm:ss-03:00` (Brasília), determinístico. */
export function formatDhEmi(data: string | Date): string {
  const d = new Date(typeof data === "string" ? data : data.getTime())
  const ms = d.getTime()
  const base = Number.isFinite(ms) ? ms : 0
  const shifted = new Date(base - 3 * 3600 * 1000)
  const p2 = (n: number) => String(n).padStart(2, "0")
  const Y = shifted.getUTCFullYear()
  const M = p2(shifted.getUTCMonth() + 1)
  const D = p2(shifted.getUTCDate())
  const h = p2(shifted.getUTCHours())
  const mi = p2(shifted.getUTCMinutes())
  const s = p2(shifted.getUTCSeconds())
  return `${Y}-${M}-${D}T${h}:${mi}:${s}-03:00`
}
