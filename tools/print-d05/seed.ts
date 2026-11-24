/** Initial synthetic catalog only; never resets data, sales, print ledger or an existing password. */
import "./seed-server-only.mjs"
import { randomBytes } from "node:crypto"
import { writeFileSync } from "node:fs"
import path from "node:path"
import bcrypt from "bcryptjs"
import { privateEnvironment, savePrivateEnvironment } from "./environment.mjs"
import { D05_TARGET } from "../../lib/printing/direct/homologation.mjs"
import type { Prisma } from "../../generated/prisma"
import type { StockLedgerTx } from "../../lib/estoque/stock-ledger-service"

const storeId = "d05-synthetic-store"
let phase = "PRIVATE_STATE"
async function main() {
  const privateRoot = process.argv[2]
  if (!privateRoot) throw new Error("D05_PRIVATE_ROOT_REQUIRED")
  const values = privateEnvironment(privateRoot)
  if (!values.D05_OPERATOR_PASSWORD) { values.D05_OPERATOR_PASSWORD = randomBytes(32).toString("base64url"); savePrivateEnvironment(privateRoot, values) }
  process.env.DATABASE_URL = values.DATABASE_URL
  process.env.DIRECT_URL = values.DIRECT_URL
  phase = "SERVER_MODULES"
  const { prisma } = await import("../../lib/prisma")
  const { applyStockMutationTx } = await import("../../lib/estoque/stock-ledger-service")
  const { defaultPdvImpressaoConfig, mergeImpressaoIntoPrinterConfig } = await import("../../lib/pdv-impressao-config")
  try {
    phase = "VERIFY_TARGET"
    const current = await prisma.$queryRaw<Array<{ db: string; role: string }>>`SELECT current_database() AS db,current_user AS role`
    if (current[0]?.db !== D05_TARGET.database || current[0]?.role !== D05_TARGET.role) throw new Error("D05_SEED_TARGET_REFUSED")
    const adminHash = await bcrypt.hash(values.ADMIN_DEFAULT_PASSWORD, 12), operatorHash = await bcrypt.hash(values.D05_OPERATOR_PASSWORD, 12)
    phase = "SEED_TRANSACTION"
    await prisma.$transaction(async tx => {
      if (await tx.store.count({ where: { id: { not: storeId } } }) !== 0) throw new Error("D05_NON_SYNTHETIC_STORE_REFUSED")
      await tx.store.upsert({ where: { id: storeId }, update: {}, create: { id: storeId, name: "HOMOLOGAÇÃO D05 — DADOS SINTÉTICOS", profile: "VARIEDADES", subscriptionPlan: "OURO", codigoNumeracaoVenda: "D05QA", cnpj: "00000000000000" } })
      const receipt = { ...defaultPdvImpressaoConfig(), bobinaTamanho: "80mm" as const, imprimirAutomatico: false, impressaoDireta: false, abrirGaveta: false, rodapeCupom: "TESTE D05 — SEM VALOR FISCAL" }
      await tx.storeSettings.upsert({ where: { storeId }, update: {}, create: { storeId, marketingMediaCredits: 0, printerConfig: mergeImpressaoIntoPrinterConfig({}, receipt) as Prisma.InputJsonObject } })
      for (const [id, name, email, role, password] of [
        ["d05-admin", "Administrador sintético D05", "admin-d05@example.invalid", "ADMIN", adminHash],
        ["d05-operator", "Operador sintético D05", "operador-d05@example.invalid", "CAIXA", operatorHash],
      ] as const) {
        await tx.adminUser.upsert({ where: { id }, update: {}, create: { id, name, email, role, password, lojaId: storeId, accessScope: "STORE", active: true, planName: "OURO", subscriptionStatus: "active" } })
        await tx.adminUserStore.upsert({ where: { adminUserId_storeId: { adminUserId: id, storeId } }, update: {}, create: { adminUserId: id, storeId } })
      }
      for (const index of [1, 2]) await tx.pdvTerminal.upsert({ where: { id: `d05-terminal-${index}` }, update: {}, create: { id: `d05-terminal-${index}`, storeId, code: `PDV${index}`, name: `Caixa sintético D05 ${index}` } })
      for (const [id, name, price] of [["d05-pao", "Pão de queijo — Ç/ã/é", 4.5], ["d05-cafe", "Café com açúcar", 3.25], ["d05-maca", "Maçã", 2.75]] as const) {
        await tx.produto.upsert({ where: { id }, update: {}, create: { id, storeId, sku: id.toUpperCase(), name, price, stock: 0, active: true, metadata: { unidadeMedida: "UN", syntheticD05: true } } })
        const result = await applyStockMutationTx(tx as unknown as StockLedgerTx, { storeId, principal: null, source: "d05-authorized-synthetic-seed", operatorLabel: "Preparação sintética D05" }, { kind: "entrada", produtoId: id, origem: "cadastro", quantidade: 100, custoUnitario: 1, idempotencyKey: `d05-seed-stock:${id}`, motivo: "Massa sintética de homologação" })
        if (!result.ok) throw new Error("D05_STOCK_SEED_REFUSED")
      }
    }, { timeout: 60000 })
    const result = { at: new Date().toISOString(), storeId, users: ["admin-d05@example.invalid", "operador-d05@example.invalid"], terminals: 2, products: 3, stockInitializedByCanonicalLedger: true, directPrintEnabledInStore: false, automaticPrint: false, credentials: "DPAPI_CURRENT_USER_OUTSIDE_REPOSITORY", productionAccess: false, physicalHomologation: "PENDING" }
    writeFileSync(path.join(process.cwd(), "docs/print-004c-e2e/evidence/d05/authorized-environment/SYNTHETIC_DATA.json"), JSON.stringify(result, null, 2) + "\n")
    console.log("D05_SYNTHETIC_DATA_READY")
  } finally { await prisma.$disconnect() }
}
main().catch((error: unknown) => {
  const e = error as { name?: string; code?: string; message?: string; stack?: string }
  console.error(JSON.stringify({ event: "D05_SYNTHETIC_SEED_FAILED", phase, name: e.name, code: e.code, reason: e.message && /^[A-Z_]+$/.test(e.message) ? e.message : "REDACTED", frames: e.stack?.split("\n").filter(l => l.trim().startsWith("at ")).slice(0, 3) }))
  process.exitCode = 1
})
