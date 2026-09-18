/**
 * PDV-SCAN-SEARCH-AUTOCLEAR-FOCUS-005 + PDV-SCAN-INLINE-FEEDBACK-AUTOFOCUS-006 —
 * contrato estrutural por superfície (prova por leitura).
 *
 * BIPE → RESPOSTA → LIMPEZA → FOCO. Antes, um código inexistente confirmado por Enter ficava preso
 * no campo (com "Nenhum produto encontrado…" persistente) e sobrevivia ao Item Avulso (INSERT).
 *
 * Trava, em Clássico / Assistência / Supermercado / Venda Completa:
 * 1. aviso de não encontrado vem do hook compartilhado (curto, um único aviso vivo) e aparece
 *    INLINE no próprio campo Código/Bipe (GOAL 006) — o toast foi removido;
 * 2. código é consumido ANTES do `await` remoto (2º Enter não duplica); pesquisa manual não é apagada;
 * 3. Item Avulso fechado (confirmar/cancelar) limpa o campo e devolve o foco via `onCloseAutoFocus`;
 * 4. Esc no modo rápido limpa o texto ANTES de remover item do carrinho (onde existe modo rápido);
 * 5. marcadores congelados da suíte de paridade N5 (Insert/Esc) continuam intactos;
 * 6. autofocus operacional (GOAL 006) passa pelo guard `canAutoFocusPdvBipe` — nunca rouba foco
 *    de outro campo nem de modal.
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
    /** GOAL 006: o estado inline mora no shell; a superfície repassa. */
    inlineWiring: "bipeInlineFeedback={scanFeedback.inline}",
    inlineErrorState: "bipeInlineFeedback={scanFeedback.inline}",
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
    inlineWiring: "<PdvScanInlineNotFound",
    inlineErrorState: "aria-invalid={!!scanFeedback.inline.code",
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
    inlineWiring: "<PdvScanInlineNotFound",
    inlineErrorState: "aria-invalid={!!scanFeedback.inline.code",
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
    inlineWiring: "<PdvScanInlineNotFound",
    inlineErrorState: "aria-invalid={!!scanFeedback.inline.code",
  },
] as const

