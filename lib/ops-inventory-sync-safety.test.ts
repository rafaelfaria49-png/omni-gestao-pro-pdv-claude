/**
 * Teste estático ("lint test") — OPS-INVENTORY-SYNC-SAFETY-001.
 *
 * Ambiente node, só LÊ o source (não monta componentes). Garante que nenhum fluxo
 * client sobrescreve o estoque real enviando o INVENTÁRIO INTEIRO via
 * `PUT /api/ops/inventory`, e que o servidor permanece a fonte da verdade:
 *
 *  1. `operations-store` NÃO escreve inventário (sem `fetch("/api/ops/inventory", {...PUT})`),
 *     mas ainda LÊ (`GET /api/ops/inventory?lojaId=...`) e carrega o marcador
 *     `LEGACY_INVENTORY_SYNC_DISABLED`.
 *  2. NENHUM arquivo de `components/` + `lib/` + `app/` faz a escrita ampla de inventário
 *     (forma de fetch de 1º argumento `"/api/ops/inventory",` — usada só pelos PUTs;
 *     o GET usa querystring e o lookup/import usam subpath).
 *  3. O endpoint `PUT /api/ops/inventory` está QUARENTENADO (410 +
 *     `INVENTORY_BULK_SYNC_DISABLED`, sem `produto.upsert`); o GET continua ativo e
 *     exige `storeId` (sem fallback `loja-1`).
 *  4. O Inventário Assistido lê pelo lookup e NÃO escreve via inventário amplo.
 *
 * Pega regressão futura: se alguém reintroduzir o sync amplo do client, falha.
 */
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(__dirname, "..")

const OPS_STORE = "lib/operations-store.tsx"
const INVENTORY_ROUTE = "app/api/ops/inventory/route.ts"
const INVENTARIO_ASSISTIDO = "components/dashboard/estoque/inventario-assistido.tsx"

const SCAN_ROOTS = ["app", "components", "lib"]
const EXCLUDE_PATH_FRAGMENTS = [
  "node_modules",
  "components/pdv-github-original",
  ".next",
  "generated",
]

/**
 * Forma de fetch que escrevia o inventário inteiro: `"/api/ops/inventory",` (string
 * fechada logo após `inventory`, seguida de vírgula → 1º argumento do fetch).
 * O GET usa `"/api/ops/inventory?lojaId=..."` (querystring) e o lookup/import usam
 * `"/api/ops/inventory/lookup"` / `"/import"` — nenhum casa com esta regex.
 */
const INVENTORY_BULK_WRITE_RE = /["'`]\/api\/ops\/inventory["'`]\s*,/

/** Remove comentários de bloco e de linha (preserva `://` de URLs). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
}

function read(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), "utf8")
}

function shouldVisit(absPath: string): boolean {
  const rel = relative(REPO_ROOT, absPath).replace(/\\/g, "/")
  return !EXCLUDE_PATH_FRAGMENTS.some((frag) => rel.includes(frag))
}

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const name of entries) {
    const full = join(dir, name)
    if (!shouldVisit(full)) continue
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (s.isDirectory()) {
      walk(full, acc)
    } else if (
      s.isFile() &&
      (full.endsWith(".ts") || full.endsWith(".tsx")) &&
      !full.endsWith(".test.ts") &&
      !full.endsWith(".spec.ts")
    ) {
      acc.push(full)
    }
  }
  return acc
}

function filesWithBulkInventoryWrite(): string[] {
  const hits: string[] = []
  for (const root of SCAN_ROOTS) {
    for (const f of walk(join(REPO_ROOT, root))) {
      let content: string
      try {
        content = readFileSync(f, "utf8")
      } catch {
        continue
      }
      if (INVENTORY_BULK_WRITE_RE.test(stripComments(content))) {
        hits.push(relative(REPO_ROOT, f).replace(/\\/g, "/"))
      }
    }
  }
  return hits
}

describe("OPS-INVENTORY-SYNC-SAFETY-001 — sem sobrescrita ampla de estoque pelo client", () => {
  it("operations-store NÃO escreve inventário, mas ainda LÊ via GET", () => {
    const code = stripComments(read(OPS_STORE))
    expect(code).not.toMatch(INVENTORY_BULK_WRITE_RE)
    expect(code).toContain("/api/ops/inventory?lojaId=")
  })

  it("operations-store carrega o marcador LEGACY_INVENTORY_SYNC_DISABLED", () => {
    expect(read(OPS_STORE)).toContain("LEGACY_INVENTORY_SYNC_DISABLED")
  })

  it("nenhum arquivo de app/components/lib faz a escrita ampla de inventário", () => {
    expect(filesWithBulkInventoryWrite()).toEqual([])
  })

  it("PUT /api/ops/inventory está quarentenado (410 + code, sem produto.upsert)", () => {
    const route = read(INVENTORY_ROUTE)
    const stripped = stripComments(route)
    expect(route).toContain("INVENTORY_BULK_SYNC_DISABLED")
    expect(stripped).toMatch(/status:\s*410/)
    // A escrita ampla (upsert por item) foi removida do handler.
    expect(stripped).not.toContain("produto.upsert")
  })

  it("GET /api/ops/inventory continua ativo e exige storeId (sem fallback loja-1)", () => {
    const route = read(INVENTORY_ROUTE)
    expect(route).toContain("export async function GET")
    expect(route).toContain("storeId obrigatório")
    expect(route).not.toContain("loja-1")
  })

  it("Inventário Assistido lê pelo lookup e não escreve via inventário amplo", () => {
    const code = stripComments(read(INVENTARIO_ASSISTIDO))
    expect(code).not.toMatch(INVENTORY_BULK_WRITE_RE)
    expect(code).toContain("/api/ops/inventory/lookup")
  })
})
