import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { readJsonBody, requireCatalogoLojaWrite } from "@/lib/catalogo-aparelhos/loja-catalogo-api"
import { compatResultResponse, compatServerError, resolveCompatPdvRead } from "@/lib/compat/compat-api"
import { createCorLoja, listCoresLoja, listCoresVisual, setCorPadraoAtiva, updateCorLoja } from "@/lib/compat/compat-store"
import { coresEfetivas } from "@/lib/compat/cores-loja"

/**
 * COMPAT-PROFISSIONAL-001 — cores da loja.
 *  - GET   → { cores (paleta + próprias, com estado e visual da loja), linhas } (também usado pelo PDV)
 *  - POST  { label, visual? }                          → cor própria nova
 *  - PATCH { id, version, label?, ativo?, visual? }    → renomear/editar visual/ativar-desativar cor própria
 *  - PATCH { baseKey, ativo?, visual? }                → ativar-desativar/editar visual da cor padrão SÓ nesta loja
 * Vendas antigas guardam o rótulo congelado: renomear/desativar não altera o histórico.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  // PDV inteiro (inclusive CAIXA) lê as cores da loja; escrita continua só com Cadastros + catálogo.
  const gate = await resolveCompatPdvRead(req)
  if (!gate.ok) return gate.response
  try {
    const [linhas, visuais] = gate.storeId
      ? await Promise.all([listCoresLoja(prisma, gate.storeId), listCoresVisual(prisma, gate.storeId)])
      : [[], {}]
    return NextResponse.json({ ok: true, cores: coresEfetivas(linhas, visuais), linhas })
  } catch (e) {
    return compatServerError("cores GET", e, "Falha ao carregar cores")
  }
}

export async function POST(req: Request) {
  const gate = await requireCatalogoLojaWrite(req)
  if (!gate.ok) return gate.response
  const body = await readJsonBody(req)
  if (body === null) return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  try {
    return compatResultResponse(await createCorLoja(prisma, gate.storeId, gate.actorId, body), 201)
  } catch (e) {
    return compatServerError("cores POST", e, "Falha ao cadastrar cor")
  }
}

export async function PATCH(req: Request) {
  const gate = await requireCatalogoLojaWrite(req)
  if (!gate.ok) return gate.response
  const body = await readJsonBody(req)
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }
  const b = body as Record<string, unknown>
  try {
    if (typeof b.baseKey === "string") {
      return compatResultResponse(await setCorPadraoAtiva(prisma, gate.storeId, gate.actorId, b.baseKey, b.ativo, b.visual))
    }
    if (typeof b.id !== "string" || !b.id) return NextResponse.json({ ok: false, error: "Informe a cor." }, { status: 400 })
    return compatResultResponse(await updateCorLoja(prisma, gate.storeId, gate.actorId, b.id, b))
  } catch (e) {
    return compatServerError("cores PATCH", e, "Falha ao gravar cor")
  }
}
