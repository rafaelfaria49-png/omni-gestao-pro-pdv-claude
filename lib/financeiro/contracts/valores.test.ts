import { describe, it, expect } from "vitest"
import {
  formatDateBR,
  parseDateStringSafe,
  isOverdueDateString,
  distribuirRecebimentoPorVencimento,
  type TituloAbertoDistribuicao,
} from "./valores"

// ============================================================================
// FINANCEIRO-RECEBER-CLIENTE-DATEFIX-002
// ----------------------------------------------------------------------------
// A UI do Financeiro HUB fazia `new Date(r.venc)` sobre vencimentos gravados
// como texto `dd/mm/aaaa` (adapter OS e venda PDV à prazo). O construtor nativo
// `Date` interpreta strings `xx/yy/zzzz` como `mm/dd/aaaa`: quando o dia > 12 o
// "mês" fica inválido e o resultado vira "Invalid Date"; quando o dia <= 12 o
// valor é lido silenciosamente errado (mês e dia trocados). Estes testes travam
// o comportamento do parser/formatador seguro reaproveitado pela UI.
// ============================================================================

describe("parseDateStringSafe", () => {
  it("interpreta ISO yyyy-mm-dd corretamente", () => {
    const d = parseDateStringSafe("2026-07-25")
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(6) // julho = índice 6
    expect(d!.getDate()).toBe(25)
  })

  it("interpreta dd/mm/aaaa com dia > 12 sem virar inválido", () => {
    const d = parseDateStringSafe("25/07/2026")
    expect(d).not.toBeNull()
    expect(d!.getDate()).toBe(25)
    expect(d!.getMonth()).toBe(6) // julho, não "mês 25"
    expect(d!.getFullYear()).toBe(2026)
  })

  it("interpreta dd/mm/aaaa com dia <= 12 sem inverter mês/dia", () => {
    const d = parseDateStringSafe("03/07/2026")
    expect(d).not.toBeNull()
    expect(d!.getDate()).toBe(3)
    expect(d!.getMonth()).toBe(6) // julho — não deve virar "dia 7 de março"
    expect(d!.getFullYear()).toBe(2026)
  })

  it("retorna null para vazio/nulo/indefinido", () => {
    expect(parseDateStringSafe("")).toBeNull()
    expect(parseDateStringSafe(null)).toBeNull()
    expect(parseDateStringSafe(undefined)).toBeNull()
  })

  it("retorna null para texto não interpretável como data", () => {
    expect(parseDateStringSafe("não é uma data")).toBeNull()
  })
})

describe("formatDateBR", () => {
  it("formata ISO para pt-BR", () => {
    expect(formatDateBR("2026-07-25")).toBe("25/07/2026")
  })

  it("formata dd/mm/aaaa com dia > 12 sem virar Invalid Date", () => {
    const out = formatDateBR("25/07/2026")
    expect(out).not.toMatch(/invalid/i)
    expect(out).toBe("25/07/2026")
  })

  it("formata dd/mm/aaaa com dia <= 12 sem inverter mês/dia", () => {
    expect(formatDateBR("03/07/2026")).toBe("03/07/2026")
  })

  it("usa o fallback honesto para vencimento vazio", () => {
    expect(formatDateBR("", "Sem vencimento")).toBe("Sem vencimento")
    expect(formatDateBR(null, "Sem vencimento")).toBe("Sem vencimento")
  })

  it("usa o fallback honesto para vencimento inválido (nunca 'Invalid Date')", () => {
    const out = formatDateBR("lixo-invalido")
    expect(out).not.toMatch(/invalid/i)
    expect(out).toBe("—")
  })

  it("aceita fallback default '—' quando não informado", () => {
    expect(formatDateBR(undefined)).toBe("—")
  })
})

describe("isOverdueDateString (regressão de parsing)", () => {
  it("não lança e não trata dd/mm/aaaa com dia > 12 como data inválida", () => {
    const hoje = new Date(2026, 6, 1) // 01/07/2026
    expect(isOverdueDateString("25/07/2026", hoje)).toBe(false) // no futuro
    expect(isOverdueDateString("25/06/2026", hoje)).toBe(true) // no passado
  })
})

