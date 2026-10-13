import { FichaFuncionario } from "@/components/dashboard/pessoas/ficha"
import { obterFuncionario, listarHistorico, atualizarDadosPessoais, completarVinculoRascunho, criarVersaoContrato } from "@/app/actions/pessoas"
import { listarDocumentos, criarUploadIntent, confirmarUpload, autorizarDownload } from "@/lib/pessoas/documentos/service"
import { exigirAtor } from "@/lib/pessoas/scope"
import { PessoasError } from "@/lib/pessoas/domain"

// exigirAtor e a action canônica leem o mesmo contexto de cookies desta requisição.
async function naStore<T>(expectedStoreId: string, operation: () => Promise<T>) {
  try {
    const ator = await exigirAtor()
    if (ator.storeId !== expectedStoreId) return { ok: false as const, code: "LOJA_DIVERGENTE" }
    return await operation()
  } catch (error) {
    return { ok: false as const, code: error instanceof PessoasError ? error.code : "FALHA_INTERNA" }
  }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  async function obter(expectedStoreId: string, empregadorId: string, vinculoId: string) {
    "use server"
    return naStore(expectedStoreId, () => obterFuncionario(empregadorId, vinculoId))
  }
  async function historico(expectedStoreId: string, empregadorId: string, vinculoId: string) {
    "use server"
    return naStore(expectedStoreId, () => listarHistorico(empregadorId, vinculoId))
  }
  async function pessoais(expectedStoreId: string, input: Parameters<typeof atualizarDadosPessoais>[0]) {
    "use server"
    return naStore(expectedStoreId, () => atualizarDadosPessoais(input))
  }
  async function vinculo(expectedStoreId: string, input: Parameters<typeof completarVinculoRascunho>[0]) {
    "use server"
    return naStore(expectedStoreId, () => completarVinculoRascunho(input))
  }
  async function contrato(expectedStoreId: string, input: Parameters<typeof criarVersaoContrato>[0]) {
    "use server"
    return naStore(expectedStoreId, () => criarVersaoContrato(input))
  }
  // Os mesmos serviços 001A das APIs documentais mantêm guards, intent e idempotência.
  async function documentos(expectedStoreId: string, empregadorId: string, vinculoId: string) {
    "use server"
    return naStore(expectedStoreId, async () => ({ ok: true as const, data: await listarDocumentos(empregadorId, vinculoId) }))
  }
  async function intent(expectedStoreId: string, input: Parameters<typeof criarUploadIntent>[0]) {
    "use server"
    return naStore(expectedStoreId, async () => ({ ok: true as const, data: await criarUploadIntent(input) }))
  }
  async function complete(expectedStoreId: string, token: Parameters<typeof confirmarUpload>[0]) {
    "use server"
    return naStore(expectedStoreId, async () => ({ ok: true as const, data: await confirmarUpload(token) }))
  }
  async function download(expectedStoreId: string, empregadorId: string, documentoId: string) {
    "use server"
    return naStore(expectedStoreId, async () => ({ ok: true as const, data: await autorizarDownload(empregadorId, documentoId) }))
  }
  return <FichaFuncionario key={id} id={id} actions={{ obterFuncionario: obter, listarHistorico: historico,
    atualizarDadosPessoais: pessoais, completarVinculoRascunho: vinculo, criarVersaoContrato: contrato }}
    documentActions={{ listar: documentos, criarIntent: intent, confirmar: complete, download }} />
}
