/**
 * Manifesto de atualização do EXECUTÁVEL (não do sistema web, que se atualiza pelo deploy).
 *
 * V1: apenas AVISA que há versão nova e abre a página de download no navegador.
 * Não baixa, não instala e nunca reinicia o app sozinho (poderia interromper uma venda).
 */

import type { DesktopChannel } from "./build-config"

export interface UpdateManifest {
  channel: DesktopChannel
  version: string
  /** Página https onde o operador baixa o instalador assinado. */
  downloadPageUrl: string
  sha256: string
  signed: boolean
  notes?: string
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

export function compareSemver(a: string, b: string): number {
  const ma = SEMVER.exec(a)
  const mb = SEMVER.exec(b)
  if (!ma || !mb) throw new Error(`versão inválida: ${a} / ${b}`)
  for (let i = 1; i <= 3; i++) {
    const d = Number(ma[i]) - Number(mb[i])
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

export function parseUpdateManifest(raw: unknown, expectedChannel: DesktopChannel): UpdateManifest {
  if (!raw || typeof raw !== "object") throw new Error("manifesto ausente")
  const r = raw as Record<string, unknown>
  if (r.channel !== expectedChannel) throw new Error("manifesto de outro canal")
  if (typeof r.version !== "string" || !SEMVER.test(r.version)) throw new Error("versão inválida")
  if (typeof r.downloadPageUrl !== "string") throw new Error("downloadPageUrl ausente")
  const page = new URL(r.downloadPageUrl)
  if (page.protocol !== "https:" || page.username || page.password) throw new Error("downloadPageUrl insegura")
  if (typeof r.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(r.sha256)) throw new Error("sha256 inválido")
  if (typeof r.signed !== "boolean") throw new Error("signed ausente")
  // Produção nunca anuncia binário sem assinatura.
  if (expectedChannel === "production" && !r.signed) throw new Error("produção exige binário assinado")
  return {
    channel: expectedChannel,
    version: r.version,
    downloadPageUrl: page.toString(),
    sha256: r.sha256.toLowerCase(),
    signed: r.signed,
    notes: typeof r.notes === "string" ? r.notes.slice(0, 500) : undefined,
  }
}

export function isUpdateAvailable(manifest: UpdateManifest, currentVersion: string): boolean {
  return compareSemver(manifest.version, currentVersion) > 0
}
