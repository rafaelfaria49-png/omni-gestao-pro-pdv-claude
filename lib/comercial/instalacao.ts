/**
 * Detecção da migration comercial (20261129120000_comercial_custos_preparacao).
 * O código pode ser publicado ANTES do apply: escritores que tocam fluxos existentes
 * (liberação de aparelho, venda) consultam isto e seguem o caminho antigo; as rotas comerciais
 * respondem 503 COMERCIAL_NAO_INSTALADO. `to_regclass` não aborta a transação quando a tabela falta.
 */
type RawQuery = { $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T> }

let instalado = false

/** Só memoriza o positivo: depois do apply passa a valer sem reiniciar. */
export async function comercialInstalado(db: RawQuery): Promise<boolean> {
  if (instalado) return true
  const r = await db.$queryRaw<Array<{ t: string | null }>>`SELECT to_regclass('public.comercial_custos_lancamentos')::text AS t`
  instalado = !!r[0]?.t
  return instalado
}

/** Testes: reinicia a memória do positivo. */
export function __resetComercialInstaladoParaTestes(): void {
  instalado = false
}
