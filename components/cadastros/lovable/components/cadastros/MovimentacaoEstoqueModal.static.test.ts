import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const src = readFileSync(
  "components/cadastros/lovable/components/cadastros/MovimentacaoEstoqueModal.tsx",
  "utf8",
)

describe("MovimentacaoEstoqueModal — copy operacional de drift", () => {
  it("diagnostica, oferece Resolver saldo e não esconde o detalhe técnico", () => {
    expect(src).toContain("diagnosticarSaldoEstoque")
    expect(src).toContain("Resolver saldo")
    expect(src).toContain("Confirme primeiro o saldo físico na aba Ajuste")
    expect(src).toContain("Esta divergência pode ser corrigida automaticamente junto com a operação")
    expect(src).toContain("Saldo do cadastro")
    expect(src).toContain("Saldo nos depósitos")
    expect(src).toContain("Detalhes")
    expect(src).toContain("estoque-reconcile")
  })
})
