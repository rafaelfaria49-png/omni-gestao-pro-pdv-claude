/**
 * Gate leve para ferramentas técnicas (ex.: /dashboard/dev-health).
 * Não substitui auth real; não expõe valores de variáveis de ambiente.
 */

function isExplicitTrue(v: string | undefined): boolean {
  return v?.trim() === "true"
}

/**
 * Painel dev-health liberado quando:
 * - NODE_ENV !== "production", ou
 * - ENABLE_DEV_HEALTH === "true" (servidor — preferido na Vercel), ou
 * - NEXT_PUBLIC_ENABLE_DEV_HEALTH === "true" (também disponível no cliente; evite deixar ligado sem necessidade).
 */
export function isDevToolsEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true
  if (isExplicitTrue(process.env.ENABLE_DEV_HEALTH)) return true
  if (isExplicitTrue(process.env.NEXT_PUBLIC_ENABLE_DEV_HEALTH)) return true
  return false
}

/**
 * Texto seguro para UI ou logs (sem secrets).
 */
export function getDevToolsAccessReason(): string {
  if (process.env.NODE_ENV !== "production") {
    return "Acesso permitido: ambiente não é produção."
  }
  if (isExplicitTrue(process.env.ENABLE_DEV_HEALTH)) {
    return "Acesso permitido: ENABLE_DEV_HEALTH=true no servidor."
  }
  if (isExplicitTrue(process.env.NEXT_PUBLIC_ENABLE_DEV_HEALTH)) {
    return "Acesso permitido: NEXT_PUBLIC_ENABLE_DEV_HEALTH=true."
  }
  return "Ative ENABLE_DEV_HEALTH=true nas variáveis de ambiente (servidor) para liberar temporariamente. Alternativa: NEXT_PUBLIC_ENABLE_DEV_HEALTH=true se precisar do flag no bundle do cliente — recomenda-se desligar assim que terminar o diagnóstico."
}
