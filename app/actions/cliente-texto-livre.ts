"use server"

import { revalidatePath } from "next/cache"
import { requireCadastrosActionAccess } from "@/lib/cadastros/cadastros-action-access"
import { cadastrosAuditPrincipalFromSession } from "@/lib/cadastros/cadastros-audit-principal"
import { createClient, updateClient } from "@/lib/cadastros/client-write-service"
import { interpretarTextoCliente, validateClientEditor, type ClientEditorValues } from "@/lib/cadastros/natural-text/cliente"
import { CLIENT_TEXT_FIELDS, CLIENT_VOICE_PRIVACY_GATE, type ClientTextSuggestion } from "@/lib/cadastros/natural-text/cliente-types"

export async function interpretarClienteTextoLivre(storeId: string, text: unknown, captureSource: unknown = "text"): Promise<
  { ok: true; sugestao: ClientTextSuggestion } | { ok: false; message: string }
> {
  await requireCadastrosActionAccess(storeId, "hub")
  if (captureSource !== "text") return { ok: false, message: CLIENT_VOICE_PRIVACY_GATE.message }
  try { return { ok: true, sugestao: interpretarTextoCliente(text) } }
  catch { return { ok: false, message: "Descreva o cliente em até 2000 caracteres." } }
}

/** A separate, explicit human submit. No raw capture or provenance enters the writer. */
export async function salvarClienteRevisado(storeId: string, clientId: string | null, raw: ClientEditorValues, confirmed: boolean) {
  const gate = await requireCadastrosActionAccess(storeId, "hub")
  if (confirmed !== true) return { ok: false as const, message: "Revise e confirme os dados antes de salvar." }
  // Runtime allowlist: callers cannot smuggle authority, financial metadata or transcript into tags.
  if (!raw || typeof raw !== "object" || raw.tipo !== "PF" && raw.tipo !== "PJ") return { ok: false as const, message: "Revise os dados do cliente." }
  const fields = [...CLIENT_TEXT_FIELDS, "tags", "observacoes"] as const
  if (fields.some((f) => typeof raw[f] !== "string") || typeof raw.active !== "boolean") return { ok: false as const, message: "Revise os dados do cliente." }
  const values = Object.fromEntries(fields.map((f) => [f, raw[f].trim()])) as unknown as ClientEditorValues
  values.tipo = raw.tipo
  values.active = raw.active
  // Keep the established writer policy for legacy edits (including old invalid documents).
  // Strict capture validation applies to new assisted/manual creations in this editor.
  const errors = clientId === null ? validateClientEditor(values) : {}
  if (Object.keys(errors).length) return { ok: false as const, message: "Corrija os campos indicados.", errors }
  const input = {
    nome: values.nome, tipo: values.tipo, documento: values.documento, telefone: values.telefone,
    email: values.email, cidade: values.cidade, active: values.active,
    tags: {
      labels: values.tags.split(",").map((s) => s.trim()).filter(Boolean),
      address: { street: values.endereco, state: values.uf.toUpperCase() },
      operational: { notes: values.observacoes },
    },
  }
  try {
    const ctx = { storeId: gate.storeId, principal: cadastrosAuditPrincipalFromSession(gate.session) }
    const result = clientId === null ? await createClient(ctx, input) : await updateClient(ctx, clientId, input, { tagsMode: "editor" })
    if (!result.ok) return { ok: false as const, message: result.message, code: result.code }
    revalidatePath("/dashboard/cadastros-v2")
    return { ok: true as const, id: result.id }
  } catch {
    return { ok: false as const, message: "Não foi possível salvar o cliente. Tente novamente." }
  }
}
