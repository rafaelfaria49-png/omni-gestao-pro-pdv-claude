/**
 * COMPAT-PROFISSIONAL-001 — recusa, no SERVIDOR, cor padrão desativada pela loja em venda NOVA
 * finalizada AO VIVO.
 *
 * Regras:
 *  - Só a paleta padrão (colorKey ≠ "outra") é verificada; "outra" é texto livre por contrato.
 *  - Só recusa FINALIZAÇÃO AO VIVO: venda não registrada offline (`registeredOffline !== true`),
 *    feita depois da desativação e chegando dentro da janela de finalização (relógio do servidor).
 *    Venda registrada offline, ou sincronizada depois da janela (fila de reenvio), é ACEITA: o
 *    terminal pode ter vendido com a paleta que conhecia, e recusar mandaria uma venda física já
 *    paga para "ação necessária" sem registro no servidor (estoque/caixa divergentes).
 *  - Replay/reenvio de venda já gravada nunca chega aqui (o upsert devolve o registro antes);
 *    o histórico não é revalidado nem alterado.
 *  - Tabela ausente (migration não aplicada) = sem restrição (rollout seguro). A existência é
 *    conferida com `to_regclass` ANTES da consulta: um erro P2021 dentro da transação da venda
 *    abortaria a transação do PostgreSQL mesmo se capturado.
 */

import { isAcessorioColorKey, resolveAcessorioColorLabel } from "@/lib/acessorios/cores"

/** Janela em que uma venda é tratada como finalização ao vivo (relógio do servidor). */
export const JANELA_FINALIZACAO_AO_VIVO_MS = 10 * 60 * 1000

type CorDb = {
  compatCorLoja?: {
    findMany: (args: {
      where: { storeId: string; ativo: boolean; baseKey: { in: string[] } }
      select: { baseKey: true; updatedAt: true }
    }) => Promise<{ baseKey: string | null; updatedAt: Date }[]>
  }
  $queryRaw?: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>
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

/** A venda está sendo finalizada ao vivo (e não sincronizada da fila / registrada offline)? */
export function ehFinalizacaoAoVivo(venda: { registeredOffline?: unknown }, vendaEm: Date, agora: Date): boolean {
  if (venda.registeredOffline === true) return false
  const idade = agora.getTime() - vendaEm.getTime()
  return idade <= JANELA_FINALIZACAO_AO_VIVO_MS
}

async function tabelaExiste(db: CorDb): Promise<boolean> {
  if (typeof db.compatCorLoja?.findMany !== "function") return false
  // Dublê sem SQL cru: só o delegate importa. Cliente real: confere sem disparar erro na transação.
  if (typeof db.$queryRaw !== "function") return true
  const rows = (await db.$queryRaw`SELECT to_regclass('public.compat_cores_loja') IS NOT NULL AS ok`) as { ok: boolean }[]
  return rows?.[0]?.ok === true
}

/** Primeira cor recusada (rótulo) ou `null` quando a venda pode seguir. */
export async function corPadraoDesativadaNaVenda(
  db: CorDb,
  storeId: string,
  venda: { lines?: unknown; registeredOffline?: unknown },
  vendaEm: Date,
  agora: Date = new Date(),
): Promise<string | null> {
  const usadas = coresPadraoDasLinhas(venda.lines)
  if (usadas.length === 0) return null
  if (!ehFinalizacaoAoVivo(venda, vendaEm, agora)) return null
  if (!(await tabelaExiste(db))) return null
  const inativas = await db.compatCorLoja!.findMany({
    where: { storeId, ativo: false, baseKey: { in: usadas } },
    select: { baseKey: true, updatedAt: true },
  })
  const recusada = inativas.find((c) => c.baseKey && vendaEm.getTime() >= c.updatedAt.getTime())
  return recusada?.baseKey ? (resolveAcessorioColorLabel(recusada.baseKey) ?? recusada.baseKey) : null
}
