import { describe, expect, it } from "vitest"
import jsQRModule from "jsqr"
import { VCARD_ERROR_MESSAGES } from "./parser"
import {
  QR_ERROR_MESSAGES, QR_LIMITS, classifyQrText, decodePixels, decodeSinglePixels, inspectImage, qrPayloadToVcard, scaledSize, type JsQrFn, type QrPayload,
} from "./qr"
import { QR_MECARD, QR_PIX, QR_TEXT, QR_URL, QR_VCARD_21, QR_VCARD_30, QR_VCARD_40, QR_WIFI, pngFromGray, qrPng, qrRgba, qrRgbaRow } from "./__fixtures__/qr"

// O decodificador REAL (o mesmo que o app carrega sob demanda), sem mock do resultado.
const mod = jsQRModule as unknown as JsQrFn | { default: JsQrFn }
const jsQR: JsQrFn = typeof mod === "function" ? mod : mod.default
const read = (content: string | Uint8Array, opts?: Parameters<typeof qrRgba>[1]) => {
  const payload = decodePixels(jsQR, qrRgba(content, opts))
  if (!payload) throw new Error("QR não reconhecido")
  return payload
}
const contactsOf = (payload: QrPayload) => {
  const result = qrPayloadToVcard(payload)
  if (!result.ok) throw new Error(result.message)
  return result.contacts
}

