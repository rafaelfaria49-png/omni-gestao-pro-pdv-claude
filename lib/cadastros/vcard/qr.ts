/**
 * QR Code de contato → importador vCard existente. Puro: sem rede, sem DOM, sem
 * storage. Decide se a imagem pode ser processada (pelo conteúdo, não pela
 * extensão/MIME), converte o resultado do decodificador em texto e entrega SÓ
 * vCard ao parser canônico (`parseVcardBytes`/`parseVcardText`). Link, PIX,
 * Wi-Fi, MECARD, texto comum ou desconhecido recebem recusa honesta, sem nunca
 * abrir, executar ou ecoar o conteúdo.
 */
import { VCARD_ERROR_MESSAGES, parseVcardBytes, parseVcardText, type VcardParseResult } from "./parser"

/** Limites de PRODUTO, exibidos na UI e cobertos por testes. */
export const QR_LIMITS = {
  /** Arquivo de imagem, checado antes da leitura. */
  maxImageBytes: 10 * 1024 * 1024,
  /** Largura ou altura declarada no cabeçalho da imagem. */
  maxImageSide: 10_000,
  /** Área declarada no cabeçalho (antes de decodificar os pixels). */
  maxImagePixels: 36_000_000,
  /** Maior lado efetivamente processado (a imagem é reduzida antes da leitura). */
  maxProcessedSide: 1600,
  /** Maior lado processado por quadro da câmera. */
  maxCameraSide: 960,
  /** Conteúdo decodificado; um QR Code comporta no máximo 2.953 bytes. */
  maxPayloadBytes: 4096,
  /** Intervalo mínimo entre leituras de quadros da câmera. */
  cameraIntervalMs: 250,
  /** A câmera desliga sozinha depois deste tempo sem QR reconhecido. */
  maxCameraMs: 60_000,
} as const

export type QrErrorCode =
  | "IMAGE_TOO_LARGE" | "IMAGE_FORMAT" | "IMAGE_DIMENSIONS" | "IMAGE_CORRUPT" | "NOT_FOUND" | "MULTIPLE"
  | "PAYLOAD_TOO_LARGE" | "ENCODING" | "LINK" | "PIX" | "WIFI" | "MECARD" | "TEXT" | "UNKNOWN"
  | "CAMERA_UNSUPPORTED" | "CAMERA_DENIED" | "CAMERA_NOT_FOUND" | "CAMERA_BUSY" | "CAMERA_FAILED" | "CAMERA_TIMEOUT" | "CAMERA_HIDDEN"
  | "DECODER_UNAVAILABLE" | "IMAGE_READ" | "CROWDED"

