import { describe, expect, it, vi } from "vitest"
import {
  coletarVendasHistoricoParaExportacao,
  HISTORICO_EXPORT_MAX,
  HISTORICO_EXPORT_PAGE,
  resolverFimExportacaoHistorico,
} from "./historico-pagamento-export"

type V = { dbId: string }

/** Servidor fake que pagina corretamente um conjunto já filtrado. */
function servidor(total: number) {
  const rows: V[] = Array.from({ length: total }, (_, i) => ({ dbId: `v${i}` }))
  return vi.fn(async (skip: number, take: number) => ({ vendas: rows.slice(skip, skip + take), total }))
}

describe("coletarVendasHistoricoParaExportacao", () => {
  it("mantém o limite de 5.000 e páginas de 200", () => {
    expect(HISTORICO_EXPORT_MAX).toBe(5000)
    expect(HISTORICO_EXPORT_PAGE).toBe(200)
  })

  it("páginas cheias: para quando o offset alcança o total, sem chamada extra", async () => {
    const fetchPage = servidor(600)
    const r = await coletarVendasHistoricoParaExportacao(fetchPage)
    expect(r.linhas).toHaveLength(600)
    expect(fetchPage.mock.calls.map(([skip, take]) => [skip, take])).toEqual([[0, 200], [200, 200], [400, 200]])
    expect(r.truncado).toBe(false)
  })

  it("última página parcial", async () => {
    const fetchPage = servidor(450)
    const r = await coletarVendasHistoricoParaExportacao(fetchPage)
    expect(r.linhas.map((v) => v.dbId)).toEqual(Array.from({ length: 450 }, (_, i) => `v${i}`))
    expect(fetchPage).toHaveBeenCalledTimes(3)
  })

  it("sem resultados: uma chamada, nada exportado", async () => {
    const fetchPage = servidor(0)
    const r = await coletarVendasHistoricoParaExportacao(fetchPage)
    expect(r).toEqual({ linhas: [], totalServidor: 0, truncado: false })
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it("acima do limite: exporta 5.000 e sinaliza truncamento", async () => {
    const fetchPage = servidor(7000)
    const r = await coletarVendasHistoricoParaExportacao(fetchPage)
    expect(r.linhas).toHaveLength(5000)
    expect(r.totalServidor).toBe(7000)
    expect(r.truncado).toBe(true)
    expect(fetchPage).toHaveBeenCalledTimes(25)
  })

  it("exatamente no limite: exportação completa, sem truncamento", async () => {
    const r = await coletarVendasHistoricoParaExportacao(servidor(5000))
    expect(r.linhas).toHaveLength(5000)
    expect(r.truncado).toBe(false)
  })

  it("descarta venda repetida entre páginas (offset deslocado)", async () => {
    const fetchPage = vi.fn(async (skip: number) =>
      skip === 0
        ? { vendas: [{ dbId: "a" }, { dbId: "b" }], total: 4 }
        : { vendas: [{ dbId: "b" }, { dbId: "c" }], total: 4 },
    )
    const r = await coletarVendasHistoricoParaExportacao(fetchPage, { pageSize: 2 })
    expect(r.linhas.map((v) => v.dbId)).toEqual(["a", "b", "c"])
  })

  it("lote vazio encerra mesmo com total desatualizado (sem laço infinito)", async () => {
    const fetchPage = vi.fn(async (skip: number) => ({ vendas: skip === 0 ? [{ dbId: "a" }] : [], total: 999 }))
    const r = await coletarVendasHistoricoParaExportacao(fetchPage, { pageSize: 1 })
    expect(r.linhas).toHaveLength(1)
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(r.truncado).toBe(false)
  })

  it("fim do período: âncora do servidor nas páginas seguintes, sem ultrapassar o filtro do usuário", () => {
    const ancora = "2026-10-24T12:00:00.000Z"
    expect(resolverFimExportacaoHistorico("", "")).toBe("")
    expect(resolverFimExportacaoHistorico("", ancora)).toBe(ancora)
    expect(resolverFimExportacaoHistorico("2026-10-24T23:59:59.000Z", ancora)).toBe(ancora)
    expect(resolverFimExportacaoHistorico("2026-10-20T23:59:59.000Z", ancora)).toBe("2026-10-20T23:59:59.000Z")
  })

  it("falha de rede propaga (o componente mostra 'Falha na exportação')", async () => {
    await expect(
      coletarVendasHistoricoParaExportacao(async () => {
        throw new Error("HTTP 503")
      }),
    ).rejects.toThrow("HTTP 503")
  })
})
