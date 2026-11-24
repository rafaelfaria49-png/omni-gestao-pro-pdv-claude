import { createHash, timingSafeEqual } from "node:crypto"

/**
 * Autorização de `/api/cron/saas` (padrão Vercel Cron: `Authorization: Bearer <CRON_SECRET>`).
 * Falha FECHADA: sem segredo configurado (ou curto demais), nada roda.
 * Comparação em tempo constante sobre os digests (tamanhos iguais, sem vazar comprimento).
 */

export const CRON_SECRET_MIN = 16

export type DecisaoCron = { ok: true } | { ok: false; status: 401 | 503; erro: "cron_nao_configurado" | "nao_autorizado" }

const digest = (v: string) => createHash("sha256").update(v, "utf8").digest()

export function autorizarCron(authorization: string | null | undefined, segredo: string | undefined): DecisaoCron {
  const s = (segredo ?? "").trim()
  if (s.length < CRON_SECRET_MIN) return { ok: false, status: 503, erro: "cron_nao_configurado" }
  const m = /^Bearer (.+)$/.exec((authorization ?? "").trim())
  const recebido = m ? m[1].trim() : ""
  // Compara sempre (mesmo com cabeçalho ausente) para não diferenciar por tempo.
  const igual = timingSafeEqual(digest(recebido), digest(s))
  return igual && recebido.length > 0 ? { ok: true } : { ok: false, status: 401, erro: "nao_autorizado" }
}
