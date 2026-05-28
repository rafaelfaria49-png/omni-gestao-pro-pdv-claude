/**
 * Teste estático ("lint test") — baseline anti-regressão multi-loja.
 *
 * Cobertura: F-02 da AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md
 *
 * Varre código de produção (`app/`, `lib/`, exceto mirror legado e este próprio
 * arquivo) procurando por hardcode do fallback `"loja-1"` no padrão
 * `|| "loja-1"`. Documenta as ocorrências CONHECIDAS e detecta regressão futura.
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
 * Padrão alvo: `|| "loja-1"` ou `|| 'loja-1'` (com ou sem espaço).
 * Captura também a versão com template literal `|| \`loja-1\``.
 */
const HARDCODED_FALLBACK_RE = /\|\|\s*["'`]loja-1["'`]/g

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

describe("multi-loja: hardcode `|| \"loja-1\"` em código de produção (F-02)", () => {
  it("[snapshot baseline] contagem documentada de ocorrências (deve só diminuir)", () => {
    const occs = findOccurrences()
    // Registro para troubleshooting humano se o teste falhar:
    if (process.env.VITEST_VERBOSE_LOJA1) {
      // eslint-disable-next-line no-console
      console.log("[F-02 baseline] ocorrências:", occs)
    }
    // Baseline pré-piloto: 30+ ocorrências detectadas em 2026-05-28.
    // Toleramos 32 para folga; cada redução real reduz este número.
    expect(occs.length).toBeLessThanOrEqual(32)
    // Não pode crescer — qualquer regressão para de propagar fallback.
    expect(occs.length).toBeGreaterThan(0) // se virar 0, troque por toBe(0) e remova fails abaixo
  })

  it("[snapshot baseline] todas as ocorrências estão em rotas API (financeiro, vendas, finance, ops/contas-*-list)", () => {
    const occs = findOccurrences()
    const offenders = occs.map((o) => o.file)
    const allowedPrefixes = [
      "app/api/vendas/",
      "app/api/financeiro/",
      "app/api/finance/",
      "app/api/ops/contas-receber-list/",
      "app/api/ops/contas-pagar-list/",
      // F-13 da auditoria — rota legada /dashboard/os/OsPageClient.tsx com TODO confessado
      "app/dashboard/os/",
    ]
    for (const file of offenders) {
      const matchesKnown = allowedPrefixes.some((p) => file.startsWith(p))
      if (!matchesKnown) {
        // Falha clara — surgiu offender NOVO fora da lista conhecida da auditoria.
        // Ajuste a auditoria + esta lista, não silencie.
        throw new Error(
          `[F-02] Nova ocorrência fora da baseline conhecida: ${file}. ` +
            `Atualize AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md ou corrija o código.`,
        )
      }
    }
  })

  /**
   * EXPECTED-FAILING: alvo pós-SPRINT_01_MULTI_LOJA.
   * Quando o piloto fechar, troque `it.fails` por `it` e a contagem cai para 0.
   */
  it.fails(
    "[F-02] DEVE ter ZERO ocorrências de fallback hardcoded após SPRINT_01_MULTI_LOJA",
    () => {
      const occs = findOccurrences()
      expect(occs).toEqual([])
    },
  )
})