describe("QR → decodificação local real → parser vCard canônico", () => {
  it("vCard 3.0: nome, telefone, email, endereço e acentos, byte a byte", () => {
    const payload = read(QR_VCARD_30)
    expect(payload.source).toBe("bytes")
    const [c] = contactsOf(payload)
    expect(c.version).toBe("3.0")
    expect(c.names).toEqual(["Lia Sintética do QR"])
    expect(c.phones.map((p) => p.value)).toEqual(["(14) 99888-7766"])
    expect(c.emails.map((e) => e.value)).toEqual(["lia.qr@exemplo.invalid"])
    expect(c.addresses[0]).toMatchObject({ street: "Rua do QR Sintético, 10", locality: "Itaí", region: "SP", country: "Brasil" })
  })

  it("vCard 4.0 com URI tel: e acentos", () => {
    const [c] = contactsOf(read(QR_VCARD_40))
    expect(c.version).toBe("4.0")
    expect(c.names).toEqual(["João Ação Çedilha QR"])
    expect(c.phones[0].value).toBe("+55-14-98777-6655")
  })

  it("QR claro sobre fundo escuro também é lido (imagem)", () => {
    expect(contactsOf(read(QR_VCARD_30, { invert: true }))[0].names).toEqual(["Lia Sintética do QR"])
  })

  it("as regras do vCard são as do parser: 2.1 recusado com a mesma mensagem", () => {
    expect(qrPayloadToVcard(read(QR_VCARD_21))).toEqual({ ok: false, code: "VERSION_21", message: VCARD_ERROR_MESSAGES.VERSION_21 })
  })

  it.each([
    ["link", QR_URL, "LINK"], ["PIX", QR_PIX, "PIX"], ["Wi-Fi", QR_WIFI, "WIFI"], ["MECARD", QR_MECARD, "MECARD"], ["texto comum", QR_TEXT, "TEXT"],
  ])("QR com %s: recusa honesta, sem ecoar o conteúdo", (_label, content, code) => {
    const result = qrPayloadToVcard(read(content))
    expect(result).toEqual({ ok: false, code, message: QR_ERROR_MESSAGES[code as keyof typeof QR_ERROR_MESSAGES] })
    if (!result.ok) for (const piece of ["exemplo.invalid", "RedeSintetica", "senha-sintetica", "FULANO", "Lia"]) expect(result.message).not.toContain(piece)
  })

  it("bytes que não são UTF-8 são recusados, nunca convertidos", () => {
    const latin1 = Uint8Array.from("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ita\xed\r\nEND:VCARD\r\n", (c) => c.charCodeAt(0))
    expect(qrPayloadToVcard(read(latin1))).toMatchObject({ ok: false, code: "ENCODING", message: VCARD_ERROR_MESSAGES.ENCODING })
    expect(qrPayloadToVcard(read(Uint8Array.from([0xff, 0xfe, 0x00, 0x41])))).toMatchObject({ ok: false, code: "ENCODING" })
  })

  it("modo Kanji ou ECI que não UTF-8 com acentos: recusa; ECI 26 (UTF-8) e ASCII puro: aceitos", () => {
    const bytes = new TextEncoder().encode(QR_VCARD_30)
    expect(qrPayloadToVcard({ source: "bytes", bytes, kanji: true, eci: [] })).toMatchObject({ ok: false, code: "ENCODING" })
    expect(qrPayloadToVcard({ source: "bytes", bytes, kanji: false, eci: [3] })).toMatchObject({ ok: false, code: "ENCODING" })
    expect(qrPayloadToVcard({ source: "bytes", bytes, kanji: false, eci: [26] }).ok).toBe(true)
    const ascii = new TextEncoder().encode("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ana Teste\r\nEND:VCARD\r\n")
    expect(qrPayloadToVcard({ source: "bytes", bytes: ascii, kanji: false, eci: [3] }).ok).toBe(true)
  })

  it("conteúdo acima do limite é recusado inteiro, sem corte", () => {
    const big = new Uint8Array(QR_LIMITS.maxPayloadBytes + 1).fill(0x41)
    expect(qrPayloadToVcard({ source: "bytes", bytes: big, kanji: false, eci: [] })).toMatchObject({ ok: false, code: "PAYLOAD_TOO_LARGE" })
    expect(qrPayloadToVcard({ source: "text", text: "B".repeat(QR_LIMITS.maxPayloadBytes + 1) })).toMatchObject({ ok: false, code: "PAYLOAD_TOO_LARGE" })
    expect(qrPayloadToVcard({ source: "bytes", bytes: new Uint8Array(), kanji: false, eci: [] })).toMatchObject({ ok: false, code: "UNKNOWN" })
  })

  it("mais de um QR na mesma imagem (diferentes, cópias ou A, A e B): recusa, nunca escolhe um deles; um só QR: aceito", () => {
    // Sem a segunda leitura, o jsQR devolve UM deles (aqui, o link): a escolha arbitrária que a recusa evita.
    const mixed = qrRgbaRow([QR_VCARD_30, QR_URL], { scales: [6, 2], gap: 100 })
    expect(decodePixels(jsQR, mixed)).toMatchObject({ source: "bytes" })
    expect(decodeSinglePixels(jsQR, mixed)).toEqual({ multiple: true })
    expect(decodeSinglePixels(jsQR, qrRgbaRow([QR_URL, QR_VCARD_30], { scales: [2, 6], gap: 100 }))).toEqual({ multiple: true })
    expect(decodeSinglePixels(jsQR, qrRgbaRow([QR_VCARD_30, QR_VCARD_40], { scales: [4, 3], gap: 150 }))).toEqual({ multiple: true })
    // Qualquer segundo QR é recusado, inclusive cópia idêntica: com A, A e B, aceitar A esconderia B (R2).
    expect(decodeSinglePixels(jsQR, qrRgbaRow([QR_VCARD_30, QR_VCARD_30], { scales: [4, 3], gap: 150 }))).toEqual({ multiple: true })
    expect(decodeSinglePixels(jsQR, qrRgbaRow([QR_VCARD_30, QR_VCARD_30, QR_URL], { scales: [5, 5, 2], gap: 120 }))).toEqual({ multiple: true })
    expect(decodeSinglePixels(jsQR, qrRgbaRow([QR_VCARD_40, QR_URL, QR_VCARD_40], { scales: [4, 2, 4], gap: 120 }))).toEqual({ multiple: true })
    // Claro sobre escuro: o fundo é detectado pela borda e a mesma busca vale.
    const inverted = qrRgbaRow([QR_VCARD_30, QR_VCARD_30, QR_URL], { scales: [5, 5, 2], gap: 120 })
    for (let i = 0; i < inverted.data.length; i += 4) inverted.data.fill(255 - inverted.data[i], i, i + 3)
    expect(decodeSinglePixels(jsQR, inverted)).toEqual({ multiple: true })
    // Dois do mesmo tamanho encostados: o jsQR não lê nenhum (vira "nenhum QR reconhecido").
    expect(decodeSinglePixels(jsQR, qrRgbaRow([QR_VCARD_30, QR_URL], { gap: 0 }))).toBeNull()
    const single = decodeSinglePixels(jsQR, qrRgba(QR_VCARD_30))
    expect(single && "source" in single && contactsOf(single)[0].names).toEqual(["Lia Sintética do QR"])
    expect(decodeSinglePixels(jsQR, { data: new Uint8ClampedArray(64 * 64 * 4).fill(255), width: 64, height: 64 })).toBeNull()
  })

  it("um QR cercado de 'texto' (blocos escuros que não são QR) não vira falso 'vários QRs'; imagem grande em tempo limitado", () => {
    const base = qrRgba(QR_VCARD_30, { scale: 6 })
    const width = base.width + 900, height = base.height + 300
    const data = new Uint8ClampedArray(width * height * 4).fill(255)
    for (let y = 0; y < base.height; y++) data.set(base.data.subarray(y * base.width * 4, (y + 1) * base.width * 4), ((y + 150) * width + 450) * 4)
    // "Linhas de texto" e barras ao redor, separadas por espaço em branco.
    for (const [bx, by, bw, bh] of [[20, 20, 380, 18], [20, 60, 300, 18], [20, 300, 60, 60], [width - 400, 40, 360, 24], [width - 300, height - 120, 40, 90], [460, 20, 300, 30]]) {
      for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) if ((x >> 3) % 2 === 0) data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3)
    }
    const started = performance.now()
    const single = decodeSinglePixels(jsQR, { data, width, height })
    expect(single && "source" in single && contactsOf(single)[0].names).toEqual(["Lia Sintética do QR"])
    const big = qrRgbaRow([QR_VCARD_30, QR_URL], { scales: [12, 6], gap: 400 })
    expect(decodeSinglePixels(jsQR, big)).toEqual({ multiple: true })
    expect(performance.now() - started).toBeLessThan(5000)
  })

  it("regiões demais para conferir (blocos antes dos QRs restantes): recusa pedindo recorte, nunca aceita (R3)", () => {
    const row = qrRgbaRow([QR_VCARD_30, QR_VCARD_30, QR_URL], { scales: [5, 5, 2], gap: 120 })
    const top = 60, width = row.width, height = row.height + top
    const data = new Uint8ClampedArray(width * height * 4).fill(255)
    data.set(row.data, top * width * 4)
    // 30 blocos escuros de 24 px, separados por faixas brancas, ACIMA dos QRs.
    for (let k = 0; k < 30; k++) for (let y = 10; y < 34; y++) for (let x = 8 + k * 32; x < 32 + k * 32 && x < width; x++) data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3)
    const result = decodeSinglePixels(jsQR, { data, width, height })
    expect(result && !("source" in result)).toBe(true)
    expect(result).toEqual({ crowded: true })
    expect(qrPayloadToVcard).toBeTypeOf("function")
    expect(QR_ERROR_MESSAGES.CROWDED).toMatch(/Recorte a imagem/)
  })

  it("imagem sem QR: nada reconhecido", () => {
    const noise = { data: new Uint8ClampedArray(200 * 200 * 4).map((_, i) => (i % 4 === 3 ? 255 : ((i * 2654435761) >>> 24) & 0xff)), width: 200, height: 200 }
    expect(decodePixels(jsQR, noise)).toBeNull()
    expect(decodePixels(jsQR, { data: new Uint8ClampedArray(64 * 64 * 4).fill(255), width: 64, height: 64 })).toBeNull()
  })
})

