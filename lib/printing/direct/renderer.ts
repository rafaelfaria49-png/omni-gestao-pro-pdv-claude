import { buildPdvReceiptEscPos, concatBytes, escposAlign, escposBold, escposInit, line, type PdvReceiptInput } from "@/lib/escpos"
import { PDV_NON_FISCAL_EXPLANATION, PDV_NON_FISCAL_NOTICE } from "@/lib/pdv-non-fiscal-notice"
import { byteHash } from "./codec"
import { check } from "./db"

export const RENDERER_VERSION = "escpos-nonfiscal-004c-v1"
export type ThermalProfile = { id: "THERMAL_58" | "THERMAL_80"; version: 1; columns: 32 | 48 }
export const THERMAL_PROFILES: Readonly<Record<"THERMAL_58" | "THERMAL_80", ThermalProfile>> = Object.freeze({
  THERMAL_58: Object.freeze({ id: "THERMAL_58" as const, version: 1 as const, columns: 32 as const }),
  THERMAL_80: Object.freeze({ id: "THERMAL_80" as const, version: 1 as const, columns: 48 as const }),
})
export type CopyMark = { kind: "INITIAL" | "REPRINT"; ordinal: number; count: number }

function markLabel(mark: CopyMark): string | null {
  check(Number.isSafeInteger(mark.ordinal) && Number.isSafeInteger(mark.count) && mark.ordinal >= 1 && mark.ordinal <= mark.count && mark.count <= 2, "INVALID_COPY", 500)
  if (mark.kind === "REPRINT") return `SEGUNDA VIA - REIMPRESSAO ${mark.ordinal}/${mark.count}`
  return mark.count > 1 ? `VIA ${mark.ordinal}/${mark.count}` : null
}

function wrap(text: string, columns: number): string {
  const out: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    let line = ""
    for (const word of raw.trim().split(/\s+/).filter(Boolean)) {
      for (let w = word; w.length > 0; w = w.slice(columns)) {
        const piece = w.slice(0, columns)
        if (!line) line = piece
        else if (line.length + 1 + piece.length <= columns) line += " " + piece
        else { out.push(line); line = piece }
      }
    }
    if (line) out.push(line)
  }
  return out.join("\n")
}

/** Deterministic: identical snapshot + profile + mark → identical bytes (P06). No drawer command is ever emitted. */
export function renderReceipt(input: PdvReceiptInput, profileId: string, mode: "simplificado" | "completo", mark: CopyMark): Uint8Array {
  const profile = THERMAL_PROFILES[profileId as keyof typeof THERMAL_PROFILES]
  check(profile, "THERMAL_PROFILE_UNSUPPORTED", 400)
  // The shared builder truncates the footer at 48 chars; pre-wrap it to the real column count (58 mm = 32).
  const body = buildPdvReceiptEscPos({ ...input, receiptFooter: wrap(input.receiptFooter ?? "", profile.columns) }, { maxChars: profile.columns, modo: mode })
  const label = markLabel(mark)
  const bytes = label ? concatBytes(escposInit(), escposAlign(1), escposBold(true), line(label), escposBold(false), body) : body
  validateEscPos(bytes)
  return bytes
}

/**
 * Allow-list of the exact ESC/POS subset this renderer emits. Anything else (ESC p drawer kick,
 * DLE real-time commands, GS ( extended functions, raw C0 controls, NV images…) is refused.
 * The local agent runs the same check before touching the spooler.
 */
export function validateEscPos(bytes: Uint8Array): void {
  let i = 0
  let cut = false
  while (i < bytes.length) {
    const b = bytes[i]
    if (b === 0x0a || (b >= 0x20 && b !== 0x7f)) { i++; continue }
    if (b === 0x1b) {
      const c = bytes[i + 1], n = bytes[i + 2]
      if (c === 0x40) { i += 2; continue }
      if (c === 0x74 && n === 16) { i += 3; continue }
      if (c === 0x61 && n !== undefined && n <= 2) { i += 3; continue }
      if (c === 0x45 && (n === 0 || n === 1)) { i += 3; continue }
      if (c === 0x64 && n !== undefined && n <= 10) { i += 3; continue }
      throw new Error("ESCPOS_COMMAND_REFUSED")
    }
    if (b === 0x1d && bytes[i + 1] === 0x56 && bytes[i + 2] === 0x00) { cut = true; i += 3; continue }
    throw new Error("ESCPOS_COMMAND_REFUSED")
  }
  if (!cut || bytes.length === 0) throw new Error("ESCPOS_CUT_REQUIRED")
}

export const payloadHash = byteHash

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

/**
 * Browser print chosen explicitly by the operator (P2-4). Server-rendered from the confirmed sale; every value escaped;
 * no script, no external resource. The mark tells whether another copy may already exist.
 */
export function renderBrowserHtml(input: PdvReceiptInput, mode: "simplificado" | "completo", mark: string): string {
  const row = (k: string, v: string) => `<div class="r"><span>${esc(k)}</span><span>${esc(v)}</span></div>`
  const items = mode === "simplificado" ? `<p>${input.itens.length} item(ns)</p>`
    : input.itens.map(i => row(`${i.quantity}x ${i.name}`, brl(i.lineTotal))).join("")
  const pays = (input.pagamentos ?? []).map(p => row(p.label, brl(p.valor))).join("")
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Comprovante não fiscal</title>` +
    `<style>@page{size:80mm auto;margin:0}body{font:12px ui-monospace,Consolas,monospace;margin:0;padding:3mm;color:#000;background:#fff;width:72mm}` +
    `.c{text-align:center}.b{font-weight:700}.r{display:flex;justify-content:space-between;gap:6px}hr{border:0;border-top:1px dashed #000}</style></head><body>` +
    `<p class="c b">${esc(mark)}</p><p class="c b">${esc(input.nomeFantasia)}</p><p class="c">CNPJ: ${esc(input.cnpj)}</p>` +
    (input.enderecoLinha ? `<p class="c">${esc(input.enderecoLinha)}</p>` : "") +
    `<hr><p class="c b">${esc(PDV_NON_FISCAL_NOTICE)}</p><p class="c">${esc(PDV_NON_FISCAL_EXPLANATION)}</p><hr>` +
    (input.numeroVenda ? row("Venda", input.numeroVenda) : "") + row("Data", input.dataHora) +
    (input.operador ? row("Operador", input.operador) : "") + (input.clienteNome ? row("Cliente", input.clienteNome) : "") +
    `<hr>${items}<hr>` + row("Subtotal", brl(input.subtotal)) + (input.discount > 0 ? row("Desconto", brl(input.discount)) : "") +
    `<div class="b">${row("Valor final pago", brl(input.total))}</div>` + (pays ? `<hr>${pays}` : "") +
    (input.troco ? row("Troco", brl(input.troco)) : "") +
    (input.receiptFooter ? `<hr><p class="c">${esc(input.receiptFooter).replace(/\n/g, "<br>")}</p>` : "") +
    `<p class="c">Obrigado!</p></body></html>`
}
