import type { AccessModule } from "@/lib/auth/access-policy"

/**
 * Reconciliação main: a sessão real carrega os módulos contratados por loja (access-policy) e
 * o perfil EMPRESA exige `finance`. As fixtures sintéticas declaram os módulos explicitamente —
 * somente infraestrutura de teste; nenhuma asserção de negócio muda.
 */
export const MODULOS_SINTETICOS: readonly AccessModule[] = ["home", "pdv", "sales", "cash", "catalog", "stock", "reports",
  "settings", "service", "finance", "whatsapp", "accountant", "agent"]
export function modulosSinteticos(storeIds: readonly string[]): Record<string, AccessModule[]> {
  return Object.fromEntries(storeIds.map((id) => [id, [...MODULOS_SINTETICOS]]))
}
