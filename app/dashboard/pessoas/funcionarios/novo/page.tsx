import { NovoFuncionario } from "@/components/dashboard/pessoas/novo"
import { criarFuncionario } from "@/app/actions/pessoas"
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
  async function criar(expectedStoreId: string, input: Parameters<typeof criarFuncionario>[0]) {
    "use server"
    return naStore(expectedStoreId, () => criarFuncionario(input))
  }
  return <NovoFuncionario actions={{ criarFuncionario: criar }} />
}
