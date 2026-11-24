import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import test from "node:test"

const script = fileURLToPath(new URL("./prepare-pg.mjs", import.meta.url))

for (const url of [
  "",
  "postgresql://qa@db.example.invalid:5432/vest_p02_test",
  "postgresql://qa@127.0.0.1:1/omni_persistente",
  "postgresql://qa@127.0.0.1:1/vest_p02_test/schema_alheio",
  "postgresql://qa@127.0.0.1:1/vest_p02_test?schema=outro",
  "postgresql://qa@127.0.0.1:1/vest_p02_test?schema=public&schema=outro",
  "postgresql://qa@127.0.0.1:1/vest_p02_test?host=db.example.invalid",
  "https://qa@127.0.0.1:1/vest_p02_test",
]) {
  test(`recusa alvo não descartável antes de procurar migration ou conectar: ${url}`, () => {
    // Sem diretório Prisma; porta 1 inacessível. Até uma versão sem guard não pode
    // atingir banco neste ensaio. Exige erro do guard, não um erro posterior de CLI.
    const result = spawnSync(process.execPath, [script], {
      cwd: tmpdir(), env: { ...process.env, VESTUARIO_P02_TEST_DATABASE_URL: url }, encoding: "utf8",
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /BLOQUEIO_EXPLICITO_PG/)
    assert.doesNotMatch(result.stderr, /MIGRATION_AUSENTE|P1001|Can't reach database/)
  })
}
