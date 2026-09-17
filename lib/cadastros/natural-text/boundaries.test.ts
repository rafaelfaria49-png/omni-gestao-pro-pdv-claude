import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * CAD-R2-016 — boundaries estáticos do parser de texto livre.
 *
 * Prova por inspeção de fonte (mesmo padrão de
 * `app/actions/cadastros.product-interactive.test.ts`):
 * 16. nenhuma chamada Prisma/Produto no parser;
 * 17. nenhuma mutação StockLedger no parser;
 * 14/15. nenhum write direto de Produto (só upsertProduto/ProductWriteService
 *         salvam — fora deste módulo).
 */

const DIR = resolve(__dirname)
const ARQUIVOS = [
  "types.ts",
  "extracao-deterministica.ts",
  "interpretar.ts",
  "aplicar.ts",
  "index.ts",
  resolve(__dirname, "..", "..", "..", "app", "actions", "produto-texto-livre.ts"),
]

function ler(relOuAbs: string): string {
  const abs = relOuAbs.startsWith("/") || /^[A-Za-z]:/.test(relOuAbs) ? relOuAbs : resolve(DIR, relOuAbs)
  return readFileSync(abs, "utf8")
}

/** Remove comentários (bloco/linha) para casar só código real, não documentação. */
function semComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1")
}

describe("boundaries estaticos: parser nunca escreve", () => {
  it("16. nenhum import/uso de Prisma ou model Produto", () => {
    for (const arq of ARQUIVOS) {
      const src = semComentarios(ler(arq))
      expect(src, arq).not.toMatch(/@\/lib\/prisma|@\/generated\/prisma|prisma\s*\.\s*produto/i)
      expect(src, arq).not.toMatch(/from\s+["']@\/lib\/prisma["']/)
    }
  })

  it("17. nenhuma mutacao StockLedger/estoque", () => {
    for (const arq of ARQUIVOS) {
      const src = semComentarios(ler(arq))
      expect(src, arq).not.toMatch(/stock-ledger|applyStockMutation|MovimentacaoEstoque|produtoDeposito/i)
    }
  })

  it("14/15. nenhum write direto: sem ProductWriteService/upsertProduto aqui", () => {
    for (const arq of ARQUIVOS) {
      const src = semComentarios(ler(arq))
      expect(src, arq).not.toMatch(/product-write-service|createProduct|updateProduct|upsertProduto/i)
    }
  })

  it("nenhum segredo lido fora do servidor: sem NEXT_PUBLIC, sem log de corpo", () => {
    for (const arq of ARQUIVOS) {
      const src = ler(arq)
      expect(src, arq).not.toMatch(/NEXT_PUBLIC/)
    }
    const interp = ler("interpretar.ts")
    // Erros sanitizados: corpo/URL jamais em console ou throw.
    expect(interp).not.toMatch(/console\.(log|error)\([^)]*(raw|body|url|key)/i)
  })
})

