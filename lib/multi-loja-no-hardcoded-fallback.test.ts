/**
 * Teste estático ("lint test") — baseline anti-regressão multi-loja.
 *
 * Cobertura: F-02 da AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md
 *
 * Varre código de produção (`app/`, `lib/`, exceto mirror legado e este próprio
 * arquivo) procurando por hardcode do fallback `"loja-1"` nos padrões
 * `|| "loja-1"` e `?? "loja-1"` (em UMA linha). Documenta as ocorrências CONHECIDAS e detecta regressão futura.
 *
 * Estratégia em duas camadas:
 *
 * 1. **snapshot baseline**: a contagem atual está em ≥30. Este teste passa hoje
 *    porque registra a quantidade exata e pede que ela DIMINUA com o tempo.
 *    Quando o fix em SPRINT_01_MULTI_LOJA reduzir esse número, o teste pega
 *    a redução; se subir, falha.
 *
 * 2. **expected-failing alvo final** (it.fails): após o piloto, zero ocorrências.
 *    Quando o piloto fechar, troque `it.fails` por `it`.
 */
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(__dirname, "..")

/** Diretórios de código de produção a varrer. */
const SCAN_ROOTS = ["app", "lib"]

/**
 * Pastas a excluir (mirror legado, snapshots, build artefatos, testes).
 * O mirror `components/pdv-github-original/**` está marcado para descomissionamento.
 */
const EXCLUDE_PATH_FRAGMENTS = [
  "node_modules",
  "components/pdv-github-original",
  ".next",
  "generated",
  // o próprio arquivo deste teste contém literal "loja-1" (sem espaço entre || e literal)
  // e seria self-contaminação; excluímos por nome.
  "multi-loja-no-hardcoded-fallback.test.ts",
  // F-02-anchor RESOLVIDO em SPRINT_MULTI_LOJA-S-002: exportar/route.ts deixou de usar
  // `|| "loja-1"` (agora 400 quando storeId ausente). Removido da exclusão — passa a ser coberto.
  // F-13 da auditoria — UI legada /dashboard/os, fora do escopo F-02 (apenas rotas API).
  "app/dashboard/os/",
]

function shouldVisit(absPath: string): boolean {
  const rel = relative(REPO_ROOT, absPath).replace(/\\/g, "/")
  for (const frag of EXCLUDE_PATH_FRAGMENTS) {
    if (rel.includes(frag)) return false
  }
  return true
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

/**
 * Padrão alvo: `|| "loja-1"` / `?? "loja-1"` (e `'...'` / template, com ou sem espaço).
 * DT-14: a forma nullish `??` foi adicionada (a regex antiga só pegava `||`).
 * Nota: este scan é linha-a-linha, então só pega a forma em UMA linha. A forma
 * multi-linha (`??` no fim de uma linha + `"loja-1"` na seguinte) usada em
 * `carteiras/*` e `dre/*` é coberta pelo bloco DT-14 em
 * `multi-loja-route-acl-baseline.test.ts` (substring no arquivo inteiro).
 */
const HARDCODED_FALLBACK_RE = /(?:\|\||\?\?)\s*["'`]loja-1["'`]/g

type Occurrence = { file: string; line: number; snippet: string }

function findOccurrences(): Occurrence[] {
  const out: Occurrence[] = []
  for (const root of SCAN_ROOTS) {
    const absRoot = join(REPO_ROOT, root)
    let files: string[] = []
    try {
      files = walk(absRoot)
    } catch {
      continue
    }
    for (const f of files) {
      let content: string
      try {
        content = readFileSync(f, "utf8")
      } catch {
        continue
      }
      const lines = content.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!
        if (HARDCODED_FALLBACK_RE.test(line)) {
          out.push({
            file: relative(REPO_ROOT, f).replace(/\\/g, "/"),
            line: i + 1,
            snippet: line.trim().slice(0, 140),
          })
        }
        HARDCODED_FALLBACK_RE.lastIndex = 0
      }
    }
  }
  return out
}

describe("multi-loja: hardcode `|| \"loja-1\"` / `?? \"loja-1\"` em código de produção (F-02)", () => {
  it("[snapshot baseline] contagem documentada de ocorrências (deve só diminuir)", () => {
    const occs = findOccurrences()
    // Registro para troubleshooting humano se o teste falhar:
    if (process.env.VITEST_VERBOSE_LOJA1) {
      // eslint-disable-next-line no-console
      console.log("[F-02 baseline] ocorrências:", occs)
    }
    // Pós SPRINT_MULTI_LOJA-S-001: todas as ocorrências corrigidas (exceção exportar excluída acima).
    // Resultado esperado: 0.
    expect(occs.length).toBe(0)
  })

  it("[pós-fix] sem ocorrências em rotas API conhecidas (baseline anti-regressão)", () => {
    const occs = findOccurrences()
    // Pós SPRINT_MULTI_LOJA-S-001: deve ser zero (exceção exportar já excluída no scan).
    expect(occs).toHaveLength(0)
  })

  // SPRINT_MULTI_LOJA-S-001 executada: it.fails → it normal.
  it("[F-02] ZERO ocorrências de fallback hardcoded (SPRINT_MULTI_LOJA-S-001 concluída)", () => {
    const occs = findOccurrences()
    expect(occs).toEqual([])
  })
})