describe("texto do detector nativo (BarcodeDetector)", () => {
  it("vCard correto segue ao parser; acento mal decodificado pelo sistema é recusado", () => {
    expect(qrPayloadToVcard({ source: "text", text: QR_VCARD_30 }).ok).toBe(true)
    const mojibake = String.fromCharCode(...new TextEncoder().encode(QR_VCARD_30))
    expect(mojibake).toContain("SintÃ©tica")
    expect(qrPayloadToVcard({ source: "text", text: mojibake })).toMatchObject({ ok: false, code: "ENCODING" })
    expect(qrPayloadToVcard({ source: "text", text: QR_VCARD_30.replace("é", "�") })).toMatchObject({ ok: false, code: "ENCODING" })
    // Latin-1 legítimo (sem sequência UTF-8 válida) não é confundido com erro de decodificação.
    expect(qrPayloadToVcard({ source: "text", text: "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Itaí\r\nEND:VCARD\r\n" }).ok).toBe(true)
    expect(qrPayloadToVcard({ source: "text", text: QR_URL })).toMatchObject({ ok: false, code: "LINK" })
  })
})

describe("classificação do conteúdo", () => {
  it.each([
    [" begin:vcard\r\n", "VCARD"], ["﻿BEGIN:VCARD", "VCARD"], ["HTTP://x.invalid", "LINK"], ["www.exemplo.invalid", "LINK"],
    ["mailto:a@b.invalid", "LINK"], ["tel:+5514999", "LINK"], ["javascript:alert(1)", "LINK"], ["ftp://x", "LINK"],
    ["wifi:S:x;;", "WIFI"], ["mecard:N:x;;", "MECARD"], [QR_PIX, "PIX"], ["000201 sem pix", "TEXT"],
    ["Nome: João", "TEXT"], ["", "UNKNOWN"], ["a\u0001b", "UNKNOWN"],
  ])("%j → %s", (text, kind) => expect(classifyQrText(text)).toBe(kind))
})

