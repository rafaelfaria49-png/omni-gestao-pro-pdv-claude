#!/usr/bin/env node
/**
 * OMNI-SAAS-001A — prepara um PostgreSQL DESCARTÁVEL e PROVA a migration aditiva.
 *
 * 1. Baseline = schema da base (`SAAS_BASE_REF`/`APARELHOS_BASE_REF`, default origin/main) no ponto
 *    IMEDIATAMENTE ANTERIOR à migration do SaaS (mesmo método de scripts/aparelhos/prepare-pg.mjs),
 *    criado por `prisma migrate diff --from-empty`.
 * 2. Semeia dados representativos dos clientes ATUAIS (lojas legadas tipo `loja-1`/`loja-2`, loja de
 *    piloto com pacote básico, ADMIN legado com accessScope NULL, usuários de loja, vínculos,
 *    configurações e produtos) e tira um retrato (md5 por tabela).
 * 3. Aplica, em ordem, a migration do SaaS e todas as posteriores da branch (SQL real de produção).
 * 4. Prova: retrato idêntico (colunas antigas), toda loja com organizationId NULL, tabelas novas
 *    vazias, CHECKs/gatilhos presentes e drift ZERO contra prisma/schema.prisma.
 *
 * Recusa qualquer host que não seja loopback (nunca toca Production).
 * Uso: SAAS_TEST_DATABASE_URL=postgresql://user@127.0.0.1:55473/saas_pg node scripts/saas/prepare-pg.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const url = (process.env.SAAS_TEST_DATABASE_URL ?? "").trim()
if (!url) throw new Error("BLOQUEIO_EXPLICITO_PG: defina SAAS_TEST_DATABASE_URL (PostgreSQL descartável).")
const host = new URL(url).hostname.toLowerCase()
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) throw new Error("BLOQUEIO_EXPLICITO_PG: somente loopback.")

export const SAAS_MIGRATION = "20261124120000_saas_fundacao_comercial"
export const TABELAS_NOVAS = ["organizations", "organization_members", "subscriptions", "subscription_history", "trial_grants", "notification_outbox", "platform_audit_logs"]
const TABELAS_LEGADAS = ["stores", "store_settings", "admin_users", "admin_user_stores", "estoque_produtos"]

const baseRef = process.env.SAAS_BASE_REF || process.env.APARELHOS_BASE_REF || "origin/main"
const MIG_DIR = "prisma/migrations"
const isMigration = (name) => /^\d/.test(name) && existsSync(join(MIG_DIR, name, "migration.sql"))
const npx = process.platform === "win32" ? "npx.cmd" : "npx"
const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url }
const prisma = (args) => execFileSync(npx, ["prisma", ...args], { env, stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32" }).toString()

const dir = mkdtempSync(join(tmpdir(), "saas-pg-"))
const { PrismaClient } = await import("../../generated/prisma/index.js")
const db = new PrismaClient({ datasourceUrl: url })
const execSql = (nome, sql) => {
  writeFileSync(join(dir, nome), sql)
  prisma(["db", "execute", "--url", url, "--file", join(dir, nome)])
}

async function retrato() {
  const out = {}
  for (const t of TABELAS_LEGADAS) {
    // Só as colunas que já existiam: a coluna nova sai do hash.
    const [r] = await db.$queryRawUnsafe(
      `SELECT count(*)::int AS n, coalesce(md5(string_agg((to_jsonb(t) - 'organizationId')::text, '|' ORDER BY t.id)), '') AS h FROM "${t}" t`,
    )
    out[t] = r
  }
  return out
}

try {
  if (!isMigration(SAAS_MIGRATION)) throw new Error(`MIGRATION_AUSENTE: ${SAAS_MIGRATION} não está na branch.`)
  const introducao = execFileSync("git", ["log", baseRef, "--diff-filter=A", "--format=%H", "-1", "--", `${MIG_DIR}/${SAAS_MIGRATION}/migration.sql`]).toString().trim()
  const baselineRef = introducao ? `${introducao}^` : baseRef
  writeFileSync(join(dir, "base.prisma"), execFileSync("git", ["show", `${baselineRef}:prisma/schema.prisma`]).toString())
  execSql("reset.sql", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
  execSql("baseline.sql", prisma(["migrate", "diff", "--from-empty", "--to-schema-datamodel", join(dir, "base.prisma"), "--script"]))
  console.log(`BASELINE_OK (${baselineRef === baseRef ? baseRef : `${baseRef} antes de ${SAAS_MIGRATION}`})`)

  // Dados representativos dos clientes atuais (sintéticos; nenhum dado real).
  execSql("seed-legado.sql", `
    INSERT INTO stores (id, name, cnpj, "moduleAccess", "updatedAt") VALUES
      ('loja-1', 'Loja Legada Um (sintética)', '00.000.000/0001-01', NULL, now()),
      ('loja-2', 'Loja Legada Dois (sintética)', '00.000.000/0001-02', NULL, now()),
      ('cliente-00000000-0000-4000-8000-000000000001', 'Piloto Sintético', '', '{"version":1,"modules":["home","pdv","sales","cash","catalog","stock","reports","settings"]}', now());
    INSERT INTO store_settings (id, "storeId", "updatedAt") VALUES ('ss-1', 'loja-1', now()), ('ss-2', 'loja-2', now()), ('ss-p', 'cliente-00000000-0000-4000-8000-000000000001', now());
    INSERT INTO admin_users (id, name, email, password, role, "lojaId", "accessScope", "updatedAt") VALUES
      ('legado-owner', 'Dono Legado', 'owner@legado.invalid', '$2a$10$sinteticosinteticosintuOq1Xy9mE0o0y3f6l1Yl2m3n4o5p6q', 'ADMIN', NULL, NULL, now()),
      ('legado-caixa', 'Caixa Loja 1', 'caixa@legado.invalid', '$2a$10$sinteticosinteticosintuOq1Xy9mE0o0y3f6l1Yl2m3n4o5p6q', 'CAIXA', 'loja-1', 'STORE', now()),
      ('piloto-admin', 'Admin Piloto', 'admin@piloto.invalid', '$2a$10$sinteticosinteticosintuOq1Xy9mE0o0y3f6l1Yl2m3n4o5p6q', 'ADMIN', 'cliente-00000000-0000-4000-8000-000000000001', 'STORE', now());
    INSERT INTO admin_user_stores (id, "adminUserId", "storeId") VALUES
      ('aus-1', 'legado-caixa', 'loja-1'), ('aus-2', 'legado-caixa', 'loja-2'), ('aus-3', 'piloto-admin', 'cliente-00000000-0000-4000-8000-000000000001');
    INSERT INTO estoque_produtos (id, "storeId", name, "updatedAt") VALUES
      ('prod-l1', 'loja-1', 'Capa sintética', now()), ('prod-l2', 'loja-2', 'Película sintética', now()),
      ('prod-p1', 'cliente-00000000-0000-4000-8000-000000000001', 'Pão sintético', now());
  `)
  const antes = await retrato()

  const noBaseline = new Set(execFileSync("git", ["ls-tree", "--name-only", `${baselineRef}:${MIG_DIR}`]).toString().split("\n").map((l) => l.trim()).filter(Boolean))
  const aplicar = readdirSync(MIG_DIR).filter((n) => isMigration(n) && !noBaseline.has(n)).sort()
  if (!aplicar.includes(SAAS_MIGRATION)) throw new Error(`BASELINE_INVALIDO: ${SAAS_MIGRATION} já estava no baseline.`)
  for (const name of aplicar) {
    prisma(["db", "execute", "--url", url, "--file", join(MIG_DIR, name, "migration.sql")])
    console.log(`MIGRATION_OK ${name}`)
  }

  const depois = await retrato()
  if (JSON.stringify(antes) !== JSON.stringify(depois)) {
    console.error(JSON.stringify({ antes, depois }, null, 2))
    throw new Error("DADOS_LEGADOS_ALTERADOS")
  }
  const [{ comOrg }] = await db.$queryRawUnsafe(`SELECT count(*)::int AS "comOrg" FROM stores WHERE "organizationId" IS NOT NULL`)
  if (comOrg !== 0) throw new Error("LOJA_LEGADA_VINCULADA")
  for (const t of TABELAS_NOVAS) {
    const [{ n }] = await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}"`)
    if (n !== 0) throw new Error(`TABELA_NOVA_NAO_VAZIA ${t}`)
  }
  const [{ checks, gatilhos }] = await db.$queryRawUnsafe(`
    SELECT (SELECT count(*)::int FROM pg_constraint WHERE contype = 'c' AND conrelid::regclass::text = ANY($1)) AS checks,
           (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text = ANY($1)) AS gatilhos`,
    TABELAS_NOVAS)
  if (checks !== 16 || gatilhos !== 4) throw new Error(`INTEGRIDADE_AUSENTE checks=${checks} gatilhos=${gatilhos}`)

  const drift = prisma(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", "prisma/schema.prisma", "--script"])
  if (drift.split("\n").some((l) => l.trim() && !l.trim().startsWith("--"))) {
    console.error(drift)
    throw new Error("DRIFT: banco migrado difere do schema da branch.")
  }
  console.log(`LEGADO_PRESERVADO ${JSON.stringify(depois)}`)
  console.log(`INTEGRIDADE_OK checks=${checks} gatilhos=${gatilhos}`)
  console.log("DRIFT_ZERO")
} finally {
  await db.$disconnect()
  rmSync(dir, { recursive: true, force: true })
}
