/**
 * Contrato canônico de data/hora comercial para regularização de Trocas e Devoluções
 * (GOAL=OMNI-PDV-TROCAS-BUSINESS-TIMEZONE-P1-001).
 *
 * Módulo PURO (sem I/O, sem React, sem Prisma) compartilhado entre UI, API e testes.
 *
 * Regras:
 * - Instantes no banco e na API trafegam em ISO UTC absoluto (`...Z`).
 * - A data civil comercial e a data/hora informadas no formulário (`datetime-local`)
 *   referem-se ao fuso da loja (`America/Sao_Paulo` por convenção canônica do repositório,
 *   extensível via parâmetro `timeZone`), NUNCA ao fuso local do navegador/runner nem a
 *   um offset fixo `-03:00` (datas históricas tiveram horário de verão `-02:00`).
 */
import {
  FUSO_LOJA_V3,
  diaCivilValidoV3,
  diaNaLojaV3,
  fimDoDiaLojaIsoV3,
  horaNaLojaV3,
  inicioDoDiaLojaIsoV3,
  paredeLojaParaIsoV3,
} from "@/lib/operacoes-v3/datas-operacionais-model"

export const TROCA_BUSINESS_TIMEZONE = FUSO_LOJA_V3

export interface CashSessionWindow {
  id: string
  abertaEm: string | Date
  fechadaEm: string | Date | null
}

export type ParsedBusinessDateTimeLocal =
  | {
      ok: true
      /** Dia civil comercial na loja (`YYYY-MM-DD`). */
      dia: string
      /** Horário de parede na loja (`HH:mm`). */
      hora: string
      /** Instante absoluto em ISO UTC (`...Z`). */
      iso: string
      /** Instante absoluto em epoch ms. */
      timestampMs: number
    }
  | {
      ok: false
      reason: "empty" | "invalid_format" | "invalid_date" | "ambiguous_or_nonexistent"
    }

export type BusinessDayBounds =
  | { ok: true; inicio: Date; fim: Date; dia: string }
  | { ok: false }

const DATETIME_LOCAL_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/

function resolveTz(timeZone?: string): string {
  const clean = (timeZone ?? "").trim()
  return clean || TROCA_BUSINESS_TIMEZONE
}

/**
 * Converte um instante absoluto (UTC `Date` ou ISO) para o valor de parede
 * `YYYY-MM-DDTHH:mm` esperado por `<input type="datetime-local">`, no fuso
 * comercial da loja — independente do fuso do navegador ou runner.
 */
export function formatInstantToBusinessDateTimeLocal(
  instant: Date | string,
  timeZone?: string,
): string {
  const d = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(d.getTime())) return ""
  const iso = d.toISOString()
  const tz = resolveTz(timeZone)
  const dia = diaNaLojaV3(iso, tz)
  const hora = horaNaLojaV3(iso, tz)
  return dia && hora ? `${dia}T${hora}` : ""
}

/**
 * Interpreta o valor `YYYY-MM-DDTHH:mm` (ou `YYYY-MM-DDTHH:mm:ss`) de um
 * `<input type="datetime-local">` estritamente no fuso comercial da loja,
 * devolvendo o dia civil comercial (`dia`) e o instante absoluto em UTC (`iso`, `timestampMs`).
 */
export function parseBusinessDateTimeLocal(
  raw: string | null | undefined,
  timeZone?: string,
): ParsedBusinessDateTimeLocal {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) return { ok: false, reason: "empty" }

  const match = DATETIME_LOCAL_RE.exec(trimmed)
  if (!match) return { ok: false, reason: "invalid_format" }

  const dia = match[1]!
  const hora = match[2]!
  const secStr = match[3]
  const msStr = match[4]

  if (!diaCivilValidoV3(dia)) return { ok: false, reason: "invalid_date" }

  const [hh, mm] = hora.split(":").map(Number)
  const ss = secStr ? Number(secStr) : 0
  const ms = msStr ? Number(msStr.padEnd(3, "0")) : 0
  if (
    hh === undefined ||
    mm === undefined ||
    hh < 0 ||
    hh > 23 ||
    mm < 0 ||
    mm > 59 ||
    ss < 0 ||
    ss > 59
  ) {
    return { ok: false, reason: "invalid_format" }
  }

  const tz = resolveTz(timeZone)
  const baseIso = paredeLojaParaIsoV3(dia, hora, tz)
  if (!baseIso) return { ok: false, reason: "ambiguous_or_nonexistent" }

  const timestampMs = Date.parse(baseIso) + ss * 1000 + ms
  return {
    ok: true,
    dia,
    hora,
    iso: new Date(timestampMs).toISOString(),
    timestampMs,
  }
}

/**
 * Calcula os limites absolutos (UTC) `[inicio, fim]` de um dia civil comercial
 * (`YYYY-MM-DD`) no fuso da loja, via `Intl.DateTimeFormat` (sem offset fixo `-03:00`).
 */
export function resolveBusinessDayBounds(
  dia: string | null | undefined,
  timeZone?: string,
): BusinessDayBounds {
  const clean = (dia ?? "").trim()
  if (!diaCivilValidoV3(clean)) return { ok: false }
  const tz = resolveTz(timeZone)
  const inicioIso = inicioDoDiaLojaIsoV3(clean, tz)
  const fimIso = fimDoDiaLojaIsoV3(clean, tz)
  if (!inicioIso || !fimIso) return { ok: false }
  return {
    ok: true,
    dia: clean,
    inicio: new Date(inicioIso),
    fim: new Date(fimIso),
  }
}

/**
 * Seleciona automaticamente a única sessão de caixa cujo intervalo `[abertaEm, fechadaEm]`
 * cobre o instante absoluto `instantMs`. Retorna `""` se nenhuma ou mais de uma cobrir.
 */
export function selectCoveringCashSessionId(
  sessoes: ReadonlyArray<CashSessionWindow>,
  instantMs: number,
): string {
  if (!Number.isFinite(instantMs)) return ""
  const matches = sessoes.filter((s) => {
    const start = s.abertaEm instanceof Date ? s.abertaEm.getTime() : Date.parse(s.abertaEm)
    if (!Number.isFinite(start) || instantMs < start) return false
    if (s.fechadaEm === null || s.fechadaEm === undefined || s.fechadaEm === "") return true
    const end = s.fechadaEm instanceof Date ? s.fechadaEm.getTime() : Date.parse(s.fechadaEm)
    return Number.isFinite(end) && instantMs <= end
  })
  return matches.length === 1 ? matches[0]!.id : ""
}

/**
 * Formata um instante absoluto ISO para exibição `dd/mm/aaaa, hh:mm` no fuso comercial
 * da loja — garantindo consistência entre a lista de sessões, o comprovante e o input.
 */
export function formatInstantBusinessPtBr(
  iso: string | Date,
  timeZone?: string,
): string {
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("pt-BR", {
    timeZone: resolveTz(timeZone),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
