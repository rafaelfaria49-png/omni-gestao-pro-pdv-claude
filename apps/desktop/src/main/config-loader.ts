import { app } from "electron"
import { readFileSync } from "node:fs"
import path from "node:path"
import { BuildConfigError, validateBuildConfig, type DesktopBuildConfig } from "../shared/build-config"

/**
 * Lê build-config.json gravado dentro do pacote (asar) no empacotamento.
 * Não há variável de ambiente, argumento ou tela que troque a origem em tempo de execução.
 */
export function loadBuildConfig(): DesktopBuildConfig {
  const file = path.join(app.getAppPath(), "build-config.json")
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, "utf8"))
  } catch {
    throw new BuildConfigError(`build-config.json ausente ou ilegível em ${file}`)
  }
  const config = validateBuildConfig(raw)
  if (app.isPackaged && config.channel === "development") {
    throw new BuildConfigError("pacote instalável não pode usar o canal development")
  }
  return config
}
