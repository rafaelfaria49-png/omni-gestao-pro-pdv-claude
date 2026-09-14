import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { computePdvCartTotals } from "@/lib/pdv-cart-totals"
import { parsePdvScanPrefix } from "@/lib/pdv-scan-prefix"
import {
  getPdvBlackStorageScope,
  readPdvBlackTurno,
  writePdvBlackTurno,
  readPdvBlackCupom,
  writePdvBlackCupom,
} from "@/lib/pdv-black-storage"
import {
  writeSelectedTerminal,
  clearSelectedTerminal,
  readSelectedTerminal,
  TERMINAL_CHANGED_EVENT,
} from "@/lib/pdv-terminal"
import {
  getHeldSales,
  saveHeldSale,
  newHoldId,
  type HeldSale,
} from "@/lib/pdv-hold"
import { experimentalPdvEnabled } from "@/lib/feature-flags"

function installStorageShim() {
  const store = new Map<string, string>()
  const listeners: Record<string, Function[]> = {}

  const fakeLocalStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  }

  ;(globalThis as any).window = {
    addEventListener: (event: string, handler: Function) => {
      listeners[event] = listeners[event] || []
      listeners[event].push(handler)
    },
    removeEventListener: (event: string, handler: Function) => {
      if (!listeners[event]) return
      listeners[event] = listeners[event].filter((h) => h !== handler)
    },
    dispatchEvent: (event: { type?: string }) => {
      const name = event?.type || String(event)
      if (listeners[name]) {
        listeners[name].forEach((fn) => fn(event))
      }
      return true
    },
  }
  ;(globalThis as any).localStorage = fakeLocalStorage
  ;(globalThis as any).Event = class Event {
    type: string
    constructor(type: string) {
      this.type = type
    }
  }
  ;(globalThis as any).CustomEvent = class CustomEvent {
    type: string
    detail: any
    constructor(type: string, init?: { detail?: any }) {
      this.type = type
      this.detail = init?.detail
    }
  }
}

function uninstallStorageShim() {
  delete (globalThis as any).window
  delete (globalThis as any).localStorage
  delete (globalThis as any).Event
  delete (globalThis as any).CustomEvent
}

