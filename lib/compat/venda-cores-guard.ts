/**
 * COMPAT-PROFISSIONAL-001 — recusa, no SERVIDOR, cor padrão desativada pela loja em venda NOVA.
 *
 * Regras:
 *  - Só a paleta padrão (colorKey ≠ "outra") é verificada; "outra" é texto livre por contrato.
 *  - A recusa vale só para venda feita DEPOIS da desativação (`Venda.at` ≥ `updatedAt` da linha
 *    inativa). Venda feita antes — inclusive a que estava na fila offline — continua aceita.
 *  - Replay/reenvio de venda já gravada nunca chega aqui (o upsert devolve o registro antes);
 *    o histórico não é revalidado nem alterado.
 *  - Tabela ausente (migration não aplicada) = sem restrição (rollout seguro).
 *
 * Puro + leitura escopada por `storeId`; quem lança o erro é o upsert da venda.
 */

import { isAcessorioColorKey, resolveAcessorioColorLabel } from "@/lib/acessorios/cores"
import { isUnavailable } from "@/lib/catalogo-aparelhos/loja-catalogo-store"

type CorDb = {
  compatCorLoja: {
    findMany: (args: {
      where: { storeId: string; ativo: boolean; baseKey: { in: string[] } }
      select: { baseKey: true; updatedAt: true }
    }) => Promise<{ baseKey: string | null; updatedAt: Date }[]>
  }
}

/** Cores da paleta usadas nas linhas (sem "outra"), deduplicadas. */
export function coresPadraoDasLinhas(lines: unknown): string[] {
  if (!Array.isArray(lines)) return []
  const out = new Set<string>()
  for (const raw of lines) {
    const sel = raw && typeof raw === "object" ? (raw as Record<string, unknown>).accessorySelection : null
    const key = sel && typeof sel === "object" ? (sel as Record<string, unknown>).colorKey : null
    if (isAcessorioColorKey(key) && key !== "outra") out.add(key)
  }
  return [...out]
}

/** Primeira cor recusada (rótulo) ou `null` quando a venda pode seguir. */
export async function corPadraoDesativadaNaVenda(
  db: CorDb,
  storeId: string,
  lines: unknown,
  vendaEm: Date,
): Promise<string | null> {
  const usadas = coresPadraoDasLinhas(lines)
  if (usadas.length === 0) return null
  // Cliente Prisma sem o delegate (cliente gerado antes do schema / dublê de teste sem a tabela)
  // equivale a tabela ausente: sem restrição, igual ao rollout sem migration.
  if (typeof db.compatCorLoja?.findMany !== "function") return null
  let inativas: { baseKey: string | null; updatedAt: Date }[]
  try {
    inativas = await db.compatCorLoja.findMany({
      where: { storeId, ativo: false, baseKey: { in: usadas } },
      select: { baseKey: true, updatedAt: true },
    })
  } catch (e) {
    if (isUnavailable(e)) return null
    throw e
  }
  const recusada = inativas.find((c) => c.baseKey && vendaEm.getTime() >= c.updatedAt.getTime())
  return recusada?.baseKey ? (resolveAcessorioColorLabel(recusada.baseKey) ?? recusada.baseKey) : null
}
