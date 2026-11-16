import "server-only"
import { prisma } from "@/lib/prisma"
import { loadCatalogoIndex } from "@/lib/catalogo-aparelhos/catalogo-loader"
import { modeloOperacional } from "@/lib/catalogo-aparelhos/catalogo-aparelhos"
import {
  listarMarcasDoCatalogo,
  marcaVisivel,
  marcasOcultasDaLoja,
  type MarcaCatalogo,
} from "@/lib/catalogo-aparelhos/marcas"
import type { CatalogoIndex } from "@/lib/catalogo-aparelhos/types"
import { getPreferencias } from "./compat-store"

/**
 * COMPAT-CATALOGO-BRASIL-2023-2026-002 — marcas visíveis por loja (servidor).
 * Sem loja: só o padrão (prioritárias visíveis). Preferências indisponíveis (migration não aplicada)
 * caem no padrão via `getPreferencias` (leitura fail-soft) — a busca nunca quebra por isso.
 */

const marcasCache = new WeakMap<CatalogoIndex, MarcaCatalogo[]>()

export function marcasDoCatalogo(index: CatalogoIndex = loadCatalogoIndex()): MarcaCatalogo[] {
  const hit = marcasCache.get(index)
  if (hit) return hit
  const lista = listarMarcasDoCatalogo(index, modeloOperacional)
  marcasCache.set(index, lista)
  return lista
}

export async function marcasOcultasParaLoja(storeId: string | null): Promise<Set<string>> {
  const marcas = marcasDoCatalogo()
  let config: Record<string, boolean> = {}
  if (storeId) {
    try {
      config = (await getPreferencias(prisma, storeId)).marcasConfig
    } catch (e) {
      // Busca do PDV nunca cai por causa da preferência de marcas: segue com o padrão.
      console.warn("[compat] marcas: preferência indisponível, usando o padrão", e instanceof Error ? e.message : String(e))
    }
  }
  return marcasOcultasDaLoja(marcas, config)
}

export async function marcasComVisibilidade(storeId: string) {
  const prefs = await getPreferencias(prisma, storeId)
  return {
    version: prefs.version,
    marcas: marcasDoCatalogo().map((m) => ({ ...m, visivel: marcaVisivel(m, prefs.marcasConfig) })),
  }
}
