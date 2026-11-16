import { mkdir, writeFile } from "node:fs/promises"
import { performance } from "node:perf_hooks"
import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"
import { DEFAULT_MEDIA, type LabelSnapshot } from "./contracts"
import { renderLabelsHtml, renderLabelsPdf } from "./label-renderer.server"

export function syntheticSnapshot(widthMm = 60, heightMm = 40): LabelSnapshot {
  return { version: 1, createdAt: "2026-11-16T12:00:00.000Z", media: { ...DEFAULT_MEDIA, widthMm, heightMm, barcodeHeightMm: heightMm === 30 ? 8 : 10, showPrice: true }, total: 2, items: [{
    produtoId: "qa-camiseta", varianteId: "qa-azul-m", nome: "Camiseta Algodão Orgânico — Edição São João com nome longo para conferir truncamento",
    sku: "CAM-AZUL-M", cor: "Azul Royal", tamanho: "M", updatedAt: "2026-11-16T12:00:00.000Z", variantVersion: 1,
    precoCentavos: 4990, codigoInterno: "OGV-012345678901", codigoInternoAtivo: true, codigoExistente: null,
    identificadorId: "qa-identificador", codigo: "OGV-012345678901", quantidade: 2,
  }] }
}
describe("etiquetas reais em PDF/HTML", () => {
  it("gera 50×30, 60×40 e 80×50 mm, congela bytes e registra amostras para decodificador independente", async () => {
    const dir = "test-results/vestuario-p03/pdf"
    await mkdir(dir, { recursive: true })
    const metrics = []
    const combined = await PDFDocument.create()
    for (const [w, h] of [[50, 30], [60, 40], [80, 50]]) {
      const snapshot = syntheticSnapshot(w, h)
      const start = performance.now()
      const bytes = await renderLabelsPdf(snapshot)
      metrics.push({ media: `${w}x${h}`, pages: snapshot.total, bytes: bytes.length, ms: Math.round(performance.now() - start), codigo: snapshot.items[0].codigo })
      expect(Buffer.from(bytes).equals(Buffer.from(await renderLabelsPdf(snapshot)))).toBe(true)
      const pdf = await PDFDocument.load(bytes)
      expect(pdf.getPageCount()).toBe(2)
      expect(pdf.getPage(0).getWidth()).toBeCloseTo(w * 72 / 25.4)
      expect(pdf.getPage(0).getHeight()).toBeCloseTo(h * 72 / 25.4)
      await writeFile(`${dir}/${w}x${h}.pdf`, bytes)
      for (const page of await combined.copyPages(pdf, pdf.getPageIndices())) combined.addPage(page)
    }
    await writeFile(`${dir}/metrics.json`, JSON.stringify(metrics, null, 2))
    await writeFile(`${dir}/AMOSTRA_QA_P03.pdf`, await combined.save())
  }, 60_000)
  it("escapa HTML, incorpora fonte local e não consulta recursos remotos", async () => {
    const snapshot = syntheticSnapshot()
    snapshot.items[0].nome = '<script>alert("x")</script> & Camiseta'
    const html = await renderLabelsHtml(snapshot)
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/)
    expect(html.match(/<section/g)).toHaveLength(2)
    expect(html).toContain("data:font/ttf;base64,")
  })
  it("processa o limite real de 500 etiquetas e registra CPU/bytes sem fila ou Chromium", async () => {
    const s = syntheticSnapshot(); s.total = 500
    const first = s.items[0]
    s.items = Array.from({ length: 5 }, (_, n) => ({ ...first, varianteId: `qa-${n}`, codigo: `OGV-${String(n).padStart(12, "0")}`, codigoInterno: `OGV-${String(n).padStart(12, "0")}`, identificadorId: `qa-id-${n}`, quantidade: 100 }))
    const start = performance.now(), cpu = process.cpuUsage()
    const bytes = await renderLabelsPdf(s)
    const used = process.cpuUsage(cpu)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(500)
    await mkdir("test-results/vestuario-p03/pdf", { recursive: true })
    await writeFile("test-results/vestuario-p03/pdf/max-batch-metrics.json", JSON.stringify({ pages: 500, targets: 5, bytes: bytes.length,
      wallMs: Math.round(performance.now() - start), cpuMs: (used.user + used.system) / 1000, runtime: process.version, physicalHomologation: "NOT_EXECUTED" }, null, 2))
  }, 60_000)
  it("recusa glyph sem suporte, mídia inválida e inconsistência de código/total", async () => {
    const s = syntheticSnapshot(); s.items[0].nome = "Camiseta 🦄"
    await expect(renderLabelsPdf(s)).rejects.toThrow(/LABEL_UNSUPPORTED_GLYPH/)
    await expect(renderLabelsPdf({ ...syntheticSnapshot(), total: 20 })).rejects.toThrow()
    await expect(renderLabelsPdf({ ...syntheticSnapshot(), media: { ...DEFAULT_MEDIA, widthMm: 10 } })).rejects.toThrow()
    const overlap = syntheticSnapshot(50, 30); overlap.media.barcodeHeightMm = 12
    await expect(renderLabelsPdf(overlap)).rejects.toThrow(/mídia precisa comportar/)
  })
})
