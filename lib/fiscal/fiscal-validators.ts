/**
 * Validadores fiscais puros (GOAL_002 — Fiscal Identity Per Store).
 *
 * Funções puras, sem I/O, testáveis. Usadas pela API de identidade fiscal para
 * validar CNPJ/IE/CEP/UF/código IBGE/ambiente/modelo/regime antes de persistir.
 * NÃO emitem nada; apenas validam o cadastro da identidade fiscal por loja.
 */

import {
  AmbienteFiscal,
  ModeloFiscal,
  RegimeTributario,
} from "@/generated/prisma"

export function onlyDigits(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D+/g, "")
}

/** UFs válidas (27 — 26 estados + DF). */
export const UFS_VALIDAS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const

export type UF = (typeof UFS_VALIDAS)[number]

export function isValidUf(raw: string | null | undefined): boolean {
  const v = String(raw ?? "").trim().toUpperCase()
  return (UFS_VALIDAS as readonly string[]).includes(v)
}

/** CNPJ com dígitos verificadores. Aceita com ou sem máscara. */
export function isValidCnpj(raw: string | null | undefined): boolean {
  const c = onlyDigits(raw)
  if (c.length !== 14) return false
  if (/^(\d)\1{13}$/.test(c)) return false // todos iguais
  const calcDv = (len: number): number => {
    let sum = 0
    let pos = len - 7
    for (let i = len; i >= 1; i--) {
      sum += Number(c[len - i]) * pos
      pos -= 1
      if (pos < 2) pos = 9
    }
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = calcDv(12)
  const d2 = calcDv(13)
  return d1 === Number(c[12]) && d2 === Number(c[13])
}

/**
 * IE — validação leniente e UF-agnóstica (a tabela por UF é extensa e muda por
 * legislação; a validação rigorosa por estado fica para a fase de emissão).
 * Aceita "ISENTO" (contribuinte isento) ou 2–14 dígitos.
 */
export function isValidInscricaoEstadual(raw: string | null | undefined): boolean {
  const v = String(raw ?? "").trim().toUpperCase()
  if (v === "" ) return true // IE opcional no cadastro da identidade
  if (v === "ISENTO" || v === "ISENTA") return true
  const d = onlyDigits(v)
  return d.length >= 2 && d.length <= 14
}

/** CEP: 8 dígitos. Vazio é aceito no cadastro (opcional). */
export function isValidCep(raw: string | null | undefined): boolean {
  const v = String(raw ?? "").trim()
  if (v === "") return true
  return onlyDigits(v).length === 8
}

/** Código de município IBGE: 7 dígitos. Vazio aceito no cadastro (opcional). */
export function isValidCodigoMunicipioIbge(raw: string | null | undefined): boolean {
  const v = String(raw ?? "").trim()
  if (v === "") return true
  return onlyDigits(v).length === 7
}

export function isValidAmbiente(raw: string | null | undefined): raw is AmbienteFiscal {
  return raw === AmbienteFiscal.HOMOLOGACAO || raw === AmbienteFiscal.PRODUCAO
}

export function isValidModeloFiscal(raw: string | null | undefined): raw is ModeloFiscal {
  return (
    raw === ModeloFiscal.NFCE ||
    raw === ModeloFiscal.SAT ||
    raw === ModeloFiscal.NFE
  )
}

export function isValidRegimeTributario(raw: string | null | undefined): raw is RegimeTributario {
  return (
    raw === RegimeTributario.SIMPLES_NACIONAL ||
    raw === RegimeTributario.SIMPLES_NACIONAL_EXCESSO ||
    raw === RegimeTributario.REGIME_NORMAL ||
    raw === RegimeTributario.MEI
  )
}

/**
 * CRT (Código de Regime Tributário) derivado do regime — fonte única, evita
 * divergência entre regime e CRT no XML futuro.
 *   1 = Simples Nacional · 2 = Simples Nacional (excesso sublimite)
 *   3 = Regime Normal     · 4 = Simples Nacional — MEI
 */
export function crtFromRegime(regime: RegimeTributario): number {
  switch (regime) {
    case RegimeTributario.SIMPLES_NACIONAL:
      return 1
    case RegimeTributario.SIMPLES_NACIONAL_EXCESSO:
      return 2
    case RegimeTributario.REGIME_NORMAL:
      return 3
    case RegimeTributario.MEI:
      return 4
    default:
      return 1
  }
}

/** CNAE principal: 7 dígitos quando informado. Vazio aceito (opcional no cadastro). */
export function isValidCnae(raw: string | null | undefined): boolean {
  const v = String(raw ?? "").trim()
  if (v === "") return true
  return onlyDigits(v).length === 7
}