describe.each(SURFACES)("$id — bipe → resposta → limpeza → foco", (s) => {
  const src = read(s.file)

  it("aviso de não encontrado vem do hook compartilhado (sem toast inline)", () => {
    expect(src).toContain('import { usePdvScanNotFoundFeedback } from "./use-pdv-scan-feedback"')
    expect(src).toContain('import { canAutoFocusPdvBipe, isPdvScanLikeQuery } from "@/lib/pdv-scan-input"')
    expect(src).toContain("scanFeedback.notify(")
    expect(src).not.toContain('title: "Produto não encontrado"')
  })

  it("aviso inline (GOAL 006) aparece no próprio campo e some com nova digitação", () => {
    expect(src).toContain(s.inlineWiring)
    expect(src).toContain(s.inlineErrorState)
    // Digitação nova encerra o aviso anterior na hora — busca manual nunca convive com erro velho.
    expect(src).toContain("Digitação nova (scan ou busca manual) encerra na hora o aviso inline anterior")
  })

  it("autofocus operacional (GOAL 006) usa o guard — não rouba foco de campo/modal", () => {
    expect(src).toContain("canAutoFocusPdvBipe()")
    expect(src).toContain(`${s.focusRef}.current?.focus()`)
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
    // GOAL 007: fechar/cancelar limpa o contexto transitório do código bipado.
    expect(bloco).toContain("initialCodigo={avulsoSeedCodigo}")
    expect(bloco).toContain("missedScanCodeRef.current = null")
    expect(bloco).toContain("setAvulsoSeedCodigo(null)")
  })

  it("GOAL 007 — política por loja age só no miss confirmado: contexto + autoabertura com guarda", () => {
    // Decisão centralizada (server-first), nunca regra local por superfície.
    expect(src).toContain('from "@/lib/pdv-scan-unregistered-action"')
    expect(src).toContain("resolvePdvScanUnregisteredPolicy(")
    expect(src).toContain("scanFeedback.notify(")
    // A copy do hint vem do ESTADO do aviso (suggestsAvulso) e SÓ para miss scan-like,
    // nunca de decisão local.
    expect(src).toContain("suggestAvulso: scanLike && scanUnregisteredPolicy.showInsertHint")
    // O código do miss é preservado como contexto (modos B/C).
    expect(src).toContain("missedScanCodeRef.current = ")
    // Autoabertura (modo C) SEMPRE guardada: nunca por cima de modal crítico e
    // NUNCA para miss de busca textual (distinção scan × busca do GOAL 005).
    expect(src).toContain("scanLike && scanUnregisteredPolicy.autoOpenAvulso && !hasBlockingPdvDialog()")
    expect(src).toContain("openItemAvulso(")
    // Insert congelado (N5, marcador por superfície) e agora com contexto seguro — campo vazio decide.
    expect(src).toContain(s.n5Markers[0])
    expect(src).toContain("scanUnregisteredPolicy.offersAvulsoContext && campoVazio")
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

  it("hook do aviso é INLINE (GOAL 006): estado na lib, duração curta, some ao desmontar, sem toast", () => {
    const hook = read("use-pdv-scan-feedback.ts")
    expect(hook).toContain("createPdvScanInlineNotFoundFeedback")
    expect(hook).toContain("useEffect(() => () => feedback.dismiss(), [feedback])")
    expect(hook).toContain("inline")
    // Toast removido no GOAL 006 — o aviso inline é o feedback principal.
    expect(hook).not.toContain("use-toast")
    expect(hook).not.toContain("toast({")
  })

  it("fábrica do aviso inline usa a duração curta compartilhada", () => {
    const lib = read("../../../lib/pdv-scan-input.ts")
    expect(lib).toContain("durationMs: number = PDV_SCAN_NOT_FOUND_FEEDBACK_MS")
    expect(lib).toContain("export const PDV_SCAN_NOT_FOUND_FEEDBACK_MS = 1800")
  })

  it("overlay inline é acessível: role=status, aria-live, ícone + texto, código visível", () => {
    const overlay = read("pdv-scan-inline-feedback.tsx")
    expect(overlay).toContain('role="status"')
    expect(overlay).toContain('aria-live="polite"')
    expect(overlay).toContain("data-pdv-scan-inline")
    expect(overlay).toContain("Produto não cadastrado · ")
    expect(overlay).toContain("{feedback.code}")
    expect(overlay).toContain("pointer-events-none")
    // Ícone além da cor (acessibilidade): TriangleAlert do lucide.
    expect(overlay).toContain("TriangleAlert")
    // Tokens do tema — nada de paleta paralela hardcoded.
    expect(overlay).toContain("text-destructive")
    expect(overlay).toContain("bg-background")
  })

  it("shell clássico recebe o estado inline e marca erro no campo", () => {
    const shell = read("pdv-omni-classic-shell.tsx")
    expect(shell).toContain("bipeInlineFeedback?: PdvScanInlineFeedbackState")
    expect(shell).toContain("PdvScanInlineNotFound")
    expect(shell).toContain("error={!!props.bipeInlineFeedback?.code}")
    expect(shell).toContain("aria-invalid={error || undefined}")
  })

  it("GOAL 007 — ItemAvulsoModal semeia o código bipado como contexto (initialCodigo)", () => {
    const modal = read("item-avulso-modal.tsx")
    expect(modal).toContain("initialCodigo?: string | null")
    expect(modal).toContain("setCodigoInput(initialCodigo ? initialCodigo.trim() : \"\")")
    // Foco inicial continua na Descrição (digitação imediata, modo automático).
    expect(modal).toContain("descriptionRef.current?.focus()")
  })

  it("GOAL 007 — camada de decisão pura: default seguro e autoabertura nunca por cima de modal", () => {
    const lib = read("../../../lib/pdv-scan-unregistered-action.ts")
    expect(lib).toContain('DEFAULT_PDV_SCAN_UNREGISTERED_ACTION: PdvScanUnregisteredAction = "warn_offer_avulso"')
    expect(lib).toContain("hasBlockingPdvDialog")
    expect(lib).toContain('doc.querySelector(\'[role="dialog"], [role="alertdialog"]\')')
  })

  it("GOAL 007 — overlay lê o hint de Insert do estado do aviso (sem decisão local)", () => {
    const overlay = read("pdv-scan-inline-feedback.tsx")
    expect(overlay).toContain("feedback.suggestsAvulso")
    expect(overlay).toContain("Insert")
    expect(overlay).toContain("para Item Avulso")
  })
})
