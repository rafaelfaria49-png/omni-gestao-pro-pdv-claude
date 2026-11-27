"use client"

/**
 * Ponte opt-in minimalista para interceptar navegações programáticas (ex.: Command Menu ⌘K)
 * quando a tela ativa possui alterações não salvas ou salvamento em andamento.
 * Sem guarda registrada, `interceptRouteExit` retorna `false` (comportamento anterior intacto).
 */
export interface RouteExitGuard {
  shouldBlock: (href: string) => boolean
  requestExit: (href: string, label?: string) => boolean
}

const routeExitGuards = new Set<RouteExitGuard>()

export function registerRouteExitGuard(guard: RouteExitGuard): () => void {
  routeExitGuards.add(guard)
  return () => {
    routeExitGuards.delete(guard)
  }
}

export function interceptRouteExit(href: string, label?: string): boolean {
  for (const guard of routeExitGuards) {
    if (guard.shouldBlock(href) && guard.requestExit(href, label)) {
      return true
    }
  }
  return false
}
