import { ConfiguracoesPessoas } from "@/components/dashboard/pessoas/configuracoes"
import { setupEmpregador, obterEmpregador, editarEmpregador, criarEstabelecimento, editarEstabelecimento } from "@/app/actions/pessoas"
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

export default function Page() {
  async function setup(expectedStoreId: string, input: Parameters<typeof setupEmpregador>[0]) {
    "use server"
    return naStore(expectedStoreId, () => setupEmpregador(input))
  }
  async function obter(expectedStoreId: string, empregadorId: string) {
    "use server"
    return naStore(expectedStoreId, () => obterEmpregador(empregadorId))
  }
  async function empregador(expectedStoreId: string, input: Parameters<typeof editarEmpregador>[0]) {
    "use server"
    return naStore(expectedStoreId, () => editarEmpregador(input))
  }
  async function criar(expectedStoreId: string, input: Parameters<typeof criarEstabelecimento>[0]) {
    "use server"
    return naStore(expectedStoreId, () => criarEstabelecimento(input))
  }
  async function editar(expectedStoreId: string, input: Parameters<typeof editarEstabelecimento>[0]) {
    "use server"
    return naStore(expectedStoreId, () => editarEstabelecimento(input))
  }
  return <ConfiguracoesPessoas actions={{ setupEmpregador: setup, obterEmpregador: obter,
    editarEmpregador: empregador, criarEstabelecimento: criar, editarEstabelecimento: editar }} />
}
