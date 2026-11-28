import crypto from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import { LIMITES_MIDIA } from "./contratos"
import {
  contarPaginasPdf,
  criarDownloaderMidiaMeta,
  criarDownloaderMidiaSimulado,
  detectarMimeReal,
  ehIpPrivadoOuReservado,
  validarBufferMidia,
  validarUrlDestinoMeta,
  type FixtureMidiaSimulada,
} from "./midia-seguranca"

// ─── Helpers de fixtures binárias válidas ──────────────────────────────────

const OGG_BYTES = Buffer.concat([Buffer.from("OggS", "ascii"), Buffer.alloc(32, 0x11)])
const MP3_ID3_BYTES = Buffer.concat([Buffer.from("ID3", "ascii"), Buffer.alloc(32, 0x22)])
const MP3_SYNC_BYTES = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00])
const MP3_SYNC_E0_BYTES = Buffer.from([0xff, 0xe0, 0x00, 0x00, 0x00])
const M4A_BYTES = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from("ftypM4A ", "ascii"),
  Buffer.alloc(16, 0x33),
])
const WAV_BYTES = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WAVE", "ascii"),
  Buffer.alloc(16, 0x44),
])
const WEBM_BYTES = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81])
const AMR_BYTES = Buffer.concat([Buffer.from("#!AMR\n", "ascii"), Buffer.alloc(16, 0x55)])

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x18, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "ascii"),
  Buffer.alloc(16, 0x66),
])

