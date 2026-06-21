import { describe, it, expect } from "vitest"
import {
  calcSaldoDevedorClienteDeSaldos,
  calcSaldoDevedorClienteTodaLoja,
} from "@/lib/contas-receber-recibo"

// ============================================================================
// BUG P1 — Recibo de baixa parcial imprimia "SALDO DEVEDOR ATUAL: R$ 0,00".
// ----------------------------------------------------------------------------
// Causa raiz: o rodapé do recibo usava `calcSaldoDevedorClienteTodaLoja`, que
// reinfere o saldo de cada título por (status, valor, parcelas). Após uma baixa
// parcial o PdvRecebimentoModal marca o título como status "parcial" — que NÃO
// estava na lista de status "em aberto" do helper — então o título era tratado
// como quitado e o saldo somava 0.
//
// Correção: o recibo passa a obter o saldo da FONTE AUTORITATIVA (saldo em aberto
// do servidor = valor − pagamentos) via `calcSaldoDevedorClienteDeSaldos`, que
// recebe o saldo remanescente DESTE título já calculado + os saldos dos demais
// títulos do cliente. Estes testes exercitam exatamente a aritmética do recibo.
// ============================================================================

/** Espelha o cálculo do modal: saldo remanescente do título = saldo em aberto − valor pago. */
function saldoRemanescente(saldoAberto: number, valorPago: number): number {
  return Math.max(0, Math.round((saldoAberto - valorPago) * 100) / 100)
}

describe("calcSaldoDevedorClienteDeSaldos — saldo devedor no recibo", () => {
  it("pagamento parcial: título 180,00 e pagamento 131,82 → 48,18 (cenário do bug)", () => {
    const saldoRem = saldoRemanescente(180, 131.82)
    expect(saldoRem).toBe(48.18)
    expect(calcSaldoDevedorClienteDeSaldos(saldoRem, [])).toBe(48.18)
  })

  it("pagamento total: quita o título inteiro → 0,00", () => {
    const saldoRem = saldoRemanescente(180, 180)
    expect(saldoRem).toBe(0)
    expect(calcSaldoDevedorClienteDeSaldos(saldoRem, [])).toBe(0)
  })

  it("múltiplas baixas parciais: cada parcial usa o saldo já abatido do servidor", () => {
    // 1ª parcial: 180 − 50 = 130 restante
    const apos1 = saldoRemanescente(180, 50)
    expect(calcSaldoDevedorClienteDeSaldos(apos1, [])).toBe(130)
    // 2ª parcial sobre o saldo já reduzido: 130 − 31,82 = 98,18 restante
    const apos2 = saldoRemanescente(apos1, 31.82)
    expect(calcSaldoDevedorClienteDeSaldos(apos2, [])).toBe(98.18)
  })

  it("última parcela: o pagamento que zera o saldo imprime 0,00", () => {
    // Restavam 48,18; o cliente paga exatamente 48,18 → quita.
    const saldoRem = saldoRemanescente(48.18, 48.18)
    expect(saldoRem).toBe(0)
    expect(calcSaldoDevedorClienteDeSaldos(saldoRem, [])).toBe(0)
  })

  it("nunca assume zero enquanto houver centavo pendente", () => {
    const saldoRem = saldoRemanescente(48.18, 48.17)
    expect(saldoRem).toBe(0.01)
    expect(calcSaldoDevedorClienteDeSaldos(saldoRem, [])).toBe(0.01)
  })

  it("soma os demais títulos abertos do mesmo cliente", () => {
    // Este título quitado (0), mas o cliente ainda deve 90,00 e 10,50 em outros.
    expect(calcSaldoDevedorClienteDeSaldos(0, [90, 10.5])).toBe(100.5)
    // Este título parcial (48,18) + outro aberto (90,00).
    expect(calcSaldoDevedorClienteDeSaldos(48.18, [90])).toBe(138.18)
  })

  it("guarda contra valores negativos e não-finitos", () => {
    expect(calcSaldoDevedorClienteDeSaldos(-5, [-10])).toBe(0)
    expect(calcSaldoDevedorClienteDeSaldos(Number.NaN, [Number.POSITIVE_INFINITY, 12])).toBe(12)
  })
})

describe("regressão documentada: por que o helper antigo zerava o recibo", () => {
  it("calcSaldoDevedorClienteTodaLoja ignora título com status 'parcial' (raiz do bug)", () => {
    // Reproduz o nextRows do PdvRecebimentoModal após a baixa parcial.
    const saldo = calcSaldoDevedorClienteTodaLoja(
      [{ cliente: "Maria", status: "parcial", valor: 48.18 }],
      "Maria",
    )
    expect(saldo).toBe(0) // <- comportamento incorreto que o novo cálculo substitui
  })
})
