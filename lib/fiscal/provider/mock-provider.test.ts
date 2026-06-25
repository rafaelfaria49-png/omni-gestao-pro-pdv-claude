/**
 * BL-FISCAL-007 — MockProvider (test double) + fábrica.
 *
 * O Mock implementa o MESMO contrato `FiscalProvider`, é 100% simulado (sem rede/fetch/Prisma),
 * permite scriptar o desfecho de cada operação e registra as chamadas. Cobre os contratos:
 * autorizar(emitir)/consultar/cancelar/inutilizar/statusServico + validações + factory + alias.
 */
import { describe, it, expect } from "vitest"
import {
  MockProvider,
  createMockProvider,
  createFiscalProvider,
  SefazStubProvider,
  StubHomologacaoProvider,
  type FiscalProviderRequest,
} from "./index"
import { dryRunSnapshot } from "../dry-run"

const REQ: FiscalProviderRequest = {
  contexto: { storeId: "loja-1", notaFiscalId: "nf-1", modelo: "NFCE", ambiente: "HOMOLOGACAO", serie: 1, numero: 42 },
  snapshot: dryRunSnapshot("simples"),
}
const CLOCK = () => "2027-06-01T12:00:00.000Z"

describe("MockProvider · desfecho feliz (todas as operações)", () => {
  it("emitir/consultar/cancelar/inutilizar retornam ok simulado e registram chamadas", async () => {
    const p = new MockProvider({ clock: CLOCK })
    expect(p.simulado).toBe(true)

    const emit = await p.emitir(REQ)
    expect(emit.ok).toBe(true)
    expect(emit.simulado).toBe(true)
    expect(emit.statusNota).toBe("AUTORIZADA")
    expect(emit.dados?.chaveAcesso).toMatch(/^MOCK-CHAVE-/)

    const cons = await p.consultar({ contexto: REQ.contexto, chaveAcesso: "CH" })
    expect(cons.resultado).toBe("ok")

    const canc = await p.cancelar({ contexto: REQ.contexto, justificativa: "x".repeat(20) })
    expect(canc.statusNota).toBe("CANCELADA")

    const inut = await p.inutilizar({ contexto: REQ.contexto, serie: 1, numeroInicial: 1, numeroFinal: 9, justificativa: "y".repeat(20) })
    expect(inut.statusNota).toBe("INUTILIZADA")

    // chamadas registradas em ordem
    expect(p.calls.map((c) => c.operacao)).toEqual(["emitir", "consultar", "cancelar", "inutilizar"])
    expect(p.calls.every((c) => c.em === CLOCK())).toBe(true)
  })

  it("statusServico reflete online configurável", async () => {
    const on = await createMockProvider({ clock: CLOCK }).statusServico({ provider: "MOCK", ambiente: "HOMOLOGACAO" })
    expect(on.online).toBe(true)
    expect(on.cStat).toBe("107")
    const off = await createMockProvider({ statusOnline: false, clock: CLOCK }).statusServico({ provider: "MOCK", ambiente: "HOMOLOGACAO" })
    expect(off.online).toBe(false)
    expect(off.cStat).toBe("108")
  })
})

describe("MockProvider · desfechos scriptados (caminhos de erro p/ pipeline)", () => {
  it("emitir → rejeitado", async () => {
    const p = new MockProvider({ outcomes: { emitir: "rejeitado" }, clock: CLOCK })
    const r = await p.emitir(REQ)
    expect(r.ok).toBe(false)
    expect(r.resultado).toBe("rejeitado")
    expect(r.statusNota).toBe("REJEITADA")
    expect(r.erros.length).toBeGreaterThan(0)
  })

  it("emitir → erro", async () => {
    const p = new MockProvider({ outcomes: { emitir: "erro" }, clock: CLOCK })
    const r = await p.emitir(REQ)
    expect(r.ok).toBe(false)
    expect(r.resultado).toBe("erro")
    expect(r.statusNota).toBe("ERRO")
    expect(r.erros[0]?.code).toBe("erro_interno")
  })

  it("emitir → pendente", async () => {
    const p = new MockProvider({ outcomes: { emitir: "pendente" }, clock: CLOCK })
    const r = await p.emitir(REQ)
    expect(r.resultado).toBe("pendente")
    expect(r.pendencias.length).toBeGreaterThan(0)
  })

  it("determinismo: mesma config + clock fixo → resposta idêntica", async () => {
    const a = await new MockProvider({ clock: CLOCK }).emitir(REQ)
    const b = await new MockProvider({ clock: CLOCK }).emitir(REQ)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it("reset limpa o histórico de chamadas", async () => {
    const p = new MockProvider({ clock: CLOCK })
    await p.emitir(REQ)
    expect(p.calls.length).toBe(1)
    p.reset()
    expect(p.calls.length).toBe(0)
  })
})

describe("createFiscalProvider (fábrica por intenção)", () => {
  it("mock → MockProvider; sefaz_stub/stub_homologacao → StubHomologacaoProvider", () => {
    expect(createFiscalProvider("mock")).toBeInstanceOf(MockProvider)
    expect(createFiscalProvider("sefaz_stub")).toBeInstanceOf(StubHomologacaoProvider)
    expect(createFiscalProvider("stub_homologacao")).toBeInstanceOf(StubHomologacaoProvider)
  })

  it("SefazStubProvider é o alias do StubHomologacaoProvider (sem duplicar implementação)", () => {
    expect(SefazStubProvider).toBe(StubHomologacaoProvider)
  })

  it("o stub e o mock satisfazem o mesmo contrato (emitir/statusServico)", async () => {
    const stub = createFiscalProvider("sefaz_stub")
    const mock = createFiscalProvider("mock")
    expect(typeof stub.emitir).toBe("function")
    expect(typeof mock.emitir).toBe("function")
    const st = await stub.statusServico({ provider: "STUB_HOMOLOGACAO", ambiente: "HOMOLOGACAO" })
    expect(st.simulado).toBe(true)
  })
})
