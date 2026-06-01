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
 * DT-15 ESTENDE a cobertura a marketing/config/onboarding/cadastros (6 arquivos).
 * FORA de ambos (decisão separada): `lib/loja-ativa.tsx` (F-11, o provider que
 * SEMEIA lojaAtivaId — fonte), `lib/stores-api-access.ts` (F-15, server),
 * `lib/ops-loja-id.ts` (P3) e `store-defaults.ts` (definição canônica).
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

/** Telas fora de PDV/vendas no escopo do DT-15 (marketing/config/onboarding/cadastros). */
const DT15_FILES = [
  "app/dashboard/marketing/page.tsx",
  "components/dashboard/configuracoes/configuracoes-sistema.tsx",
  "components/dashboard/configuracoes/centro-personalizacao-financeira-rafacell.tsx",
  "components/dashboard/configuracoes/backup-importador/importador-dados-externos.tsx",
  "components/onboarding/first-access-wizard.tsx",
  "components/cadastros/lovable/components/cadastros/CadastrosHub.tsx",
]

describe("DT-15 — marketing/config/onboarding/cadastros sem fallback LEGACY_PRIMARY_STORE_ID", () => {
  for (const f of DT15_FILES) {
    it(`[${f}] não importa nem usa LEGACY_PRIMARY_STORE_ID`, () => {
      const src = read(f)
      expect(src).not.toContain("LEGACY_PRIMARY_STORE_ID")
    })
  }
})
