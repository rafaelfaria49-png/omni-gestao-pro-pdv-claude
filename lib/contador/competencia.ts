/**
 * Contador HUB · contrato canônico de competência mensal.
 *
 * GOAL CONTADOR-HUB-COMPETENCIA-CONTRATOS-005
 *
 * Biblioteca pura de domínio:
 * - sem IO, React, router, cookies, sessão ou Prisma;
 * - timezone fixo America/Sao_Paulo (com histórico de horário de verão via Intl);
 * - período UTC semiaberto [inicio, fimExclusivo).
 *
 * Nenhum reader real é implementado aqui — apenas o contrato de fronteira mensal
 * e a tabela documental de regra de data por fonte (uso futuro).
 */

export const TIMEZONE_CONTADOR = "America/Sao_Paulo" as const

/** Competência mensal canônica (mês 1–12). */
export type Competencia = Readonly<{
  ano: number
  mes: number
}>

/**
 * Intervalo UTC semiaberto da competência:
 * [inicio, fimExclusivo) — `fimExclusivo` é a meia-noite local do 1º dia do mês seguinte.
 */
export type PeriodoUtc = Readonly<{
  inicio: Date
  fimExclusivo: Date
}>

/** Regra documental de qual data cada fonte deve usar em filtros futuros. */
export type RegraDataFonte = Readonly<{
  fonte: string
  campoData: string
  /** Filtro de status obrigatório, se houver. */
  filtroStatus?: string
  /** Notas para implementadores de readers futuros. */
  notas?: string
}>

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const

/** Regex estrito: exatamente AAAA-MM com mês 01–12. */
const COMPETENCIA_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

/**
 * Tabela canônica (documental) de regra de data por fonte.
 * Não implementa readers — apenas contrato para GOALs futuros.
 * Fiscal permanece atrás de CONTADOR_FISCAL_READER (não importar Fiscal aqui).
 */
export const REGRAS_DATA_POR_FONTE: readonly RegraDataFonte[] = [
  {
    fonte: "financeiro.movimentos",
    campoData: "dataCompetencia ou dataMovimento (a definir no reader)",
    notas: "Filtrar com PeriodoUtc da competência; multi-loja por storeId.",
  },
  {
    fonte: "financeiro.contas_receber",
    campoData: "dataEmissao / competencia do título (a definir no reader)",
    notas: "Usar [inicio, fimExclusivo) em UTC; nunca cortar por meia-noite local do servidor.",
  },
  {
    fonte: "financeiro.contas_pagar",
    campoData: "dataEmissao / competencia do título (a definir no reader)",
    notas: "Mesma fronteira PeriodoUtc da competência ativa.",
  },
  {
    fonte: "caixa.fechamentos",
    campoData: "periodo / data do fechamento (a definir no reader)",
    notas: "Somente registros no intervalo semiaberto da competência.",
  },
  {
    fonte: "nota_fiscal",
    campoData: "dataEmissao",
    filtroStatus: "autorizado",
    notas:
      "Somente status autorizado. Acesso exclusivamente atrás de CONTADOR_FISCAL_READER. " +
      "Não consultar NotaFiscal nem importar módulo Fiscal neste contrato.",
  },
  {
    fonte: "documentos.anexos_contador",
    campoData: "competencia (AAAA-MM) ou createdAt no período",
    notas: "Preferir tag de competência explícita quando existir.",
  },
] as const

export function isCompetencia(value: unknown): value is Competencia {
  if (value === null || typeof value !== "object") return false
  const v = value as { ano?: unknown; mes?: unknown }
  return (
    typeof v.ano === "number" &&
    Number.isInteger(v.ano) &&
    v.ano >= 1 &&
    v.ano <= 9999 &&
    typeof v.mes === "number" &&
    Number.isInteger(v.mes) &&
    v.mes >= 1 &&
    v.mes <= 12
  )
}

/**
 * Parse estrito de `AAAA-MM`.
 * Rejeita: espaços, barras, mês 00/13, `2026-6`, datas incompletas, objetos.
 */
export function parseCompetencia(input: unknown): Competencia | null {
  if (typeof input !== "string") return null
  const m = COMPETENCIA_RE.exec(input)
  if (!m) return null
  const ano = Number(m[1])
  const mes = Number(m[2])
  if (!Number.isInteger(ano) || !Number.isInteger(mes)) return null
  if (ano < 1 || ano > 9999) return null
  return Object.freeze({ ano, mes })
}

