/**
 * Carregador SERVER-ONLY do Catálogo de Aparelhos.
 *
 * Lê os seeds versionados (`docs/catalogo/seeds/*.csv`) do disco via `fs` e monta o
 * índice em memória (cacheado por processo). Só deve ser importado de código de
 * servidor (API routes / server actions) — nunca de um client component, para não
 * arrastar `fs` para o bundle do cliente.
 *
 * Nota de deploy: em produção (Vercel serverless), a pasta `docs/` precisa estar no
 * bundle da função. Se ausente, `readSeed` degrada para "" e a busca fica vazia (sem
 * lançar). Em desenvolvimento e nos testes (Node com o repo completo) funciona direto.
 */

import fs from "node:fs"
import path from "node:path"
import {
  buildCatalogoIndex,
  parseDeviceAliases,
  parseDeviceCompatibilities,
  parseDeviceModels,
} from "./catalogo-aparelhos"
import type { CatalogoIndex } from "./types"

const SEED_DIR = path.join(process.cwd(), "docs", "catalogo", "seeds")

const SEED_FILES = {
  models: "device_models_seed_001.csv",
  aliases: "device_aliases_seed_001.csv",
  compatibilities: "device_compatibilities_seed_001.csv",
} as const

let cache: CatalogoIndex | null = null

function readSeed(fileName: string): string {
  try {
    return fs.readFileSync(path.join(SEED_DIR, fileName), "utf8")
  } catch {
    // Arquivo ausente/inacessível: degrada em vazio (sem lançar).
    return ""
  }
}

/** Índice do catálogo (cacheado). Reconstrói só na primeira chamada por processo. */
export function loadCatalogoIndex(): CatalogoIndex {
  if (cache) return cache
  cache = buildCatalogoIndex({
    models: parseDeviceModels(readSeed(SEED_FILES.models)),
    aliases: parseDeviceAliases(readSeed(SEED_FILES.aliases)),
    compatibilities: parseDeviceCompatibilities(readSeed(SEED_FILES.compatibilities)),
  })
  return cache
}

/** Zera o cache (uso em testes). */
export function __resetCatalogoCache(): void {
  cache = null
}
