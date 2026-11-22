#!/usr/bin/env node
/**
 * FISCAL-XSD-SUITE-RAIZ-247-FIX-002 — suíte completa da raiz SEM as suítes que exigem PostgreSQL.
 *
 * Exclui exatamente os arquivos do MANIFESTO de `run-root-pg-suites.mjs` (que os roda contra bancos
 * descartáveis no workflow "Suítes PostgreSQL da raiz") — nada além disso. A trava de cobertura
 * roda aqui também: suíte nova com `BLOQUEIO_EXPLICITO_PG` fora do manifesto reprova antes do vitest.
 * Argumentos extras são repassados ao vitest.
 */
import { spawnSync } from "node:child_process"
import { MANIFESTO, verificarCobertura } from "./run-root-pg-suites.mjs"

const cobertura = verificarCobertura()
if (cobertura.ausentes.length || cobertura.foraDoManifesto.length) {
  console.error("COBERTURA_PG_INVALIDA", JSON.stringify(cobertura, null, 2))
  process.exit(2)
}
const excluir = MANIFESTO.flatMap((g) => g.arquivos)
console.log(`Suíte da raiz sem PostgreSQL: ${excluir.length} suítes PG excluídas (rodam no workflow próprio).`)
const r = spawnSync(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", ...excluir.flatMap((f) => ["--exclude", f]), ...process.argv.slice(2)],
  { stdio: "inherit" },
)
process.exit(r.status ?? 1)
