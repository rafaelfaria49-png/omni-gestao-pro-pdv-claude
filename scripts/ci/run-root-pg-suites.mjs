#!/usr/bin/env node
/**
 * FISCAL-XSD-SUITE-RAIZ-247-FIX-002 — execução própria das suítes da raiz que EXIGEM PostgreSQL.
 *
 * Essas suítes falham de propósito sem banco (`BLOQUEIO_EXPLICITO_PG`: "ausência de ambiente é
 * impedimento, não aprovação"). Por isso a suíte da raiz sem banco (`npm run test:root:sem-pg`,
 * usada pelo job Container do Fiscal XSD) as exclui, e ESTE runner as roda contra bancos
 * descartáveis — nenhuma fica sem execução:
 *
 * 1. Trava de cobertura: todo arquivo de teste versionado que contém `BLOQUEIO_EXPLICITO_PG` precisa
 *    estar no MANIFESTO abaixo, e todo arquivo do manifesto precisa existir. Suíte PG nova sem
 *    entrada aqui faz o job falhar (nunca é excluída em silêncio).
 * 2. Um banco por grupo, recriado do zero. Os nomes seguem as travas dos próprios testes (ex.:
 *    FRG exige `ops_v4_frg_qa*`, 006/007 exigem `ops_v4_fluxo_00N_qa*`).
 * 3. Schema: `aparelhos` usa o preparador oficial (baseline + migrations + drift zero, por causa dos
 *    CHECKs que não estão no datamodel); os demais recebem o datamodel vigente de
 *    `prisma/schema.prisma` (`migrate diff --from-empty`), como nos runs locais dessas trilhas.
 * 4. Cada grupo roda isolado (`--maxWorkers=1`); qualquer falha reprova o job ao final.
 *
 * Recusa host que não seja loopback. Nunca toca banco real.
 * Uso: PG_ADMIN_URL=postgresql://user:senha@127.0.0.1:5432/postgres node scripts/ci/run-root-pg-suites.mjs
 */
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { localFixtureDatasource } from "../../lib/db/datasource-policy.mjs"

const FLUXO = "OPS_V4_FLUXO_CURTO_TEST_DATABASE_URL"
const FRG = "OPS_V4_FRG_TEST_DATABASE_URL"

/** Manifesto: grupo → banco, variáveis que apontam para ele, preparo e arquivos. */
export const MANIFESTO = [
  {
    db: "ops_v4_fluxo_qa_ci",
    envs: [FLUXO],
    preparo: "datamodel",
    arquivos: [
      "test/ops-v4-fluxo-curto-002/garantia-pg.test.ts",
      "test/ops-v4-fluxo-curto-004/entrada-complementar.pg.test.ts",
      "test/ops-v4-fluxo-curto-005/proxima-acao.pg.test.ts",
      "lib/operacoes-v4/entrada-readback.integration.test.ts",
      "lib/operacoes-v3/workspace-actions.pg.test.ts",
    ],
  },
  { db: "ops_v4_fluxo_006_qa_ci", envs: [FLUXO], preparo: "datamodel", arquivos: ["test/ops-v4-fluxo-curto-006/retirada.pg.test.ts"] },
  { db: "ops_v4_fluxo_007_qa_ci", envs: [FLUXO], preparo: "datamodel", arquivos: ["test/ops-v4-fluxo-curto-007/retorno.pg.test.ts"] },
  {
    db: "ops_v4_frg_qa_ci",
    envs: [FRG],
    preparo: "datamodel",
    arquivos: [
      "test/ops-v4-financeiro-retirada-garantia-001/projecao.pg.test.ts",
      "test/ops-v4-financeiro-retirada-garantia-002/recebimento-elegivel.pg.test.ts",
    ],
  },
  { db: "aparelhos_pg_ci", envs: ["APARELHOS_TEST_DATABASE_URL"], preparo: "aparelhos", arquivos: ["test/aparelhos/aparelhos.pg.test.ts"] },
  // OMNI-PDV-TROCAS-…-P1-002: troca atômica, regularização, a prazo/carnê, fechamento × devolução.
  { db: "pdv_trocas_qa_ci", envs: ["TROCAS_PG_URL"], preparo: "datamodel", arquivos: ["lib/pdv/trocas/troca-service.pg.test.ts"] },
  // OMNI-GESTOR-MONEY-LEGACY-COMPATIBILITY-FINAL-004: gatilho G002 venda × título com legado cruzado.
  // Preparo "aparelhos" = migrations REAIS (os gatilhos não estão no datamodel).
  { db: "gastos_venda_titulo_legado_ci", envs: ["APARELHOS_TEST_DATABASE_URL", "GASTOS_LEGADO_PG_URL"], preparo: "aparelhos", arquivos: ["test/gastos/venda-titulo-legado.pg.test.ts"] },
]

const npx = process.platform === "win32" ? "npx.cmd" : "npx"

