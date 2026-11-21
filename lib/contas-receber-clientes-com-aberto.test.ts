import { describe, expect, it } from "vitest"
import { mapearNomesAmbiguos, resumirClientesComAberto } from "@/lib/contas-receber-cliente-match"

const clientes = [
  { id: "ana", name: "Ana Souza", phone: "11900000001", document: "123" },
  { id: "mar1", name: "Maria Silva" },
  { id: "mar2", name: "maria  silva" },
  { id: "jose", name: "José Lima" },
  { id: "semdivida", name: "Sem Dívida" },
]
const opts = { nomesAmbiguos: mapearNomesAmbiguos(clientes) }

describe("resumirClientesComAberto (lista inicial F5/F9)", () => {
  it("soma só saldo em aberto, por clienteId ou nome ÚNICO, maiores devedores primeiro", () => {
    const r = resumirClientesComAberto(
      clientes,
      [
        { clienteId: "ana", cliente: "Ana Souza", saldoAberto: 30 },
        { clienteId: "ana", cliente: "Ana Souza", saldoAberto: 0 }, // quitado: fora
        { cliente: "jose lima", saldoAberto: 100 }, // nome único sem id
        { clienteId: "ana", cliente: "Ana Souza", saldoAberto: 20.5 },
      ],
      opts,
    )
    expect(r).toEqual([
      { id: "jose", name: "José Lima", phone: null, document: null, qtdAbertos: 1, totalAberto: 100 },
      { id: "ana", name: "Ana Souza", phone: "•••0001", document: "•••123", qtdAbertos: 2, totalAberto: 50.5 },
    ])
  })

  it("homônimo sem clienteId não é atribuído a nenhum dos dois; com clienteId vai só ao dono", () => {
    const r = resumirClientesComAberto(
      clientes,
      [
        { cliente: "Maria Silva", saldoAberto: 999 },
        { clienteId: "mar2", cliente: "Maria Silva", saldoAberto: 10 },
      ],
      opts,
    )
    expect(r).toEqual([expect.objectContaining({ id: "mar2", totalAberto: 10, qtdAbertos: 1 })])
  })

  it("clienteId divergente é decisivo: nome igual não 'resgata' o título para outro cliente", () => {
    const r = resumirClientesComAberto(clientes, [{ clienteId: "outro-cadastro", cliente: "Ana Souza", saldoAberto: 40 }], opts)
    expect(r).toEqual([])
  })

  it("respeita o limite", () => {
    const muitos = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, name: `Cliente ${i}` }))
    const r = resumirClientesComAberto(muitos, muitos.map((c, i) => ({ clienteId: c.id, cliente: c.name, saldoAberto: i + 1 })), { nomesAmbiguos: new Set() }, 2)
    expect(r.map((c) => c.id)).toEqual(["c4", "c3"])
  })
})

describe("mascararFinal (lista inicial não expõe contato completo)", () => {
  it("mantém só o final", async () => {
    const { mascararFinal } = await import("@/lib/contas-receber-cliente-match")
    expect(mascararFinal("(11) 97777-6666", 4)).toBe("•••6666")
    expect(mascararFinal("123.456.789-09", 3)).toBe("•••909")
    expect(mascararFinal("", 4)).toBeNull()
    expect(mascararFinal(null, 4)).toBeNull()
  })
})
