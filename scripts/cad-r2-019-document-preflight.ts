/**
 * CAD-R2-019 — Preflight READ-ONLY de documentos de Cliente.
 *
 * Auditoria OBRIGATÓRIA antes de aplicar a migration 0021
 * (UNIQUE storeId + documentKey) em produção.
 *
 * - SOMENTE LEITURA: nenhum create/update/delete/migrate neste arquivo.
 * - Bounded: paginação por cursor (lotes configuráveis via --batch-size).
 * - Classificação reusa `toStrongDocumentKey` de
 *   `lib/cadastros/client-identity/document.ts` — nenhum outro validador.
 * - Saída sanitizada em JSON: contagens + grupos com IDs técnicos
 *   (cuid/uuid, sem PII) + hash opaco da chave. NUNCA dígitos de documento.
 *
 * Uso:
 *   npx tsx scripts/cad-r2-019-document-preflight.ts [--batch-size 500]
 *
 * Saída: JSON em stdout + linha `RESULT=PASS|BLOCKED` em stderr.
 * - PASS: zero duplicidade forte mesma-store → pode prosseguir para
 *   backfill + migration 0021.
 * - BLOCKED: há duplicidade forte mesma-store → NÃO auto-merge, NÃO escolher
 *   survivor, NÃO aplicar a 0021; revisar os pares pelo fluxo 018-B e
 *   retomar o GOAL depois.
 */

import { createHash } from "node:crypto"
import * as dotenv from "dotenv"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { PrismaClient } from "../generated/prisma/index.js"
import { toStrongDocumentKey } from "@/lib/cadastros/client-identity/document.js"
import {
  classifyDocumentBucket,
  describeDocumentFormat,
} from "@/lib/cadastros/client-document-audit.js"

const HERE = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(HERE, "../.env") })

const MAX_MEMBERS_PER_GROUP = 50

function parseArgs(argv: string[]): { batchSize: number } {
  let batchSize = 500
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--batch-size") {
      const n = Number(argv[i + 1])
      if (Number.isInteger(n) && n >= 50 && n <= 5000) batchSize = n
    }
  }
  return { batchSize }
}

function opaqueKeyHash(storeId: string, key: string): string {
  return createHash("sha256").update(`cad-r2-019|${storeId}|${key}`).digest("hex").slice(0, 16)
}

async function main(): Promise<void> {
  const { batchSize } = parseArgs(process.argv.slice(2))
  const db = new PrismaClient()
  try {
    let total = 0
    let empty = 0
    let invalid = 0
    let strong = 0
    let masked = 0
    let canonical = 0

    // Agregação em streaming (sem acumular linhas): chave → membros.
    const membersByStoreKey = new Map<string, { storeId: string; keyHash: string; memberIds: string[]; truncated: boolean }>()
    const storesByKey = new Map<string, Set<string>>()

    let cursor: string | undefined
    for (;;) {
      const rows = await db.cliente.findMany({
        select: { id: true, storeId: true, document: true },
        orderBy: { id: "asc" },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: batchSize,
      })
      if (rows.length === 0) break
      for (const row of rows) {
        total += 1
        const bucket = classifyDocumentBucket(row.document)
        if (bucket === "empty") {
          empty += 1
          continue
        }
        if (bucket === "invalid") {
          invalid += 1
          continue
        }
        strong += 1
        const format = describeDocumentFormat(row.document)
        if (format === "masked") masked += 1
        if (format === "canonical") canonical += 1
        const key = toStrongDocumentKey(row.document) as string
        const storeId = (row.storeId ?? "").trim()
        const composite = `${storeId}|${key}`
        let group = membersByStoreKey.get(composite)
        if (!group) {
          group = { storeId, keyHash: opaqueKeyHash(storeId, key), memberIds: [], truncated: false }
          membersByStoreKey.set(composite, group)
        }
        if (group.memberIds.length < MAX_MEMBERS_PER_GROUP) {
          group.memberIds.push(row.id)
        } else {
          group.truncated = true
        }
        let stores = storesByKey.get(key)
        if (!stores) {
          stores = new Set<string>()
          storesByKey.set(key, stores)
        }
        stores.add(storeId)
      }
      cursor = rows[rows.length - 1]?.id
      if (rows.length < batchSize) break
    }

    const sameStoreStrongDuplicates = [...membersByStoreKey.values()]
      .filter((g) => g.memberIds.length > 1 || g.truncated)
      .map((g) => ({
        keyHash: g.keyHash,
        storeId: g.storeId,
        memberCount: g.truncated ? "50+" : g.memberIds.length,
        memberIds: [...g.memberIds].sort(),
        ...(g.truncated ? { truncated: true } : {}),
      }))
      .sort((a, b) => (a.keyHash < b.keyHash ? -1 : a.keyHash > b.keyHash ? 1 : 0))

    let crossStoreReuse = 0
    for (const stores of storesByKey.values()) {
      if (stores.size > 1) crossStoreReuse += 1
    }

    const result = sameStoreStrongDuplicates.length > 0 ? "BLOCKED" : "PASS"

    const report = {
      goal: "CAD-R2-019",
      mode: "preflight-read-only",
      batchSize,
      totalClients: total,
      emptyDocuments: empty,
      invalidDocuments: invalid,
      strongDocuments: strong,
      maskedStrong: masked,
      canonicalStrong: canonical,
      sameStoreStrongDuplicates,
      crossStoreReuse,
      result,
    }
    console.log(JSON.stringify(report, null, 2))
    console.error(`RESULT=${result}`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error("[cad-r2-019-preflight] FALHA:", e instanceof Error ? e.message : String(e))
  process.exit(1)
})
