/**
 * OMNI-PRINT D02-A — guardas sem banco: o recorte é exatamente o ensaiado, e nenhuma migration de impressão chega a
 * prisma/migrations (onde o build da Vercel a aplicaria) antes da aplicação manual registrada.
 */
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { body, buildMigrations, CUT_GUARD, cutII, NAMES, SOURCES, STAGED } from "./cut.mjs"

const ROOT = path.resolve(__dirname, "../..")
const MIGRATIONS = path.join(ROOT, "prisma/migrations")
const lf = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n")
const statements = (sql: string) => sql.split("\n").filter(l => l.trim() && !l.startsWith("--"))
const built = buildMigrations() as Record<string, string>
const names = NAMES as Record<"idxVendas" | "idxTerminais" | "core", string>

describe("D02-A — recorte das migrations", () => {
  it("as pastas em tools/print-d02/migrations são exatamente a saída do gerador, em LF", () => {
    for (const [name, sql] of Object.entries(built)) {
      const file = path.join(STAGED, name, "migration.sql")
      expect(readFileSync(file).equals(Buffer.from(sql)), name).toBe(true)
      expect(sql).not.toContain("\r")
    }
    expect(readdirSync(STAGED).sort()).toEqual(Object.keys(built).sort())
  })

  it("a guarda é byte a byte a CUT_GUARD validada no ensaio D02, e o núcleo é o CUT_II do ensaio", () => {
    const rehearsal = lf(path.join(ROOT, "tools/print-004c-e2e/d02-rehearsal.pg.test.ts"))
    for (const key of ["01", "02"] as const) {
      const literal = new RegExp(`"${key}": ("(?:[^"\\\\]|\\\\.)*")`).exec(rehearsal)
      expect(literal, key).not.toBeNull()
      expect(CUT_GUARD[key]).toBe(JSON.parse(literal![1]))
    }
    expect(rehearsal).toContain(`const CUT_II = () => write("cut_ii.sql", "BEGIN;\\n" + CUT_GUARD["01"] + body(F01).inner + body(F02).inner + "COMMIT;\\n")`)
    const core = built[names.core]
    const firstSql = core.split("\n").findIndex(l => !l.startsWith("--"))
    expect(core.split("\n").slice(firstSql).join("\n")).toBe(cutII())
    expect(core.slice(core.indexOf("BEGIN;\n"))).toBe("BEGIN;\n" + CUT_GUARD["01"] + body(SOURCES.F01).inner + body(SOURCES.F02).inner + "COMMIT;\n")
    // Exactly one top-level transaction, guard right after BEGIN, vendas locked first.
    expect(core.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(core.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(statements(core).slice(0, 4)).toEqual(["BEGIN;", "SET LOCAL lock_timeout = '2s';", "LOCK TABLE public.vendas IN SHARE ROW EXCLUSIVE MODE;",
      "LOCK TABLE public.pdv_terminais, public.stores, public.admin_users IN SHARE ROW EXCLUSIVE MODE;"])
  })

  it("cada pasta de índice tem UM único comando CONCURRENTLY, igual ao do passo 00 ensaiado", () => {
    const f00 = statements(lf(SOURCES.F00))
    for (const key of ["idxVendas", "idxTerminais"] as const) {
      const sql = statements(built[names[key]])
      expect(sql).toHaveLength(1)
      expect(sql[0]).toMatch(/^CREATE UNIQUE INDEX CONCURRENTLY "p004_(vendas|term)_id_store_uq" ON "public"\."(vendas|pdv_terminais)" \("id", "storeId"\);$/)
      expect(f00).toContain(sql[0])
    }
  })

  it("fim de linha LF garantido por .gitattributes nas pastas preparadas e nas promovidas", () => {
    const paths = [path.posix.join("tools/print-d02/migrations", names.core, "migration.sql"), path.posix.join("prisma/migrations", names.core, "migration.sql")]
    const r = spawnSync("git", ["check-attr", "eol", "--", ...paths], { cwd: ROOT, encoding: "utf8" })
    expect(r.status).toBe(0)
    for (const p of paths) expect(r.stdout).toContain(`${p}: eol: lf`)
  })
})

describe("D02-A — proteção do build (prisma migrate deploy)", () => {
  const record = JSON.parse(readFileSync(path.join(ROOT, "tools/print-d02/APLICACAO.json"), "utf8")) as Record<string, unknown>
  const folders = readdirSync(MIGRATIONS).filter(n => existsSync(path.join(MIGRATIONS, n, "migration.sql")))

  it("nenhuma migration fora das três pastas D02 cria objetos de impressão", () => {
    for (const n of folders.filter(f => !Object.values(names).includes(f)))
      expect(lf(path.join(MIGRATIONS, n, "migration.sql")), n).not.toMatch(/p004_|"print_/)
  })

  it("as pastas D02 só entram em prisma/migrations com a aplicação manual registrada (e então entram as três, idênticas)", () => {
    const promoted = folders.filter(f => Object.values(names).includes(f))
    if (record.status !== "APLICADA_E_REGISTRADA") {
      expect(promoted, "promoção sem registro da aplicação manual: o build aplicaria as migrations").toEqual([])
      return
    }
    for (const field of ["banco", "endpoint", "executor", "aprovacao", "janela", "pontoDeRestauracao", "commitAplicado", "verifyPrisma"])
      expect(record[field], field).toBeTruthy()
    expect(promoted.sort()).toEqual(Object.values(names).sort())
    for (const n of promoted) expect(readFileSync(path.join(MIGRATIONS, n, "migration.sql")).equals(Buffer.from(built[n])), n).toBe(true)
  })
})
