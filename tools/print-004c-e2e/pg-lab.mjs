/**
 * Disposable PostgreSQL 17 lab for OMNI-PRINT-004C (never a commercial database).
 * Commands: init | start | stop | reset <db> | url <db>
 * Data dir comes from PRINT_LAB_DIR (required, outside the repository); port from PRINT_LAB_PORT (default 55474).
 * reset <db>: drops/creates <db>, applies the main schema baseline (prisma migrate diff from empty),
 * then 004B synthetic migration and the 004C LOCAL_AGENT candidate migration, all with ON_ERROR_STOP.
 */
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const BIN = process.env.PG_BIN || "C:/Program Files/PostgreSQL/17/bin"
const exe = name => path.join(BIN, process.platform === "win32" ? name : name.replace(/\.exe$/, ""))
const DIR = process.env.PRINT_LAB_DIR
const PORT = Number(process.env.PRINT_LAB_PORT || 55474)
const OWNER = "omni_print_lab_owner"
if (!DIR || path.resolve(DIR).startsWith(root)) throw new Error("PRINT_LAB_DIR must be set outside the repository")
const DATA = path.join(DIR, "pgdata")
const run = (exe, args, opts = {}) => {
  const r = spawnSync(path.join(BIN, process.platform === "win32" ? exe : exe.replace(/\.exe$/, "")), args, { encoding: "utf8", windowsHide: true, timeout: 120000, ...opts })
  if (r.status !== 0) throw new Error(`${exe} ${args.join(" ")} -> ${r.status}\n${r.stdout}\n${r.stderr}`)
  return r.stdout
}
const psql = (db, args, opts) => run("psql.exe", ["-h", "127.0.0.1", "-p", String(PORT), "-U", "pgadmin", "-d", db, "-v", "ON_ERROR_STOP=1", "-X", "-q", ...args], opts)
export const labUrl = (db) => `postgresql://${OWNER}:lab@127.0.0.1:${PORT}/${db}`

function baselineSql() {
  const cache = path.join(DIR, "baseline-main.sql")
  if (existsSync(cache)) return cache
  const schema = path.join(DIR, "schema-main.prisma")
  const git = spawnSync("git", ["show", `${process.env.PRINT_LAB_BASE_REF || "origin/main"}:prisma/schema.prisma`], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 })
  if (git.status !== 0) throw new Error(git.stderr)
  writeFileSync(schema, git.stdout)
  const r = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema-datamodel", schema, "--script"],
    { cwd: root, encoding: "utf8", maxBuffer: 64 << 20, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } })
  if (r.status !== 0) throw new Error(r.stderr)
  writeFileSync(cache, r.stdout)
  return cache
}

const cmd = process.argv[2], db = process.argv[3]
if (cmd === "init") {
  mkdirSync(DIR, { recursive: true })
  if (!existsSync(DATA)) run("initdb.exe", ["-D", DATA, "-U", "pgadmin", "--auth=trust", "-E", "UTF8", "--locale=C"])
  console.log("initialized " + DATA)
} else if (cmd === "start") {
  // stdio ignore: pg_ctl start with pipes never returns on Windows (postmaster inherits handles).
  const r = spawnSync(exe("pg_ctl.exe"), ["-D", DATA, "-l", path.join(DIR, "pg.log"), "-w", "-o", `-p ${PORT} -c listen_addresses=127.0.0.1 -c max_connections=60`, "start"], { stdio: "ignore", windowsHide: true, timeout: 60000 })
  if (r.status !== 0) throw new Error("pg_ctl start failed; see pg.log")
  psql("postgres", ["-c", `DO $$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${OWNER}') THEN CREATE ROLE ${OWNER} LOGIN PASSWORD 'lab' NOSUPERUSER NOCREATEROLE NOBYPASSRLS; END IF; END$$;`])
  console.log(`started 127.0.0.1:${PORT}`)
} else if (cmd === "stop") {
  spawnSync(exe("pg_ctl.exe"), ["-D", DATA, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true, timeout: 60000 })
  console.log("stopped")
} else if (cmd === "reset") {
  if (!/^print_lab_[a-z0-9_]+$/.test(db || "")) throw new Error("db must match print_lab_*")
  psql("postgres", ["-c", `DROP DATABASE IF EXISTS ${db} WITH (FORCE)`])
  psql("postgres", ["-c", `CREATE DATABASE ${db} OWNER ${OWNER}`])
  const owner = (file) => run("psql.exe", ["-h", "127.0.0.1", "-p", String(PORT), "-U", OWNER, "-d", db, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-1", "-f", file], { env: { ...process.env, PGPASSWORD: "lab" } })
  owner(baselineSql())
  // The 004B/004C files carry their own BEGIN/COMMIT.
  // Candidate files live OUTSIDE prisma/migrations (never applied by build/merge). Optional future layout:
  // PRINT_LAB_LAYOUT=future → 00 concurrent parent indexes (no transaction) + 01 without parent indexes + 02.
  const dir = path.join(root, "tools/print-004c-e2e/candidate-migrations")
  const files = process.env.PRINT_LAB_LAYOUT === "baseline" ? []
    : process.env.PRINT_LAB_LAYOUT === "future"
    ? ["future/00_parent_indexes_concurrently.sql", "future/01_print_core_without_parent_indexes.sql", "02_20261102_print_local_agent_candidate.sql"]
    : ["01_20261030_print_core_synthetic_local.sql", "02_20261102_print_local_agent_candidate.sql"]
  for (const f of files) {
    run("psql.exe", ["-h", "127.0.0.1", "-p", String(PORT), "-U", OWNER, "-d", db, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", path.join(dir, f)], { env: { ...process.env, PGPASSWORD: "lab" } })
  }
  console.log("reset " + db)
} else if (cmd === "url") {
  console.log(labUrl(db))
} else {
  console.log("usage: init|start|stop|reset <db>|url <db>")
}
