#!/usr/bin/env node
/**
 * Gestor Money — suítes PostgreSQL G001–G006 + RLS com runtime restrito, na CI.
 *
 * Cada fixture G00x prova a identidade física do banco (porta, papel, nome e, em G004–G006, o caminho
 * do `data_directory`). Por isso cada grupo ganha o SEU `postgres:17` descartável (Docker, rede do host),
 * escutando só em 127.0.0.1 na porta exigida, com PGDATA no caminho exigido. O schema vem das migrations
 * REAIS (`scripts/aparelhos/prepare-pg.mjs`, DRIFT_ZERO). Nenhum `.env`, nenhuma credencial, nenhum banco
 * externo — o Datasource Guard (#404) continua valendo (URLs loopback; `verifyTestDatasources`).
 *
 * Reprova se algum arquivo falhar, se algum ARQUIVO terminar sem teste executado (as suítes pulam inteiras
 * sem a URL exata) ou se um grupo terminar com 0 testes. Pulos explícitos com motivo aparecem no resumo. Fora daqui, por dependerem de baselines históricos montados à mão:
 * migration.postgres, migration-g003, migration-g004 e mensageria-migration (o caminho das migrations é
 * provado pelo grupo Aparelhos de run-root-pg-suites.mjs, com DRIFT_ZERO).
 *
 * Uso (Linux com Docker): node scripts/ci/run-gestor-money-pg-suites.mjs [grupo...]
 */
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const IMAGEM = process.env.GM_PG_IMAGE || "postgres:17"
const ADMIN = "pgadmin"

/** @typedef {{ nome: string, porta: number, pgdata: string, banco: string, dono: string, envs: string[], arquivos: string[], preparo?: (g: Grupo) => void, extraEnv?: Record<string,string>, urlApp?: string }} Grupo */
// Suítes do comportamento LIGADO (evidências G002–G006): a flag é declarada aqui, explícita, nunca herdada.
const LIGADO = { GESTOR_MONEY_ENABLED: "true" }
/** @type {Grupo[]} */
export const GRUPOS = [
  { nome: "g001", porta: 55493, pgdata: "G001-execution/pgdata", banco: "gastos_g001_test", dono: "gastos_g001",
    envs: ["GASTOS_TEST_DATABASE_URL"], arquivos: ["test/gastos/perfis.postgres.test.ts"] },
  { nome: "g002", extraEnv: LIGADO, porta: 55494, pgdata: "G002-execution/pgdata", banco: "gastos_g002_test", dono: "gastos_g002",
    envs: ["GASTOS_G002_TEST_DATABASE_URL"],
    arquivos: ["test/gastos/writers.postgres.test.ts", "test/gastos/writers-routes.postgres.test.ts"],
    preparo: (g) => {
      // Papel sem login usado por `SET LOCAL ROLE gastos_g002_anon`: SELECT concedido, RLS decide (0 linhas pessoais).
      psqlAdmin(g, "postgres", "CREATE ROLE gastos_g002_anon NOLOGIN NOSUPERUSER NOBYPASSRLS")
      psqlAdmin(g, "postgres", "GRANT gastos_g002_anon TO gastos_g002")
      psqlAdmin(g, g.banco, "GRANT USAGE ON SCHEMA public TO gastos_g002_anon; GRANT SELECT ON ALL TABLES IN SCHEMA public TO gastos_g002_anon")
    } },
  { nome: "g003", extraEnv: LIGADO, porta: 55495, pgdata: "G003-execution/pgdata", banco: "gastos_g003_test", dono: "gastos_g003",
    envs: ["GASTOS_G003_TEST_DATABASE_URL", "DATABASE_URL"],
    arquivos: ["test/gastos/readers.postgres.test.ts", "test/gastos/documentos.postgres.test.ts"] },
  { nome: "g004", extraEnv: LIGADO, porta: 55496, pgdata: "G004-execution/pgdata", banco: "gastos_g004_test", dono: "gastos_g004",
    envs: ["GASTOS_G004_TEST_DATABASE_URL", "DATABASE_URL"],
    arquivos: ["test/gastos/operacoes.postgres.test.ts", "test/gastos/operacoes-http.postgres.test.ts", "test/gastos/cartoes.postgres.test.ts",
      "test/gastos/concorrencia-g004.postgres.test.ts", "test/gastos/rollback-g004.postgres.test.ts"] },
  { nome: "g005", porta: 55506, pgdata: "G005-execution/pgdata", banco: "gastos_g005_test", dono: "gastos_g005",
    envs: ["GASTOS_G005_TEST_DATABASE_URL", "DATABASE_URL"],
    arquivos: ["test/gastos/consumidores-g005.postgres.test.ts", "test/gastos/reconciliacao.postgres.test.ts",
      "test/gastos/contratos-produto.postgres.test.ts", "test/gastos/hub-pagar-g004.postgres.test.ts"] },
  { nome: "g006", extraEnv: LIGADO, porta: 55516, pgdata: "G006-execution/pgdata", banco: "gastos_g006_test", dono: "gastos_g006_owner",
    envs: ["GASTOS_G006_TEST_DATABASE_URL", "DATABASE_URL"],
    arquivos: ["test/gastos/channels.postgres.test.ts", "test/gastos/queue.postgres.test.ts", "test/gastos/worker-recovery.integration.test.ts"],
    preparo: (g) => {
      for (const papel of ["omni_gastos_ingress", "omni_gastos_worker", "omni_gastos_operator"]) {
        psqlAdmin(g, "postgres", `CREATE ROLE ${papel} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`)
        psqlAdmin(g, "postgres", `ALTER ROLE ${papel} SET timezone='UTC'`)
      }
      // Contrato de privilégios do RUNBOOK G006 (§ Papel SQL e confiança), só neste cluster descartável.
      psqlAdmin(g, g.banco, readFileSync("scripts/ci/gestor-money/g006-qa-grants.sql", "utf8"))
    } },
  // G007/G008 (assistente conversacional): webhook assinado → fila G006 → worker oficial com gancho → G001/G004/G005
  // reais, sem sessão de navegador. Mesmos papéis G006 (worker sem acesso às tabelas gm_assist_*, provado no teste).
  { nome: "g007", extraEnv: LIGADO, porta: 55530, pgdata: "G007-execution/pgdata", banco: "gm_g007_test", dono: "gm_g007_owner",
    envs: ["GASTOS_G007_TEST_DATABASE_URL", "DATABASE_URL"], arquivos: ["test/gastos/assistente-whatsapp.postgres.test.ts"],
    preparo: (g) => {
      for (const papel of ["omni_gastos_ingress", "omni_gastos_worker", "omni_gastos_operator"]) {
        psqlAdmin(g, "postgres", `CREATE ROLE ${papel} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`)
        psqlAdmin(g, "postgres", `ALTER ROLE ${papel} SET timezone='UTC'`)
      }
      psqlAdmin(g, g.banco, readFileSync("scripts/ci/gestor-money/g006-qa-grants.sql", "utf8"))
    } },
  // Runtime NÃO dono, NOBYPASSRLS, só DML: o `@/lib/prisma` real (com o guard #404) conecta como gm_runtime.
  { nome: "rls", porta: 55520, pgdata: "RLS-execution/pgdata", banco: "gm_rls_app", dono: "gm_owner",
    envs: ["GASTOS_RLS_OWNER_URL"], urlApp: "postgresql://gm_runtime@127.0.0.1:55520/gm_rls_app",
    arquivos: ["test/gastos/rls-runtime-restrito.postgres.test.ts"],
    preparo: (g) => {
      psqlAdmin(g, "postgres", "CREATE ROLE gm_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE")
      psqlAdmin(g, g.banco, "GRANT USAGE ON SCHEMA public TO gm_runtime; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gm_runtime; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gm_runtime")
    } },
]

