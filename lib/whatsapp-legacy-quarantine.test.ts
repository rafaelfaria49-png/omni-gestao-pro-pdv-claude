/**
 * Teste estático ("lint test") — WHATSAPP-LEGACY-QUARANTINE-001.
 *
 * Garante, sem montar componentes (ambiente node, só lê o source), que:
 *
 *  1. O componente legado `components/dashboard/whatsapp-connection.tsx` está
 *     QUARENTENADO: não importa o `operations-store`, não chama
 *     `finalizeSaleTransaction`, não usa `openCaixaIfClosed` e carrega o marcador
 *     `LEGACY_QUARANTINED`. (mentions em comentário são ignoradas — o scan tira comentários.)
 *  2. Nenhum código de produção usa `openCaixaIfClosed: true` (nem WhatsApp, nem
 *     Omni Agent, nem automação, nem legado, nem fluxo invisível). O PDV oficial usa
 *     `false`; o único ponto com `true` era o legado, agora neutralizado.
 *  3. A página `/dashboard/whatsapp` continua montando o `WhatsAppOperationalHub`
 *     (atendimento assistido) e NÃO monta o legado.
 *
 * Pega regressão futura: se alguém reintroduzir venda automática/auto-abertura de
 * caixa fora do PDV, este teste falha.
 */
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(__dirname, "..")

const LEGACY_FILE = "components/dashboard/whatsapp-connection.tsx"
const WHATSAPP_PAGE = "app/dashboard/whatsapp/page.tsx"

/** Diretórios/arquivos onde `openCaixaIfClosed: true` é proibido por este GOAL. */
const SCAN_ROOTS = ["app", "components", "lib"]

const EXCLUDE_PATH_FRAGMENTS = [
  "node_modules",
  "components/pdv-github-original",
  ".next",
  "generated",
]

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

const OPEN_CAIXA_TRUE_RE = /openCaixaIfClosed\s*:\s*true/

function filesWithOpenCaixaTrue(): string[] {
  const hits: string[] = []
  for (const root of SCAN_ROOTS) {
    for (const f of walk(join(REPO_ROOT, root))) {
      let content: string
      try {
        content = readFileSync(f, "utf8")
      } catch {
        continue
      }
      if (OPEN_CAIXA_TRUE_RE.test(stripComments(content))) {
        hits.push(relative(REPO_ROOT, f).replace(/\\/g, "/"))
      }
    }
  }
  return hits
}

describe("WhatsApp legado quarentenado (WHATSAPP-LEGACY-QUARANTINE-001)", () => {
  it("o legado não importa operations-store nem chama finalizeSaleTransaction / openCaixaIfClosed", () => {
    const code = stripComments(read(LEGACY_FILE))
    expect(code).not.toContain("operations-store")
    expect(code).not.toContain("finalizeSaleTransaction")
    expect(code).not.toContain("openCaixaIfClosed")
  })

  it("o legado carrega o marcador LEGACY_QUARANTINED", () => {
    expect(read(LEGACY_FILE)).toContain("LEGACY_QUARANTINED")
  })

  it("nenhum código de produção usa `openCaixaIfClosed: true` (PDV usa false; sem WhatsApp/Omni/automação/legado)", () => {
    expect(filesWithOpenCaixaTrue()).toEqual([])
  })

  it("a página /dashboard/whatsapp monta o WhatsAppOperationalHub e NÃO o legado", () => {
    const page = read(WHATSAPP_PAGE)
    expect(page).toContain("WhatsAppOperationalHub")
    expect(page).not.toContain("whatsapp-connection")
    expect(page).not.toContain("WhatsAppConnection")
  })
})
