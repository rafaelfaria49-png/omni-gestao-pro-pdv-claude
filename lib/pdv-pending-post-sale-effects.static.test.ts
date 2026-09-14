/**
 * CORREÇÃO-01 — PENDING SEM EFEITOS DEFINITIVOS (prova estática por leitura).
 *
 * Para cada superfície de PDV, prova que o branch PENDING sai ANTES de
 * qualquer efeito definitivo e que o caminho CONFIRMED os preserva:
 *
 * 1. PENDING Classic não imprime (sem auto-print/postSalePrint);
 * 2. PENDING Supermercado não imprime;
 * 3. PENDING Assistência não imprime;
 * 4. PENDING Venda Completa não abre cupom;
 * 5. PENDING Troca não abre cupom nem conclui callback;
 * 6. PENDING não cria audit sale_finalized;
 * 7. PENDING não enfileira produto como venda concluída;
 * 8. CONFIRMED continua imprimindo/abrindo cupom normalmente.
 *
 * Estratégia: o guard `if (result.pending)` / `if (novaVenda.pending)` precisa
 * vir DEPOIS apenas do ok-check e ANTES dos efeitos. O teste fatia o fonte em
 * três regiões — gap (finalize → guard), bloco pending (brace-matched) e resto
 * (CONFIRMED) — e afirma presença/ausência dos marcadores em cada região.
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8")
}

/** Conta ocorrências literais (sem regex). */
function countOf(source: string, needle: string): number {
  return source.split(needle).length - 1
}

/** Extrai o bloco `{...}` balanceado a partir do índice da chave de abertura. */
function balancedBlock(source: string, openBraceIdx: number): string {
  let depth = 0
  for (let i = openBraceIdx; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === "{") depth += 1
    else if (ch === "}") {
      depth -= 1
      if (depth === 0) return source.slice(openBraceIdx, i + 1)
    }
  }
  throw new Error("bloco desbalanceado")
}

type Surface = {
  file: string
  guard: string
  /** Condição FAILED entre finalize e guard (ex.: "!result.ok", "!novaVenda.ok"). */
  failedCheck: string
  forbiddenInGapAndPending: string[]
  requiredInPending: string[]
  requiredInConfirmed: string[]
}

const CLASSIC = "components/dashboard/vendas/pdv-classic.tsx"
const SUPER = "components/dashboard/vendas/pdv-supermercado.tsx"
const ASSIST = "components/dashboard/vendas/pdv-assistencia-enterprise.tsx"
const COMPLETA = "components/dashboard/vendas/venda-completa-enterprise.tsx"
const TROCAS = "components/dashboard/vendas/trocas-devolucao.tsx"
const BLACK = "components/pdv-next/PdvBlackEdition.tsx"

const SURFACES: Surface[] = [
  {
    // 1. PENDING Classic não imprime.
    file: CLASSIC,
    guard: "if (result.pending) {",
    failedCheck: "!result.ok",
    forbiddenInGapAndPending: [
      "setAutoPrintInput",
      "setPostSalePrint",
      "sale_finalized",
      "enfileirarProdutosACadastrar",
      "setLastSaleTotal",
      "setCart([])",
    ],
    requiredInPending: ["PENDING_SALE_TITLE"],
    requiredInConfirmed: ["setAutoPrintInput", "sale_finalized", "setLastSaleTotal", "Venda finalizada"],
  },
  {
    // 2. PENDING Supermercado não imprime.
    file: SUPER,
    guard: "if (result.pending) {",
    failedCheck: "!result.ok",
    forbiddenInGapAndPending: [
      "setAutoPrintInput",
      "setPostSalePrint",
      "sale_finalized",
      "enfileirarProdutosACadastrar",
      "setCart([])",
    ],
    requiredInPending: ["PENDING_SALE_TITLE"],
    requiredInConfirmed: ["setAutoPrintInput", "sale_finalized", "Venda finalizada"],
  },
  {
    // 3. PENDING Assistência não imprime.
    file: ASSIST,
    guard: "if (result.pending) {",
    failedCheck: "!result.ok",
    forbiddenInGapAndPending: [
      "setAutoPrintInput",
      "setPostSalePrint",
      "enfileirarProdutosACadastrar",
      "localStorage.removeItem",
      "setCart([])",
    ],
    requiredInPending: ["PENDING_SALE_TITLE"],
    requiredInConfirmed: ["setAutoPrintInput", "Venda finalizada"],
  },
  {
    // 4. PENDING Venda Completa não abre cupom.
    file: COMPLETA,
    guard: "if (result.pending) {",
    failedCheck: "!result.ok",
    forbiddenInGapAndPending: [
      "setCupomOpen",
      "setCupomData",
      "sale_finalized",
      "enfileirarProdutosACadastrar",
      "localStorage.removeItem",
      "setCart([])",
    ],
    requiredInPending: ["PENDING_SALE_TITLE"],
    requiredInConfirmed: ["setCupomOpen(true)", "sale_finalized"],
  },
  {
    // 5. PENDING Troca não abre cupom nem conclui callback.
    file: TROCAS,
    guard: "if (novaVenda.pending) {",
    failedCheck: "!novaVenda.ok",
    forbiddenInGapAndPending: [
      "setCupomOpen",
      "setCupomData",
      "onRegistered",
      "setLastDevolucao",
      "setTrocaCart([])",
    ],
    requiredInPending: ["PENDING_SALE_TITLE"],
    requiredInConfirmed: ["setCupomOpen(true)", "onRegistered?.()", "setLastDevolucao(", "Troca finalizada"],
  },
]

