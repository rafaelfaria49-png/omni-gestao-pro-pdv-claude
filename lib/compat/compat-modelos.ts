import "server-only"
import { prisma } from "@/lib/prisma"
import { hierarquiaDoModeloGlobal, hierarquiaDoModeloLoja, type HierarquiaAparelho } from "@/lib/catalogo-aparelhos/hierarquia"
import { isManualModelKey, lojaModeloCanonicalName, overridesUtilizaveis, type LojaCompatOverride, type LojaModelo } from "@/lib/catalogo-aparelhos/loja-catalogo"
import { getLojaModelosByKeys } from "@/lib/catalogo-aparelhos/loja-catalogo-store"
import type { PeliculaGrupoMember } from "@/lib/catalogo-aparelhos/peliculas"
import type { CatalogoIndex } from "@/lib/catalogo-aparelhos/types"

/**
 * COMPAT-PROFISSIONAL-001 — resolução de modelos (global + manual DA LOJA) para as rotas do Compat.
 * Um modelo manual de outra loja nunca é resolvido (consulta escopada por `storeId`).
 */

export interface ModeloResolvidoCompat extends PeliculaGrupoMember {
  source: "global" | "loja"
  active: boolean
  hierarquia: HierarquiaAparelho
  aliases: string[]
}

export async function resolverModelosCompat(
  index: CatalogoIndex,
  storeId: string | null,
  keys: readonly string[],
): Promise<Map<string, ModeloResolvidoCompat>> {
  const out = new Map<string, ModeloResolvidoCompat>()
  const manuais: LojaModelo[] = storeId ? await getLojaModelosByKeys(prisma, storeId, keys) : []
  const manualByKey = new Map(manuais.map((m) => [m.modelKey, m]))
  for (const key of new Set(keys)) {
    const g = index.modelByKey.get(key)
    if (g) {
      out.set(key, {
        modelKey: key,
        canonicalName: g.canonicalName || key,
        brand: g.brand,
        source: "global",
        active: true,
        hierarquia: hierarquiaDoModeloGlobal(g),
        aliases: (index.aliasesByModelKey.get(key) ?? []).map((a) => a.alias).slice(0, 8),
      })
      continue
    }
    const m = manualByKey.get(key)
    if (m) {
      out.set(key, {
        modelKey: key,
        canonicalName: lojaModeloCanonicalName(m),
        brand: m.brand,
        source: "loja",
        active: m.active,
        hierarquia: hierarquiaDoModeloLoja(m),
        aliases: m.aliases,
      })
    }
  }
  return out
}

/** Só pares cujos dois lados existem (global atual ou manual ATIVO desta loja). */
export function filtrarOverridesValidos<T extends LojaCompatOverride>(
  index: CatalogoIndex,
  overrides: readonly T[],
  resolvidos: Map<string, ModeloResolvidoCompat>,
): T[] {
  return overridesUtilizaveis(
    overrides,
    (k) => index.modelByKey.has(k),
    (k) => isManualModelKey(k) && resolvidos.get(k)?.active === true,
  )
}

export function memberFrom(resolvidos: Map<string, ModeloResolvidoCompat>) {
  return (modelKey: string): PeliculaGrupoMember => {
    const r = resolvidos.get(modelKey)
    return r
      ? { modelKey, canonicalName: r.canonicalName, brand: r.brand }
      : { modelKey, canonicalName: modelKey, brand: "" }
  }
}