function exigirAdminLocal() {
  const raw = (process.env.PG_ADMIN_URL ?? "").trim()
  if (!raw) throw new Error("BLOQUEIO_EXPLICITO_PG: defina PG_ADMIN_URL (PostgreSQL descartável, banco de manutenção).")
  const url = new URL(localFixtureDatasource(raw))
  if (url.hostname === "localhost") url.hostname = "127.0.0.1"
  return url
}

/** Arquivos de teste versionados que travam sem banco — todos precisam estar no manifesto. */
export function verificarCobertura(manifesto = MANIFESTO) {
  const listados = new Set(manifesto.flatMap((g) => g.arquivos))
  const ausentes = [...listados].filter((f) => !existsSync(f))
  const versionados = execFileSync("git", ["ls-files", "*.test.ts", "*.test.tsx", "*.spec.ts"]).toString().split("\n").filter(Boolean)
  const exigemPg = versionados.filter((f) => readFileSync(f, "utf8").includes("BLOQUEIO_EXPLICITO_PG"))
  const foraDoManifesto = exigemPg.filter((f) => !listados.has(f))
  return { exigemPg, ausentes, foraDoManifesto }
}

function urlDoBanco(admin, db) {
  const u = new URL(admin.href)
  u.pathname = `/${db}`
  return u.href
}

function sql(admin, comando) {
  // libpq environment defaults and psql startup files can otherwise replace
  // the validated destination or execute an additional connection command.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)))
  const host = admin.hostname.replace(/^\[|\]$/g, "")
  Object.assign(env, {
    PGHOST: host,
    PGHOSTADDR: host,
    PGPORT: admin.port || "5432",
    PGUSER: decodeURIComponent(admin.username),
    PGPASSWORD: decodeURIComponent(admin.password),
    PGDATABASE: decodeURIComponent(admin.pathname.slice(1)),
    PGSSLMODE: admin.searchParams.get("sslmode") ?? "prefer",
    PGCONNECT_TIMEOUT: admin.searchParams.get("connect_timeout") ?? "10",
  })
  // CREATE/DROP DATABASE não rodam em transação: um comando por execução.
  const r = spawnSync(process.env.PSQL || "psql", ["-X", "-w", "-v", "ON_ERROR_STOP=1", "-qAtc", comando], {
    env,
    stdio: ["ignore", "inherit", "inherit"],
  })
  if (r.status !== 0) throw new Error(`psql falhou: ${comando}`)
}

function prisma(args, env) {
  execFileSync(npx, ["prisma", ...args], { env: { ...process.env, ...env }, stdio: ["ignore", "inherit", "inherit"], shell: process.platform === "win32" })
}

function main() {
  const admin = exigirAdminLocal()
  const cobertura = verificarCobertura()
  if (cobertura.ausentes.length || cobertura.foraDoManifesto.length) {
    console.error("COBERTURA_PG_INVALIDA", JSON.stringify(cobertura, null, 2))
    process.exit(2)
  }
  console.log(`COBERTURA_PG_OK: ${cobertura.exigemPg.length} suítes com BLOQUEIO_EXPLICITO_PG, todas no manifesto.`)

  const tmp = mkdtempSync(join(tmpdir(), "root-pg-"))
  const falhas = []
  try {
    const datamodel = join(tmp, "datamodel.sql")
    writeFileSync(datamodel, execFileSync(npx, ["prisma", "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"], { shell: process.platform === "win32" }))
    for (const grupo of MANIFESTO) {
      const url = urlDoBanco(admin, grupo.db)
      console.log(`\n=== ${grupo.db} (${grupo.arquivos.length} arquivo(s))`)
      sql(admin, `DROP DATABASE IF EXISTS ${grupo.db} WITH (FORCE)`)
      sql(admin, `CREATE DATABASE ${grupo.db}`)
      const env = { DATABASE_URL: url, DIRECT_URL: url, ...Object.fromEntries(grupo.envs.map((k) => [k, url])) }
      if (grupo.preparo === "aparelhos") {
        execFileSync(process.execPath, ["scripts/aparelhos/prepare-pg.mjs"], { env: { ...process.env, ...env }, stdio: ["ignore", "inherit", "inherit"] })
      } else {
        prisma(["db", "execute", "--schema", "prisma/schema.prisma", "--file", datamodel], env)
      }
      const r = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", ...grupo.arquivos, "--maxWorkers=1", "--testTimeout=120000", "--hookTimeout=120000"], {
        env: { ...process.env, ...env },
        stdio: "inherit",
      })
      if (r.status !== 0) falhas.push(grupo.db)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  if (falhas.length) {
    console.error(`\nSUITES_PG_FALHARAM: ${falhas.join(", ")}`)
    process.exit(1)
  }
  console.log("\nSUITES_PG_OK")
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("run-root-pg-suites.mjs")) main()
