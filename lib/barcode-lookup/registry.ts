import type { ProvedorId } from "./types"

/**
 * Registro/ordem dos provedores de lookup externo (GOAL 004A).
 *
 * Lê `BARCODE_LOOKUP_PROVIDERS` (CSV). Default neste GOAL: "cosmos".
 * Provedor desconhecido na env => erro claro (não crash).
 */

const PROVEDORES_VALIDOS: ReadonlySet<ProvedorId> = new Set([
  "cosmos",
  "upcitemdb",
  "openfoodfacts",
])

export type ResultadoOrdem =
  | { ok: true; provedores: ProvedorId[] }
  | { ok: false; erro: string }

/**
 * Parseia a ordem de provedores a partir da env CSV.
 * - Vazio => default "cosmos".
 * - Provedor desconhecido => erro claro (não lança).
 * - Duplicatas são removidas preservando a primeira ocorrência.
 */
export function lerOrdemProvedores(env: string | undefined): ResultadoOrdem {
  const raw = (env ?? "").trim()
  if (!raw) return { ok: true, provedores: ["cosmos"] }

  const tokens = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)

  if (tokens.length === 0) return { ok: true, provedores: ["cosmos"] }

  const ordem: ProvedorId[] = []
  const vistos = new Set<string>()
  for (const token of tokens) {
    if (!PROVEDORES_VALIDOS.has(token as ProvedorId)) {
      return {
        ok: false,
        erro: `Provedor desconhecido em BARCODE_LOOKUP_PROVIDERS: "${token}". Valores aceitos: cosmos, upcitemdb, openfoodfacts.`,
      }
    }
    if (!vistos.has(token)) {
      vistos.add(token)
      ordem.push(token as ProvedorId)
    }
  }
  if (ordem.length === 0) return { ok: true, provedores: ["cosmos"] }
  return { ok: true, provedores: ordem }
}
