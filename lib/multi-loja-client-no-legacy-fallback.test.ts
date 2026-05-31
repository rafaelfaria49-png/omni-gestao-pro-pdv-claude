/**
 * Teste estático ("lint test") — anti-regressão multi-loja CLIENT-SIDE (DT-13).
 *
 * Cobre o resíduo client-side de `LEGACY_PRIMARY_STORE_ID` nas telas de PDV/vendas
 * (escopo enxuto do DT-13). O lint server-side
 * (`multi-loja-no-hardcoded-fallback.test.ts`) NÃO cobre estes arquivos: ele varre
 * só `app/` + `lib/` e casa o literal `"loja-1"`, não a constante
 * `LEGACY_PRIMARY_STORE_ID` em `components/`.
 *
 * Padrão-alvo (canônico, já em `pdv-classic`, `pdv-recebimento-modal` e no
 * `shortcutsKey` do pdv-assistência): `(lojaAtivaId ?? "").trim()` — sem fallback
 * silencioso para a loja principal. O servidor (pós S-001/DT-14) responde 400
 * quando o storeId está ausente.
 *
 * FORA do escopo DT-13 (mesma natureza, módulos diferentes → futuro DT-15):
 * marketing, configuracoes, onboarding, cadastros. E `lib/loja-ativa.tsx` (F-11,
 * o provider que SEMEIA lojaAtivaId — fonte, decisão separada).
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = resolve(__dirname, "..")

function read(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf8")
}

/** Telas PDV/vendas no escopo enxuto do DT-13. */
const DT13_FILES = [
  "components/dashboard/vendas/vendas-arquivo-geral.tsx",
  "components/dashboard/vendas/venda-completa-enterprise.tsx",
  "components/dashboard/vendas/pdv-venda-completa-enterprise.tsx",
  "components/dashboard/vendas/pdv-assistencia-enterprise.tsx",
]

describe("DT-13 — PDV/vendas sem fallback LEGACY_PRIMARY_STORE_ID (client-side)", () => {
  for (const f of DT13_FILES) {
    it(`[${f}] não importa nem usa LEGACY_PRIMARY_STORE_ID`, () => {
      const src = read(f)
      expect(src).not.toContain("LEGACY_PRIMARY_STORE_ID")
    })
  }

  it("usa o padrão canônico (lojaAtivaId ?? \"\").trim() em pelo menos uma tela", () => {
    // sanity: garante que o fix aplicou o padrão esperado (não removeu o storeId por completo)
    const anyHasCanonical = DT13_FILES.some((f) => read(f).includes('(lojaAtivaId ?? "").trim()'))
    expect(anyHasCanonical).toBe(true)
  })
})
