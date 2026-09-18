/**
 * CAD-R2-019 — Backfill idempotente de `Cliente.documentKey`.
 *
 * - Reusa `toStrongDocumentKey` de `lib/cadastros/client-identity/document.ts`
 *   (nenhum outro validador CPF/CNPJ; nunca inventa/corrige DV).
 * - Regras: CPF válido → 11 dígitos; CNPJ válido → 14; vazio/inválido → NULL.
 * - Idempotente: só escreve quando a chave difere da armazenada; reaplicar
 *   resulta em zero writes.
 * - Bounded: paginação por cursor + updates em lotes na mesma transação.
 * - NÃO auto-merge, NÃO escolhe survivor, NÃO apaga: colisões mesma-store
 *   (duas linhas que receberiam a mesma chave) são REPORTADAS e ignoradas
 *   nesta passada (exit 2, RESULT=BLOCKED) para revisão pelo fluxo 018-B.
 * - Logs sanitizados: contagens e IDs técnicos; nunca documento bruto.
 *
 * Uso:
 *   npx tsx scripts/cad-r2-019-document-backfill.ts [--batch-size 500] [--exec]
 *
 * Sem --exec: dry-run (só relata). Com --exec: aplica as escritas seguras.
 */

import * as dotenv from "dotenv"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { PrismaClient } from "../generated/prisma/index.js"
import { toStrongDocumentKey } from "@/lib/cadastros/client-identity/document.js"

const HERE = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(HERE, "../.env") })

type CliOpts = { batchSize: number; exec: boolean }

function parseArgs(argv: string[]): CliOpts {
  let batchSize = 500
  let exec = false
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--batch-size") {
      const n = Number(argv[i + 1])
      if (Number.isInteger(n) && n >= 50 && n <= 2000) batchSize = n
    }
    if (argv[i] === "--exec") exec = true
  }
  return { batchSize, exec }
}

type Planned = { id: string; storeId: string; key: string | null; stored: string | null }

async function main(): Promise<void> {
  const { batchSize, exec } = parseArgs(process.argv.slice(2))
  const db = new PrismaClient()
  try {
    let scanned = 0
    let alreadyOk = 0
    const planned: Planned[] = []

    let cursor: string | undefined
    for (;;) {
      const rows = await db.cliente.findMany({
        select: { id: true, storeId: true, document: true, documentKey: true },
        orderBy: { id: "asc" },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: batchSize,
      })
      if (rows.length === 0) break
      for (const row of rows) {
        scanned += 1
        const key = toStrongDocumentKey(row.document)
        if (key === row.documentKey) {
          alreadyOk += 1
          continue
        }
        planned.push({ id: row.id, storeId: (row.storeId ?? "").trim(), key, stored: row.documentKey })
      }
      cursor = rows[rows.length - 1]?.id
      if (rows.length < batchSize) break
    }

    // Chaves já ocupadas (linhas novas escritas pelo serviço ou passadas
    // anteriores): valem como primeiro ocupante.
    const occupied = new Map<string, string>()
    {
      let cur: string | undefined
      for (;;) {
        const rows = await db.cliente.findMany({
          select: { id: true, storeId: true, documentKey: true },
          where: { NOT: { documentKey: null } },
          orderBy: { id: "asc" },
          ...(cur ? { cursor: { id: cur }, skip: 1 } : {}),
          take: batchSize,
        })
        if (rows.length === 0) break
        for (const row of rows) {
          if (row.documentKey) occupied.set(`${(row.storeId ?? "").trim()}|${row.documentKey}`, row.id)
        }
        cur = rows[rows.length - 1]?.id
        if (rows.length < batchSize) break
      }
    }

    const safe: Planned[] = []
    const collisions: Array<{ storeId: string; memberIds: string[] }> = []
    const collisionIndex = new Map<string, string[]>()
    for (const p of planned) {
      if (p.key === null) {
        // NULL nunca colide; se esta linha liberava uma chave ocupada,
        // devolve a ocupação para não bloquear terceiros à toa.
        if (p.stored !== null) {
          const composite = `${p.storeId}|${p.stored}`
          if (occupied.get(composite) === p.id) occupied.delete(composite)
        }
        safe.push(p)
        continue
      }
      const composite = `${p.storeId}|${p.key}`
      const first = occupied.get(composite)
      if (first === undefined) {
        occupied.set(composite, p.id)
        safe.push(p)
        continue
      }
      let group = collisionIndex.get(composite)
      if (!group) {
        group = [first]
        collisionIndex.set(composite, group)
      }
      group.push(p.id)
    }
    for (const [composite, memberIds] of collisionIndex) {
      collisions.push({ storeId: composite.slice(0, composite.indexOf("|")), memberIds: [...memberIds].sort() })
    }
    collisions.sort((a, b) => (a.memberIds[0] < b.memberIds[0] ? -1 : 1))

    let written = 0
    if (exec && safe.length > 0) {
      for (let i = 0; i < safe.length; i += batchSize) {
        const chunk = safe.slice(i, i + batchSize)
        await db.$transaction(
          chunk.map((p) =>
            db.cliente.update({ where: { id: p.id }, data: { documentKey: p.key } }),
          ),
        )
        written += chunk.length
      }
    }

    const result = collisions.length > 0 ? "BLOCKED" : "PASS"
    const report = {
      goal: "CAD-R2-019",
      mode: exec ? "backfill-exec" : "backfill-dry-run",
      batchSize,
      scanned,
      alreadyCanonical: alreadyOk,
      planned: planned.length,
      safe,
      skippedCollisions: collisions,
      written,
      result,
    }
    // IDs técnicos + contagens; `safe` carrega só {id, storeId, key:null?} —
    // chaves fortes planejadas NÃO são emitidas (evita vazar documento).
    const sanitized = {
      ...report,
      safe: undefined,
      safeCount: safe.filter((p) => p.key !== null).length,
      safeNullCount: safe.filter((p) => p.key === null).length,
    }
    console.log(JSON.stringify(sanitized, null, 2))
    console.error(`RESULT=${result}`)
    if (collisions.length > 0) process.exitCode = 2
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error("[cad-r2-019-backfill] FALHA:", e instanceof Error ? e.message : String(e))
  process.exit(1)
})
