// Seed sintético do GO-LIVE da padaria (PG descartável 55443). Nunca toca outro banco.
// Senhas e PIN vêm do ambiente do processo (gerados pelo chamador); nada é impresso.
import { createHmac } from "node:crypto"
import bcrypt from "bcryptjs"

const database = "postgresql://platform_pilot:isolated_ci_only@127.0.0.1:55443/platform_pilot_isolated"
const { GOLIVE_DONO_PASSWORD: donoPw, GOLIVE_CAIXA_PASSWORD: caixaPw, GOLIVE_SUPERVISOR_PIN: pin, GOLIVE_AUTH_SECRET: secret } = process.env
if (!donoPw || !caixaPw || !pin || !secret) throw new Error("GOLIVE_ENV_REQUIRED")
const { PrismaClient } = await import("../../../generated/prisma/index.js")
const { BASIC_MODULE_ACCESS } = await import("../../../lib/auth/access-policy.ts") // rodar com node --import tsx
const db = new PrismaClient({ datasourceUrl: database })
try {
  const [{ db: name }] = await db.$queryRawUnsafe("SELECT current_database() AS db, inet_server_port() AS port")
  if (name !== "platform_pilot_isolated") throw new Error("GOLIVE_DB_MISMATCH")
  const STORE = "golive-padaria"
  const modules = BASIC_MODULE_ACCESS.modules
  const store = { name: "Padaria Go-Live Sintética", cnpj: "00.000.000/0001-55", moduleAccess: { version: 1, modules: [...modules] } }
  await db.store.upsert({ where: { id: STORE }, create: { id: STORE, ...store }, update: store })
  const printerConfig = { capabilities: { version: 1, business: { primaryBranch: "padaria" } } }
  await db.storeSettings.upsert({ where: { storeId: STORE }, create: { storeId: STORE, printerConfig }, update: { printerConfig } })
  for (const [id, role, pw] of [["golive-dono", "ADMIN", donoPw], ["golive-caixa", "CAIXA", caixaPw]]) {
    const data = { email: `${id}@pilot.invalid`, name: `Sintético ${id}`, role, lojaId: STORE, accessScope: "STORE", password: await bcrypt.hash(pw, 10), mustChangePassword: false }
    await db.adminUser.upsert({ where: { id }, update: data, create: { id, ...data, adminUserStores: { create: [{ storeId: STORE }] } } })
  }
  const pinHash = await bcrypt.hash(createHmac("sha256", secret).update(pin, "utf8").digest("hex"), 10)
  await db.user.upsert({ where: { id: "golive-supervisor" }, update: { pinHash }, create: { id: "golive-supervisor", name: "Supervisor Padaria Sintético", role: "ADMIN", pin: "x:golive-supervisor", pinHash } })
  console.log("GOLIVE_SEED_OK store=" + STORE + " modules=" + modules.length)
} finally { await db.$disconnect() }
