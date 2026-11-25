/**
 * OMNI-GESTOR-MONEY-MAIN-RECONCILIATION-001 — ativação controlada do Gestor Money.
 *
 * Desligado por padrão: somente o valor exato "true" em GESTOR_MONEY_ENABLED liga.
 * Desligado, a fundação G001–G006 fica inerte para as lojas existentes:
 * - writers canônicos (G002) NÃO criam FinanceiroPerfil nem adotam histórico;
 * - readers (G003) mantêm a autorização legada enquanto a loja não tem perfil;
 * - rotas novas do Gestor Money respondem 404;
 * - nenhum worker/fila é iniciado por este código.
 * Ligar exige a migration aplicada E a concessão governada de PerfilMembro (ver docs).
 * Não é autorização: apenas seleciona se o módulo existe para o runtime.
 */
export function gestorMoneyAtivo(env: Record<string, string | undefined> = process.env): boolean {
  return env.GESTOR_MONEY_ENABLED === "true"
}
