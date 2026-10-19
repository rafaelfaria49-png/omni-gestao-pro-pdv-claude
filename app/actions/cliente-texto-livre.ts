"use server"

import { revalidatePath } from "next/cache"
import { requireCadastrosActionAccess } from "@/lib/cadastros/cadastros-action-access"
import { cadastrosAuditPrincipalFromSession } from "@/lib/cadastros/cadastros-audit-principal"
import { createClient, updateClient } from "@/lib/cadastros/client-write-service"
import { prisma } from "@/lib/prisma"
import { interpretarTextoCliente, validateClientEditor, type ClientEditorValues } from "@/lib/cadastros/natural-text/cliente"
import { CLIENT_TEXT_FIELDS, type ClientTextSuggestion } from "@/lib/cadastros/natural-text/cliente-types"
import { CLIENT_CAPTURE_SOURCE_INVALID_MESSAGE, isClientCaptureSource } from "@/lib/cadastros/voice-capture/cliente"

export async function interpretarClienteTextoLivre(storeId: string, text: unknown, captureSource: unknown = "text"): Promise<
  { ok: true; sugestao: ClientTextSuggestion } | { ok: false; message: string }
> {
  await requireCadastrosActionAccess(storeId, "hub")
  // Only the literals "text"/"voice" are accepted, as a label. The server does not
  // receive audio and cannot attest a string's physical origin: the source neither
  // authorizes anything nor changes the parser, the suggestion or the writer contract.
  if (!isClientCaptureSource(captureSource)) return { ok: false, message: CLIENT_CAPTURE_SOURCE_INVALID_MESSAGE }
  try { return { ok: true, sugestao: interpretarTextoCliente(text) } }
  catch { return { ok: false, message: "Descreva o cliente em até 2000 caracteres." } }
}

/** A separate, explicit human submit. No raw capture or provenance enters the writer. */
export async function salvarClienteRevisado(storeId: string, clientId: string | null, raw: ClientEditorValues, confirmed: boolean) {
  const gate = await requireCadastrosActionAccess(storeId, "hub")
  if (confirmed !== true) return { ok: false as const, message: "Revise e confirme os dados antes de salvar." }
  if (clientId !== null && (typeof clientId !== "string" || !clientId.trim())) return { ok: false as const, message: "Cliente não encontrado.", code: "NOT_FOUND" }
  // Runtime allowlist: callers cannot smuggle authority, financial metadata or transcript into tags.
  if (!raw || typeof raw !== "object" || raw.tipo !== "PF" && raw.tipo !== "PJ") return { ok: false as const, message: "Revise os dados do cliente." }
  const fields = [...CLIENT_TEXT_FIELDS, "tags", "observacoes"] as const
  if (fields.some((f) => typeof raw[f] !== "string") || typeof raw.active !== "boolean") return { ok: false as const, message: "Revise os dados do cliente." }
  const values = Object.fromEntries(fields.map((f) => [f, raw[f].trim()])) as unknown as ClientEditorValues
  values.tipo = raw.tipo
  values.active = raw.active
  try {
    // The original identity comes only from an authorized, store-scoped server read.
    const previous = clientId === null ? null : await prisma.cliente.findFirst({
      where: { id: clientId, storeId: gate.storeId },
      select: { kind: true, document: true, phone: true, email: true },
    })
    if (clientId !== null && !previous) return { ok: false as const, message: "Cliente não encontrado.", code: "NOT_FOUND" }
    const original = previous ? {
      tipo: previous.kind === "PJ" ? "PJ" as const : "PF" as const,
      documento: previous.document ?? "", telefone: previous.phone ?? "", email: previous.email ?? "",
    } : undefined
    const errors = validateClientEditor(values, original)
    if (Object.keys(errors).length) return { ok: false as const, message: "Corrija os campos indicados.", errors }
    const identityPairChanged = !original || values.tipo !== original.tipo || values.documento !== original.documento.trim()
    const input = {
      nome: values.nome, cidade: values.cidade, active: values.active,
      ...(identityPairChanged ? { tipo: values.tipo, documento: values.documento } : {}),
      ...(!original || values.telefone !== original.telefone.trim() ? { telefone: values.telefone } : {}),
      ...(!original || values.email !== original.email.trim() ? { email: values.email } : {}),
      tags: {
        labels: values.tags.split(",").map((s) => s.trim()).filter(Boolean),
        address: { street: values.endereco, state: values.uf.toUpperCase() },
        operational: { notes: values.observacoes },
      },
    }
    const ctx = { storeId: gate.storeId, principal: cadastrosAuditPrincipalFromSession(gate.session) }
    const result = clientId === null ? await createClient(ctx, input) : await updateClient(ctx, clientId, input, { tagsMode: "editor" })
    if (!result.ok) return { ok: false as const, message: result.message, code: result.code }
    revalidatePath("/dashboard/cadastros-v2")
    return { ok: true as const, id: result.id }
  } catch {
    return { ok: false as const, message: "Não foi possível salvar o cliente. Tente novamente." }
  }
}
