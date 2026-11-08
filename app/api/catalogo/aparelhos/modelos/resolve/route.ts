import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { loadCatalogoIndex } from "@/lib/catalogo-aparelhos/catalogo-loader"
import { lojaModeloCanonicalName } from "@/lib/catalogo-aparelhos/loja-catalogo"
import { getLojaModelosByKeys } from "@/lib/catalogo-aparelhos/loja-catalogo-store"
import { resolveCatalogoLojaRead } from "@/lib/catalogo-aparelhos/loja-catalogo-api"

/**
 * CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001 — nomes legíveis para `modelKey`s salvos
 * (reidratação da ficha do produto). Modelos manuais só resolvem na PRÓPRIA loja;
 * desativados voltam com `active: false` (histórico preservado). Somente leitura.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const MAX_KEYS = 200

export async function GET(req: Request) {
  const gate = await resolveCatalogoLojaRead(req)
  if (!gate.ok) return gate.response
  const url = new URL(req.url)
  const keys = [
    ...new Set(
      (url.searchParams.get("keys") ?? "")
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k && k.length <= 160),
    ),
  ].slice(0, MAX_KEYS)
  try {
    const index = loadCatalogoIndex()
    const manuais = gate.storeId ? await getLojaModelosByKeys(prisma, gate.storeId, keys) : []
    const manualByKey = new Map(manuais.map((m) => [m.modelKey, m]))
    const models = keys.flatMap((k) => {
      const g = index.modelByKey.get(k)
      if (g) return [{ modelKey: k, canonicalName: g.canonicalName, brand: g.brand, source: "global", active: true }]
      const m = manualByKey.get(k)
      if (m) {
        return [{ modelKey: k, canonicalName: lojaModeloCanonicalName(m), brand: m.brand, source: "loja", active: m.active }]
      }
      return []
    })
    return NextResponse.json({ ok: true, models })
  } catch (e) {
    console.error("[api/catalogo/aparelhos/modelos/resolve]", e instanceof Error ? e.message : String(e))
    return NextResponse.json({ ok: false, error: "Falha ao resolver modelos" }, { status: 500 })
  }
}
