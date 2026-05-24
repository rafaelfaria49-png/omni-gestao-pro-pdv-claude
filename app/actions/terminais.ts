"use server"

import { prisma, withPrismaSafe } from "@/lib/prisma"
import { computeLockStatus, type TerminalLockStatus } from "@/lib/pdv-terminal-lock"

/**
 * Terminais PDV por loja (Multi-Terminais).
 * Cada loja pode ter vários terminais (PDV1, PDV2, PDV3...). Todos compartilham o
 * mesmo estoque; o isolamento de caixa/venda por terminal usa `terminalId`.
 *
 * Fase 2: cada terminal tem lock (deviceId + heartbeat) — ver `lib/pdv-terminal-lock.ts`
 * e as rotas `app/api/ops/terminal/{lock,heartbeat,unlock}`. Aqui só LISTAMOS o estado
 * (com status de lock computado server-side, sem clock skew) e fazemos CRUD básico.
 *
 * Todas as operações são scoped por `storeId` (multi-loja) e usam `withPrismaSafe`
 * para degradar com segurança caso a tabela/colunas ainda não existam no banco — assim
 * o PDV nunca quebra por causa do terminal.
 */

export type TerminalStatus = "ACTIVE" | "INACTIVE"

export type TerminalLockInfo = {
  status: TerminalLockStatus
  lockedByOperador: string | null
  /** ISO do último heartbeat (para exibir "último sinal às HH:MM"). */
  heartbeatAt: string | null
  /** ISO de quando o lock atual foi adquirido ("em uso desde"). */
  lockedAt: string | null
  /** true quando o lock pertence ao device que consultou. */
  isMine: boolean
}

export type PdvTerminalDTO = {
  id: string
  storeId: string
  code: string
  name: string
  status: TerminalStatus
  lock: TerminalLockInfo
}

export type TerminalMutationResult = {
  ok: boolean
  terminal?: PdvTerminalDTO
  error?: string
}

/** Códigos padrão criados na primeira vez que uma loja consulta seus terminais. */
const DEFAULT_TERMINAL_CODES = ["PDV1", "PDV2", "PDV3"] as const

type TerminalRow = {
  id: string
  storeId: string
  code: string
  name: string
  status: string
  lockedByDeviceId: string | null
  lockedByOperador: string | null
  lockedAt: Date | null
  heartbeatAt: Date | null
}

function toDTO(t: TerminalRow, myDeviceId: string | null, nowMs: number): PdvTerminalDTO {
  const lockStatus = computeLockStatus({
    status: t.status,
    lockedByDeviceId: t.lockedByDeviceId,
    heartbeatAtMs: t.heartbeatAt ? t.heartbeatAt.getTime() : null,
    nowMs,
    myDeviceId,
  })
  return {
    id: t.id,
    storeId: t.storeId,
    code: t.code,
    name: t.name,
    status: t.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    lock: {
      status: lockStatus,
      lockedByOperador: t.lockedByOperador ?? null,
      heartbeatAt: t.heartbeatAt ? t.heartbeatAt.toISOString() : null,
      lockedAt: t.lockedAt ? t.lockedAt.toISOString() : null,
      isMine: !!(myDeviceId && t.lockedByDeviceId === myDeviceId),
    },
  }
}

/** Sufixo numérico do código (PDV1 → 1). 0 quando não houver número. */
function codeNum(code: string): number {
  const n = parseInt(String(code).replace(/\D/g, ""), 10)
  return Number.isFinite(n) ? n : 0
}

/** Nome amigável padrão a partir do código (PDV1 → "PDV 1"). */
function defaultName(code: string): string {
  const num = codeNum(code)
  return num > 0 ? `PDV ${num}` : code
}

/** Ordena por número do código (PDV2 antes de PDV10, ao contrário do sort textual). */
function sortByCodeNum(rows: TerminalRow[]): TerminalRow[] {
  return [...rows].sort((a, b) => codeNum(a.code) - codeNum(b.code) || a.code.localeCompare(b.code))
}

