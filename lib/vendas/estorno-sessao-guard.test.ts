/**
 * GOAL 007B · INVARIANTE 3 — elegibilidade da sessão de caixa para o estorno simples.
 *
 * Predicado puro compartilhado pelo servidor. A política para venda SEM vínculo é
 * deliberada e está travada aqui para não virar silêncio: ausência de `sessaoId` não é
 * prova de sessão fechada, e inventar vínculo por horário seria decidir dinheiro com
 * palpite.
 */
import { describe, expect, it } from "vitest"
import {
  ESTORNO_BLOQUEIO_SESSAO_CODE,
  ESTORNO_BLOQUEIO_SESSAO_FECHADA,
  avaliarSessaoParaEstorno,
} from "./estorno-sessao-guard"

describe("sessão ABERTA", () => {
  it("libera o estorno", () => {
    expect(avaliarSessaoParaEstorno({ sessaoId: "s1", sessao: { status: "ABERTA" } })).toEqual({
      bloqueado: false,
      motivoPermissao: "sessao_aberta",
    })
  })
})

describe("sessão FECHADA", () => {
  it("BLOQUEIA com motivo e código reais", () => {
    expect(avaliarSessaoParaEstorno({ sessaoId: "s1", sessao: { status: "FECHADA" } })).toEqual({
      bloqueado: true,
      motivo: ESTORNO_BLOQUEIO_SESSAO_FECHADA,
      code: ESTORNO_BLOQUEIO_SESSAO_CODE,
    })
  })

  it("compara sem depender de caixa/espaços do banco", () => {
    expect(avaliarSessaoParaEstorno({ sessaoId: "s1", sessao: { status: " fechada " } }).bloqueado).toBe(true)
  })

  it("a razão diz o caminho alternativo e não promete estorno retroativo", () => {
    expect(ESTORNO_BLOQUEIO_SESSAO_FECHADA).toMatch(/Financeiro/)
    expect(ESTORNO_BLOQUEIO_SESSAO_FECHADA).not.toMatch(/em breve|retroativ/i)
  })
})

describe("venda SEM vínculo de sessão — política documentada", () => {
  it.each([undefined, null, "", "   "])("sessaoId %p libera, marcado como sem vínculo", (sessaoId) => {
    expect(avaliarSessaoParaEstorno({ sessaoId, sessao: null })).toEqual({
      bloqueado: false,
      motivoPermissao: "sem_vinculo_de_sessao",
    })
  })

  it("vínculo apontando para sessão inexistente não é prova de fechamento", () => {
    expect(avaliarSessaoParaEstorno({ sessaoId: "sumiu", sessao: null })).toEqual({
      bloqueado: false,
      motivoPermissao: "sem_vinculo_de_sessao",
    })
  })

  it("os dois casos liberados continuam distinguíveis (não colapsam em um só)", () => {
    const a = avaliarSessaoParaEstorno({ sessaoId: "s1", sessao: { status: "ABERTA" } })
    const b = avaliarSessaoParaEstorno({ sessaoId: null, sessao: null })
    expect(a).not.toEqual(b)
  })
})

describe("status desconhecido", () => {
  it.each(["", null, undefined, "PAUSADA", "???"])("status %p não bloqueia por invenção", (status) => {
    expect(avaliarSessaoParaEstorno({ sessaoId: "s1", sessao: { status } }).bloqueado).toBe(false)
  })
})
