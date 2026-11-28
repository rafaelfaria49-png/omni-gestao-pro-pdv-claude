import { net } from "electron"
import type { DesktopBuildConfig } from "../shared/build-config"
import type { DesktopPackageKind } from "../shared/distribution"
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
export async function checkDesktopUpdate(
  config: DesktopBuildConfig,
  currentVersion: string,
  kind: DesktopPackageKind = "squirrel",
): Promise<UpdateStatus> {
  // Pacote da Microsoft Store: a própria Store entrega as versões novas. O manifesto do Setup.exe
  // não vale para este canal (oferecer outro instalador aqui criaria uma segunda instalação).
  if (kind === "msix") {
    return { available: false, message: `Programa na versão ${currentVersion}. Atualizações chegam pela Microsoft Store.` }
  }
  if (!config.updateManifestUrl) {
    return {
      available: false,
      message: "Atualização do programa: canal ainda não configurado. Novas versões chegam por instalador oficial.",
    }
  }
  try {
    const res = await net.fetch(config.updateManifestUrl, { cache: "no-store", redirect: "error" })
    // 404 = nenhuma release pública aprovada no canal oficial (estado normal antes da 1ª publicação).
    if (res.status === 404) {
      return { available: false, message: `Programa na versão ${currentVersion}. Nenhuma versão nova publicada no canal oficial.` }
    }
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
