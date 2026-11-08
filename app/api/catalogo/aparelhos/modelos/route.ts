import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCadastrosHubApi } from "@/lib/cadastros/hub-api-gate"
import { requireModuleApi } from "@/lib/auth/module-access"
import { loadCatalogoIndex } from "@/lib/catalogo-aparelhos/catalogo-loader"
import { catalogKey } from "@/lib/catalogo-aparelhos/loja-catalogo"
import { createLojaModelo, listLojaModelos } from "@/lib/catalogo-aparelhos/loja-catalogo-store"
import {
  catalogoLojaFailureResponse,
  readJsonBody,
  requireCatalogoLojaWrite,
} from "@/lib/catalogo-aparelhos/loja-catalogo-api"

/**
 * CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001 — modelos de aparelho cadastrados pela loja.
 *
 *  - GET  ?q=&inativos=1 → lista os modelos manuais DA LOJA ATIVA (gestão).
 *  - POST { brand, name, aliases?, notes? } → cadastra (409 em duplicidade na mesma marca,
 *    inclusive contra o catálogo global). Nunca altera o catálogo global.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const denied = await requireModuleApi(req, "deviceCatalog")
  if (denied) return denied
  const gate = await requireCadastrosHubApi(req, "read")
  if (!gate.ok) return gate.response

  const url = new URL(req.url)
  const q = catalogKey(url.searchParams.get("q") ?? "")
  const includeInactive = url.searchParams.get("inativos") === "1"
  try {
    const modelos = (await listLojaModelos(prisma, gate.storeId, { includeInactive })).filter((m) => {
      if (!q) return true
      return [m.brand, m.name, ...m.aliases].some((t) => catalogKey(t).includes(q))
    })
    return NextResponse.json({ ok: true, modelos })
  } catch (e) {
    console.error("[api/catalogo/aparelhos/modelos GET]", e instanceof Error ? e.message : String(e))
    return NextResponse.json({ ok: false, error: "Falha ao listar modelos da loja" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const gate = await requireCatalogoLojaWrite(req)
  if (!gate.ok) return gate.response
  const body = await readJsonBody(req)
  if (body === null) return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  try {
    const result = await createLojaModelo(prisma, loadCatalogoIndex(), gate.storeId, gate.actorId, body)
    if (!result.ok) return catalogoLojaFailureResponse(result)
    return NextResponse.json({ ok: true, modelo: result.value }, { status: 201 })
  } catch (e) {
    console.error("[api/catalogo/aparelhos/modelos POST]", e instanceof Error ? e.message : String(e))
    return NextResponse.json({ ok: false, error: "Falha ao cadastrar modelo" }, { status: 500 })
  }
}
