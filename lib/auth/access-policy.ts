/** Contrato de liberação consumido pelo motor enterprise (não é uma ACL concorrente). */
export const MODULES = [
  "home", "pdv", "sales", "cash", "catalog", "stock", "reports", "settings",
  "service", "deviceCatalog", "ai", "agent", "marketing", "marketplace", "accountant",
  "whatsapp", "finance", "fiscal", "experiments",
] as const
export type AccessModule = (typeof MODULES)[number]
export type ModuleAccess = { version: 1; modules: AccessModule[] }
export const BASIC_MODULE_ACCESS: ModuleAccess = {
  version: 1, modules: ["home", "pdv", "sales", "cash", "catalog", "stock", "reports", "settings"],
}

export function isPlatformAuthority(user: { role?: string | null; accessScope?: string | null }): boolean {
  if (user.accessScope === "PLATFORM") return true
  // Somente NULL persistido representa legado. Ausência de claim não concede autoridade.
  return user.accessScope === null && ["ADMIN", "SUPER_ADMIN"].includes(String(user.role).toUpperCase())
}

export function parseModuleAccess(value: unknown): ModuleAccess | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (v.version !== 1 || !Array.isArray(v.modules) ||
      v.modules.some((m) => typeof m !== "string" || !(MODULES as readonly string[]).includes(m))) return null
  return { version: 1, modules: [...new Set(v.modules)] as AccessModule[] }
}

export function resolveStoreModules(value: unknown): AccessModule[] {
  // SQL NULL existe apenas em lojas legadas; JSON/payload inválido falha fechado.
  return value === null ? [...MODULES] : parseModuleAccess(value)?.modules ?? []
}

export function isPlatformSession(session: { user?: { platformAuthority?: boolean } } | null | undefined): boolean {
  return session?.user?.platformAuthority === true
}