/** Formato canônico `AAAA-MM`. */
export function formatCompetencia(c: Competencia): string {
  assertCompetencia(c)
  return `${String(c.ano).padStart(4, "0")}-${String(c.mes).padStart(2, "0")}`
}

/**
 * Label em português para UI: `"Junho / 2026"`.
 * Espelha o seletor visual do Contador HUB.
 */
export function labelCompetencia(c: Competencia): string {
  assertCompetencia(c)
  return `${MESES_PT[c.mes - 1]} / ${c.ano}`
}

/** Label curto `"Junho/2026"` (microcopy de seções). */
export function labelCompetenciaCurta(c: Competencia): string {
  assertCompetencia(c)
  return `${MESES_PT[c.mes - 1]}/${c.ano}`
}

/** Código legado de UI `"MM/AAAA"` (ex.: `06/2026`). */
export function formatCompetenciaMmYyyy(c: Competencia): string {
  assertCompetencia(c)
  return `${String(c.mes).padStart(2, "0")}/${c.ano}`
}

/**
 * Competência “agora” no fuso America/Sao_Paulo.
 * `now` injetável para testes determinísticos.
 */
export function competenciaAtual(now: Date = new Date()): Competencia {
  const parts = getZonedParts(now)
  return Object.freeze({ ano: parts.year, mes: parts.month })
}

/**
 * Resolve o período UTC semiaberto da competência:
 * meia-noite local SP do dia 1 do mês → meia-noite local SP do dia 1 do mês seguinte.
 *
 * Não assume UTC-3 fixo: usa o offset real de America/Sao_Paulo (DST histórico).
 */
export function resolvePeriodoUtc(c: Competencia): PeriodoUtc {
  assertCompetencia(c)
  const inicio = zonedTimeToUtc(c.ano, c.mes, 1, 0, 0, 0)
  const next = competenciaProxima(c)
  const fimExclusivo = zonedTimeToUtc(next.ano, next.mes, 1, 0, 0, 0)
  return Object.freeze({ inicio, fimExclusivo })
}

export function competenciaAnterior(c: Competencia): Competencia {
  assertCompetencia(c)
  if (c.mes === 1) {
    return Object.freeze({ ano: c.ano - 1, mes: 12 })
  }
  return Object.freeze({ ano: c.ano, mes: c.mes - 1 })
}

export function competenciaProxima(c: Competencia): Competencia {
  assertCompetencia(c)
  if (c.mes === 12) {
    return Object.freeze({ ano: c.ano + 1, mes: 1 })
  }
  return Object.freeze({ ano: c.ano, mes: c.mes + 1 })
}

/**
 * Resolve `searchParams.c` (Next.js: string | string[] | undefined).
 * Inválido / ausente → competência atual em America/Sao_Paulo.
 */
export function resolveCompetenciaFromSearchParam(
  raw: string | string[] | undefined,
  now: Date = new Date(),
): Competencia {
  const value = Array.isArray(raw) ? raw[0] : raw
  return parseCompetencia(value) ?? competenciaAtual(now)
}

/* ───────────────────── timezone helpers (Intl only) ───────────────────── */

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function getZonedParts(date: Date): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE_CONTADOR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
  const map: Record<string, string> = {}
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === "24" ? "0" : map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

/**
 * Converte horário de parede em America/Sao_Paulo para instante UTC.
 * Itera o offset real (DST histórico) sem dependências externas.
 */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const desiredAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second)
  let utcMs = desiredAsUtcMs

  for (let i = 0; i < 4; i++) {
    const parts = getZonedParts(new Date(utcMs))
    const actualAsUtcMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    )
    const diff = desiredAsUtcMs - actualAsUtcMs
    if (diff === 0) break
    utcMs += diff
  }

  return new Date(utcMs)
}

function assertCompetencia(c: Competencia): void {
  if (!isCompetencia(c)) {
    throw new TypeError(
      `Competencia inválida: ${JSON.stringify(c)}. Esperado { ano: 1..9999, mes: 1..12 }.`,
    )
  }
}
