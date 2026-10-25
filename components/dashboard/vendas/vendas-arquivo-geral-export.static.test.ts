/**
 * GOAL PDV-PADARIA-HISTORICO-PAGAMENTO-G1-001 — invariantes da exportação CSV do
 * Histórico. A coleta é coberta em `lib/vendas/historico-pagamento-export.test.ts`
 * e sobre a rota real em `app/api/vendas/historico/route.test.ts`; aqui se trava o
 * formato do arquivo e a ligação do componente com o coletor.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const src = readFileSync(resolve(__dirname, "vendas-arquivo-geral.tsx"), "utf8")
const exportar = src.slice(src.indexOf("const handleExportar"), src.indexOf("// ── KPI Cards"))

describe("vendas-arquivo-geral — exportação CSV", () => {
  it("usa o coletor compartilhado com o limite canônico e a âncora de período", () => {
    expect(exportar).toContain("coletarVendasHistoricoParaExportacao")
    expect(exportar).toContain("resolverFimExportacaoHistorico(toFiltro, ancora)")
    expect(exportar).toContain("{ max: HISTORICO_EXPORT_MAX }")
  })

  it("não mantém laço próprio que parava no primeiro lote vazio", () => {
    expect(exportar).not.toMatch(/while\s*\(/)
    expect(exportar).not.toContain("if (lote.length === 0) break")
  })

  it("preserva BOM UTF-8, separador ';', CRLF e decimal com vírgula", () => {
    expect(exportar).toContain('new Blob(["﻿" + csv.join("\\r\\n")]')
    expect(exportar).toContain('cabecalho.join(";")')
    expect(exportar).toContain('n.toFixed(2).replace(".", ",")')
  })

  it("respeita todos os filtros ativos da tela", () => {
    for (const param of ["q: busca", "status: statusFiltro", "pagamento: pagamentoFiltro", "operador: operadorFiltro.trim()", "terminalId: terminalFiltro", "from: new Date(fromDate).toISOString()"]) {
      expect(exportar).toContain(param)
    }
    expect(exportar).toContain('headers: { "x-assistec-loja-id": storeId }')
  })

  it("diferencia exportação completa de truncamento pelo limite", () => {
    expect(exportar).toContain("const { linhas, truncado } = await coletarVendasHistoricoParaExportacao")
    expect(exportar).toContain("limite de ${HISTORICO_EXPORT_MAX.toLocaleString")
  })
})
