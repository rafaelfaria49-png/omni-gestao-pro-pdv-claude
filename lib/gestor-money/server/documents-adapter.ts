import "server-only"
import {
  autorizarDownloadDocumentoGasto,
  listarDocumentosGasto,
  registrarDocumentoGasto,
  vincularDocumentoGasto,
} from "@/lib/gastos/documentos"
import type { DocumentoStoragePort } from "@/lib/gastos/documentos-fixture"
import {
  diagnosticarGateStorageG003,
  resolverStorageDocumentosG003,
  type CodigoBloqueioGateStorageG003,
  type DiagnosticoGateStorageG003,
  type EventoAuditoriaStorageG003,
} from "@/lib/gastos/documentos-storage"
import type { FinanceiroContextoAutorizado } from "@/lib/gastos/types"
import type { StorageComprovantesDiagnostico } from "@/lib/gestor-money/contracts"

export type DiagnosticoStorageComprovantes = StorageComprovantesDiagnostico

const MOTIVOS_BLOQUEIO_G003: Record<CodigoBloqueioGateStorageG003, string> = {
  flag_desligada:
    "Gate G003-STORAGE desligado (GESTOR_MONEY_STORAGE_G003_ENABLED !== 'true'). Upload e download de comprovantes permanecem bloqueados (fail-closed).",
  provider_invalido:
    "Provedor de storage não configurado como Cloudflare R2 (CONTADOR_STORAGE_PROVIDER !== 'r2').",
  config_r2_incompleta:
    "Variáveis obrigatórias do Cloudflare R2 privado estão incompletas no servidor.",
  segredo_em_next_public:
    "Configuração insegura bloqueada: credencial R2 detectada em variável NEXT_PUBLIC_*.",
  bucket_inexistente:
    "Bucket privado R2 configurado não foi localizado ou está inacessível.",
  privacidade_bucket_nao_comprovada:
    "Privacidade real do bucket R2 (r2.dev desabilitado, zero domínios públicos, sonda anônima negada e credencial com escopo mínimo) ainda não foi comprovada neste runtime (fail-closed).",
  bucket_publico_detectado:
    "Bucket público detectado (r2.dev ou domínio customizado público). Armazenamento bloqueado por segurança.",
  escopo_credencial_invalido:
    "Credencial R2 sem escopo mínimo restrito ao bucket alvo (fail-closed).",
  verificador_indisponivel:
    "Verificador de privacidade real do bucket R2 indisponível no momento (fail-closed).",
}

export function descreverBloqueioGateStorageG003(
  codigo: CodigoBloqueioGateStorageG003 | null
): string {
  if (!codigo) {
    return "Gate G003-STORAGE liberado: Cloudflare R2 privado verificado com escopo mínimo e download assinado (TTL <= 60s)."
  }
  return MOTIVOS_BLOQUEIO_G003[codigo]
}

/** Hook restrito a testes descartáveis para injetar `DocumentoStoragePort` (fixture ou R2 G003 com verificador de teste) sem alterar produção. */
let storageTesteInjetado: DocumentoStoragePort | null = null

export function definirStorageComprovantesTeste(storage: DocumentoStoragePort | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Injeção de storage de teste proibida em produção.")
  }
  storageTesteInjetado = storage
}

function registrarAuditoriaStorage(evento: EventoAuditoriaStorageG003): void {
  if (evento.resultado !== "OK") {
    console.warn(
      JSON.stringify({
        modulo: "gestor-money",
        gate: "G003-STORAGE",
        acao: evento.acao,
        ambiente: evento.ambiente,
        resultado: evento.resultado,
        motivoCodigo: evento.motivoCodigo ?? null,
        at: evento.at,
      })
    )
  }
}

/**
 * Diagnóstico seguro e sem IO de rede delegando diretamente ao contrato canônico
 * `diagnosticarGateStorageG003` (`lib/gastos/documentos-storage.ts`).
 *
 * - Expõe apenas flags e nomes de variáveis faltantes (zero valores/segredos).
 * - Mantém fail-closed absoluto enquanto privacidade real do R2 não estiver comprovada.
 */
export function diagnosticarStorageComprovantes(
  env: Record<string, string | undefined> = process.env
): DiagnosticoStorageComprovantes {
  const canonico: DiagnosticoGateStorageG003 = diagnosticarGateStorageG003(env, {
    possuiVerificadorPrivacidade: false,
  })
  const testeAtivo = process.env.NODE_ENV !== "production" && storageTesteInjetado !== null
  const runtimeLiberado = canonico.runtimeLiberado || testeAtivo
  const bloqueioCodigo = testeAtivo ? null : canonico.bloqueioCodigo

  return {
    gate: canonico.gate,
    runtimeLiberado,
    bloqueioCodigo,
    flagHabilitada: canonico.flagHabilitada,
    providerDeclaradoValido: canonico.providerDeclaradoValido,
    configR2Completa: canonico.configR2Completa,
    variaveisObrigatorias: canonico.variaveisObrigatorias,
    variaveisFaltando: canonico.variaveisFaltando,
    privacidadeComprovadaNoRuntime: canonico.privacidadeComprovadaNoRuntime,
    reutilizaAdapter: canonico.reutilizaAdapter,
    liberadoNoMotorG003: runtimeLiberado,
    variaveisR2Presentes: canonico.providerDeclaradoValido && canonico.configR2Completa,
    motivo: testeAtivo
      ? "Storage privado de teste isolado ativo neste ambiente não-produtivo (G003)."
      : descreverBloqueioGateStorageG003(canonico.bloqueioCodigo),
  }
}

/**
 * Resolve o storage privado de comprovantes pelo ponto canônico `resolverStorageDocumentosG003()`.
 *
 * Sem prova real de privacidade/escopo R2 no runtime (ou com flag desligada),
 * `resolverStorageDocumentosG003()` lança `GateStorageG003Error` (503 fail-closed)
 * com o código exato do bloqueio. Jamais forja `ambiente: "fixture"` ou `publico: false`.
 */
function exigirStoragePort(storage?: DocumentoStoragePort): DocumentoStoragePort {
  if (storage) return storage
  if (process.env.NODE_ENV !== "production" && storageTesteInjetado) {
    return storageTesteInjetado
  }
  return resolverStorageDocumentosG003({
    onAuditoria: registrarAuditoriaStorage,
  })
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
