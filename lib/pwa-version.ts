/**
 * PWA stale guard — comparação de versão do bundle em execução vs. deploy atual.
 *
 * Sem dependência de DOM; as funções de decisão são puras e testáveis. O componente
 * `components/pwa/pwa-update-prompt.tsx` consome `currentAppVersion()` +
 * `fetchDeployedVersion()` e decide a severidade com `evaluateStaleness()`.
 */

export type AppVersion = {
  buildId: string
  /** ISO string do momento do build, ou null se indisponível. */
  buildTime: string | null
}

export type StaleSeverity = "none" | "warn" | "strong"

export type StalenessResult = {
  stale: boolean
  severity: StaleSeverity
  /** Quão mais novo o deploy é que o bundle em execução (ms). 0 se desconhecido. */
  ageMs: number
}

/** Acima disso a versão é considerada "muito atrasada" → alerta forte. */
export const STALE_STRONG_AFTER_MS = 6 * 60 * 60 * 1000 // 6 horas

/** Versão embutida NESTE bundle (inlined em build via `next.config.mjs`). */
export function currentAppVersion(): AppVersion {
  return {
    buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev",
    buildTime: process.env.NEXT_PUBLIC_BUILD_TIME ?? null,
  }
}

/**
 * Decide se o bundle em execução está desatualizado e com que gravidade.
 *
 * Regras (conservadoras — nunca marca stale por engano):
 * - Sem id de deploy ou id "dev" → nunca stale (evita falso-positivo em dev).
 * - ids iguais → não stale.
 * - ids diferentes → stale. Severidade pela diferença de tempo de build:
 *   `< strongAfterMs` = `warn` (poucas horas), `>=` = `strong` (muito atrasada).
 *   Sem timestamps confiáveis, assume `warn` (degrada para o aviso mais brando).
 */
export function evaluateStaleness(
  current: AppVersion,
  deployed: AppVersion | null,
  strongAfterMs: number = STALE_STRONG_AFTER_MS,
): StalenessResult {
  if (!deployed || !deployed.buildId || deployed.buildId === "dev") {
    return { stale: false, severity: "none", ageMs: 0 }
  }
  if (!current.buildId || current.buildId === "dev") {
    return { stale: false, severity: "none", ageMs: 0 }
  }
  if (current.buildId === deployed.buildId) {
    return { stale: false, severity: "none", ageMs: 0 }
  }

  let ageMs = 0
  const ct = current.buildTime ? Date.parse(current.buildTime) : NaN
  const dt = deployed.buildTime ? Date.parse(deployed.buildTime) : NaN
  if (Number.isFinite(ct) && Number.isFinite(dt)) {
    ageMs = Math.max(0, dt - ct)
  }

  const severity: StaleSeverity = ageMs >= strongAfterMs ? "strong" : "warn"
  return { stale: true, severity, ageMs }
}

/** Busca a versão do deploy atual. Devolve null em qualquer falha (rede/parse). */
export async function fetchDeployedVersion(signal?: AbortSignal): Promise<AppVersion | null> {
  try {
    const res = await fetch("/api/version", { cache: "no-store", signal })
    if (!res.ok) return null
    const data = (await res.json()) as Partial<AppVersion> | null
    if (!data || typeof data.buildId !== "string") return null
    return {
      buildId: data.buildId,
      buildTime: typeof data.buildTime === "string" ? data.buildTime : null,
    }
  } catch {
    return null
  }
}
