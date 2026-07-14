/**
 * Rate limit do portal legado do Contador — em memória, por instância do processo.
 * Proteção local/best-effort: não é distribuída, reinicia a cada deploy/restart e não é
 * compartilhada entre múltiplas instâncias serverless. Suficiente para o P0 deste GOAL;
 * não adiciona Redis/banco/dependência nova.
 */

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

type Bucket = { count: number; windowStart: number }

const buckets = new Map<string, Bucket>()

export type ContadorRateLimitResult = { limited: false } | { limited: true; retryAfterSeconds: number }

function isWindowExpired(bucket: Bucket, nowMs: number): boolean {
  return nowMs - bucket.windowStart >= WINDOW_MS
}

export function checkContadorRateLimit(key: string, nowMs: number = Date.now()): ContadorRateLimitResult {
  const bucket = buckets.get(key)
  if (!bucket || isWindowExpired(bucket, nowMs)) return { limited: false }
  if (bucket.count < MAX_ATTEMPTS) return { limited: false }
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.windowStart + WINDOW_MS - nowMs) / 1000))
  return { limited: true, retryAfterSeconds }
}

export function registerContadorAuthFailure(key: string, nowMs: number = Date.now()): void {
  const bucket = buckets.get(key)
  if (!bucket || isWindowExpired(bucket, nowMs)) {
    buckets.set(key, { count: 1, windowStart: nowMs })
    return
  }
  bucket.count += 1
}

/** Tentativa bem-sucedida limpa o estado do IP. */
export function registerContadorAuthSuccess(key: string): void {
  buckets.delete(key)
}

/** Uso exclusivo dos testes — reseta o estado em memória entre casos. */
export function __resetContadorRateLimitForTests(): void {
  buckets.clear()
}
