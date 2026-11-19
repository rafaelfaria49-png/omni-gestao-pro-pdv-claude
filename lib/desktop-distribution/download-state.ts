import "server-only"

import {
  latestManifestUrl,
  parseReleaseManifest,
  parseReleasesBaseUrl,
  type DesktopRelease,
} from "./release-manifest"

/**
 * Estado do download público do instalador Windows.
 *
 * Três chaves, todas obrigatórias (fail-closed):
 *  1. `DESKTOP_PUBLIC_DOWNLOAD=on` — autorização comercial do proprietário.
 *  2. `DESKTOP_RELEASES_BASE_URL` — origem https do armazenamento/CDN de downloads.
 *  3. `latest.json` válido nessa origem (assinado, conferido e instalado pelo pipeline).
 *
 * Qualquer falha devolve `unavailable` e a página mostra só o acesso pelo navegador.
 * A Vercel lê apenas o manifesto JSON; o executável é servido direto pela CDN.
 */
export type DesktopDownloadState =
  | { status: "available"; release: DesktopRelease }
  | { status: "disabled" }
  | { status: "unavailable"; reason: string }

export async function getDesktopDownloadState(): Promise<DesktopDownloadState> {
  if (process.env.DESKTOP_PUBLIC_DOWNLOAD?.trim() !== "on") return { status: "disabled" }
  const base = parseReleasesBaseUrl(process.env.DESKTOP_RELEASES_BASE_URL)
  if (!base) return { status: "unavailable", reason: "origem de downloads não configurada" }
  try {
    const res = await fetch(latestManifestUrl(base), {
      redirect: "error",
      signal: AbortSignal.timeout(4000),
      next: { revalidate: 300 },
    })
    if (!res.ok) return { status: "unavailable", reason: `manifesto HTTP ${res.status}` }
    return { status: "available", release: parseReleaseManifest(await res.json(), base) }
  } catch (err) {
    return { status: "unavailable", reason: (err as Error).message || "manifesto inválido" }
  }
}