// ============================================================================
// FINANCEIRO-RECEBER-CLIENTE-VALOR-AVULSO-003
// ----------------------------------------------------------------------------
// O fluxo "Receber valor" do modal "Receber de cliente" usa este helper puro
// para planejar a distribuição de um valor avulso entre os títulos em aberto
// (vencimento mais antigo primeiro). A execução reaproveita as baixas
// existentes (liquidar/parcial) — o helper NÃO cria título nem chama API.
// ============================================================================

describe("distribuirRecebimentoPorVencimento", () => {
  const titulos: TituloAbertoDistribuicao[] = [
    { id: "c", saldoAberto: 39.9, vencimento: "2026-07-10" },
    { id: "a", saldoAberto: 15, vencimento: "2026-06-01" },
    { id: "d", saldoAberto: 39.9, vencimento: "2026-08-01" },
    { id: "b", saldoAberto: 25, vencimento: "15/06/2026" }, // dd/mm/aaaa também é aceito
  ]

  it("calcula o total em aberto correto do cliente", () => {
    const r = distribuirRecebimentoPorVencimento(titulos, 10)
    expect(r.totalAberto).toBe(119.8)
  })

  it("distribui valor menor que o total: quita os mais antigos e faz parcial no último (exemplo do comando)", () => {
    const r = distribuirRecebimentoPorVencimento(titulos, 100)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.baixas).toEqual([
      { id: "a", valor: 15, total: true },
      { id: "b", valor: 25, total: true },
      { id: "c", valor: 39.9, total: true },
      { id: "d", valor: 20.1, total: false },
    ])
    expect(r.quitados).toBe(3)
    expect(r.parciais).toBe(1)
  })

  it("valor igual ao total quita todos os títulos", () => {
    const r = distribuirRecebimentoPorVencimento(titulos, 119.8)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.baixas).toHaveLength(4)
    expect(r.baixas.every((b) => b.total)).toBe(true)
    expect(r.quitados).toBe(4)
    expect(r.parciais).toBe(0)
  })

  it("bloqueia valor maior que o total em aberto", () => {
    const r = distribuirRecebimentoPorVencimento(titulos, 119.81)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro).toBe("valor_maior_que_saldo")
  })

  it("bloqueia valor zero, negativo ou inválido", () => {
    for (const v of [0, -10, NaN, Infinity, "abc" as unknown]) {
      const r = distribuirRecebimentoPorVencimento(titulos, v)
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(r.erro).toBe("valor_invalido")
    }
  })

  it("respeita vencimento mais antigo primeiro (independente da ordem de entrada)", () => {
    const r = distribuirRecebimentoPorVencimento(titulos, 119.8)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.baixas.map((b) => b.id)).toEqual(["a", "b", "c", "d"])
  })

  it("títulos sem vencimento válido vão para o fim da fila", () => {
    const r = distribuirRecebimentoPorVencimento(
      [
        { id: "sem-venc", saldoAberto: 10, vencimento: null },
        { id: "com-venc", saldoAberto: 10, vencimento: "2026-06-01" },
      ],
      15,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.baixas).toEqual([
      { id: "com-venc", valor: 10, total: true },
      { id: "sem-venc", valor: 5, total: false },
    ])
  })

  it("títulos sem saldo aberto (pagos/zerados) não entram na distribuição nem no total", () => {
    const r = distribuirRecebimentoPorVencimento(
      [
        { id: "pago", saldoAberto: 0, vencimento: "2026-01-01" },
        { id: "negativo", saldoAberto: -5, vencimento: "2026-01-02" },
        { id: "aberto", saldoAberto: 30, vencimento: "2026-06-01" },
      ],
      30,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.totalAberto).toBe(30)
    expect(r.baixas).toEqual([{ id: "aberto", valor: 30, total: true }])
  })

  it("bloqueia quando não há títulos em aberto", () => {
    const r = distribuirRecebimentoPorVencimento([{ id: "pago", saldoAberto: 0, vencimento: "2026-01-01" }], 10)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro).toBe("sem_titulos")
    expect(r.totalAberto).toBe(0)
  })

  it("não gera resíduo de centavos (aritmética em centavos)", () => {
    const r = distribuirRecebimentoPorVencimento(
      [
        { id: "x", saldoAberto: 0.1, vencimento: "2026-06-01" },
        { id: "y", saldoAberto: 0.2, vencimento: "2026-06-02" },
      ],
      0.3,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.baixas).toEqual([
      { id: "x", valor: 0.1, total: true },
      { id: "y", valor: 0.2, total: true },
    ])
  })
})
