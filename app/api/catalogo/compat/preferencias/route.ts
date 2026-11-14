import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { readJsonBody, requireCatalogoLojaWrite } from "@/lib/catalogo-aparelhos/loja-catalogo-api"
import { compatResultResponse, compatServerError, requireCompatGestaoRead } from "@/lib/compat/compat-api"
import { getPreferencias, setPreferencias } from "@/lib/compat/compat-store"

/**
 * COMPAT-PROFISSIONAL-001 — preferências do Compat da loja.
 *  - GET   → { preferencias }
 *  - PATCH { version, posicoesHabilitadas?, modoModeloPadrao?, modoCorPadrao? }
 * `version: 0` = loja ainda sem preferências gravadas (padrões).
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const gate = await requireCompatGestaoRead(req)
  if (!gate.ok) return gate.response
  try {
    return NextResponse.json({ ok: true, preferencias: await getPreferencias(prisma, gate.storeId) })
  } catch (e) {
    return compatServerError("preferencias GET", e, "Falha ao carregar preferências")
  }
}

export async function PATCH(req: Request) {
  const gate = await requireCatalogoLojaWrite(req)
  if (!gate.ok) return gate.response
  const body = await readJsonBody(req)
  if (body === null) return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  try {
    const r = await setPreferencias(prisma, gate.storeId, gate.actorId, body)
    return r.ok ? NextResponse.json({ ok: true, preferencias: r.value }) : compatResultResponse(r)
  } catch (e) {
    return compatServerError("preferencias PATCH", e, "Falha ao gravar preferências")
  }
}
