import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { readJsonBody, requireCatalogoLojaWrite } from "@/lib/catalogo-aparelhos/loja-catalogo-api"
import { compatResultResponse, compatServerError, requireCompatGestaoRead } from "@/lib/compat/compat-api"
import { createFileira, createPainel, getPreferencias, listOrganizacao } from "@/lib/compat/compat-store"

/**
 * COMPAT-PROFISSIONAL-001 — painéis e fileiras da loja (organização física de capinhas).
 *  - GET  → { paineis: [{ ..., fileiras: [...] }], preferencias }
 *  - POST { tipo: "painel", nome, descricao? } | { tipo: "fileira", painelId, nome, descricao? }
 * Endereço físico apenas: nada aqui altera produto ou estoque.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const gate = await requireCompatGestaoRead(req)
  if (!gate.ok) return gate.response
  try {
    const [paineis, preferencias] = await Promise.all([
      listOrganizacao(prisma, gate.storeId),
      getPreferencias(prisma, gate.storeId),
    ])
    return NextResponse.json({ ok: true, paineis, preferencias })
  } catch (e) {
    return compatServerError("organizacao GET", e, "Falha ao carregar painéis e fileiras")
  }
}

export async function POST(req: Request) {
  const gate = await requireCatalogoLojaWrite(req)
  if (!gate.ok) return gate.response
  const body = await readJsonBody(req)
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }
  const tipo = (body as Record<string, unknown>).tipo
  try {
    if (tipo === "painel") return compatResultResponse(await createPainel(prisma, gate.storeId, gate.actorId, body), 201)
    if (tipo === "fileira") return compatResultResponse(await createFileira(prisma, gate.storeId, gate.actorId, body), 201)
    return NextResponse.json({ ok: false, error: "Tipo inválido (painel | fileira)." }, { status: 400 })
  } catch (e) {
    return compatServerError("organizacao POST", e, "Falha ao gravar")
  }
}
