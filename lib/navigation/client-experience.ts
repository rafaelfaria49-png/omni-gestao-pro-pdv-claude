import { MODULES } from "@/lib/auth/access-policy"
import type { EnterprisePermissions } from "@/lib/auth/enterprise-permissions"

/**
 * Apresentação, não autoridade: escolhe qual tela existente mostrar.
 *
 * A plataforma e as lojas com liberação legada (todos os módulos, `moduleAccess`
 * NULL) mantêm as telas históricas. Lojas com pacote explícito recebem a experiência
 * do cliente. Ramo, nome, email e storage não participam. Nenhum acesso é concedido
 * ou negado aqui: páginas, APIs e Server Actions continuam com os próprios guards.
 *
 * `null` (sessão ainda carregando) não é decidido: o chamador deve aguardar em vez de
 * renderizar controles internos que depois sumiriam.
 */
export function usesClientExperience(p: EnterprisePermissions | null): boolean | null {
  if (!p) return null
  if (p.platformAuthority === true) return false
  return !MODULES.every((m) => p.modules?.[m] === true)
}