const ALTERNATIVES = "Use “Escolher imagem de QR Code”, o arquivo .vcf ou cole o conteúdo do vCard."
const INCOMPATIBLE = "Este QR Code não é um contato vCard 3.0 ou 4.0"
export const QR_ERROR_MESSAGES: Record<QrErrorCode, string> = {
  IMAGE_TOO_LARGE: "A imagem passa de 10 MiB. Recorte ou reduza a foto do QR Code e tente de novo.",
  IMAGE_FORMAT: "O arquivo não é uma imagem PNG, JPG ou WebP válida.",
  IMAGE_DIMENSIONS: "A imagem é grande demais (mais de 10.000 px de lado ou 36 megapixels). Recorte ou reduza a foto do QR Code.",
  IMAGE_CORRUPT: "Não foi possível abrir a imagem: o arquivo parece corrompido. Escolha outra imagem.",
  NOT_FOUND: "Nenhum QR Code foi reconhecido na imagem. Use uma imagem nítida, com o QR Code inteiro e bem iluminado.",
  MULTIPLE: "Há mais de um QR Code na imagem. Use uma imagem só com o QR Code do contato.",
  PAYLOAD_TOO_LARGE: "O conteúdo do QR Code passa do limite desta importação.",
  ENCODING: `${INCOMPATIBLE} em UTF-8. Gere o QR Code do contato novamente.`,
  LINK: `${INCOMPATIBLE}: ele contém um link ou endereço de outro aplicativo. O link não foi aberto.`,
  PIX: `${INCOMPATIBLE}: ele contém uma cobrança PIX. Nada foi pago nem registrado.`,
  WIFI: `${INCOMPATIBLE}: ele contém dados de rede Wi-Fi. Nada foi configurado.`,
  MECARD: `${INCOMPATIBLE}: ele está no formato MECARD, que não é suportado. Gere o QR Code do contato como vCard.`,
  TEXT: `${INCOMPATIBLE}: ele contém texto comum.`,
  UNKNOWN: `${INCOMPATIBLE}: o conteúdo não foi reconhecido.`,
  CAMERA_UNSUPPORTED: `Este navegador não oferece câmera para esta página. ${ALTERNATIVES}`,
  CAMERA_DENIED: `A permissão da câmera foi negada. Libere a câmera nas configurações do navegador ou ${ALTERNATIVES.charAt(0).toLowerCase()}${ALTERNATIVES.slice(1)}`,
  CAMERA_NOT_FOUND: `Nenhuma câmera disponível neste dispositivo. ${ALTERNATIVES}`,
  CAMERA_BUSY: `A câmera está em uso por outro aplicativo ou não respondeu. Feche o outro uso e tente novamente, ou ${ALTERNATIVES.charAt(0).toLowerCase()}${ALTERNATIVES.slice(1)}`,
  CAMERA_FAILED: `A câmera parou de responder e foi desligada. Tente novamente ou ${ALTERNATIVES.charAt(0).toLowerCase()}${ALTERNATIVES.slice(1)}`,
  CAMERA_TIMEOUT: "Nenhum QR Code reconhecido em 60 segundos: a câmera foi desligada. Tente novamente com o QR Code mais perto e iluminado.",
  CAMERA_HIDDEN: "A câmera foi desligada porque a página saiu da tela. Tente novamente quando quiser.",
  DECODER_UNAVAILABLE: "Não foi possível carregar o leitor de QR Code deste aplicativo. Recarregue a página e tente de novo, ou importe o arquivo .vcf.",
  IMAGE_READ: "Não foi possível ler o arquivo da imagem. Selecione-o novamente.",
  CROWDED: "A imagem tem elementos demais para conferir que há um único QR Code. Recorte a imagem (ou enquadre a câmera) só no QR Code do contato.",
}

export type QrReadResult = VcardParseResult | { ok: false; code: QrErrorCode; message: string }
export const qrFail = (code: QrErrorCode): { ok: false; code: QrErrorCode; message: string } => ({ ok: false, code, message: QR_ERROR_MESSAGES[code] })

export type ImageFormat = "png" | "jpeg" | "webp"
export type ImageInfo = { ok: true; format: ImageFormat; mime: string; width: number; height: number } | { ok: false; code: QrErrorCode }

const MIME: Record<ImageFormat, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" }
const be16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1]
const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8)
const le24 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
const ascii = (b: Uint8Array, i: number, s: string) => [...s].every((ch, k) => b[i + k] === ch.charCodeAt(0))

/**
 * Formato e dimensões lidos do CABEÇALHO, sem decodificar pixels: imagem
 * desproporcional é recusada antes de ocupar memória.
 */
export function inspectImage(bytes: Uint8Array): ImageInfo {
  if (bytes.byteLength > QR_LIMITS.maxImageBytes) return { ok: false, code: "IMAGE_TOO_LARGE" }
  const size = sizeOf(bytes)
  if (!size) return { ok: false, code: "IMAGE_FORMAT" }
  if ("corrupt" in size) return { ok: false, code: "IMAGE_CORRUPT" }
  const { format, width, height } = size
  if (!width || !height) return { ok: false, code: "IMAGE_CORRUPT" }
  if (width > QR_LIMITS.maxImageSide || height > QR_LIMITS.maxImageSide || width * height > QR_LIMITS.maxImagePixels) return { ok: false, code: "IMAGE_DIMENSIONS" }
  return { ok: true, format, mime: MIME[format], width, height }
}

