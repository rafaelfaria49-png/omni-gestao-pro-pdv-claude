/**
 * QR Codes SINTÉTICOS para testes (Node): conteúdo gerado aqui, sem contato real.
 * `qrcode-generator` (devDependency) monta a matriz; os pixels e o PNG são
 * escritos por este arquivo, sem canvas e sem rede.
 */
import { deflateSync } from "node:zlib"
import qrcode from "qrcode-generator"

const crlf = (lines: string[]) => lines.join("\r\n") + "\r\n"

export const QR_VCARD_30 = crlf([
  "BEGIN:VCARD", "VERSION:3.0", "FN:Lia Sintética do QR", "TEL;TYPE=CELL:(14) 99888-7766",
  "EMAIL:lia.qr@exemplo.invalid", "ADR;TYPE=HOME:;;Rua do QR Sintético\\, 10;Itaí;SP;;Brasil", "END:VCARD",
])
export const QR_VCARD_40 = crlf([
  "BEGIN:VCARD", "VERSION:4.0", "FN:João Ação Çedilha QR", "TEL;VALUE=uri;TYPE=cell:tel:+55-14-98777-6655",
  "EMAIL:joao.qr@exemplo.invalid", "END:VCARD",
])
export const QR_VCARD_21 = crlf(["BEGIN:VCARD", "VERSION:2.1", "FN:Versão Antiga QR", "END:VCARD"])
export const QR_URL = "https://exemplo.invalid/contato?ref=qr-sintetico"
export const QR_PIX = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913FULANO SINTET6008BRASILIA62070503***63041D3D"
export const QR_WIFI = "WIFI:T:WPA;S:RedeSintetica;P:senha-sintetica;;"
export const QR_MECARD = "MECARD:N:Sintética,Lia;TEL:14999887766;EMAIL:lia@exemplo.invalid;;"
export const QR_TEXT = "Obs: cliente sintético, ligar à tarde"

/** Bytes exatos no modo Byte do QR (UTF-8 por padrão; `Uint8Array` grava os bytes como estão). */
export function qrMatrix(content: string | Uint8Array, level: "L" | "M" | "Q" | "H" = "M"): boolean[][] {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content
  const factory = qrcode as unknown as { stringToBytes: (s: string) => number[] }
  const original = factory.stringToBytes
  factory.stringToBytes = (s: string) => Array.from(s, (c) => c.charCodeAt(0))
  try {
    const code = qrcode(0, level)
    code.addData(String.fromCharCode(...bytes), "Byte")
    code.make()
    const n = code.getModuleCount()
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => code.isDark(r, c)))
  } finally { factory.stringToBytes = original }
}

/** RGBA com zona de silêncio; `invert` gera QR claro sobre fundo escuro. */
export function qrRgba(content: string | Uint8Array, { scale = 4, margin = 4, invert = false } = {}) {
  const matrix = qrMatrix(content)
  const size = (matrix.length + margin * 2) * scale
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.floor(y / scale) - margin, c = Math.floor(x / scale) - margin
    const dark = r >= 0 && c >= 0 && r < matrix.length && c < matrix.length && matrix[r][c]
    const v = dark !== invert ? 0 : 255
    data.set([v, v, v, 255], (y * size + x) * 4)
  }
  return { data, width: size, height: size }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, body: Uint8Array) {
  const out = new Uint8Array(12 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  out.set(Array.from(type, (c) => c.charCodeAt(0)), 4)
  out.set(body, 8)
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)))
  return out
}
/** PNG em tons de cinza (8 bits) — encoder mínimo, suficiente para fixtures. */
export function pngFromGray(width: number, height: number, gray: (x: number, y: number) => number): Buffer {
  const raw = new Uint8Array((width + 1) * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = gray(x, y)
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width); view.setUint32(4, height)
  ihdr.set([8, 0, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array()),
  ])
}
export function qrPng(content: string | Uint8Array, options?: { scale?: number; margin?: number }): Buffer {
  const { data, width, height } = qrRgba(content, options)
  return pngFromGray(width, height, (x, y) => data[(y * width + x) * 4])
}