function criarPdfBytes(numPaginas: number): Buffer {
  const paginas = Array.from(
    { length: numPaginas },
    (_, i) => `${i + 3} 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n`
  ).join("")
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count ${numPaginas} >>\nendobj\n${paginas}%%EOF`,
    "latin1"
  )
}

const DNS_PUBLICO = async () => ["157.240.22.35"]
const CREDENCIAIS_VALIDAS = { phoneNumberId: "100200300", accessToken: "EAAG-secret-token" }

function criarStreamChunked(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++])
      } else {
        controller.close()
      }
    },
  })
}

// ─── 1. Detecção real de MIME (magic bytes) ────────────────────────────────

describe("detectarMimeReal", () => {
  it("detecta todos os formatos de áudio aceitos por magic bytes", () => {
    expect(detectarMimeReal(OGG_BYTES)).toBe("audio/ogg")
    expect(detectarMimeReal(MP3_ID3_BYTES)).toBe("audio/mpeg")
    expect(detectarMimeReal(MP3_SYNC_BYTES)).toBe("audio/mpeg")
    expect(detectarMimeReal(MP3_SYNC_E0_BYTES)).toBe("audio/mpeg")
    expect(detectarMimeReal(M4A_BYTES)).toBe("audio/mp4")
    expect(detectarMimeReal(WAV_BYTES)).toBe("audio/wav")
    expect(detectarMimeReal(WEBM_BYTES)).toBe("audio/webm")
    expect(detectarMimeReal(AMR_BYTES)).toBe("audio/amr")
  })

  it("detecta todos os formatos de documento/imagem aceitos por magic bytes", () => {
    expect(detectarMimeReal(JPEG_BYTES)).toBe("image/jpeg")
    expect(detectarMimeReal(PNG_BYTES)).toBe("image/png")
    expect(detectarMimeReal(WEBP_BYTES)).toBe("image/webp")
    expect(detectarMimeReal(criarPdfBytes(1))).toBe("application/pdf")
  })

  it("rejeita HTML, SVG, EXE, ELF, ZIP, RIFF desconhecido e buffers vazios/aleatórios", () => {
    expect(detectarMimeReal(Buffer.alloc(0))).toBeNull()
    expect(detectarMimeReal(Buffer.from("<!DOCTYPE html><html><body>x</body></html>"))).toBeNull()
    expect(detectarMimeReal(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull()
    expect(detectarMimeReal(Buffer.from("MZ\x90\x00\x03\x00\x00\x00"))).toBeNull() // PE/EXE
    expect(detectarMimeReal(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]))).toBeNull() // ELF
    expect(detectarMimeReal(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]))).toBeNull() // ZIP
    expect(detectarMimeReal(Buffer.from("RIFF\x10\x00\x00\x00AVI LIST"))).toBeNull()
    expect(detectarMimeReal(Buffer.from([0xff, 0xff, 0xff, 0xff]))).toBeNull()
    expect(detectarMimeReal(Buffer.from("texto puro qualquer"))).toBeNull()
  })
})

// ─── 2. Contagem segura de páginas de PDF ──────────────────────────────────

describe("contarPaginasPdf", () => {
  it("conta /Type /Page sem contar /Type /Pages", () => {
    expect(contarPaginasPdf(criarPdfBytes(1))).toBe(1)
    expect(contarPaginasPdf(criarPdfBytes(4))).toBe(4)
    expect(contarPaginasPdf(criarPdfBytes(12))).toBe(12)
  })

  it("suporta variações de espaçamento e exclui /Pages e /PageLabels", () => {
    const pdf = Buffer.from(
      "%PDF-1.7\n<< /Type/Pages /Count 3 >>\n<< /Type /PageLabels >>\n<< /Type/Page >>\n<< /Type\n/Page >>\n<< /Type /Page >>",
      "latin1"
    )
    expect(contarPaginasPdf(pdf)).toBe(3)
  })

  it("retorna ao menos 1 para PDF válido sem tags explícitas, usa /Count em fallback e 0 para não-PDF", () => {
    expect(contarPaginasPdf(Buffer.from("%PDF-1.4\n%conteudo binario\n%%EOF", "latin1"))).toBe(1)
    expect(
      contarPaginasPdf(Buffer.from("%PDF-1.5\n<< /Type /Pages /Count 14 >>\n%%EOF", "latin1"))
    ).toBe(14)
    expect(contarPaginasPdf(JPEG_BYTES)).toBe(0)
    expect(contarPaginasPdf(Buffer.alloc(0))).toBe(0)
  })
})

// ─── 3. Validação completa de buffer de mídia ──────────────────────────────

describe("validarBufferMidia", () => {
  it("valida áudio válido, calcula sha256 e zero-fill em descartar()", () => {
    const bytes = Buffer.from(OGG_BYTES)
    const esperadoSha = crypto.createHash("sha256").update(bytes).digest("hex")

    const res = validarBufferMidia({
      bytes,
      tipoEsperado: "AUDIO",
      duracaoSegundos: 45,
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.midia.mimeReal).toBe("audio/ogg")
    expect(res.midia.extensao).toBe("ogg")
    expect(res.midia.tamanhoBytes).toBe(bytes.length)
    expect(res.midia.sha256).toBe(esperadoSha)
    expect(res.midia.paginasPdf).toBeUndefined()

    res.midia.descartar()
    expect(res.midia.bytes.every((b) => b === 0)).toBe(true)
  })

  it("valida PDF dentro do limite de páginas e rejeita PDF acima do limite", () => {
    const pdfOk = validarBufferMidia({
      bytes: criarPdfBytes(LIMITES_MIDIA.MAX_PAGINAS_PDF),
      tipoEsperado: "DOCUMENTO",
    })
    expect(pdfOk.ok).toBe(true)
    if (pdfOk.ok) {
      expect(pdfOk.midia.mimeReal).toBe("application/pdf")
      expect(pdfOk.midia.paginasPdf).toBe(LIMITES_MIDIA.MAX_PAGINAS_PDF)
    }

    const pdfExcedido = validarBufferMidia({
      bytes: criarPdfBytes(LIMITES_MIDIA.MAX_PAGINAS_PDF + 1),
      tipoEsperado: "DOCUMENTO",
    })
    expect(pdfExcedido.ok).toBe(false)
    if (!pdfExcedido.ok) {
      expect(pdfExcedido.codigo).toBe("PDF_MUITAS_PAGINAS")
      expect(pdfExcedido.transitorio).toBe(false)
    }
  })

  it("rejeita buffer vazio, tamanho excedido, tipo incompatível e duração excedida", () => {
    const vazio = validarBufferMidia({ bytes: Buffer.alloc(0), tipoEsperado: "AUDIO" })
    expect(vazio.ok).toBe(false)
    if (!vazio.ok) expect(vazio.codigo).toBe("CONTEUDO_INVALIDO")

    const grande = validarBufferMidia({
      bytes: Buffer.concat([PNG_BYTES, Buffer.alloc(200)]),
      tipoEsperado: "DOCUMENTO",
      maxBytes: 100,
    })
    expect(grande.ok).toBe(false)
    if (!grande.ok) expect(grande.codigo).toBe("MIDIA_MUITO_GRANDE")

    // Imagem enviada onde se esperava áudio
    const mismatchAudio = validarBufferMidia({ bytes: Buffer.from(JPEG_BYTES), tipoEsperado: "AUDIO" })
    expect(mismatchAudio.ok).toBe(false)
    if (!mismatchAudio.ok) expect(mismatchAudio.codigo).toBe("MIME_NAO_SUPORTADO")

    // Áudio enviado onde se esperava documento
    const mismatchDoc = validarBufferMidia({ bytes: Buffer.from(OGG_BYTES), tipoEsperado: "DOCUMENTO" })
    expect(mismatchDoc.ok).toBe(false)
    if (!mismatchDoc.ok) expect(mismatchDoc.codigo).toBe("MIME_NAO_SUPORTADO")

    // Áudio acima de 180s
    const longo = validarBufferMidia({
      bytes: Buffer.from(OGG_BYTES),
      tipoEsperado: "AUDIO",
      duracaoSegundos: LIMITES_MIDIA.MAX_DURACAO_AUDIO_SEG + 1,
    })
    expect(longo.ok).toBe(false)
    if (!longo.ok) expect(longo.codigo).toBe("DURACAO_EXCEDIDA")
  })
})

// ─── 4. Proteção SSRF (IPs privados/reservados e URLs Meta) ────────────────

describe("ehIpPrivadoOuReservado", () => {
  it("bloqueia todos os intervalos IPv4 privados, loopback, link-local, CGNAT e reservados", () => {
    const bloqueados = [
      "0.0.0.0",
      "0.1.2.3",
      "10.0.0.1",
      "10.255.255.255",
      "100.64.0.1",
      "100.127.255.254",
      "127.0.0.1",
      "127.255.255.254",
      "169.254.169.254", // AWS/GCP/Azure metadata
      "172.16.0.1",
      "172.31.255.254",
      "192.168.0.1",
      "192.168.1.100",
      "224.0.0.1",
      "240.0.0.1",
      "255.255.255.255",
    ]
    for (const ip of bloqueados) {
      expect(ehIpPrivadoOuReservado(ip), `deveria bloquear ${ip}`).toBe(true)
    }
  })

  it("bloqueia IPv6 loopback, link-local, ULA, multicast, IPv4-mapped e strings inválidas", () => {
    const bloqueados = [
      "::",
      "::1",
      "[::1]",
      "fe80::1",
      "fe80::1%eth0",
      "febf::abcd",
      "fc00::1",
      "fd12:3456:789a::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
      "::ffff:7f00:1",
      "0:0:0:0:0:ffff:10.0.0.1",
      "64:ff9b::10.0.0.1",
      "2001:db8::1",
      "",
      "localhost",
      "999.0.0.1",
      "127.1",
    ]
    for (const ip of bloqueados) {
      expect(ehIpPrivadoOuReservado(ip), `deveria bloquear ${ip}`).toBe(true)
    }
  })

  it("permite IPs IPv4 e IPv6 públicos roteáveis", () => {
    const publicos = [
      "157.240.22.35",
      "31.13.71.36",
      "100.63.255.255",
      "100.128.0.1",
      "172.15.255.255",
      "172.32.0.1",
      "8.8.8.8",
      "2a03:2880:f11c:8083:face:b00c:0:25de",
      "2606:4700:4700::1111",
    ]
    for (const ip of publicos) {
      expect(ehIpPrivadoOuReservado(ip), `deveria permitir ${ip}`).toBe(false)
    }
  })
})

describe("validarUrlDestinoMeta", () => {
  it("aceita URLs HTTPS válidas nos domínios Meta/WhatsApp com DNS público", async () => {
    const urls = [
      "https://graph.facebook.com/v21.0/12345",
      "https://graph.facebook.com:443/v21.0/12345",
      "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=123",
      "https://scontent.xx.fbcdn.net/v/t62.7118-24/file",
      "https://mmg.whatsapp.net/o1/v/t62/file",
      "https://media.whatsapp.com/download/123",
    ]

    for (const url of urls) {
      const res = await validarUrlDestinoMeta(url, DNS_PUBLICO)
      expect(res.ok, `deveria aceitar ${url}`).toBe(true)
    }
  })

  it("bloqueia HTTP, porta não-443, userinfo, domínios fora da allowlist e DNS privado/falho", async () => {
    const urlsInvalidas = [
      "http://graph.facebook.com/v21.0/123",
      "https://graph.facebook.com:8443/v21.0/123",
      "https://user:pass@graph.facebook.com/v21.0/123",
      "https://user@lookaside.fbsbx.com/file",
      "https://evil.com/file",
      "https://graph.facebook.com.evil.com/v21.0/123",
      "https://evil-fbsbx.com/file",
      "https://fbsbx.com/file",
      "https://169.254.169.254/latest/meta-data/",
      "https://[::1]/secret",
      "file:///etc/passwd",
      "not-a-url",
    ]

    for (const url of urlsInvalidas) {
      const res = await validarUrlDestinoMeta(url, DNS_PUBLICO)
      expect(res.ok, `deveria bloquear ${url}`).toBe(false)
      if (!res.ok) expect(res.codigo).toBe("DESTINO_NAO_AUTORIZADO")
    }

    // DNS que mistura IP público e IP privado -> bloqueia
    const dnsMisto = await validarUrlDestinoMeta(
      "https://lookaside.fbsbx.com/file",
      async () => ["157.240.22.35", "169.254.169.254"]
    )
    expect(dnsMisto.ok).toBe(false)

    // DNS que retorna vazio ou falha -> bloqueia
    const dnsVazio = await validarUrlDestinoMeta("https://lookaside.fbsbx.com/file", async () => [])
    expect(dnsVazio.ok).toBe(false)

    const dnsErro = await validarUrlDestinoMeta("https://lookaside.fbsbx.com/file", async () => {
      throw new Error("ENOTFOUND")
    })
    expect(dnsErro.ok).toBe(false)
  })
})

// ─── 5. Downloader Meta WhatsApp (2 etapas, redirects, streaming, erros) ────

describe("criarDownloaderMidiaMeta", () => {
  it("baixa mídia em 2 etapas validando host/DNS e magic bytes", async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ url: "https://lookaside.fbsbx.com/whatsapp/media/abc", file_size: OGG_BYTES.length }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array(OGG_BYTES), {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        })
      )

    const downloader = criarDownloaderMidiaMeta({
      fetchFn: fetchMock,
      resolverDns: DNS_PUBLICO,
      apiVersion: "v21.0",
    })

    const res = await downloader.baixar({
      mediaId: "media_123",
      tipoEsperado: "AUDIO",
      credenciais: CREDENCIAIS_VALIDAS,
      duracaoSegundos: 12,
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.midia.mimeReal).toBe("audio/ogg")
    expect(res.midia.tamanhoBytes).toBe(OGG_BYTES.length)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://graph.facebook.com/v21.0/media_123")
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("manual")
    expect(fetchMock.mock.calls[1]?.[1]?.redirect).toBe("manual")
  })

  it("segue redirect para host Meta autorizado e remove Authorization em redirect cross-host", async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/att/1" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://scontent.xx.fbcdn.net/v/t62/signed-image" },
        })
      )
      .mockResolvedValueOnce(new Response(new Uint8Array(JPEG_BYTES), { status: 200 }))

    const downloader = criarDownloaderMidiaMeta({
      fetchFn: fetchMock,
      resolverDns: DNS_PUBLICO,
    })

    const res = await downloader.baixar({
      mediaId: "img_01",
      tipoEsperado: "DOCUMENTO",
      credenciais: CREDENCIAIS_VALIDAS,
    })

    expect(res.ok).toBe(true)
    if (res.ok) expect(res.midia.mimeReal).toBe("image/jpeg")

    // Na 2ª chamada (lookaside.fbsbx.com) envia Authorization
    const headersInicial = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>
    expect(headersInicial.Authorization).toBe(`Bearer ${CREDENCIAIS_VALIDAS.accessToken}`)

    // Na 3ª chamada (redirect cross-host para scontent.xx.fbcdn.net) NÃO envia Authorization
    const headersRedirect = fetchMock.mock.calls[2]?.[1]?.headers as Record<string, string>
    expect(headersRedirect.Authorization).toBeUndefined()
  })

  it("bloqueia redirect para host não autorizado ou excesso de saltos", async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/att/1" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "https://evil.example.com/steal" } })
      )

    const downloader = criarDownloaderMidiaMeta({
      fetchFn: fetchMock,
      resolverDns: DNS_PUBLICO,
    })

    const resEvil = await downloader.baixar({
      mediaId: "doc_evil",
      tipoEsperado: "DOCUMENTO",
      credenciais: CREDENCIAIS_VALIDAS,
    })
    expect(resEvil.ok).toBe(false)
    if (!resEvil.ok) expect(resEvil.codigo).toBe("REDIRECT_NAO_AUTORIZADO")
    // Nunca fez fetch para evil.example.com
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Excesso de redirects (> MAX_REDIRECTS_DOWNLOAD = 2)
    const fetchLoop = vi.fn<typeof fetch>()
    fetchLoop
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/hop0" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "https://scontent.xx.fbcdn.net/hop1" } })
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "https://mmg.whatsapp.net/hop2" } })
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "https://media.whatsapp.com/hop3" } })
      )

    const downloaderLoop = criarDownloaderMidiaMeta({
      fetchFn: fetchLoop,
      resolverDns: DNS_PUBLICO,
    })
    const resLoop = await downloaderLoop.baixar({
      mediaId: "doc_loop",
      tipoEsperado: "DOCUMENTO",
      credenciais: CREDENCIAIS_VALIDAS,
    })
    expect(resLoop.ok).toBe(false)
    if (!resLoop.ok) expect(resLoop.codigo).toBe("REDIRECT_NAO_AUTORIZADO")
  })

  it("bloqueia URL de download retornada pela Meta se apontar para destino/IP privado", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ url: "https://169.254.169.254/latest/meta-data" }), {
        status: 200,
      })
    )

    const downloader = criarDownloaderMidiaMeta({
      fetchFn: fetchMock,
      resolverDns: DNS_PUBLICO,
    })

    const res = await downloader.baixar({
      mediaId: "ssrf_01",
      tipoEsperado: "DOCUMENTO",
      credenciais: CREDENCIAIS_VALIDAS,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.codigo).toBe("DESTINO_NAO_AUTORIZADO")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("aborta streaming quando o corpo excede MAX_BYTES sem confiar em Content-Length", async () => {
    const chunkGrande = new Uint8Array(4 * 1024 * 1024) // 4 MB por chunk -> 3 chunks = 12 MB > 10 MB
    chunkGrande.set(PNG_BYTES, 0)

    const fetchMock = vi.fn<typeof fetch>()
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/big" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(criarStreamChunked([chunkGrande, new Uint8Array(4 * 1024 * 1024), new Uint8Array(4 * 1024 * 1024)]), {
          status: 200,
        })
      )

    const downloader = criarDownloaderMidiaMeta({
      fetchFn: fetchMock,
      resolverDns: DNS_PUBLICO,
    })

    const res = await downloader.baixar({
      mediaId: "big_stream",
      tipoEsperado: "DOCUMENTO",
      credenciais: CREDENCIAIS_VALIDAS,
    })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.codigo).toBe("MIDIA_MUITO_GRANDE")
      expect(res.transitorio).toBe(false)
    }
  })

  it("retorna DOWNLOAD_TIMEOUT em timeout e DOWNLOAD_TEMPORARIO transitório em 503/erro de rede", async () => {
    const fetchLento = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("Aborted")
            err.name = "AbortError"
            reject(err)
          })
        })
    )

    const downloaderTimeout = criarDownloaderMidiaMeta({
      fetchFn: fetchLento,
      resolverDns: DNS_PUBLICO,
      timeoutMs: 25,
    })

    const resTimeout = await downloaderTimeout.baixar({
      mediaId: "slow_01",
      tipoEsperado: "AUDIO",
      credenciais: CREDENCIAIS_VALIDAS,
    })
    expect(resTimeout.ok).toBe(false)
    if (!resTimeout.ok) {
      expect(resTimeout.codigo).toBe("DOWNLOAD_TIMEOUT")
      expect(resTimeout.transitorio).toBe(true)
    }

    const fetch503 = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("busy", { status: 503 }))
    const downloader503 = criarDownloaderMidiaMeta({
      fetchFn: fetch503,
      resolverDns: DNS_PUBLICO,
    })
    const res503 = await downloader503.baixar({
      mediaId: "temp_01",
      tipoEsperado: "AUDIO",
      credenciais: CREDENCIAIS_VALIDAS,
    })
    expect(res503.ok).toBe(false)
    if (!res503.ok) {
      expect(res503.codigo).toBe("DOWNLOAD_TEMPORARIO")
      expect(res503.transitorio).toBe(true)
    }
  })

  it("rejeita spoofing de MIME (Content-Type image/jpeg com HTML real) e DNS rebinding em redirect", async () => {
    const fetchSpoof = vi.fn<typeof fetch>()
    fetchSpoof
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/att/spoof" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response("<!DOCTYPE html><script>alert(1)</script>", {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        })
      )

    const downloaderSpoof = criarDownloaderMidiaMeta({
      fetchFn: fetchSpoof,
      resolverDns: DNS_PUBLICO,
    })

    const resSpoof = await downloaderSpoof.baixar({
      mediaId: "spoof_01",
      tipoEsperado: "DOCUMENTO",
      mimeDeclarado: "image/jpeg",
      credenciais: CREDENCIAIS_VALIDAS,
    })
    expect(resSpoof.ok).toBe(false)
    if (!resSpoof.ok) expect(resSpoof.codigo).toBe("MIME_NAO_SUPORTADO")

    // Redirect para domínio allowlisted que resolve para IP privado (DNS rebinding) ou protocol-relative
    const fetchRebind = vi.fn<typeof fetch>()
    fetchRebind
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/att/rebind" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://scontent.xx.fbcdn.net/internal" },
        })
      )

    const downloaderRebind = criarDownloaderMidiaMeta({
      fetchFn: fetchRebind,
      resolverDns: async (host) =>
        host === "scontent.xx.fbcdn.net" ? ["127.0.0.1"] : ["157.240.22.35"],
    })
    const resRebind = await downloaderRebind.baixar({
      mediaId: "rebind_01",
      tipoEsperado: "DOCUMENTO",
      credenciais: CREDENCIAIS_VALIDAS,
    })
    expect(resRebind.ok).toBe(false)
    if (!resRebind.ok) expect(resRebind.codigo).toBe("REDIRECT_NAO_AUTORIZADO")
    expect(fetchRebind).toHaveBeenCalledTimes(2)
  })
})

// ─── 6. Downloader simulado com validação real ─────────────────────────────

describe("criarDownloaderMidiaSimulado", () => {
  it("valida fixtures reais e rejeita MIME inválido, PDF longo e áudio excedido", async () => {
    const mapa = new Map<string, FixtureMidiaSimulada>([
      ["ok-audio", { bytes: Buffer.from(OGG_BYTES), duracaoSegundos: 20 }],
      ["audio-longo", { bytes: Buffer.from(OGG_BYTES), duracaoSegundos: 240 }],
      ["html-malicioso", { bytes: Buffer.from("<html><script>alert(1)</script></html>") }],
      ["pdf-grande", { bytes: criarPdfBytes(15) }],
      [
        "erro-forcado",
        {
          bytes: Buffer.alloc(0),
          erro: {
            codigo: "DOWNLOAD_TEMPORARIO",
            transitorio: true,
            mensagemUsuario: "Falha simulada",
          },
        },
      ],
    ])

    const downloader = criarDownloaderMidiaSimulado(mapa)

    const ok1 = await downloader.baixar({ mediaId: "ok-audio", tipoEsperado: "AUDIO" })
    expect(ok1.ok).toBe(true)
    if (ok1.ok) {
      ok1.midia.descartar()
      expect(ok1.midia.bytes.every((b) => b === 0)).toBe(true)
    }

    // Rebaixar a mesma fixture continua funcionando (descartar não corrompe o mapa)
    const ok2 = await downloader.baixar({ mediaId: "ok-audio", tipoEsperado: "AUDIO" })
    expect(ok2.ok).toBe(true)

    const longo = await downloader.baixar({ mediaId: "audio-longo", tipoEsperado: "AUDIO" })
    expect(longo.ok).toBe(false)
    if (!longo.ok) expect(longo.codigo).toBe("DURACAO_EXCEDIDA")

    const html = await downloader.baixar({ mediaId: "html-malicioso", tipoEsperado: "DOCUMENTO" })
    expect(html.ok).toBe(false)
    if (!html.ok) expect(html.codigo).toBe("MIME_NAO_SUPORTADO")

    const pdf = await downloader.baixar({ mediaId: "pdf-grande", tipoEsperado: "DOCUMENTO" })
    expect(pdf.ok).toBe(false)
    if (!pdf.ok) expect(pdf.codigo).toBe("PDF_MUITAS_PAGINAS")

    const erroForcado = await downloader.baixar({ mediaId: "erro-forcado", tipoEsperado: "AUDIO" })
    expect(erroForcado.ok).toBe(false)
    if (!erroForcado.ok) {
      expect(erroForcado.codigo).toBe("DOWNLOAD_TEMPORARIO")
      expect(erroForcado.transitorio).toBe(true)
    }

    const inexistente = await downloader.baixar({ mediaId: "nao-existe", tipoEsperado: "AUDIO" })
    expect(inexistente.ok).toBe(false)
    if (!inexistente.ok) expect(inexistente.codigo).toBe("DOWNLOAD_NAO_ENCONTRADO")
  })
})