const container = (g) => `gm-pg-${g.nome}`
const urlDono = (g) => `postgresql://${g.dono}@127.0.0.1:${g.porta}/${g.banco}`

function psqlAdmin(g, banco, sql) {
  execFileSync("docker", ["exec", "-i", container(g), "psql", "-X", "-w", "-v", "ON_ERROR_STOP=1", "-q",
    "-h", "127.0.0.1", "-p", String(g.porta), "-U", ADMIN, "-d", banco], { input: sql, stdio: ["pipe", "inherit", "inherit"] })
}

function subir(g) {
  spawnSync("docker", ["rm", "-f", container(g)], { stdio: "ignore" })
  execFileSync("docker", ["run", "-d", "--name", container(g), "--network", "host",
    "-e", `POSTGRES_USER=${ADMIN}`, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-e", "POSTGRES_DB=postgres",
    "-e", `PGDATA=/var/lib/postgresql/${g.pgdata}`, IMAGEM,
    "-c", `port=${g.porta}`, "-c", "listen_addresses=127.0.0.1", "-c", "max_connections=200",
    "-c", "createrole_self_grant=set,inherit"], { stdio: ["ignore", "ignore", "inherit"] })
  for (let i = 0; i < 90; i++) {
    const r = spawnSync("docker", ["exec", container(g), "pg_isready", "-h", "127.0.0.1", "-p", String(g.porta), "-U", ADMIN], { stdio: "ignore" })
    // pg_isready responde antes do fim do initdb do entrypoint; exigir uma consulta real.
    if (r.status === 0 && spawnSync("docker", ["exec", container(g), "psql", "-X", "-h", "127.0.0.1", "-p", String(g.porta), "-U", ADMIN,
      "-d", "postgres", "-Atc", "select 1"], { stdio: "ignore" }).status === 0) return
    spawnSync("sleep", ["1"])
  }
  throw new Error(`PostgreSQL do grupo ${g.nome} não ficou pronto`)
}

