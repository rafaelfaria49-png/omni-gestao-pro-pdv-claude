import {
  ENV_ORDEM_BARCODE,
  ORDEM_BARCODE_DEFAULT,
  idsConhecidos,
} from "@/lib/cadastros/provider-governance"
import type { ProvedorId } from "./types"

/**
 * Registro/ordem dos provedores de lookup externo (GOAL 004A · CAD-R2-015).
 *
 * Lê `BARCODE_LOOKUP_PROVIDERS` (CSV). Default neste GOAL: "cosmos".
 * Provedor desconhecido na env => erro claro (não crash).
 *
 * CAD-R2-015: os ids válidos, o default e o nome da env vêm da governança
 * canônica (lib/cadastros/provider-governance) — fonte única. O comportamento
 * funcional (parse, default, dedup, erro honesto) é preservado.
 */

const PROVEDORES_VALIDOS: ReadonlySet<ProvedorId> = new Set(idsConhecidos())

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
  if (!raw) return { ok: true, provedores: [...ORDEM_BARCODE_DEFAULT] }

  const tokens = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)

  if (tokens.length === 0) return { ok: true, provedores: [...ORDEM_BARCODE_DEFAULT] }

  const ordem: ProvedorId[] = []
  const vistos = new Set<string>()
  for (const token of tokens) {
    if (!PROVEDORES_VALIDOS.has(token as ProvedorId)) {
      return {
        ok: false,
        erro: `Provedor desconhecido em ${ENV_ORDEM_BARCODE}: "${token}". Valores aceitos: ${idsConhecidos().join(", ")}.`,
      }
    }
    if (!vistos.has(token)) {
      vistos.add(token)
      ordem.push(token as ProvedorId)
    }
  }
  if (ordem.length === 0) return { ok: true, provedores: [...ORDEM_BARCODE_DEFAULT] }
  return { ok: true, provedores: ordem }
}
