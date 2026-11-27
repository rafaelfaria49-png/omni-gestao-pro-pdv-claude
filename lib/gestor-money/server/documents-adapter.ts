import "server-only"
import {
  autorizarDownloadDocumentoGasto,
  listarDocumentosGasto,
  registrarDocumentoGasto,
  vincularDocumentoGasto,
} from "@/lib/gastos/documentos"
import type { DocumentoStoragePort } from "@/lib/gastos/documentos-fixture"
import type { FinanceiroContextoAutorizado } from "@/lib/gastos/types"
import { ENV_KEYS_R2, ENV_KEY_PROVIDER } from "@/lib/contador/documentos/config"
import { GestorMoneyApiError } from "./auth-boundary"

export interface DiagnosticoStorageComprovantes {
  infraestruturaExistenteDetectada: "cloudflare_r2_contador" | "nenhuma"
  variaveisR2Presentes: boolean
  liberadoNoMotorG003: false
  codigoBloqueio: "documentos_storage_privado_bloqueado_g003"
  motivo: string
}

/**
 * Inspeciona somente os NOMES das variáveis da infraestrutura Cloudflare R2
 * já existente no OmniGestão (`lib/contador/documentos/storage-r2.ts`),
 * sem expor valores/segredos e sem contratar novos serviços.
 *
 * Impedimento real documentado na fundação PR #405 (`lib/gastos/documentos.ts`):
 * 1. `storagePrivado()` exige `storage.ambiente === "fixture"` (bloqueia qualquer storage produtivo até gate G003-STORAGE).
 * 2. `storagePrivado()` exige `bucket.publico === false`, mas o adapter R2 existente (`storage-r2.ts`) retorna `publico: null` (API S3 do R2 não expõe flag booleana pública).
 * Por segurança, jamais forjamos `ambiente: "fixture"` ou `publico: false` sobre um bucket real.
 */
export function diagnosticarStorageComprovantes(
  env: Record<string, string | undefined> = process.env
): DiagnosticoStorageComprovantes {
  const providerR2 = (env[ENV_KEY_PROVIDER] ?? "").trim().toLowerCase() === "r2"
  const credenciaisR2 = Boolean(
    env[ENV_KEYS_R2.accountId]?.trim() &&
      env[ENV_KEYS_R2.accessKeyId]?.trim() &&
      env[ENV_KEYS_R2.secretAccessKey]?.trim() &&
      env[ENV_KEYS_R2.bucket]?.trim()
  )
  const variaveisR2Presentes = providerR2 && credenciaisR2
  return {
    infraestruturaExistenteDetectada: variaveisR2Presentes ? "cloudflare_r2_contador" : "nenhuma",
    variaveisR2Presentes,
    liberadoNoMotorG003: false,
    codigoBloqueio: "documentos_storage_privado_bloqueado_g003",
    motivo:
      "Infraestrutura privada Cloudflare R2 já existe em lib/contador/documentos/storage-r2.ts (sem custo adicional), mas lib/gastos/documentos.ts (PR #405) trava deliberadamente `storage.ambiente === 'fixture'` e `bucket.publico === false` (enquanto R2 retorna `publico: null`). Upload/download produtivo permanece bloqueado (fail-closed) até liberação dedicada na fundação G003-STORAGE com prefixo/bucket isolado.",
  }
}

/** Hook restrito a testes descartáveis para injetar `DocumentoStorageFixture` nas rotas HTTP sem alterar produção. */
let storageTesteInjetado: DocumentoStoragePort | null = null

export function definirStorageComprovantesTeste(storage: DocumentoStoragePort | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Injeção de storage de teste proibida em produção.")
  }
  storageTesteInjetado = storage
}

function exigirStoragePort(storage?: DocumentoStoragePort): DocumentoStoragePort {
  const resolved = storage ?? (process.env.NODE_ENV !== "production" ? storageTesteInjetado : null)
  if (!resolved) {
    const diag = diagnosticarStorageComprovantes()
    throw new GestorMoneyApiError(diag.codigoBloqueio, 503, diag.motivo)
  }
  return resolved
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
