/** PDV-F8-TROCA-IMEDIATA-INTEGRACAO-SEGURA-001 — desfecho da fila offline e fator de valor pago. */
import { describe, expect, it } from "vitest"
import { classificarRespostaDevolucao, nextDevolucaoId } from "@/lib/operations-store"
import { fatorValorPago } from "@/lib/pdv/devolucao/registrar-devolucao"

describe("fila de devoluções — resposta do servidor", () => {
  it("2xx confirma; conflito de id reidentifica; recusa de negócio sai da fila; resto aguarda", () => {
    expect(classificarRespostaDevolucao(200, undefined)).toBe("confirmada")
    expect(classificarRespostaDevolucao(409, "LOCAL_ID_CONFLITO")).toBe("reidentificar")
    for (const code of ["REEMBOLSO_DINHEIRO_BLOQUEADO_POR_POLITICA", "QUANTIDADE_EXCEDE_DEVOLVIVEL", "VENDA_CANCELADA", "CLIENTE_DOC_OBRIGATORIO", "ITEM_NAO_CONSTA_NA_VENDA"]) {
      expect(classificarRespostaDevolucao(409, code)).toBe("recusada")
    }
    // Venda ainda não sincronizada, período fechado, 5xx e rede: tenta de novo.
    expect(classificarRespostaDevolucao(409, "VENDA_ORIGEM_NAO_ENCONTRADA")).toBe("aguardar")
    expect(classificarRespostaDevolucao(409, "periodo_fechado")).toBe("aguardar")
    expect(classificarRespostaDevolucao(503, undefined)).toBe("aguardar")
  })

  it("ids de devolução não colidem entre terminais (sufixo aleatório) e o contador continua", () => {
    const year = new Date().getFullYear()
    const a = nextDevolucaoId([])
    const b = nextDevolucaoId([])
    expect(a).toMatch(new RegExp(`^DEV-${year}-0001-[0-9A-F]{8}$`))
    expect(a).not.toBe(b)
    const c = nextDevolucaoId([{ id: `DEV-${year}-0007` } as never, { id: `DEV-${year}-0009-ABCDEF12` } as never])
    expect(c.startsWith(`DEV-${year}-0010-`)).toBe(true)
  })
})

describe("fatorValorPago", () => {
  it("desconto reduz; acréscimo não aumenta; sem linhas = 1", () => {
    expect(fatorValorPago(50, [{ lineTotal: 100 }])).toBe(0.5)
    expect(fatorValorPago(120, [{ lineTotal: 100 }])).toBe(1)
    expect(fatorValorPago(10, [])).toBe(1)
  })
})