function sizeOf(b: Uint8Array): { format: ImageFormat; width: number; height: number } | { corrupt: true } | null {
  if (b.byteLength >= 8 && be32(b, 0) === 0x89504e47 && be32(b, 4) === 0x0d0a1a0a) {
    if (b.byteLength < 24 || !ascii(b, 12, "IHDR")) return { corrupt: true }
    return { format: "png", width: be32(b, 16), height: be32(b, 20) }
  }
  if (b.byteLength >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return jpegSize(b)
  if (b.byteLength >= 12 && ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) {
    if (b.byteLength < 30) return { corrupt: true }
    if (ascii(b, 12, "VP8X")) return { format: "webp", width: le24(b, 24) + 1, height: le24(b, 27) + 1 }
    if (ascii(b, 12, "VP8L")) {
      if (b[20] !== 0x2f) return { corrupt: true }
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
      return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
    }
    if (ascii(b, 12, "VP8 ")) {
      if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return { corrupt: true }
      return { format: "webp", width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff }
    }
    return { corrupt: true }
  }
  return null
}

/** Percorre os segmentos até o SOF (linear, limitado ao tamanho do arquivo). */
function jpegSize(b: Uint8Array): { format: "jpeg"; width: number; height: number } | { corrupt: true } {
  let i = 2
  while (i + 3 < b.byteLength) {
    if (b[i] !== 0xff) return { corrupt: true }
    const marker = b[i + 1]
    if (marker === 0xff) { i++; continue }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
    if (marker === 0xd9 || marker === 0xda) return { corrupt: true }
    const length = be16(b, i + 2)
    if (length < 2) return { corrupt: true }
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (sof) {
      if (i + 8 >= b.byteLength) return { corrupt: true }
      return { format: "jpeg", height: be16(b, i + 5), width: be16(b, i + 7) }
    }
    i += 2 + length
  }
  return { corrupt: true }
}

/** Lado a lado, reduzido proporcionalmente para no máximo `maxSide` (nunca ampliado). */
export function scaledSize(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Saída do decodificador local: bytes exatos do QR (com o modo de cada trecho) ou texto do detector nativo. */
export type QrPayload =
  | { source: "bytes"; bytes: Uint8Array; kanji: boolean; eci: number[] }
  | { source: "text"; text: string }

type JsQrChunk = { type: string; assignmentNumber?: number }
type JsQrPoint = { x: number; y: number }
type JsQrResult = {
  binaryData: number[]; chunks: JsQrChunk[]
  location?: { topLeftCorner: JsQrPoint; topRightCorner: JsQrPoint; bottomLeftCorner: JsQrPoint; bottomRightCorner: JsQrPoint }
} | null
export type JsQrFn = (data: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst" }) => JsQrResult
type Pixels = { data: Uint8ClampedArray; width: number; height: number }

/** Decodifica pixels RGBA com o jsQR já carregado (um QR, o primeiro que ele achar). */
export function decodePixels(jsQR: JsQrFn, pixels: Pixels, invert = true): QrPayload | null {
  const code = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: invert ? "attemptBoth" : "dontInvert" })
  return code ? toPayload(code) : null
}

/** Busca de um segundo QR: regiões separadas por faixas uniformes, com teto de leituras. */
const SECOND_SEARCH = { maxRegions: 16, minRegionSide: 21, depth: 4 } as const
type Rect = { x: number; y: number; w: number; h: number }

/**
 * Um QR e só um. Depois do primeiro, a área dele é coberta com a cor do fundo e o
 * restante é lido de novo: a imagem inteira e, como o jsQR se confunde com dois QRs do
 * mesmo tamanho, cada região separada por faixas uniformes (a zona de silêncio que todo
 * QR tem), por cortes XY recursivos, com teto de regiões: passar do teto = recusa pedindo
 * recorte (nunca aceitar sem ter conferido tudo). Qualquer outro QR = recusa,
 * inclusive cópia idêntica: com A, A e B, aceitar A esconderia B (escolha arbitrária).
 * Limite: QRs encostados sem faixa uniforme entre eles (ex.: foto com fundo) podem não ser
 * achados; aí vale a revisão humana da prévia.
 */
export function decodeSinglePixels(jsQR: JsQrFn, pixels: Pixels, invert = true): QrPayload | { multiple: true } | { crowded: true } | null {
  const options = { inversionAttempts: invert ? "attemptBoth" as const : "dontInvert" as const }
  const first = jsQR(pixels.data, pixels.width, pixels.height, options)
  if (!first) return null
  const payload = toPayload(first)
  if (!first.location) return payload
  const { width, height } = pixels
  const dark = new Uint8Array(width * height)
  for (let i = 0; i < dark.length; i++) dark[i] = pixels.data[i * 4] + pixels.data[i * 4 + 1] + pixels.data[i * 4 + 2] < 384 ? 1 : 0
  // Fundo = classe predominante na borda (QR escuro em papel claro ou o inverso).
  let border = 0, darkBorder = 0
  for (let x = 0; x < width; x++) { darkBorder += dark[x] + dark[(height - 1) * width + x]; border += 2 }
  for (let y = 0; y < height; y++) { darkBorder += dark[y * width] + dark[y * width + width - 1]; border += 2 }
  const bg = darkBorder * 2 > border ? 1 : 0
  const corners = [first.location.topLeftCorner, first.location.topRightCorner, first.location.bottomLeftCorner, first.location.bottomRightCorner]
  const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y)
  const pad = Math.ceil(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.04) + 2
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - pad), x1 = Math.min(width, Math.ceil(Math.max(...xs)) + pad)
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - pad), y1 = Math.min(height, Math.ceil(Math.max(...ys)) + pad)
  const masked = new Uint8ClampedArray(pixels.data)
  const fill = bg ? 0 : 255
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) { masked.fill(fill, (y * width + x) * 4, (y * width + x) * 4 + 3); dark[y * width + x] = bg }
  }
  if (jsQR(masked, width, height, options)) return { multiple: true }
  const regions = uniformCuts(dark, width, bg, { x: 0, y: 0, w: width, h: height }, SECOND_SEARCH.depth).filter((r) => r.w !== width || r.h !== height)
  // Sem orçamento para conferir todas as regiões: recusa pedindo recorte, nunca aceita no escuro.
  if (regions.length > SECOND_SEARCH.maxRegions) return { crowded: true }
  for (const r of regions) {
    const crop = new Uint8ClampedArray(r.w * r.h * 4)
    for (let y = 0; y < r.h; y++) crop.set(masked.subarray(((r.y + y) * width + r.x) * 4, ((r.y + y) * width + r.x + r.w) * 4), y * r.w * 4)
    if (jsQR(crop, r.w, r.h, options)) return { multiple: true }
  }
  return payload
}

