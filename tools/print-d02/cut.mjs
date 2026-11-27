/**
 * OMNI-PRINT D02-A — recorte das migrations a partir dos arquivos candidatos (fonte única).
 *
 * (i)  duas pastas, cada uma com UM ÚNICO comando `CREATE UNIQUE INDEX CONCURRENTLY` copiado de
 *      `future/00_parent_indexes_concurrently.sql`. O Prisma só executa CONCURRENTLY fora de transação quando ele é o
 *      único comando do arquivo; por isso não há `SET` nem verificação no arquivo: o operador (`d02.mjs apply-indexes`)
 *      aplica `lock_timeout` e confere `pg_index.indisvalid`.
 * (ii) uma pasta com 01-futura + 02 numa ÚNICA transação: `BEGIN;` + CUT_GUARD["01"] + corpos sem BEGIN/COMMIT internos +
 *      `COMMIT;`. É exatamente o `CUT_II()` de `tools/print-004c-e2e/d02-rehearsal.pg.test.ts`, precedido só de comentários
 *      (`d02-guard.test.ts` confere a CUT_GUARD contra o literal do ensaio e a montagem contra a expressão do CUT_II).
 *
 * Os arquivos candidatos não são alterados. Saída sempre com LF (o checksum do Prisma é sobre os bytes).
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const MIG = path.join(ROOT, "tools/print-004c-e2e/candidate-migrations")
export const SOURCES = {
  F00: path.join(MIG, "future/00_parent_indexes_concurrently.sql"),
  F01: path.join(MIG, "future/01_print_core_without_parent_indexes.sql"),
  F02: path.join(MIG, "02_20261102_print_local_agent_candidate.sql"),
}

/** Guarda validada no ensaio D02 (teste 3). Locks pais no início, `vendas` primeiro. NÃO alterar sem novo ensaio. */
export const CUT_GUARD = {
  "01": "SET LOCAL lock_timeout = '2s';\nLOCK TABLE public.vendas IN SHARE ROW EXCLUSIVE MODE;\nLOCK TABLE public.pdv_terminais, public.stores, public.admin_users IN SHARE ROW EXCLUSIVE MODE;\n",
  "02": "SET LOCAL lock_timeout = '2s';\nLOCK TABLE public.stores, public.admin_users IN SHARE ROW EXCLUSIVE MODE;\n",
}

export const NAMES = {
  idxVendas: "20261105120000_omni_print_d02_idx_vendas",
  idxTerminais: "20261105120100_omni_print_d02_idx_terminais",
  core: "20261105120200_omni_print_d02_core",
}
export const INDEXES = { idxVendas: "p004_vendas_id_store_uq", idxTerminais: "p004_term_id_store_uq" }

const lf = (file) => readFileSync(file, "utf8").replace(/\r\n/g, "\n")

/** Corpo de um arquivo candidato entre seu único BEGIN e COMMIT de topo (mesma regra do ensaio). */
export function body(file) {
  const sql = lf(file)
  const at = sql.indexOf("\nBEGIN;\n"), end = sql.lastIndexOf("\nCOMMIT;")
  if (at < 0 || sql.indexOf("\nBEGIN;\n", at + 1) >= 0 || end < at) throw new Error("expected exactly one top-level BEGIN/COMMIT in " + file)
  return { head: sql.slice(0, at + 1), inner: sql.slice(at + 8, end + 1), tail: sql.slice(end + 1) }
}

/** CUT_II do ensaio, byte a byte. */
export const cutII = () => "BEGIN;\n" + CUT_GUARD["01"] + body(SOURCES.F01).inner + body(SOURCES.F02).inner + "COMMIT;\n"

function indexStatement(name) {
  const lines = lf(SOURCES.F00).split("\n").filter(l => l.startsWith(`CREATE UNIQUE INDEX CONCURRENTLY "${name}" `))
  if (lines.length !== 1) throw new Error(`expected one CREATE INDEX for ${name} in 00`)
  return lines[0] + "\n"
}

const INDEX_HEADER = (table) => `-- OMNI-PRINT D02-A (i) — índice único pai em ${table}, usado pelas FKs compostas das tabelas print_*.
-- NÃO APLICAR sem aprovação do proprietário (janela, executor). Aplicação manual: tools/print-d02/d02.mjs apply-indexes,
-- que fixa lock_timeout = 5s e confere pg_index.indisvalid. Depois: prisma migrate resolve --applied (RUNBOOK_D02.md).
-- CONCURRENTLY não bloqueia INSERT/UPDATE/DELETE. ÚNICO comando do arquivo: o Prisma só o executa fora de transação assim.
-- Sem IF NOT EXISTS: índice homônimo pré-existente deve ser investigado. Se ficar INVÁLIDO: DROP INDEX CONCURRENTLY e repetir.
`
const CORE_HEADER = `-- OMNI-PRINT D02-A (ii) — 11 tabelas print_*, 7 funções p004_*, gatilhos e FKs, numa ÚNICA transação.
-- NÃO APLICAR sem aprovação do proprietário (janela, executor). Aplicação manual: tools/print-d02/d02.mjs apply-core.
-- Guarda logo após o BEGIN (CUT_GUARD "01", ensaio D02 teste 3): lock_timeout 2s e locks pais pegos no início, vendas
-- primeiro. Com venda aberta, desiste inteira em ~2 s sem deixar nada; heartbeat e login não esperam enquanto aguarda.
-- Exige os dois índices de (i) VÁLIDOS (verificação no início do corpo). Gerado por tools/print-d02/generate.mjs.
`

/** Conteúdo final das três pastas, por nome de migration. */
export function buildMigrations() {
  return {
    [NAMES.idxVendas]: INDEX_HEADER("vendas") + indexStatement(INDEXES.idxVendas),
    [NAMES.idxTerminais]: INDEX_HEADER("pdv_terminais") + indexStatement(INDEXES.idxTerminais),
    [NAMES.core]: CORE_HEADER + cutII(),
  }
}

/** Staged folder (fora de prisma/migrations: nenhum build ou merge aplica). */
export const STAGED = path.join(ROOT, "tools/print-d02/migrations")
