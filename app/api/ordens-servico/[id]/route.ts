import { NextResponse } from "next/server"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { apiGuardOperacoesHubOrLegacy } from "@/lib/auth/api-enterprise-guard"
import { LEGACY_ORDENS_SERVICO_WRITE_DISABLED } from "@/lib/operacoes/legacy-api-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 })
}

async function guardLegacyWrite(req: Request, id: string) {
  if (!id?.trim()) return badRequest("ID inválido")

  const storeId = storeIdFromAssistecRequestForWrite(req)
  if (!storeId) {
    return badRequest("Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId / lojaId.")
  }

  const guard = await apiGuardOperacoesHubOrLegacy(storeId)
  if (guard) return guard

  return json(LEGACY_ORDENS_SERVICO_WRITE_DISABLED, { status: 410 })
}

/** Escrita desativada — semântica de estoque legada incompatível com Operações HUB V2. */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  return guardLegacyWrite(req, id)
}

/** Escrita desativada — semântica de estoque legada incompatível com Operações HUB V2. */
export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  return guardLegacyWrite(req, id)
}