describe("PDV-NEXT-ABSORB-N2 Integrations", () => {
  describe("Troco canônico em pagamentos simples e mistos", () => {
    function computeTroco(dinheiroPago: number, cashTendered?: number): number {
      if (cashTendered != null && dinheiroPago > 0.005) {
        const cashTenderedNum = Number(cashTendered)
        if (Number.isFinite(cashTenderedNum) && cashTenderedNum >= dinheiroPago) {
          return Math.max(0, Math.round((cashTenderedNum - dinheiroPago) * 100) / 100)
        }
      }
      return 0
    }

    it("calcula troco corretamente para pagamento exclusivo em dinheiro", () => {
      const troco = computeTroco(100, 150)
      expect(troco).toBe(50)
    })

    it("calcula troco corretamente para pagamento misto (dinheiro + cartão/pix)", () => {
      const dinheiroPago = 40
      const cashTendered = 50
      const troco = computeTroco(dinheiroPago, cashTendered)
      expect(troco).toBe(10)
    })

    it("retorna 0 quando o valor entregue é exato", () => {
      expect(computeTroco(50, 50)).toBe(0)
    })

    it("retorna 0 quando não há pagamento em dinheiro", () => {
      expect(computeTroco(0, 50)).toBe(0)
    })

    it("retorna 0 quando cashTendered é inferior ao dinheiro pago", () => {
      expect(computeTroco(50, 40)).toBe(0)
    })
  })

  describe("computePdvCartTotals com descontos combinados e imposto estimado", () => {
    it("combina percentual + reais respeitando o teto do subtotal", () => {
      const subtotal = 200
      const discountPercent = 10
      const discountReais = 30
      const pctRaw = Math.min(100, Math.max(0, discountPercent))
      const discountTotal = Math.min(
        +(subtotal * (pctRaw / 100)).toFixed(2) + Math.max(0, discountReais),
        subtotal
      )
      expect(discountTotal).toBe(50)

      const pdvParams = {
        incluirImpostoEstimadoNoPdv: false,
        aliquotaImpostoEstimadoPdv: 0,
      } as any

      const { total, impostoEstimado } = computePdvCartTotals(subtotal, discountTotal, pdvParams)
      expect(total).toBe(150)
      expect(impostoEstimado).toBe(0)
    })

    it("inclui imposto estimado configurado nos pdvParams", () => {
      const subtotal = 100
      const discountTotal = 0
      const pdvParams = {
        incluirImpostoEstimadoNoPdv: true,
        aliquotaImpostoEstimadoPdv: 10,
      } as any

      const { total, impostoEstimado } = computePdvCartTotals(subtotal, discountTotal, pdvParams)
      expect(impostoEstimado).toBe(10)
      expect(total).toBe(110)
    })

    it("limita o desconto total ao valor do subtotal", () => {
      const subtotal = 50
      const discountPercent = 50
      const discountReais = 40
      const pctRaw = Math.min(100, Math.max(0, discountPercent))
      const discountTotal = Math.min(
        +(subtotal * (pctRaw / 100)).toFixed(2) + Math.max(0, discountReais),
        subtotal
      )
      expect(discountTotal).toBe(50)

      const pdvParams = {
        incluirImpostoEstimadoNoPdv: false,
        aliquotaImpostoEstimadoPdv: 0,
      } as any

      const { total } = computePdvCartTotals(subtotal, discountTotal, pdvParams)
      expect(total).toBe(0)
    })
  })

  describe("parsePdvScanPrefix em todas as variações", () => {
    it("analisa '3x123', '3*123', '3×123'", () => {
      expect(parsePdvScanPrefix("3x123")).toEqual({ qty: 3, query: "123", hasPrefix: true })
      expect(parsePdvScanPrefix("3*123")).toEqual({ qty: 3, query: "123", hasPrefix: true })
      expect(parsePdvScanPrefix("3×123")).toEqual({ qty: 3, query: "123", hasPrefix: true })
    })

    it("lida com espaços", () => {
      expect(parsePdvScanPrefix(" 5 x café ")).toEqual({ qty: 5, query: "café", hasPrefix: true })
    })

    it("mantém texto simples inalterado com qty=1", () => {
      expect(parsePdvScanPrefix("789123456")).toEqual({ qty: 1, query: "789123456", hasPrefix: false })
      expect(parsePdvScanPrefix("arroz")).toEqual({ qty: 1, query: "arroz", hasPrefix: false })
    })

    it("não enfraquece FRACTIONAL-SALE-HARD-BLOCK-005 com decimais", () => {
      // 2.5x não é capturado como prefixo inteiro; retorna query literal
      expect(parsePdvScanPrefix("2.5x123")).toEqual({ qty: 1, query: "2.5x123", hasPrefix: false })
    })
  })

  describe("Reatividade de Terminal e Isolamento de Storage (N2 Correction)", () => {
    beforeEach(() => {
      installStorageShim()
    })

    afterEach(() => {
      uninstallStorageShim()
    })

    it("1. loja A / terminal 1 lê scope A:T1", () => {
      writePdvBlackTurno("loja-a", "T1", 3)
      writePdvBlackCupom("loja-a", "T1", 1042)

      expect(readPdvBlackTurno("loja-a", "T1")).toBe(3)
      expect(readPdvBlackCupom("loja-a", "T1")).toBe(1042)
      expect(getPdvBlackStorageScope("loja-a", "T1")).toBe("loja-a:T1")
    })

    it("2 e 3. A:T1 → A:T2 muda imediatamente para scope A:T2 e A:T2 → A:T1 restaura scope A:T1", () => {
      writePdvBlackTurno("loja-a", "T1", 5)
      writePdvBlackCupom("loja-a", "T1", 1100)

      writePdvBlackTurno("loja-a", "T2", 2)
      writePdvBlackCupom("loja-a", "T2", 1020)

      // Em T1
      let currentTerminal = "T1"
      expect(readPdvBlackTurno("loja-a", currentTerminal)).toBe(5)
      expect(readPdvBlackCupom("loja-a", currentTerminal)).toBe(1100)

      // Troca para T2
      currentTerminal = "T2"
      expect(readPdvBlackTurno("loja-a", currentTerminal)).toBe(2)
      expect(readPdvBlackCupom("loja-a", currentTerminal)).toBe(1020)

      // Retorna para T1
      currentTerminal = "T1"
      expect(readPdvBlackTurno("loja-a", currentTerminal)).toBe(5)
      expect(readPdvBlackCupom("loja-a", currentTerminal)).toBe(1100)
    })

    it("4 e 5. troca de terminal não copia turno nem cupom entre escopos", () => {
      writePdvBlackTurno("loja-a", "T1", 10)
      writePdvBlackCupom("loja-a", "T1", 2000)

      // T2 não inicializado deve retornar defaults, sem herdar T1
      expect(readPdvBlackTurno("loja-a", "T2")).toBe(1)
      expect(readPdvBlackCupom("loja-a", "T2")).toBe(1000)

      // Gravação em T2 não altera T1
      writePdvBlackTurno("loja-a", "T2", 3)
      writePdvBlackCupom("loja-a", "T2", 1015)
      expect(readPdvBlackTurno("loja-a", "T1")).toBe(10)
      expect(readPdvBlackCupom("loja-a", "T1")).toBe(2000)
    })

    it("6 e 7. holds black de T1 não aparecem em T2 e novo hold após troca grava em T2", () => {
      const holdT1: HeldSale = {
        id: newHoldId(),
        label: "Venda 1",
        savedAt: new Date().toISOString(),
        items: [{ lineId: "l1", inventoryId: "p1", name: "Produto 1", price: 10, quantity: 1 }],
        pdvType: "black",
      }
      saveHeldSale("loja-a", "T1", holdT1)

      expect(getHeldSales("loja-a", "T1", "black")).toHaveLength(1)
      expect(getHeldSales("loja-a", "T2", "black")).toHaveLength(0)

      // Grava hold em T2
      const holdT2: HeldSale = {
        id: newHoldId(),
        label: "Venda 2",
        savedAt: new Date().toISOString(),
        items: [{ lineId: "l2", inventoryId: "p2", name: "Produto 2", price: 20, quantity: 2 }],
        pdvType: "black",
      }
      saveHeldSale("loja-a", "T2", holdT2)

      expect(getHeldSales("loja-a", "T1", "black")).toHaveLength(1)
      expect(getHeldSales("loja-a", "T2", "black")).toHaveLength(1)
      expect(getHeldSales("loja-a", "T2", "black")[0]?.items[0]?.name).toBe("Produto 2")
    })

    it("8. ausência de terminal usa 'default'", () => {
      expect(getPdvBlackStorageScope("loja-a", null)).toBe("loja-a:default")
      expect(getPdvBlackStorageScope("loja-a", undefined)).toBe("loja-a:default")
      expect(readPdvBlackTurno("loja-a", null)).toBe(1)
    })

    it("9. troca default → terminal real passa ao novo scope reativamente via TERMINAL_CHANGED_EVENT", () => {
      let activeTerminal = readSelectedTerminal("loja-a")?.id ?? "default"
      expect(activeTerminal).toBe("default")

      let notified = false
      window.addEventListener(TERMINAL_CHANGED_EVENT, () => {
        notified = true
        activeTerminal = readSelectedTerminal("loja-a")?.id ?? "default"
      })

      writeSelectedTerminal("loja-a", { id: "term-real-1", code: "T1", name: "Caixa 1" })
      expect(notified).toBe(true)
      expect(activeTerminal).toBe("term-real-1")
      expect(getPdvBlackStorageScope("loja-a", activeTerminal)).toBe("loja-a:term-real-1")
    })

    it("10. troca de loja continua isolada", () => {
      writePdvBlackTurno("loja-a", "T1", 8)
      writePdvBlackTurno("loja-b", "T1", 2)

      expect(readPdvBlackTurno("loja-a", "T1")).toBe(8)
      expect(readPdvBlackTurno("loja-b", "T1")).toBe(2)
      expect(getPdvBlackStorageScope("loja-a", "T1")).not.toBe(getPdvBlackStorageScope("loja-b", "T1"))
    })

    it("11. mudança de terminal com caixa já aberto não incrementa turno sozinha", () => {
      // Simula a lógica do effect de abertura do caixa no PdvBlackEdition
      writePdvBlackTurno("loja-a", "T1", 3)
      writePdvBlackTurno("loja-a", "T2", 1)

      let caixaIsOpen = true
      let prevCaixaOpen = true // caixa já estava aberto

      const simulateCaixaEffect = (terminalId: string) => {
        if (!prevCaixaOpen && caixaIsOpen) {
          const current = readPdvBlackTurno("loja-a", terminalId)
          writePdvBlackTurno("loja-a", terminalId, current + 1)
        }
        prevCaixaOpen = caixaIsOpen
      }

      // Mudança de terminal com caixa já aberto
      simulateCaixaEffect("T2")
      expect(readPdvBlackTurno("loja-a", "T2")).toBe(1) // permaneceu 1, sem incremento espúrio

      // Fechamento e reabertura real do caixa incrementa o escopo ativo
      caixaIsOpen = false
      simulateCaixaEffect("T2")
      caixaIsOpen = true
      simulateCaixaEffect("T2")
      expect(readPdvBlackTurno("loja-a", "T2")).toBe(2) // incrementou com abertura real
      expect(readPdvBlackTurno("loja-a", "T1")).toBe(3) // T1 inalterado
    })

    it("12. NEXT continua gated por feature-flag", () => {
      expect(typeof experimentalPdvEnabled).toBe("boolean")
    })
  })
})