/** Corte XY: separa por colunas e depois linhas inteiramente do fundo; ignora regiões pequenas demais para um QR. */
function uniformCuts(dark: Uint8Array, width: number, bg: number, r: Rect, depth: number): Rect[] {
  const split = (horizontal: boolean): Rect[] => {
    const len = horizontal ? r.w : r.h, span = horizontal ? r.h : r.w
    const parts: Rect[] = []
    let start = -1
    for (let i = 0; i <= len; i++) {
      let uniform = i === len
      if (!uniform) {
        uniform = true
        for (let j = 0; j < span && uniform; j++) {
          const x = horizontal ? r.x + i : r.x + j, y = horizontal ? r.y + j : r.y + i
          if (dark[y * width + x] !== bg) uniform = false
        }
      }
      if (!uniform && start < 0) start = i
      if (uniform && start >= 0) {
        // Margem de 4 px ao redor: o jsQR precisa de um pouco de zona de silêncio.
        const a = Math.max(0, start - 4), b = Math.min(len, i + 4)
        parts.push(horizontal ? { x: r.x + a, y: r.y, w: b - a, h: r.h } : { x: r.x, y: r.y + a, w: r.w, h: b - a })
        start = -1
      }
    }
    return parts
  }
  const big = (p: Rect) => p.w >= SECOND_SEARCH.minRegionSide && p.h >= SECOND_SEARCH.minRegionSide
  for (const horizontal of [true, false]) {
    const parts = split(horizontal).filter(big)
    if (parts.length > 1 || (parts.length === 1 && (parts[0].w < r.w - 8 || parts[0].h < r.h - 8))) {
      return depth > 0 ? parts.flatMap((p) => uniformCuts(dark, width, bg, p, depth - 1)) : parts
    }
  }
  return big(r) ? [r] : []
}