const u8 = (...parts: Array<number[] | string>) => Uint8Array.from(parts.flatMap((p) => typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p))
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const le16 = (n: number) => [n & 255, (n >>> 8) & 255]
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255]
const pngHeader = (w: number, h: number) => u8([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), "IHDR", be32(w), be32(h), [8, 0, 0, 0, 0])
const jpegHeader = (w: number, h: number) => u8([0xff, 0xd8, 0xff, 0xe0, 0, 16], "JFIF", [0, 1, 1, 0, 0, 1, 0, 1, 0, 0], [0xff, 0xdb, 0, 4, 0, 0], [0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1])

describe("imagem: formato e dimensões pelo conteúdo, antes de decodificar", () => {
  it("PNG real gerado pelo fixture, JPEG, WebP (VP8X, VP8L e VP8)", () => {
    expect(inspectImage(qrPng(QR_VCARD_30))).toMatchObject({ ok: true, format: "png", mime: "image/png" })
    expect(inspectImage(jpegHeader(640, 480))).toEqual({ ok: true, format: "jpeg", mime: "image/jpeg", width: 640, height: 480 })
    expect(inspectImage(u8("RIFF", [0, 0, 0, 0], "WEBP", "VP8X", [10, 0, 0, 0], [0, 0, 0, 0], le24(799), le24(599)))).toMatchObject({ ok: true, format: "webp", width: 800, height: 600 })
    const vp8l = (799 & 0x3fff) | ((599 & 0x3fff) << 14)
    expect(inspectImage(u8("RIFF", [0, 0, 0, 0], "WEBP", "VP8L", [0, 0, 0, 0], [0x2f], [vp8l & 255, (vp8l >>> 8) & 255, (vp8l >>> 16) & 255, (vp8l >>> 24) & 255], [0, 0, 0, 0, 0]))).toMatchObject({ ok: true, width: 800, height: 600 })
    expect(inspectImage(u8("RIFF", [0, 0, 0, 0], "WEBP", "VP8 ", [0, 0, 0, 0], [0, 0, 0], [0x9d, 0x01, 0x2a], le16(320), le16(240), [0, 0]))).toMatchObject({ ok: true, width: 320, height: 240 })
  })

  it("extensão e MIME não importam: só o conteúdo decide", () => {
    for (const bytes of [u8("GIF89a", [1, 0, 1, 0]), u8("BM", [0, 0, 0, 0, 0, 0]), u8("<svg xmlns='http://www.w3.org/2000/svg'/>"), u8("BEGIN:VCARD"), new Uint8Array()]) {
      expect(inspectImage(bytes)).toEqual({ ok: false, code: "IMAGE_FORMAT" })
    }
  })

  it("dimensões acima dos limites e cabeçalhos truncados ou corrompidos são recusados", () => {
    expect(inspectImage(pngHeader(QR_LIMITS.maxImageSide + 1, 10))).toEqual({ ok: false, code: "IMAGE_DIMENSIONS" })
    expect(inspectImage(pngHeader(6001, 6000))).toEqual({ ok: false, code: "IMAGE_DIMENSIONS" })
    expect(inspectImage(pngHeader(6000, 6000))).toMatchObject({ ok: true })
    expect(inspectImage(jpegHeader(0xffff, 0xffff))).toEqual({ ok: false, code: "IMAGE_DIMENSIONS" })
    expect(inspectImage(pngHeader(0, 10))).toEqual({ ok: false, code: "IMAGE_CORRUPT" })
    expect(inspectImage(pngHeader(10, 10).subarray(0, 20))).toEqual({ ok: false, code: "IMAGE_CORRUPT" })
    expect(inspectImage(u8([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff]))).toEqual({ ok: false, code: "IMAGE_CORRUPT" })
    expect(inspectImage(u8([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toEqual({ ok: false, code: "IMAGE_CORRUPT" })
    expect(inspectImage(u8("RIFF", [0, 0, 0, 0], "WEBP", "XXXX", new Array(16).fill(0)))).toEqual({ ok: false, code: "IMAGE_CORRUPT" })
  })

  it("arquivo acima de 10 MiB é recusado pelo tamanho", () => {
    const big = new Uint8Array(QR_LIMITS.maxImageBytes + 1)
    big.set(pngHeader(10, 10))
    expect(inspectImage(big)).toEqual({ ok: false, code: "IMAGE_TOO_LARGE" })
  })

  it("JPEG com segmentos longos antes do SOF: varredura linear até o fim, sem laço", () => {
    const filler = new Array(1000).fill(0).flatMap(() => [0xff, 0xe1, 0x00, 0x02])
    expect(inspectImage(u8([0xff, 0xd8, 0xff, 0xe0, 0, 2], filler, [0xff, 0xc2, 0, 11, 8, 0, 50, 0, 60, 1, 1]))).toMatchObject({ ok: true, width: 60, height: 50 })
    expect(inspectImage(u8([0xff, 0xd8, 0xff, 0xe0, 0, 2], filler))).toEqual({ ok: false, code: "IMAGE_CORRUPT" })
  })

  it("redução proporcional para o lado máximo processado, sem ampliar", () => {
    expect(scaledSize(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(scaledSize(300, 200, 1600)).toEqual({ width: 300, height: 200 })
    expect(scaledSize(10_000, 1, 960)).toEqual({ width: 960, height: 1 })
  })

  it("encoder PNG do fixture gera cabeçalho reconhecido", () => {
    const png = pngFromGray(2, 2, () => 255)
    expect(inspectImage(png)).toMatchObject({ ok: true, width: 2, height: 2 })
  })
})
