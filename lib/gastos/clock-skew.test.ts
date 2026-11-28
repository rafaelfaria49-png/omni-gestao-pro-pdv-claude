import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))

import { agoraDoBanco, exigirRevisaoPronta } from "./operacoes"

const banco = (agora: Date | null) => ({ $queryRaw: vi.fn(async () => (agora ? [{ agora }] : [])) })

afterEach(() => { vi.useRealTimers() })

describe("G006 · clock skew — expiração de revisão usa o relógio do PostgreSQL", () => {
  const dbAgora = new Date("2026-11-25T12:00:00.000Z")
  const revisao = { versao: 1, estado: "PRONTA", expiraEm: new Date("2026-11-25T12:10:00.000Z") }

  it("host adiantado 1 h não expira uma revisão ainda válida pelo relógio do banco", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-25T13:00:00.000Z"))
    const agora = await agoraDoBanco(banco(dbAgora) as never)
    expect(() => exigirRevisaoPronta(revisao, 1, agora)).not.toThrow()
  })

  it("host atrasado 1 h não ressuscita uma revisão já expirada pelo relógio do banco", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-25T11:00:00.000Z"))
    const agora = await agoraDoBanco(banco(new Date("2026-11-25T12:10:00.001Z")) as never)
    expect(() => exigirRevisaoPronta(revisao, 1, agora)).toThrow(expect.objectContaining({ code: "revisao_expirada" }))
  })

  it("sem relógio do banco a operação falha fechada (503), nunca cai para o Date.now() do host", async () => {
    await expect(agoraDoBanco(banco(null) as never)).rejects.toMatchObject({ code: "relogio_indisponivel", status: 503 })
  })
})