describe("CORREÇÃO-01 — PENDING sai antes dos efeitos definitivos", () => {
  for (const surface of SURFACES) {
    it(`${surface.file}: guard único, gap limpo e bloco pending sem efeitos`, () => {
      const source = read(surface.file)
      const finalizeIdx = source.indexOf("await finalizeSaleTransaction(")
      expect(finalizeIdx, `${surface.file} usa finalizeSaleTransaction`).toBeGreaterThan(-1)
      // Guard único após o finalize (sem segundo branch pendente escondido).
      const guardIdx = source.indexOf(surface.guard, finalizeIdx)
      expect(guardIdx, `${surface.file} tem guard PENDING após o finalize`).toBeGreaterThan(finalizeIdx)
      expect(countOf(source, surface.guard), `${surface.file} guard único`).toBe(1)

      // Gap = só o ok-check (FAILED) entre finalize e guard.
      const gap = source.slice(finalizeIdx, guardIdx)
      expect(gap, `${surface.file} gap trata FAILED`).toContain(surface.failedCheck)
      for (const marker of surface.forbiddenInGapAndPending) {
        expect(gap, `${surface.file} gap sem ${marker}`).not.toContain(marker)
      }

      // Bloco pending = copy honesta, sem efeitos definitivos.
      const openBrace = source.indexOf("{", guardIdx)
      const pendingBlock = balancedBlock(source, openBrace)
      for (const marker of surface.forbiddenInGapAndPending) {
        expect(pendingBlock, `${surface.file} pending sem ${marker}`).not.toContain(marker)
      }
      for (const marker of surface.requiredInPending) {
        expect(pendingBlock, `${surface.file} pending informa ${marker}`).toContain(marker)
      }
      expect(pendingBlock, `${surface.file} pending retorna sem concluir`).toContain("return")

      // CONFIRMED preservado após o bloco pending.
      const confirmed = source.slice(guardIdx + pendingBlock.length + (openBrace - guardIdx))
      for (const marker of surface.requiredInConfirmed) {
        expect(confirmed, `${surface.file} CONFIRMED preserva ${marker}`).toContain(marker)
      }
    })
  }

  it("Black/Next continua correto: pending antes do cupom definitivo", () => {
    const source = read(BLACK)
    const finalizeIdx = source.indexOf("await finalizeSaleTransaction(")
    expect(finalizeIdx).toBeGreaterThan(-1)
    const guard = "if (result.pending) {"
    expect(countOf(source, guard)).toBe(1)
    const guardIdx = source.indexOf(guard, finalizeIdx)
    expect(guardIdx).toBeGreaterThan(finalizeIdx)
    const gap = source.slice(finalizeIdx, guardIdx)
    for (const marker of ["setCupomNum", "writeCupom", "setCartRows([])", "sale_finalized"]) {
      expect(gap, `Black gap sem ${marker}`).not.toContain(marker)
    }
    const pendingBlock = balancedBlock(source, source.indexOf("{", guardIdx))
    expect(pendingBlock).toContain("PENDING_SALE_TITLE")
    for (const marker of ["setCupomNum", "writeCupom", "setCartRows([])"]) {
      expect(pendingBlock, `Black pending sem ${marker}`).not.toContain(marker)
    }
    const confirmed = source.slice(guardIdx + pendingBlock.length + (source.indexOf("{", guardIdx) - guardIdx))
    expect(confirmed).toContain("writeCupom")
  })
})

describe("CORREÇÃO-01 — fiação do dispatch server-side (sem dedupe volátil)", () => {
  it("módulo de dispatch não usa nenhuma primitiva volátil como autoridade", () => {
    const raw = read("lib/vendas/sale-automation-dispatch.ts")
    // Comentários documentam o que NÃO usar — a prova vale para o código.
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
    for (const marker of ["new Set(", "localStorage", "sessionStorage", "BroadcastChannel", "useRef", "WebLock"]) {
      expect(source, `dispatch sem ${marker}`).not.toContain(marker)
    }
    expect(source).toContain("shouldDispatchSaleAutomation")
    expect(source).toContain("replayed")
  })

  it("browser não posta venda_finalizada (só notificação local de UI)", () => {
    const source = read("lib/automation/automation-engine.ts")
    const guardIdx = source.indexOf('if (event === "venda_finalizada") return')
    const fetchIdx = source.indexOf('fetch("/api/automation/handle-event"')
    expect(guardIdx, "client filtra venda_finalizada").toBeGreaterThan(-1)
    expect(fetchIdx, "client ainda posta os demais eventos").toBeGreaterThan(-1)
    expect(guardIdx, "filtro antes do fetch").toBeLessThan(fetchIdx)
  })

  it("rota handle-event responde venda_finalizada de browser sem despachar", () => {
    const source = read("app/api/automation/handle-event/route.ts")
    expect(source).toContain('guarded.event === "venda_finalizada"')
    expect(source).toContain("dispatched: false")
  })

  it("rotas venda-persist V1/V2 despacham somente no create durável", () => {
    for (const file of ["app/api/ops/venda-persist/route.ts", "app/api/ops/venda-persist/v2/route.ts"]) {
      const source = read(file)
      expect(source, `${file} usa o dispatcher`).toContain("dispatchSaleAutomationIfCreated")
      expect(source, `${file} ancora no create`).toContain("!result.replayed")
    }
  })

  it("subscribers locais de UI continuam existindo (sem quebra)", () => {
    expect(read("lib/operations-store.tsx")).toContain('emitEvent("venda_finalizada"')
    expect(read("components/dashboard/vendas/vendas-arquivo-geral.tsx")).toContain("venda_finalizada")
  })
})
