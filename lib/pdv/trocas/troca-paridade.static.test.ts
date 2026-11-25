/**
 * Paridade dos pontos de entrada de troca/devolução (OMNI-PDV-TROCAS-…-P1-002): todos montam o
 * MESMO fluxo compartilhado (`TrocasDevolucao` → `POST /api/ops/trocas`) e nenhum registra
 * devolução por conta própria (nem o `registrarDevolucao` local-first, nem a rota legada).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const ENTRADAS = [
  "components/dashboard/vendas/pdv-classic.tsx",
  "components/dashboard/vendas/pdv-assistencia-enterprise.tsx",
  "components/dashboard/vendas/pdv-supermercado.tsx",
  "components/pdv-next/PdvBlackEdition.tsx",
  "components/dashboard/vendas/vendas-arquivo-geral.tsx",
]

describe("paridade das entradas de troca/devolução", () => {
  for (const file of ENTRADAS) {
    it(`${file} usa o fluxo compartilhado e nada local`, () => {
      const src = ler(file)
      expect(src).toMatch(/import \{ TrocasDevolucao \} from "(\.\/trocas-devolucao|@\/components\/dashboard\/vendas\/trocas-devolucao)"/)
      expect(src).toContain("<TrocasDevolucao")
      expect(src).not.toMatch(/registrarDevolucao\(/)
      expect(src).not.toContain("/api/ops/devolucao\"")
    })
  }

  it("o fluxo compartilhado só grava pelo servidor autoritativo", () => {
    const ui = ler("components/dashboard/vendas/trocas-devolucao.tsx")
    const cliente = ler("lib/pdv/trocas/troca-client.ts")
    expect(ui).toContain("enviarTroca(")
    expect(cliente).toContain('fetch("/api/ops/trocas"')
    expect(ui).not.toContain("finalizeSaleTransaction")
  })

  it("CTRL do PDV Clássico guarda o 'pressionado' num ref (re-render entre keydown/keyup não perde o atalho)", () => {
    const classic = ler("components/dashboard/vendas/pdv-classic.tsx")
    expect(classic).not.toMatch(/let ctrlDown = false/)
    expect(classic).toContain("const ctrlDownRef = useRef(false)")
  })

  it("a fila antiga não é mais reenviada automaticamente (só ação manual por devolução)", () => {
    const store = ler("lib/operations-store.tsx")
    expect(store).not.toContain("flushPendingDevolucoes")
    expect(store).toContain("const reenviarDevolucaoLocal = useCallback")
  })
})
