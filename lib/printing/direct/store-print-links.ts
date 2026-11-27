/**
 * D02-A (achado 7): uma loja com registros de impressão não pode ser excluída. As FKs print_* → stores não têm cascata
 * de propósito (o registro é a prova de "não imprimir duas vezes" e os gatilhos proíbem apagá-lo). Sem esta checagem,
 * a exclusão falhava com a mensagem genérica de "registros dependentes".
 *
 * As tabelas são descobertas pelo catálogo (FKs de print_* para public.stores), então a checagem:
 *  - responde `false` sem erro enquanto as tabelas não existem (banco sem a migration D02);
 *  - acompanha qualquer tabela print_* nova que referencie a loja.
 */
export type PrintLinksDb = { $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T> }

/** Mensagem de bloqueio exibida a quem tenta excluir a unidade. */
export const STORE_HAS_PRINT_RECORDS =
  "Esta unidade tem registros de impressão (Omni Print). Eles fazem parte da auditoria de impressão e não podem ser apagados, por isso a unidade não pode ser excluída."

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`

export async function storeHasPrintRecords(db: PrintLinksDb, storeId: string): Promise<boolean> {
  const refs = await db.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(
    `SELECT c.relname AS table_name, a.attname AS column_name
       FROM pg_constraint k
       JOIN pg_class c ON c.oid = k.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
      WHERE k.contype = 'f' AND cardinality(k.conkey) = 1 AND n.nspname = 'public' AND c.relname LIKE 'print\\_%'
        AND k.confrelid = to_regclass('public.stores')
      ORDER BY 1, 2`,
  )
  if (!refs.length) return false
  const probes = refs.map(r => `SELECT 1 FROM public.${quoteIdent(r.table_name)} WHERE ${quoteIdent(r.column_name)} = $1`)
  const [row] = await db.$queryRawUnsafe<Array<{ has: boolean }>>(`SELECT EXISTS (${probes.join(" UNION ALL ")}) AS has`, storeId)
  return row?.has === true
}

/** Violação de FK (P2003) causada por uma FK de impressão (nomes `p004_fk_*`). */
export function isPrintForeignKeyViolation(e: unknown): boolean {
  if (!e || typeof e !== "object" || (e as { code?: unknown }).code !== "P2003") return false
  const meta = (e as { meta?: Record<string, unknown> }).meta
  return /p004_fk_/i.test(JSON.stringify(meta ?? {}) + String((e as { message?: unknown }).message ?? ""))
}
