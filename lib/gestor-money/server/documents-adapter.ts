import "server-only"
import {
  autorizarDownloadDocumentoGasto,
  listarDocumentosGasto,
  registrarDocumentoGasto,
  vincularDocumentoGasto,
} from "@/lib/gastos/documentos"
import type { DocumentoStoragePort } from "@/lib/gastos/documentos-fixture"
import type { FinanceiroContextoAutorizado } from "@/lib/gastos/types"
import { GestorMoneyApiError } from "./auth-boundary"

/**
 * Fronteira de armazenamento privado de comprovantes (G003).
 *
 * - Não contrata nem conecta provedor externo de storage.
 * - Não acessa documentos reais de produção.
 * - Em runtime sem storage fixture injetado (produção/staging), falha fechado com 503
 *   mantendo a listagem de metadados do banco funcional e segura.
 * - Em ensaios descartáveis com `DocumentoStorageFixture`, executa integralmente o
 *   contrato G003 (`registrarDocumentoGasto`, `vincularDocumentoGasto`, `criarDownloadDocumentoGasto`).
 */
function exigirStoragePort(storage?: DocumentoStoragePort): DocumentoStoragePort {
  if (!storage) {
    throw new GestorMoneyApiError(
      "documentos_storage_privado_pendente_g003",
      503,
      "Armazenamento privado de comprovantes aguarda provisionamento dedicado (G003-STORAGE). Nenhum serviço externo foi contratado ou acessado."
    )
  }
  return storage
}

export async function listarDocumentosPrivadosReal(ctx: FinanceiroContextoAutorizado) {
  return listarDocumentosGasto(ctx)
}

export async function registrarComprovantePrivadoReal(
  ctx: FinanceiroContextoAutorizado,
  input: {
    nomeArquivo: string
    conteudo: Uint8Array
    alvo?: { tipo: "PAGAR" | "RECEBER" | "CONTA" | "MOVIMENTACAO"; id: string }
  },
  storage?: DocumentoStoragePort
) {
  const port = exigirStoragePort(storage)
  const doc = await registrarDocumentoGasto(
    ctx,
    {
      nomeArquivo: input.nomeArquivo,
      conteudo: input.conteudo,
      proveniencia: "UPLOAD_INTERNO",
    },
    port
  )
  if (input.alvo) {
    await vincularDocumentoGasto(ctx, doc.id, input.alvo)
  }
  return doc
}

export async function obterDownloadComprovantePrivadoReal(
  ctx: FinanceiroContextoAutorizado,
  documentoId: string,
  storage?: DocumentoStoragePort
) {
  const port = exigirStoragePort(storage)
  return autorizarDownloadDocumentoGasto(ctx, documentoId, port)
}
