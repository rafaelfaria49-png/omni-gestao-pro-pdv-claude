import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ scope: vi.fn(), find: vi.fn() }))
vi.mock("./scope", () => ({ exigirEscopo: mocks.scope }))
vi.mock("@/lib/prisma", () => ({ prisma: { dpVinculo: { findFirst: mocks.find } } }))
vi.mock("./commands", () => ({ executarComando: vi.fn() }))
import { listarHistorico } from "./cadastro"

describe("Histórico: motivo contratual exige viewRemuneracao", () => {
  const motivo = "Salário sintético alterado para 9876.54"
  beforeEach(() => {
    mocks.scope.mockResolvedValue({ empregadorId: "emp", storeId: "store", capacidades: ["viewCadastro"] })
    mocks.find.mockResolvedValue({ pessoa: { versoes: [{ id: "pessoal", versao: 1, nome: "Sintético", validFrom: new Date("2026-01-01"), recordedAt: new Date("2026-01-02"), supersedesId: null, autorId: "ator", motivo }] }, contratos: [{
      id: "contrato", versao: 2, cargo: "Analista", cbo: "123",
      salarioBase: { toFixed: () => "9876.54" }, motivo,
      validFrom: new Date("2026-01-01"), validTo: null, recordedAt: new Date("2026-01-02"),
      supersedesId: "anterior", supersededAt: null, autorId: "ator",
    }] })
  })
  it("remove salário e motivo da resposta serializada sem a capacidade", async () => {
    const dto = await listarHistorico("emp", "vinculo")
    expect(dto.contratos[0]).toMatchObject({ motivo: null, salarioBase: null, remuneracaoOculta: true, supersedesId: "anterior" })
    expect(dto.pessoa[0].motivo).toBeNull()
    expect(JSON.stringify(dto)).not.toContain("9876.54")
    expect(mocks.scope).toHaveBeenCalledWith("emp", "viewCadastro")
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "vinculo", empregadorId: "emp", storeId: "store" } }))
  })
  it("preserva leitura autorizada e não modifica o histórico armazenado", async () => {
    mocks.scope.mockResolvedValue({ empregadorId: "emp", storeId: "store", capacidades: ["viewCadastro", "viewRemuneracao"] })
    const dto = await listarHistorico("emp", "vinculo")
    expect(dto.pessoa[0].motivo).toBe(motivo)
    expect(dto.contratos[0]).toMatchObject({ motivo, salarioBase: "9876.54", remuneracaoOculta: false })
  })
  it("propaga revogação sem consultar o histórico", async () => {
    mocks.find.mockClear()
    mocks.scope.mockRejectedValue(new Error("ESCOPO_NEGADO"))
    await expect(listarHistorico("emp", "vinculo")).rejects.toThrow("ESCOPO_NEGADO")
    expect(mocks.find).not.toHaveBeenCalled()
  })
})
