import "server-only"
import { toStrongDocumentKey } from "@/lib/cadastros/client-identity/document"
import type { FinanceiroDb } from "./financeiro-scope"
import type { FinanceiroContextoAutorizado } from "./types"
import { OperacaoGastoError } from "./operacao-schema"

/** Resolução somente na loja atual. Nunca cadastra nem escolhe homônimo por ordem. */
export async function resolverFornecedorGasto(tx: FinanceiroDb, ctx: FinanceiroContextoAutorizado,
  input: { fornecedorId?: string; fornecedorNome?: string; fornecedorDocumento?: string }) {
  if (ctx.tipo === "PESSOAL") {
    if (input.fornecedorId || input.fornecedorNome || input.fornecedorDocumento) throw new OperacaoGastoError("fornecedor_indisponivel")
    return null
  }
  const documento = input.fornecedorDocumento ? toStrongDocumentKey(input.fornecedorDocumento) : null
  if (input.fornecedorDocumento && !documento) throw new OperacaoGastoError("documento_fornecedor_invalido")
  if (input.fornecedorId) {
    const row = await tx.fornecedor.findFirst({ where: { id: input.fornecedorId, storeId: ctx.storeId, active: true } })
    if (!row || (documento && toStrongDocumentKey(row.document) !== documento)) throw new OperacaoGastoError("fornecedor_indisponivel")
    return row.id
  }
  if (!documento && !input.fornecedorNome) return null
  const rows = await tx.fornecedor.findMany({ where: { storeId: ctx.storeId, active: true,
    ...(documento ? {} : { OR: [{ name: { equals: input.fornecedorNome, mode: "insensitive" } },
      { legalName: { equals: input.fornecedorNome, mode: "insensitive" } }] }) }, select: { id: true, document: true } })
  const candidatos = documento ? rows.filter(r => toStrongDocumentKey(r.document) === documento) : rows
  if (candidatos.length !== 1) throw new OperacaoGastoError("fornecedor_exige_escolha", 409)
  return candidatos[0].id
}
