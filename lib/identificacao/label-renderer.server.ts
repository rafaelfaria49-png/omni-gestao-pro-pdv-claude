import "server-only"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { PDFDocument, rgb, type PDFFont } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import bwipjs from "bwip-js/node"
import { snapshotSchema, type LabelItem, type LabelSnapshot } from "./contracts"

const PT_MM = 72 / 25.4
const FONT_PATH = path.join(process.cwd(), "lib/identificacao/assets/NotoSans-Regular.ttf")
let fontBytes: Promise<Uint8Array> | undefined
const fontData = () => fontBytes ??= readFile(FONT_PATH).catch(e => { fontBytes = undefined; throw e })
type TextLine = { text: string; x: number; baseline: number; size: number }
type Rect = { x: number; top: number; width: number; height: number }
type Layout = { lines: TextLine[]; bars: Rect[] }
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

/** O mesmo plano geométrico alimenta PDF e SVG/print; nenhum barcode de API/imagem remota. */
function layout(item: LabelItem, snapshot: LabelSnapshot, font: PDFFont): Layout {
  const m = snapshot.media, margin = m.marginMm * PT_MM, width = (m.widthMm - 2 * m.marginMm) * PT_MM
  const charset = new Set(font.getCharacterSet())
  const clean = (v: string) => v.replace(/\s+/gu, " ").trim()
  const fit = (raw: string, size: number) => {
    const chars = Array.from(clean(raw))
    // Validar antes de truncar: não ocultar caracteres sem suporte fora da área visível.
    if (chars.some(c => !charset.has(c.codePointAt(0)!))) throw new Error("LABEL_UNSUPPORTED_GLYPH: revise os caracteres do nome/SKU/cor/tamanho antes de gerar a etiqueta.")
    if (font.widthOfTextAtSize(chars.join(""), size) <= width) return chars.join("")
    while (chars.length && font.widthOfTextAtSize(chars.join("") + "…", size) > width) chars.pop()
    return chars.join("") + "…"
  }
  const labels = [
    { raw: item.nome, size: 8.5 },
    { raw: `SKU: ${item.sku || "não informado"}`, size: 7 },
    { raw: item.varianteId ? `Cor: ${item.cor} · Tamanho: ${item.tamanho}` : "Produto simples", size: 7 },
    ...(m.showPrice ? [{ raw: `R$ ${Math.floor(item.precoCentavos! / 100).toLocaleString("pt-BR")},${String(item.precoCentavos! % 100).padStart(2, "0")}`, size: 8.5 }] : []),
  ]
  const lines: TextLine[] = labels.map((l, i) => ({ text: fit(l.raw, l.size), size: l.size, x: margin, baseline: margin + (2.7 + i * 3) * PT_MM }))
  const raw = bwipjs.raw({ bcid: "code128", text: item.codigo, includetext: false })[0]
  if (!raw || !("sbs" in raw)) throw new Error("LABEL_ENCODER_CONTRACT_CHANGED")
  const modules = raw.sbs.reduce((n, x) => n + x, 0)
  const moduleWidth = width / (modules + 20) // Code128: dez módulos de silêncio em cada margem.
  let x = margin + 10 * moduleWidth
  const top = (m.heightMm - m.marginMm - 4 - m.barcodeHeightMm) * PT_MM
  const bars: Rect[] = []
  raw.sbs.forEach((n, i) => {
    if (i % 2 === 0) bars.push({ x, top, width: n * moduleWidth, height: m.barcodeHeightMm * PT_MM })
    x += n * moduleWidth
  })
  const codeSize = 7
  lines.push({ text: item.codigo, size: codeSize, x: (m.widthMm * PT_MM - font.widthOfTextAtSize(item.codigo, codeSize)) / 2,
    baseline: (m.heightMm - m.marginMm - 0.8) * PT_MM })
  return { lines, bars }
}
async function document(snapshotInput: unknown) {
  const snapshot = snapshotSchema.parse(snapshotInput)
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const bytes = await fontData()
  const font = await pdf.embedFont(bytes, { subset: true })
  return { snapshot, pdf, font, bytes }
}
export async function renderLabelsPdf(input: unknown): Promise<Uint8Array> {
  const { snapshot, pdf, font } = await document(input)
  pdf.setTitle("Etiquetas de identificação OmniGestão")
  pdf.setCreator("OmniGestão P03")
  pdf.setProducer("OmniGestão / pdf-lib")
  pdf.setCreationDate(new Date(snapshot.createdAt)); pdf.setModificationDate(new Date(snapshot.createdAt))
  const width = snapshot.media.widthMm * PT_MM, height = snapshot.media.heightMm * PT_MM
  for (const item of snapshot.items) {
    const plan = layout(item, snapshot, font)
    for (let count = 0; count < item.quantidade; count++) {
      const page = pdf.addPage([width, height])
      plan.lines.forEach(l => page.drawText(l.text, { x: l.x, y: height - l.baseline, size: l.size, font, color: rgb(0, 0, 0) }))
      plan.bars.forEach(b => page.drawRectangle({ x: b.x, y: height - b.top - b.height, width: b.width, height: b.height, color: rgb(0, 0, 0) }))
    }
  }
  return pdf.save({ useObjectStreams: false, addDefaultPage: false })
}
export async function renderLabelsHtml(input: unknown): Promise<string> {
  const { snapshot, font, bytes } = await document(input)
  const m = snapshot.media, width = m.widthMm * PT_MM, height = m.heightMm * PT_MM
  const pages = snapshot.items.flatMap(item => {
    const p = layout(item, snapshot, font)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escape(item.nome)}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="white"/>${p.bars.map(b => `<rect x="${b.x}" y="${b.top}" width="${b.width}" height="${b.height}"/>`).join("")}${p.lines.map(l => `<text x="${l.x}" y="${l.baseline}" font-size="${l.size}">${escape(l.text)}</text>`).join("")}</svg>`
    return Array.from({ length: item.quantidade }, () => `<section class="label">${svg}</section>`)
  }).join("")
  // Sem script, handlers ou recurso de rede; o cliente controla a solicitação de diálogo.
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:;"><title>Etiquetas — prévia de impressão</title><style>@font-face{font-family:LabelNoto;src:url(data:font/ttf;base64,${Buffer.from(bytes).toString("base64")})}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#eceff2}svg{width:100%;height:100%;font-family:LabelNoto;fill:#000}.label{background:white;width:${m.widthMm}mm;height:${m.heightMm}mm;break-after:page;page-break-after:always;overflow:hidden;margin:10px auto}.label:last-child{break-after:auto;page-break-after:auto}@page{size:${m.widthMm}mm ${m.heightMm}mm;margin:0}@media print{html,body{background:white}.label{margin:0}}</style></head><body>${pages}</body></html>`
}