function preparar(g) {
  psqlAdmin(g, "postgres", `CREATE ROLE ${g.dono} LOGIN NOSUPERUSER NOBYPASSRLS CREATEROLE`)
  psqlAdmin(g, "postgres", `GRANT pg_read_all_settings TO ${g.dono}`) // fixtures conferem data_directory
  psqlAdmin(g, "postgres", `CREATE DATABASE ${g.banco} OWNER ${g.dono}`)
  psqlAdmin(g, g.banco, `ALTER SCHEMA public OWNER TO ${g.dono}`)
  execFileSync(process.execPath, ["scripts/aparelhos/prepare-pg.mjs"], {
    env: { ...process.env, APARELHOS_TEST_DATABASE_URL: urlDono(g) }, stdio: ["ignore", "inherit", "inherit"],
  })
  // Padrão do PostgreSQL e de Production (PUBLIC=U em public): papéis de teste sem login (ex.: *_anon)
  // precisam enxergar o schema para que o RLS — e não a ausência de USAGE — seja o que nega a leitura.
  psqlAdmin(g, g.banco, "GRANT USAGE ON SCHEMA public TO PUBLIC")
  g.preparo?.(g)
}

function rodar(g) {
  const tmp = mkdtempSync(join(tmpdir(), `gm-${g.nome}-`)), saida = join(tmp, "vitest.json")
  const app = g.urlApp ?? urlDono(g)
  const env = { ...process.env, DATABASE_URL: app, DIRECT_URL: app, ...Object.fromEntries(g.envs.map((k) => [k, k === "DATABASE_URL" ? app : urlDono(g)])) }
  Object.assign(env, g.extraEnv ?? {})
  if (g.nome === "rls") env.GASTOS_RLS_TEST_DATABASE_URL = app
  if (g.nome === "g006") { env.G006_EVIDENCE_DIR = join(tmp, "G006-execution"); mkdirSync(env.G006_EVIDENCE_DIR) }
  const r = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", ...g.arquivos, "--maxWorkers=1", "--testTimeout=180000",
    "--hookTimeout=180000", "--reporter=default", "--reporter=json", `--outputFile.json=${saida}`], { env, stdio: "inherit" })
  let rel = null
  try { rel = JSON.parse(readFileSync(saida, "utf8")) } catch { /* sem relatório = falha */ }
  rmSync(tmp, { recursive: true, force: true })
  // Arquivo sem NENHUM teste executado = suíte pulada por URL/opt-in errado (reprova). Pulos explícitos
  // (it.skip com motivo) dentro de um arquivo que rodou ficam visíveis no resumo, sem reprovar.
  const semExecucao = rel ? rel.testResults.filter((f) => !f.assertionResults.some((a) => a.status === "passed" || a.status === "failed"))
    .map((f) => f.name.replaceAll("\\", "/").split("/test/gastos/").pop()) : []
  const resumo = rel ? { total: rel.numTotalTests, ok: rel.numPassedTests, falhas: rel.numFailedTests, pulados: rel.numPendingTests + (rel.numTodoTests ?? 0),
    arquivosFalhos: rel.numFailedTestSuites, semExecucao } : null
  const ok = r.status === 0 && resumo && resumo.falhas === 0 && resumo.total > 0 && resumo.arquivosFalhos === 0 && semExecucao.length === 0
  console.log(`GM_PG_GRUPO ${g.nome} ${ok ? "OK" : "FALHOU"} ${JSON.stringify(resumo)}`)
  return ok
}

function main() {
  const pedidos = process.argv.slice(2)
  const grupos = pedidos.length ? GRUPOS.filter((g) => pedidos.includes(g.nome)) : GRUPOS
  const resultado = []
  for (const g of grupos) {
    console.log(`\n=== Gestor Money PG: ${g.nome} (porta ${g.porta}, ${g.arquivos.length} arquivo(s))`)
    try { subir(g); preparar(g); resultado.push([g.nome, rodar(g)]) } catch (e) {
      console.error(`GM_PG_GRUPO ${g.nome} ERRO_PREPARO ${e instanceof Error ? e.message : String(e)}`)
      resultado.push([g.nome, false])
    } finally {
      if (!process.env.GM_PG_KEEP) spawnSync("docker", ["rm", "-f", container(g)], { stdio: "ignore" })
    }
  }
  const falhos = resultado.filter(([, ok]) => !ok).map(([n]) => n)
  console.log(falhos.length ? `\nGM_PG_FALHOU ${falhos.join(",")}` : "\nGM_PG_OK")
  process.exit(falhos.length ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
