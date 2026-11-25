import "server-only"

/**
 * Contrato de RLS do Gestor Money (migration 20261126150000_gastos_rls_runtime_contrato).
 *
 * Linhas PESSOAIS ("storeId" NULL) só são visíveis/graváveis na transação que declara o dono em
 * `app.gm_owner_user`. O valor é LOCAL à transação (`set_config(..., true)`): some no COMMIT ou
 * ROLLBACK, então uma conexão reutilizada pelo pool nunca o herda. Chamar SOMENTE depois de o
 * contexto opaco G001 ter sido revalidado no servidor, e SOMENTE dentro de `$transaction` —
 * fora de uma transação o valor não sobrevive ao próprio statement (sem efeito, não sem risco).
 * EMPRESA não declara nada: o contexto pessoal nunca acompanha uma operação empresarial.
 */
export async function declararDonoPessoalRls(
  tx: { $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T> },
  ownerAdminUserId: string,
): Promise<void> {
  if (typeof ownerAdminUserId !== "string" || !ownerAdminUserId.trim()) throw new Error("Dono pessoal obrigatório.")
  await tx.$queryRaw`SELECT set_config('app.gm_owner_user', ${ownerAdminUserId}, true) AS dono`
}

export async function aplicarContextoRls(
  tx: { $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T> },
  ctx: { tipo: "EMPRESA" | "PESSOAL"; userId: string },
): Promise<void> {
  if (ctx.tipo === "PESSOAL") await declararDonoPessoalRls(tx, ctx.userId)
}
