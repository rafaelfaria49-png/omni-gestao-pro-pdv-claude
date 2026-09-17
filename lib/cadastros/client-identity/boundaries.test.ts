/**
 * CAD-R2-018-A — boundaries estáticos da camada de identidade.
 */
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const DIR = resolve(__dirname)

function filesOfLayer(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => resolve(DIR, f))
}

function ler(abs: string): string {
  return readFileSync(abs, "utf8")
}

function semComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1")
}

describe("boundaries: identidade não persiste nem faz merge", () => {
  it("27. nenhuma escrita de Cliente no identity layer", () => {
    for (const arq of filesOfLayer()) {
      const src = semComentarios(ler(arq))
      expect(src, arq).not.toMatch(/prisma\s*\.\s*cliente\s*\.\s*(create|update|updateMany|upsert|delete|deleteMany)/)
      if (!arq.endsWith("writers-inventory.ts")) {
        expect(src, arq).not.toMatch(/\b(createCliente|updateCliente|criarCliente)\s*\(/)
      }
    }
  })

  it("28. nenhuma escrita de estoque", () => {
    for (const arq of filesOfLayer()) {
      const src = semComentarios(ler(arq))
      expect(src, arq).not.toMatch(/stock-ledger|applyStockMutation|MovimentacaoEstoque|produtoDeposito/i)
    }
  })

  it("26. nenhum auto-merge / survivor / delete de duplicata", () => {
    for (const arq of filesOfLayer()) {
      const src = semComentarios(ler(arq))
      expect(src, arq).not.toMatch(/autoMerge\s*:\s*true|AUTO_MERGE\s*=\s*true/)
      expect(src, arq).not.toMatch(/survivor|loser|mergeClientes|consolidarCliente/)
    }
  })

  it("25. nenhuma IA participa da decisão", () => {
    for (const arq of filesOfLayer()) {
      const src = semComentarios(ler(arq))
      expect(src, arq).not.toMatch(/openai|openrouter|anthropic|generateObject|llm/i)
    }
  })

  it("29. nenhum log de PII bruta", () => {
    for (const arq of filesOfLayer()) {
      const src = semComentarios(ler(arq))
      expect(src, arq).not.toMatch(/console\.(log|info|warn|error|debug)\(/)
    }
  })

  it("browser/localStorage não é fonte de verdade", () => {
    for (const arq of filesOfLayer()) {
      const src = semComentarios(ler(arq))
      expect(src, arq).not.toMatch(/localStorage|sessionStorage|window\./)
    }
  })

  it("schema/migration não são tocados por esta camada", () => {
    for (const arq of filesOfLayer()) {
      const src = semComentarios(ler(arq))
      expect(src, arq).not.toMatch(/schema\.prisma|prisma\s+migrate/)
    }
  })

  it("30. helpers existentes são reutilizados", () => {
    const document = ler(resolve(DIR, "document.ts"))
    expect(document).toMatch(/from\s+["']@\/lib\/import-normalize["']/)
    expect(document).toMatch(/digitsOnly/)
    expect(document).toMatch(/from\s+["']@\/lib\/fiscal\/fiscal-validators["']/)
    expect(document).toMatch(/isValidCnpj/)
    const phone = ler(resolve(DIR, "phone.ts"))
    expect(phone).toMatch(/from\s+["']@\/lib\/phone-br["']/)
    expect(phone).toMatch(/phoneDigitsAll/)
    const name = ler(resolve(DIR, "name.ts"))
    expect(name).toMatch(/from\s+["']@\/lib\/import-normalize["']/)
    expect(name).toMatch(/normalizeNameForMatch/)
  })

  it("ClientWriteService implementado; merge não", () => {
    const types = ler(resolve(DIR, "types.ts"))
    expect(types).toMatch(/CLIENT_WRITE_SERVICE_IMPLEMENTED\s*=\s*true/)
    expect(types).toMatch(/CLIENT_MERGE_IMPLEMENTED\s*=\s*false/)
    const index = semComentarios(ler(resolve(DIR, "index.ts")))
    expect(index).not.toMatch(/createClient\s*\(|updateClient\s*\(/)
  })

  it("adapter Prisma é read-only e server-only", () => {
    const src = ler(resolve(DIR, "lookup-prisma.ts"))
    expect(src).toMatch(/import\s+["']server-only["']/)
    const code = semComentarios(src)
    expect(code).toMatch(/findMany/)
    expect(code).not.toMatch(/\.create\(|\.update\(|\.upsert\(|\.delete\(/)
    expect(code).toMatch(/where:\s*\{\s*storeId:\s*sid/)
  })
})