function toPayload(code: NonNullable<JsQrResult>): QrPayload {
  return {
    source: "bytes",
    bytes: Uint8Array.from(code.binaryData),
    kanji: code.chunks.some((c) => c.type === "kanji"),
    eci: code.chunks.filter((c) => c.type === "eci").map((c) => c.assignmentNumber ?? -1),
  }
}

/** ECI 26 = UTF-8 (ISO/IEC 18004). */
const UTF8_ECI = 26
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
/** Esquemas sem "//" que abrem outro aplicativo; "Obs: ..." continua sendo texto comum. */
const LINK_SCHEMES = /^(mailto|tel|sms|smsto|mms|geo|market|intent|otpauth|bitcoin|ethereum|whatsapp|tg|javascript|data|file|blob|about):/i

type Kind = "VCARD" | Exclude<QrErrorCode, `IMAGE_${string}` | `CAMERA_${string}` | "NOT_FOUND" | "MULTIPLE" | "PAYLOAD_TOO_LARGE" | "ENCODING" | "DECODER_UNAVAILABLE" | "IMAGE_READ" | "CROWDED">
/** Só a CATEGORIA do conteúdo; o conteúdo nunca é aberto, executado nem exibido. */
export function classifyQrText(text: string): Kind {
  const t = text.replace(/^﻿/, "").trimStart()
  if (/^BEGIN:VCARD/i.test(t)) return "VCARD"
  if (/^MECARD:/i.test(t)) return "MECARD"
  if (/^WIFI:/i.test(t)) return "WIFI"
  // BR Code (EMV): payload format "000201" + GUI do PIX.
  if (/^000201/.test(t) && /br\.gov\.bcb\.pix/i.test(t)) return "PIX"
  if (/^(www\.|[a-z][a-z0-9+.-]{0,31}:\/\/)/i.test(t) || LINK_SCHEMES.test(t)) return "LINK"
  if (!t.trim() || CONTROL.test(t) || t.includes("�")) return "UNKNOWN"
  return "TEXT"
}

/**
 * Texto decodificado pelo SISTEMA (detector nativo) com bytes UTF-8 lidos como
 * Latin-1 vira "Ã©" no lugar de "é". Esse padrão exato é recusado: nunca corrigir
 * acento por suposição.
 */
function looksMisdecoded(text: string): boolean {
  if (!/[\u0080-ÿ]/.test(text) || /[^\u0000-ÿ]/.test(text)) return false
  try { new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(text, (c) => c.charCodeAt(0))); return true } catch { return false }
}

/** Conteúdo do QR → mesmo resultado que o importador de arquivo/texto colado já trata. */
export function qrPayloadToVcard(payload: QrPayload): QrReadResult {
  if (payload.source === "text") {
    const text = payload.text
    if (typeof text !== "string" || text.length > QR_LIMITS.maxPayloadBytes || new TextEncoder().encode(text).byteLength > QR_LIMITS.maxPayloadBytes) return qrFail("PAYLOAD_TOO_LARGE")
    const kind = classifyQrText(text)
    if (kind !== "VCARD") return qrFail(kind)
    if (text.includes("�") || looksMisdecoded(text)) return qrFail("ENCODING")
    return parseVcardText(text)
  }
  const { bytes } = payload
  if (bytes.byteLength > QR_LIMITS.maxPayloadBytes) return qrFail("PAYLOAD_TOO_LARGE")
  if (!bytes.byteLength) return qrFail("UNKNOWN")
  let text: string | null
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes) } catch { text = null }
  // Categoria pelo prefixo ASCII, mesmo que o resto não seja UTF-8.
  const kind = classifyQrText(text ?? Array.from(bytes.subarray(0, 64), (b) => (b < 0x80 ? String.fromCharCode(b) : "�")).join(""))
  if (kind !== "VCARD") return qrFail(kind === "UNKNOWN" && text === null ? "ENCODING" : kind)
  const nonAscii = bytes.some((b) => b >= 0x80)
  // Kanji (Shift-JIS) ou ECI diferente de UTF-8 com bytes não ASCII: outra codificação, recusa explícita.
  if (text === null || payload.kanji || (nonAscii && payload.eci.some((n) => n !== UTF8_ECI))) return { ok: false, code: "ENCODING", message: VCARD_ERROR_MESSAGES.ENCODING }
  return parseVcardBytes(bytes)
}