/**
 * Lista os terminais da loja com o estado de lock computado para `deviceId`.
 * Na primeira consulta de uma loja sem terminais, cria os 3 padrão (PDV1/2/3).
 * Retorna `[]` se o banco estiver indisponível ou a tabela/colunas não existirem.
 */
export async function listTerminais(
  storeId: string,
  deviceId?: string,
): Promise<PdvTerminalDTO[]> {
  const sid = (storeId || "").trim()
  if (!sid) return []
  const myDeviceId = (deviceId || "").trim() || null
  return withPrismaSafe(async (db) => {
    let rows = (await db.pdvTerminal.findMany({ where: { storeId: sid } })) as TerminalRow[]

    if (rows.length === 0) {
      await db.pdvTerminal.createMany({
        data: DEFAULT_TERMINAL_CODES.map((code) => ({
          storeId: sid,
          code,
          name: defaultName(code),
          status: "ACTIVE",
        })),
        skipDuplicates: true,
      })
      rows = (await db.pdvTerminal.findMany({ where: { storeId: sid } })) as TerminalRow[]
    }

    const now = Date.now()
    return sortByCodeNum(rows).map((r) => toDTO(r, myDeviceId, now))
  }, [])
}

/**
 * Cria um novo terminal manualmente. O código (PDVn) é o próximo número livre da loja.
 */
export async function criarTerminal(
  storeId: string,
  input?: { name?: string },
): Promise<TerminalMutationResult> {
  const sid = (storeId || "").trim()
  if (!sid) return { ok: false, error: "Loja inválida." }
  return withPrismaSafe<TerminalMutationResult>(
    async (db) => {
      const existentes = (await db.pdvTerminal.findMany({
        where: { storeId: sid },
        select: { code: true },
      })) as Array<{ code: string }>
      const maxNum = existentes.reduce((m, r) => Math.max(m, codeNum(r.code)), 0)
      const nextNum = maxNum + 1
      const code = `PDV${nextNum}`
      const name = (input?.name || "").trim() || `PDV ${nextNum}`
      const created = (await db.pdvTerminal.create({
        data: { storeId: sid, code, name, status: "ACTIVE" },
      })) as TerminalRow
      return { ok: true, terminal: toDTO(created, null, Date.now()) }
    },
    { ok: false, error: "Não foi possível criar o terminal (banco indisponível)." },
  )
}

/**
 * Ativa ou desativa um terminal. Scoped por `storeId`. Ao DESATIVAR, o lock é
 * liberado (terminal inativo não pode ficar preso "ocupado").
 */
export async function setTerminalStatus(
  storeId: string,
  terminalId: string,
  status: TerminalStatus,
): Promise<TerminalMutationResult> {
  const sid = (storeId || "").trim()
  const tid = (terminalId || "").trim()
  if (!sid || !tid) return { ok: false, error: "Parâmetros inválidos." }
  const next: TerminalStatus = status === "INACTIVE" ? "INACTIVE" : "ACTIVE"
  return withPrismaSafe<TerminalMutationResult>(
    async (db) => {
      const existing = (await db.pdvTerminal.findFirst({
        where: { id: tid, storeId: sid },
        select: { id: true },
      })) as { id: string } | null
      if (!existing) return { ok: false, error: "Terminal não encontrado." }
      const updated = (await db.pdvTerminal.update({
        where: { id: tid },
        data:
          next === "INACTIVE"
            ? {
                status: next,
                lockedByDeviceId: null,
                lockedByOperador: null,
                lockedAt: null,
                heartbeatAt: null,
              }
            : { status: next },
      })) as TerminalRow
      return { ok: true, terminal: toDTO(updated, null, Date.now()) }
    },
    { ok: false, error: "Não foi possível atualizar o terminal (banco indisponível)." },
  )
}
