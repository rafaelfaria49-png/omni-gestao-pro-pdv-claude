import { describe, it, expect } from "vitest"
import {
  aPrazoExigeCliente,
  podeLimparCliente,
  tituloEditavel,
  parseVencimentoBr,
} from "./correcao-cliente-titulo-plan"

describe("aPrazoExigeCliente", () => {
  it("ok quando não há à prazo", () => {
    expect(aPrazoExigeCliente(0, null).ok).toBe(true)
  })
  it("bloqueia à prazo sem cliente", () => {
    const r = aPrazoExigeCliente(100, "")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("aprazo_sem_cliente")
  })
  it("ok à prazo com cliente", () => {
    expect(aPrazoExigeCliente(100, "João").ok).toBe(true)
  })
  it("trata espaços como ausência de cliente", () => {
    expect(aPrazoExigeCliente(100, "   ").ok).toBe(false)
  })
})

describe("podeLimparCliente", () => {
  it("bloqueia limpar com à prazo aberto", () => {
    const r = podeLimparCliente(true)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("cliente_obrigatorio_aprazo")
  })
  it("permite limpar sem à prazo", () => {
    expect(podeLimparCliente(false).ok).toBe(true)
  })
})

describe("tituloEditavel", () => {
  it("permite PENDENTE", () => {
    expect(tituloEditavel("pendente").ok).toBe(true)
  })
  it("permite VENCIDO", () => {
    expect(tituloEditavel("vencido").ok).toBe(true)
  })
  it("bloqueia PAGO", () => {
    const r = tituloEditavel("pago")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("titulo_recebido")
  })
  it("bloqueia PARCIAL", () => {
    const r = tituloEditavel("parcial")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("titulo_recebido")
  })
  it("bloqueia CANCELADO/ESTORNADO", () => {
    expect(tituloEditavel("cancelado").ok).toBe(false)
    expect(tituloEditavel("estornado").ok).toBe(false)
  })
})

describe("parseVencimentoBr", () => {
  it("aceita DD/MM/AAAA válido", () => {
    const r = parseVencimentoBr("15/07/2026")
    expect(r.ok).toBe(true)
    expect(r.vencimento).toBe("15/07/2026")
  })
  it("rejeita formato inválido", () => {
    expect(parseVencimentoBr("2026-07-15").ok).toBe(false)
    expect(parseVencimentoBr("15/7/26").ok).toBe(false)
    expect(parseVencimentoBr("").ok).toBe(false)
  })
  it("rejeita data inexistente", () => {
    expect(parseVencimentoBr("31/02/2026").ok).toBe(false)
  })
})
