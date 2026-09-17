"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@/generated/prisma"
import {
  importClientesItems,
  listClientesForLoja,
  type ClienteListItem,
} from "@/lib/clientes-import-handler"
import { requireCadastrosActionAccess } from "@/lib/cadastros/cadastros-action-access"
import { cadastrosAuditPrincipalFromSession } from "@/lib/cadastros/cadastros-audit-principal"

/** Lista clientes da loja (substitui GET /api/clientes/importar). */
export async function listarClientesParaCadastro(lojaId: string | null | undefined): Promise<
  | { ok: true; clientes: ClienteListItem[] }
  | { ok: false; error: string }
> {
  try {
    const lid = (await requireCadastrosActionAccess(lojaId ?? "", "shared")).storeId
    const clientes = await listClientesForLoja(lid)
    return { ok: true, clientes }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined
    console.error("[listarClientesParaCadastro] exceção:", e)
    if (e instanceof Error && e.stack) console.error("[listarClientesParaCadastro] stack:\n", e.stack)
    return { ok: false, error: code ? `${msg} (Prisma ${code})` : msg }
  }
}

/** Importa um lote de clientes e revalida a página inicial (dashboard). */
export async function importarClientesLote(
  lojaId: string | null | undefined,
  items: unknown[]
): Promise<
  | { ok: true; created: number; updated: number; skippedDuplicate: number }
  | { ok: false; error: string; detail?: string }
> {
  try {
    if (!Array.isArray(items)) {
      return { ok: false, error: "Payload inválido", detail: "Envie um array de { Nome, Telefone }." }
    }

    const gate = await requireCadastrosActionAccess(lojaId ?? "", "hub")
    const lid = gate.storeId
    const { created, updated, skippedDuplicate } = await importClientesItems(
      lid,
      items,
      cadastrosAuditPrincipalFromSession(gate.session),
    )

    revalidatePath("/")

    return { ok: true, created, updated, skippedDuplicate }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined
    console.error("[importarClientesLote]", e)
    return {
      ok: false,
      error: "Falha na importação",
      detail: code ? `${detail} (${code})` : detail,
    }
  }
}
