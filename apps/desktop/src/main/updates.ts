import { net } from "electron"
import type { DesktopBuildConfig } from "../shared/build-config"
import { isUpdateAvailable, parseUpdateManifest, type UpdateManifest } from "../shared/update-manifest"

export interface UpdateStatus {
  available: boolean
  version?: string
  manifest?: UpdateManifest
  message: string
}

/**
 * Verificação do executável. Só consulta e informa — sem download, sem instalação,
 * sem reinício. Sem manifesto configurado no build, fica desligada e diz isso.
 */
export async function checkDesktopUpdate(config: DesktopBuildConfig, currentVersion: string): Promise<UpdateStatus> {
  if (!config.updateManifestUrl) {
    return {
      available: false,
      message: "Atualização do programa: canal ainda não configurado. Novas versões chegam por instalador oficial.",
    }
  }
  try {
    const res = await net.fetch(config.updateManifestUrl, { cache: "no-store", redirect: "error" })
    if (!res.ok) return { available: false, message: `Não foi possível verificar atualização (HTTP ${res.status}).` }
    const manifest = parseUpdateManifest(await res.json(), config.channel)
    if (!isUpdateAvailable(manifest, currentVersion)) {
      return { available: false, manifest, message: `Programa atualizado (versão ${currentVersion}).` }
    }
    return {
      available: true,
      version: manifest.version,
      manifest,
      message: `Versão ${manifest.version} disponível${manifest.signed ? "" : " (NÃO assinada — só QA)"}. Instale quando o caixa estiver livre — o programa não reinicia sozinho. Confira o SHA-256 do instalador: ${manifest.sha256}`,
    }
  } catch (err) {
    return { available: false, message: `Não foi possível verificar atualização: ${(err as Error).message}` }
  }
}
