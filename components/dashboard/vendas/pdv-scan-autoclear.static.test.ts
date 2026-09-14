/**
 * PDV-SCAN-SEARCH-AUTOCLEAR-FOCUS-005 — contrato estrutural por superfície (prova por leitura).
 *
 * BIPE → RESPOSTA → LIMPEZA → FOCO. Antes, um código inexistente confirmado por Enter ficava preso
 * no campo (com "Nenhum produto encontrado…" persistente) e sobrevivia ao Item Avulso (INSERT).
 *
 * Trava, em Clássico / Assistência / Supermercado / Venda Completa:
 * 1. aviso de não encontrado vem do hook compartilhado (curto, um único aviso vivo);
 * 2. código é consumido ANTES do `await` remoto (2º Enter não duplica); pesquisa manual não é apagada;
 * 3. Item Avulso fechado (confirmar/cancelar) limpa o campo e devolve o foco via `onCloseAutoFocus`;
 * 4. Esc no modo rápido limpa o texto ANTES de remover item do carrinho (onde existe modo rápido);
 * 5. marcadores congelados da suíte de paridade N5 (Insert/Esc) continuam intactos.
 *
 * PDV Next/Black fica fora de propósito: bipe inexistente seleciona o texto para o próximo scan
 * sobrescrever e não tem Item Avulso. A prova interativa (Playwright no componente real) fica na
 * revisão visual do GOAL.
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const dir = dirname(fileURLToPath(import.meta.url))
const read = (file: string) => readFileSync(resolve(dir, file), "utf8")

const SURFACES = [
  {
    id: "classic",
    file: "pdv-classic.tsx",
    clear: 'setBipeCode("")',
    focusRef: "shellBipeRef",
    lookup: "await lookupPdvScanRemote({ code: query",
    rapidoEscStart: 'if (e.key === "Escape" && shellBipeRef.current?.value.trim())',
    rapidoItemRemoval: 'e.key === "Escape" && cart.length > 0',
    n5Markers: ['e.key === "Insert"', 'e.key === "Escape" && cart.length > 0'],
  },
  {
    id: "assistencia",
    file: "pdv-assistencia-enterprise.tsx",
    clear: 'setSearch("")',
    focusRef: "inputRef",
    lookup: "await lookupPdvScanRemote({ code, storeId",
    rapidoEscStart: "if (inputRef.current?.value.trim())",
    rapidoItemRemoval: "if (cart.length === 0) return",
    n5Markers: ['e.key === "Insert"', 'if (e.key !== "Escape") return'],
  },
  {
    id: "supermercado",
    file: "pdv-supermercado.tsx",
    clear: 'setSearchTerm("")',
    focusRef: "productInputRef",
    lookup: "await lookupPdvScanRemote({ code: lookupTerm",
    rapidoEscStart: "if (productInputRef.current?.value.trim())",
    rapidoItemRemoval: "if (cart.length === 0) return",
    n5Markers: ['e.key === "Insert"', 'if (e.key !== "Escape") return'],
  },
  {
    id: "venda-completa",
    file: "venda-completa-enterprise.tsx",
    clear: 'setProductQuery("")',
    focusRef: "productInputRef",
    lookup: "await lookupPdvScanRemote({ code: parsed.query, storeId",
    rapidoEscStart: null,
    rapidoItemRemoval: null,
    n5Markers: ['case "Insert":', 'case "Escape":'],
  },
] as const

describe.each(SURFACES)("$id — bipe → resposta → limpeza → foco", (s) => {
  const src = read(s.file)

  it("aviso de não encontrado vem do hook compartilhado (sem toast inline)", () => {
    expect(src).toContain('import { usePdvScanNotFoundFeedback } from "./use-pdv-scan-feedback"')
    expect(src).toContain('import { isPdvScanLikeQuery } from "@/lib/pdv-scan-input"')
    expect(src).toContain("scanFeedback.notify(")
    expect(src).not.toContain('title: "Produto não encontrado"')
  })

  it("código é consumido antes do await remoto (2º Enter encontra o campo vazio)", () => {
    const at = src.indexOf(s.lookup)
    expect(at, "chamada remota").toBeGreaterThan(0)
    const antes = src.slice(src.lastIndexOf("isPdvScanLikeQuery(", at), at)
    expect(antes).toContain("scanLike")
    expect(antes).toContain(s.clear)
  })

  it("miss remoto não apaga pesquisa manual incondicionalmente", () => {
    const notify = src.indexOf("scanFeedback.notify(")
    const trecho = src.slice(src.lastIndexOf("}", notify), notify)
    expect(trecho).not.toContain(s.clear)
  })

  it("Item Avulso fechado limpa o campo e devolve o foco ao campo de bipe", () => {
    const at = src.indexOf("<ItemAvulsoModal")
    const bloco = src.slice(at, at + 900)
    expect(bloco).toContain("onCloseAutoFocus={(e) => {")
    expect(bloco).toContain(`${s.focusRef}.current?.focus()`)
    expect(bloco).toContain("if (!open) {")
    expect(bloco).toContain(s.clear)
    expect(bloco).toContain("scanFeedback.dismiss()")
  })

  it.runIf(s.rapidoEscStart !== null)("Esc no modo rápido limpa o texto antes de remover item do carrinho", () => {
    const esc = src.indexOf(s.rapidoEscStart!)
    expect(esc, "ramo de texto do Esc").toBeGreaterThan(0)
    const remocao = src.indexOf(s.rapidoItemRemoval!, esc)
    expect(remocao).toBeGreaterThan(esc)
    expect(remocao - esc, "ramo de texto vem imediatamente antes da remoção").toBeLessThan(700)
  })

  it("marcadores congelados da paridade N5 (Insert/Esc) continuam presentes", () => {
    for (const m of s.n5Markers) expect(src, m).toContain(m)
  })

  it("erro de finalização segue visível como toast destructive (paridade N5 F-06)", () => {
    expect(src).toContain('variant: "destructive"')
  })
})

describe("peças compartilhadas", () => {
  it("ItemAvulsoModal repassa onCloseAutoFocus ao DialogContent", () => {
    expect(read("item-avulso-modal.tsx")).toContain("onCloseAutoFocus={onCloseAutoFocus}")
  })

  it("hook do aviso usa a duração curta compartilhada e some ao desmontar", () => {
    const hook = read("use-pdv-scan-feedback.ts")
    expect(hook).toContain("duration: PDV_SCAN_NOT_FOUND_FEEDBACK_MS")
    expect(hook).toContain("useEffect(() => () => feedback.dismiss(), [feedback])")
  })
})
