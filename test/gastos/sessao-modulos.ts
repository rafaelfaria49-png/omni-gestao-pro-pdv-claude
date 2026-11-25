/**
 * Reconciliação main: a sessão real carrega os módulos contratados por loja (access-policy) e
 * o perfil EMPRESA exige `finance`. As fixtures sintéticas declaram os módulos explicitamente —
 * somente infraestrutura de teste; nenhuma asserção de negócio muda.
 */
export const MODULOS_SINTETICOS = ["home", "pdv", "sales", "cash", "catalog", "stock", "reports", "settings",
  "service", "finance", "whatsapp", "accountant", "agent"] as const
export function modulosSinteticos(storeIds: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(storeIds.map((id) => [id, [...MODULOS_SINTETICOS]]))
}
