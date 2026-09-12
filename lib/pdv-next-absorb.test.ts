import { describe, it, expect } from "vitest"
import { computePdvCartTotals } from "@/lib/pdv-cart-totals"
import { parsePdvScanPrefix } from "@/lib/pdv-scan-prefix"
import {
  getPdvBlackStorageScope,
  readPdvBlackTurno,
  writePdvBlackTurno,
  readPdvBlackCupom,
  writePdvBlackCupom,
} from "@/lib/pdv-black-storage"

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
      // Total 100: R$ 60 cartão + R$ 40 dinheiro. Cliente entrega R$ 50 em dinheiro.
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
      const discountPercent = 10 // 10% = 20
      const discountReais = 30 // 30
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
        aliquotaImpostoEstimadoPdv: 10, // 10%
      } as any

      const { total, impostoEstimado } = computePdvCartTotals(subtotal, discountTotal, pdvParams)
      expect(impostoEstimado).toBe(10)
      expect(total).toBe(110)
    })

    it("limita o desconto total ao valor do subtotal", () => {
      const subtotal = 50
      const discountPercent = 50 // 25
      const discountReais = 40 // 40 -> sum = 65 > subtotal
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

  describe("Isolamento de escopo de storage (storeId + terminalId)", () => {
    it("gera chaves de escopo sem colisões", () => {
      const scopeA = getPdvBlackStorageScope("store-1", "term-A")
      const scopeB = getPdvBlackStorageScope("store-1", "term-B")
      const scopeC = getPdvBlackStorageScope("store-2", "term-A")
      const scopeDefault = getPdvBlackStorageScope(null, null)

      expect(scopeA).toBe("store-1:term-A")
      expect(scopeB).toBe("store-1:term-B")
      expect(scopeC).toBe("store-2:term-A")
      expect(scopeDefault).toBe("default:default")
      expect(scopeA).not.toBe(scopeB)
      expect(scopeA).not.toBe(scopeC)
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
  })
})
