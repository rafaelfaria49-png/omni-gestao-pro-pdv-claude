/**
 * Contador HUB · Pacote do Contador (GOAL 008) — compactação ZIP (jszip).
 *
 * Verifica o round-trip (conteúdo intacto após zip → unzip) e, de ponta a ponta, que os
 * hashes do manifesto batem com os bytes efetivamente gravados no ZIP.
 */
import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { montarDados, type FontesContador } from "@/lib/contador/readers"
import { montarChecklistFechamento } from "@/lib/contador/fechamento"
import { montarConteudoPacote } from "./builder"
import { ziparArquivos } from "./zip"
import { sha256Hex } from "./seguranca"
import type { ArquivoPacote } from "./tipos"

const agora = new Date("2026-07-16T12:00:00.000Z")

describe("ziparArquivos", () => {
  it("compacta e o conteúdo dos arquivos volta intacto (inclui acentos e subpastas)", async () => {
    const arquivos: ArquivoPacote[] = [
      { caminho: "a.txt", categoria: "csv", descricao: "", conteudo: "olá, çãé — mundo" },
      { caminho: "sub/b.json", categoria: "manifesto", descricao: "", conteudo: '{"x":1}\n' },
    ]
    const bytes = await ziparArquivos(arquivos, agora)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.byteLength).toBeGreaterThan(0)

    const zip = await JSZip.loadAsync(bytes)
    expect(await zip.file("a.txt")!.async("string")).toBe("olá, çãé — mundo")
    expect(await zip.file("sub/b.json")!.async("string")).toBe('{"x":1}\n')
  })
})

describe("Pacote do Contador — integridade ponta a ponta (manifesto ↔ ZIP)", () => {
  const competencia = { ano: 2026, mes: 6 }
  const fontes: FontesContador = {
    vendas: [{ total: 100, status: "concluida", payload: { paymentBreakdown: { pix: 100 } } }],
    devolucoes: [{ valorTotal: 10 }],
    movimentacoes: [{ tipo: "entrada", origem: "venda", valor: 50 }],
    receber: [{ valor: 30, status: "pendente", vencimento: "2026-06-10" }],
    pagar: [{ valor: 15, status: "pendente", vencimento: "20/06/2026" }],
    sessoes: [{ status: "fechada", saldoFinal: 100, saldoContado: 101 }],
    operacoes: [{ tipo: "sangria", valor: 5 }],
    falhas: [],
  }

  it("cada arquivo do ZIP tem exatamente o sha256 declarado no manifesto", async () => {
    const dados = montarDados(fontes, competencia)
    const checklist = montarChecklistFechamento({ dados, competencia, agora })
    const pacote = montarConteudoPacote({ dados, checklist, competencia, agora, storeId: "loja-1" })

    const bytes = await ziparArquivos(pacote.arquivos, agora)
    const zip = await JSZip.loadAsync(bytes)

    // Todos os arquivos montados estão no ZIP.
    for (const arquivo of pacote.arquivos) {
      expect(zip.file(arquivo.caminho), `ZIP sem ${arquivo.caminho}`).toBeTruthy()
    }

    // Os hashes do manifesto (que exclui manifest.json) batem com o conteúdo no ZIP.
    for (const entrada of pacote.manifesto.arquivos) {
      const conteudo = await zip.file(entrada.caminho)!.async("string")
      expect(sha256Hex(conteudo), `hash ${entrada.caminho}`).toBe(entrada.sha256)
    }
  })
})
