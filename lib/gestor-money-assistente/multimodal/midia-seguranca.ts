/**
 * Segurança e download de mídia multimodal (WhatsApp Meta / Fixture) — G009 e G010.
 *
 * Princípios de defesa em profundidade:
 * - Nunca confiar no MIME declarado: inspeção real por magic bytes obrigatória.
 * - Proteção SSRF fail-closed: somente HTTPS porta 443, sem userinfo, allowlist estrita
 *   de domínios Meta/WhatsApp e resolução DNS validada contra IPs privados/reservados.
 * - Redirecionamentos manuais com revalidação a cada salto, limite rígido de saltos
 *   e remoção do header Authorization em redirects cross-host.
 * - Leitura em streaming com corte imediato ao exceder o limite de bytes.
 * - Higiene de memória: zero-fill do buffer em `descartar()` e em rejeições.
 * - Nunca registrar tokens, URLs assinadas ou conteúdo binário em logs.
 */
import crypto from "node:crypto"
import dns from "node:dns"
import net from "node:net"
import {
  LIMITES_MIDIA,
  MIMES_AUDIO_ACEITOS,
  MIMES_DOCUMENTO_ACEITOS,
  type CodigoErroMidia,
  type MidiaBaixada,
  type MimeAudioAceito,
  type MimeDocumentoAceito,
  type MimeMidiaAceito,
  type PortaDownloadMidiaWhatsApp,
  type ResultadoDownloadMidia,
} from "./contratos"

// ─── Constantes e mapeamentos ──────────────────────────────────────────────

const AUDIO_MIME_SET: ReadonlySet<string> = new Set(MIMES_AUDIO_ACEITOS)
const DOCUMENTO_MIME_SET: ReadonlySet<string> = new Set(MIMES_DOCUMENTO_ACEITOS)

const EXTENSAO_POR_MIME: Record<MimeMidiaAceito, string> = {
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/amr": "amr",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
}

const HOST_EXATO_META = "graph.facebook.com"
const SUFIXOS_HOST_META = [
  ".fbsbx.com",
  ".fbcdn.net",
  ".whatsapp.net",
  ".whatsapp.com",
] as const

const STATUS_REDIRECT = new Set([301, 302, 303, 307, 308])
const VERSAO_GRAPH_PADRAO = "v21.0"
const MEDIA_ID_RE = /^[A-Za-z0-9._-]{1,256}$/
const API_VERSION_RE = /^v\d+\.\d+$/

export type ResolverDnsFn = (host: string) => Promise<string[]>

export type FixtureMidiaSimulada = {
  bytes: Buffer
  duracaoSegundos?: number
  erro?: {
    codigo: CodigoErroMidia
    transitorio: boolean
    mensagemUsuario: string
  }
}

// ─── 1. Detecção real de MIME por magic bytes ──────────────────────────────

function temPrefixo(bytes: Buffer, assinatura: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + assinatura.length) return false
  for (let i = 0; i < assinatura.length; i++) {
    if (bytes[offset + i] !== assinatura[i]) return false
  }
  return true
}

function temAscii(bytes: Buffer, texto: string, offset = 0): boolean {
  if (bytes.length < offset + texto.length) return false
  for (let i = 0; i < texto.length; i++) {
    if (bytes[offset + i] !== texto.charCodeAt(i)) return false
  }
  return true
}

/**
 * Inspeciona os magic bytes reais do buffer (nunca confia no MIME declarado).
 * Retorna `null` para formatos não suportados ou perigosos (HTML, SVG, EXE, ZIP, etc.).
 */
export function detectarMimeReal(bytes: Buffer): MimeMidiaAceito | null {
  if (!Buffer.isBuffer(bytes) || bytes.length < 3) return null

  // ── Documentos / Imagens ──
  // JPEG: FF D8 FF
  if (temPrefixo(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg"

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (temPrefixo(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png"

  // PDF: %PDF-
  if (temAscii(bytes, "%PDF-")) return "application/pdf"

  // RIFF container: WAVE (audio/wav) ou WEBP (image/webp)
  if (bytes.length >= 12 && temAscii(bytes, "RIFF", 0)) {
    if (temAscii(bytes, "WEBP", 8)) return "image/webp"
    if (temAscii(bytes, "WAVE", 8)) return "audio/wav"
    return null
  }

  // ── Áudio ──
  // OGG: OggS
  if (temAscii(bytes, "OggS")) return "audio/ogg"

  // WebM / Matroska EBML: 1A 45 DF A3
  if (temPrefixo(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "audio/webm"

  // AMR: #!AMR (cobre AMR-NB e AMR-WB)
  if (temAscii(bytes, "#!AMR")) return "audio/amr"

  // MP4 / M4A: "ftyp" no offset 4
  if (bytes.length >= 8 && temAscii(bytes, "ftyp", 4)) return "audio/mp4"

  // MP3: cabeçalho ID3 ou frame sync 0xFF 0xE0..0xFE (exclui 0xFF 0xFF)
  if (temAscii(bytes, "ID3")) return "audio/mpeg"
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && bytes[1] !== 0xff) {
    return "audio/mpeg"
  }

  return null
}

function ehMimeAudio(mime: MimeMidiaAceito): mime is MimeAudioAceito {
  return AUDIO_MIME_SET.has(mime)
}

function ehMimeDocumento(mime: MimeMidiaAceito): mime is MimeDocumentoAceito {
  return DOCUMENTO_MIME_SET.has(mime)
}

// ─── 2. Contagem segura de páginas de PDF ──────────────────────────────────

/**
 * Conta páginas de um PDF inspecionando ocorrências de `/Type /Page` (excluindo `/Pages`).
 * Retorna `0` se o buffer não tiver cabeçalho `%PDF-` válido.
 * Retorna ao menos `1` quando o PDF é válido mas não possui tags explícitas decodificáveis.
 */
export function contarPaginasPdf(bytes: Buffer): number {
  if (!Buffer.isBuffer(bytes) || !temAscii(bytes, "%PDF-")) return 0

  const texto = bytes.toString("latin1")
  const matchesPagina = texto.match(/\/Type\s*\/Page\b/g)
  if (matchesPagina && matchesPagina.length > 0) {
    return matchesPagina.length
  }

  // Fallback seguro para PDFs com streams comprimidos que ainda expõem /Pages + /Count
  let maiorCount = 0
  for (const re of [
    /\/Type\s*\/Pages\b[\s\S]{0,200}?\/Count\s+(\d+)\b/g,
    /\/Count\s+(\d+)\b[\s\S]{0,200}?\/Type\s*\/Pages\b/g,
  ]) {
    let m: RegExpExecArray | null
    while ((m = re.exec(texto)) !== null) {
      const valor = Number.parseInt(m[1], 10)
      if (Number.isFinite(valor) && valor > maiorCount) {
        maiorCount = valor
      }
    }
  }

  return maiorCount > 0 ? maiorCount : 1
}

// ─── 3. Validação completa de buffer de mídia ──────────────────────────────

export function validarBufferMidia(input: {
  bytes: Buffer
  tipoEsperado: "AUDIO" | "DOCUMENTO"
  duracaoSegundos?: number
  maxBytes?: number
  maxPaginasPdf?: number
}): ResultadoDownloadMidia {
  const { bytes, tipoEsperado, duracaoSegundos } = input

  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    return {
      ok: false,
      codigo: "CONTEUDO_INVALIDO",
      transitorio: false,
      mensagemUsuario: "O arquivo recebido está vazio ou corrompido. Envie novamente.",
    }
  }

  const maxBytes =
    input.maxBytes ??
    (tipoEsperado === "AUDIO" ? LIMITES_MIDIA.MAX_BYTES_AUDIO : LIMITES_MIDIA.MAX_BYTES_DOCUMENTO)

  if (bytes.length > maxBytes) {
    const limiteMb = Math.max(1, Math.round(maxBytes / (1024 * 1024)))
    return {
      ok: false,
      codigo: "MIDIA_MUITO_GRANDE",
      transitorio: false,
      mensagemUsuario: `O arquivo excede o limite máximo de ${limiteMb} MB.`,
    }
  }

  const mimeReal = detectarMimeReal(bytes)
  if (!mimeReal) {
    return {
      ok: false,
      codigo: "MIME_NAO_SUPORTADO",
      transitorio: false,
      mensagemUsuario: "Formato de arquivo não suportado ou inválido.",
    }
  }

  if (tipoEsperado === "AUDIO" && !ehMimeAudio(mimeReal)) {
    return {
      ok: false,
      codigo: "MIME_NAO_SUPORTADO",
      transitorio: false,
      mensagemUsuario: "O arquivo enviado não é um áudio em formato suportado.",
    }
  }

  if (tipoEsperado === "DOCUMENTO" && !ehMimeDocumento(mimeReal)) {
    return {
      ok: false,
      codigo: "MIME_NAO_SUPORTADO",
      transitorio: false,
      mensagemUsuario: "O arquivo enviado não é uma imagem (JPG, PNG, WebP) ou PDF suportado.",
    }
  }

  if (tipoEsperado === "AUDIO" && typeof duracaoSegundos === "number") {
    if (!Number.isFinite(duracaoSegundos) || duracaoSegundos < 0) {
      return {
        ok: false,
        codigo: "CONTEUDO_INVALIDO",
        transitorio: false,
        mensagemUsuario: "Duração do áudio inválida.",
      }
    }
    if (duracaoSegundos > LIMITES_MIDIA.MAX_DURACAO_AUDIO_SEG) {
      return {
        ok: false,
        codigo: "DURACAO_EXCEDIDA",
        transitorio: false,
        mensagemUsuario: `O áudio excede o limite máximo de ${Math.floor(LIMITES_MIDIA.MAX_DURACAO_AUDIO_SEG / 60)} minutos. Envie um áudio mais curto ou escreva a mensagem.`,
      }
    }
  }

  let paginasPdf: number | undefined
  if (mimeReal === "application/pdf") {
    paginasPdf = contarPaginasPdf(bytes)
    const maxPaginas = input.maxPaginasPdf ?? LIMITES_MIDIA.MAX_PAGINAS_PDF
    if (paginasPdf > maxPaginas) {
      return {
        ok: false,
        codigo: "PDF_MUITAS_PAGINAS",
        transitorio: false,
        mensagemUsuario: `O PDF possui mais de ${maxPaginas} páginas. Envie apenas as páginas do documento financeiro.`,
      }
    }
  }

  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex")

  const midia: MidiaBaixada = {
    bytes,
    mimeReal,
    tamanhoBytes: bytes.length,
    sha256,
    extensao: EXTENSAO_POR_MIME[mimeReal],
    ...(paginasPdf !== undefined ? { paginasPdf } : {}),
    descartar: () => {
      bytes.fill(0)
    },
  }

  return { ok: true, midia }
}

// ─── 4. Proteção SSRF e validação de URL/IP ────────────────────────────────

function ehIpv4PrivadoOuReservado(ip: string): boolean {
  const partes = ip.split(".")
  if (partes.length !== 4) return true
  const nums = partes.map((p) => Number.parseInt(p, 10))
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b, c] = nums

  // 0.0.0.0/8 (unspecified / this network)
  if (a === 0) return true
  // 10.0.0.0/8 (RFC 1918 private)
  if (a === 10) return true
  // 100.64.0.0/10 (RFC 6598 CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true
  // 169.254.0.0/16 (link-local / cloud metadata)
  if (a === 169 && b === 254) return true
  // 172.16.0.0/12 (RFC 1918 private)
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.0.0.0/24 (IETF protocol assignments) e 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true
  // 192.168.0.0/16 (RFC 1918 private)
  if (a === 192 && b === 168) return true
  // 198.18.0.0/15 (benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true
  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true
  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true
  // 224.0.0.0/4 (multicast) e 240.0.0.0/4 (reserved / broadcast)
  if (a >= 224) return true

  return false
}

function parseIpv6ParaGrupos(ip: string): number[] | null {
  const lower = ip.toLowerCase()
  const partesDuplo = lower.split("::")
  if (partesDuplo.length > 2) return null

  const expandirLado = (lado: string): number[] | null => {
    if (!lado) return []
    const tokens = lado.split(":")
    const grupos: number[] = []
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]
      if (tok.includes(".")) {
        // IPv4 embutido só é válido no último token
        if (i !== tokens.length - 1 || !net.isIPv4(tok)) return null
        const octetos = tok.split(".").map((o) => Number.parseInt(o, 10))
        grupos.push((octetos[0] << 8) | octetos[1], (octetos[2] << 8) | octetos[3])
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(tok)) return null
        grupos.push(Number.parseInt(tok, 16))
      }
    }
    return grupos
  }

  if (partesDuplo.length === 1) {
    const grupos = expandirLado(partesDuplo[0])
    return grupos && grupos.length === 8 ? grupos : null
  }

  const esquerda = expandirLado(partesDuplo[0])
  const direita = expandirLado(partesDuplo[1])
  if (!esquerda || !direita) return null
  const zerosFaltantes = 8 - (esquerda.length + direita.length)
  if (zerosFaltantes < 1) return null

  return [...esquerda, ...new Array<number>(zerosFaltantes).fill(0), ...direita]
}

function ehIpv6PrivadoOuReservado(ip: string): boolean {
  const g = parseIpv6ParaGrupos(ip)
  if (!g) return true

  const [g0, g1, g2, g3, g4, g5, g6, g7] = g

  // ::/128 (unspecified) e ::1/128 (loopback) e ::/96 (IPv4-compatible obsoleto)
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return true

  // ::ffff:0:0/96 (IPv4-mapped IPv6 — bloqueado incondicionalmente contra bypass SSRF)
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) return true

  // 64:ff9b::/96 e 64:ff9b:1::/48 (NAT64 / tradução IPv4)
  if (g0 === 0x0064 && g1 === 0xff9b && (g2 === 0 || g2 === 0x0001)) return true

  // 100::/64 (discard-only)
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return true

  // 2001::/32 (Teredo) e 2001:db8::/32 (documentação)
  if (g0 === 0x2001 && (g1 === 0x0000 || g1 === 0x0db8)) return true

  // 2002::/16 (6to4 — pode embutir IPv4 privado)
  if (g0 === 0x2002) return true

  // fc00::/7 (Unique Local Address — ULA)
  if ((g0 & 0xfe00) === 0xfc00) return true

  // fe80::/10 (link-local)
  if ((g0 & 0xffc0) === 0xfe80) return true

  // fec0::/10 (site-local obsoleto)
  if ((g0 & 0xffc0) === 0xfec0) return true

  // ff00::/8 (multicast)
  if ((g0 & 0xff00) === 0xff00) return true

  return false
}

/**
 * Retorna `true` se o IP for privado, loopback, link-local, CGNAT, ULA, multicast,
 * IPv4-mapped IPv6 ou inválido/malformado (fail-closed).
 */
export function ehIpPrivadoOuReservado(ip: string): boolean {
  if (typeof ip !== "string") return true
  let limpo = ip.trim()
  if (!limpo) return true

  // Remove colchetes IPv6 se presentes
  if (limpo.startsWith("[") && limpo.endsWith("]")) {
    limpo = limpo.slice(1, -1)
  }

  // Remove zone ID IPv6 (ex.: fe80::1%eth0)
  const idxZona = limpo.indexOf("%")
  if (idxZona !== -1) {
    limpo = limpo.slice(0, idxZona)
  }

  const versao = net.isIP(limpo)
  if (versao === 4) return ehIpv4PrivadoOuReservado(limpo)
  if (versao === 6) return ehIpv6PrivadoOuReservado(limpo)

  // Qualquer valor que não seja IP canônico válido é tratado como bloqueado (fail-closed)
  return true
}

function ehHostMetaAutorizado(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (!host || host.startsWith(".") || host.endsWith(".") || host.includes("..")) {
    return false
  }
  if (net.isIP(host) !== 0) return false
  if (host === HOST_EXATO_META) return true

  return SUFIXOS_HOST_META.some(
    (sufixo) => host.endsWith(sufixo) && host.length > sufixo.length
  )
}

async function resolverDnsPadrao(host: string): Promise<string[]> {
  const registros = await dns.promises.lookup(host, { all: true, verbatim: true })
  return registros.map((r) => r.address)
}

/**
 * Valida que a URL de destino aponta exclusivamente para hosts Meta/WhatsApp autorizados
 * sobre HTTPS na porta 443, sem credenciais na URL, e que TODOS os IPs resolvidos por DNS
 * são públicos e roteáveis.
 */
export async function validarUrlDestinoMeta(
  urlStr: string,
  resolverDns: ResolverDnsFn = resolverDnsPadrao
): Promise<{ ok: true; url: URL } | { ok: false; codigo: "DESTINO_NAO_AUTORIZADO" }> {
  if (typeof urlStr !== "string" || !urlStr.trim() || /[\u0000-\u001f\u007f]/.test(urlStr)) {
    return { ok: false, codigo: "DESTINO_NAO_AUTORIZADO" }
  }

  let url: URL
  try {
    url = new URL(urlStr)
  } catch {
    return { ok: false, codigo: "DESTINO_NAO_AUTORIZADO" }
  }

  if (url.protocol !== "https:") {
    return { ok: false, codigo: "DESTINO_NAO_AUTORIZADO" }
  }

  if (url.username !== "" || url.password !== "") {
    return { ok: false, codigo: "DESTINO_NAO_AUTORIZADO" }
  }

  if (url.port !== "" && url.port !== "443") {
    return { ok: false, codigo: "DESTINO_NAO_AUTORIZADO" }
  }

  if (!ehHostMetaAutorizado(url.hostname)) {
    return { ok: false, codigo: "DESTINO_NAO_AUTORIZADO" }
  }

  let ips: string[]
  try {
    ips = await resolverDns(url.hostname)
  } catch {
    return { ok: false, codigo: "DESTINO_NAO_AUTORIZADO" }
  }

  if (!Array.isArray(ips) || ips.length === 0) {
    return { ok: false, codigo: "DESTINO_NAO_AUTORIZADO" }
  }

  for (const ip of ips) {
    if (ehIpPrivadoOuReservado(ip)) {
      return { ok: false, codigo: "DESTINO_NAO_AUTORIZADO" }
    }
  }

  return { ok: true, url }
}

// ─── 5. Downloader seguro de mídia Meta WhatsApp ───────────────────────────

function erroDownload(
  codigo: CodigoErroMidia,
  transitorio: boolean,
  mensagemUsuario: string
): ResultadoDownloadMidia {
  return { ok: false, codigo, transitorio, mensagemUsuario }
}

function classificarErroStatusHttp(
  status: number,
  contexto: "metadados" | "binario"
): ResultadoDownloadMidia {
  if (status === 404 || status === 410) {
    return erroDownload(
      "DOWNLOAD_NAO_ENCONTRADO",
      false,
      "Mídia não encontrada ou expirada no WhatsApp. Reenvie o arquivo."
    )
  }
  if (status === 408 || status === 429 || status >= 500) {
    return erroDownload(
      "DOWNLOAD_TEMPORARIO",
      true,
      "Serviço de mídia do WhatsApp temporariamente indisponível. Tente novamente em instantes."
    )
  }
  return erroDownload(
    "DOWNLOAD_TEMPORARIO",
    false,
    contexto === "metadados"
      ? "Não foi possível consultar os dados da mídia no WhatsApp."
      : "Não foi possível baixar a mídia do WhatsApp."
  )
}

function zeroFillChunks(chunks: Uint8Array[]): void {
  for (const chunk of chunks) {
    chunk.fill(0)
  }
}

async function lerCorpoComLimite(
  response: Response,
  maxBytes: number,
  controller: AbortController
): Promise<{ ok: true; bytes: Buffer } | { ok: false; excedeuLimite: true }> {
  const contentLengthRaw = response.headers?.get("content-length")
  if (contentLengthRaw) {
    const contentLength = Number.parseInt(contentLengthRaw, 10)
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      await response.body?.cancel?.().catch(() => {})
      return { ok: false, excedeuLimite: true }
    }
  }

  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value || value.byteLength === 0) continue

        total += value.byteLength
        if (total > maxBytes) {
          value.fill(0)
          zeroFillChunks(chunks)
          await reader.cancel().catch(() => {})
          controller.abort()
          return { ok: false, excedeuLimite: true }
        }
        chunks.push(value)
      }
    } catch (err) {
      zeroFillChunks(chunks)
      throw err
    }

    const buffer = Buffer.concat(
      chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)),
      total
    )
    zeroFillChunks(chunks)
    return { ok: true, bytes: buffer }
  }

  // Fallback para mocks de Response sem ReadableStream
  const ab = await response.arrayBuffer()
  const buffer = Buffer.from(ab)
  if (buffer.byteLength > maxBytes) {
    buffer.fill(0)
    return { ok: false, excedeuLimite: true }
  }
  return { ok: true, bytes: buffer }
}

function ehErroAbortOuTimeout(err: unknown, timedOut: boolean): boolean {
  if (timedOut) return true
  if (err && typeof err === "object") {
    const name = "name" in err ? String((err as { name?: unknown }).name) : ""
    if (name === "AbortError" || name === "TimeoutError") return true
  }
  return false
}

export function criarDownloaderMidiaMeta(deps?: {
  fetchFn?: typeof fetch
  resolverDns?: ResolverDnsFn
  apiVersion?: string
  timeoutMs?: number
}): PortaDownloadMidiaWhatsApp {
  const fetchFn = deps?.fetchFn ?? globalThis.fetch
  const resolverDns = deps?.resolverDns ?? resolverDnsPadrao
  const apiVersion =
    deps?.apiVersion && API_VERSION_RE.test(deps.apiVersion)
      ? deps.apiVersion
      : VERSAO_GRAPH_PADRAO
  const timeoutMs = deps?.timeoutMs ?? LIMITES_MIDIA.TIMEOUT_DOWNLOAD_MS

  return {
    async baixar(input): Promise<ResultadoDownloadMidia> {
      const mediaId = typeof input.mediaId === "string" ? input.mediaId.trim() : ""
      if (!mediaId || !MEDIA_ID_RE.test(mediaId) || mediaId === "." || mediaId === ".." || mediaId.includes("..")) {
        return erroDownload("CONTEUDO_INVALIDO", false, "Identificador de mídia inválido.")
      }

      const accessToken = input.credenciais?.accessToken?.trim()
      if (!accessToken) {
        return erroDownload(
          "PROVEDOR_INDISPONIVEL",
          false,
          "Credenciais do canal WhatsApp não configuradas para baixar a mídia."
        )
      }

      if (
        input.tipoEsperado === "AUDIO" &&
        typeof input.duracaoSegundos === "number" &&
        input.duracaoSegundos > LIMITES_MIDIA.MAX_DURACAO_AUDIO_SEG
      ) {
        return erroDownload(
          "DURACAO_EXCEDIDA",
          false,
          `O áudio excede o limite máximo de ${Math.floor(LIMITES_MIDIA.MAX_DURACAO_AUDIO_SEG / 60)} minutos. Envie um áudio mais curto ou escreva a mensagem.`
        )
      }

      const maxBytes =
        input.tipoEsperado === "AUDIO"
          ? LIMITES_MIDIA.MAX_BYTES_AUDIO
          : LIMITES_MIDIA.MAX_BYTES_DOCUMENTO

      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)

      const onExternalAbort = () => controller.abort()
      if (input.signal) {
        if (input.signal.aborted) {
          clearTimeout(timer)
          return erroDownload(
            "DOWNLOAD_TIMEOUT",
            true,
            "O download da mídia foi cancelado por tempo limite."
          )
        }
        input.signal.addEventListener("abort", onExternalAbort, { once: true })
      }

      try {
        // ── Etapa 1: Consultar metadados na Graph API ──
        const metaUrlStr = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(mediaId)}`
        const validacaoMeta = await validarUrlDestinoMeta(metaUrlStr, resolverDns)
        if (!validacaoMeta.ok) {
          return erroDownload(
            "DESTINO_NAO_AUTORIZADO",
            false,
            "Destino de consulta da mídia não autorizado."
          )
        }

        let resMeta: Response
        try {
          resMeta = await fetchFn(validacaoMeta.url.toString(), {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json",
            },
            redirect: "manual",
            signal: controller.signal,
          })
        } catch (err) {
          if (ehErroAbortOuTimeout(err, timedOut)) {
            return erroDownload(
              "DOWNLOAD_TIMEOUT",
              true,
              "O download da mídia excedeu o tempo limite. Tente enviar novamente."
            )
          }
          return erroDownload(
            "DOWNLOAD_TEMPORARIO",
            true,
            "Falha temporária de conexão ao consultar a mídia. Tente novamente em instantes."
          )
        }

        if (STATUS_REDIRECT.has(resMeta.status)) {
          return erroDownload(
            "REDIRECT_NAO_AUTORIZADO",
            false,
            "Redirecionamento não autorizado ao consultar os dados da mídia."
          )
        }

        if (!resMeta.ok) {
          return classificarErroStatusHttp(resMeta.status, "metadados")
        }

        let payloadMeta: { url?: unknown; file_size?: unknown }
        try {
          payloadMeta = (await resMeta.json()) as { url?: unknown; file_size?: unknown }
        } catch {
          return erroDownload(
            "CONTEUDO_INVALIDO",
            false,
            "Resposta inválida ao consultar os dados da mídia."
          )
        }

        if (typeof payloadMeta?.url !== "string" || !payloadMeta.url.trim()) {
          return erroDownload(
            "CONTEUDO_INVALIDO",
            false,
            "URL de download da mídia ausente na resposta do WhatsApp."
          )
        }

        if (typeof payloadMeta.file_size === "number" && payloadMeta.file_size > maxBytes) {
          const limiteMb = Math.max(1, Math.round(maxBytes / (1024 * 1024)))
          return erroDownload(
            "MIDIA_MUITO_GRANDE",
            false,
            `O arquivo excede o limite máximo de ${limiteMb} MB.`
          )
        }

        // ── Etapa 2: Download binário com redirects manuais e streaming limitado ──
        const validacaoDownloadInicial = await validarUrlDestinoMeta(payloadMeta.url, resolverDns)
        if (!validacaoDownloadInicial.ok) {
          return erroDownload(
            "DESTINO_NAO_AUTORIZADO",
            false,
            "Destino de download da mídia não autorizado."
          )
        }

        let urlAtual = validacaoDownloadInicial.url
        const hostInicial = urlAtual.hostname.toLowerCase()
        let respostaBinaria: Response | null = null

        for (let salto = 0; salto <= LIMITES_MIDIA.MAX_REDIRECTS_DOWNLOAD; salto++) {
          const mesmoHost = urlAtual.hostname.toLowerCase() === hostInicial
          const headers: Record<string, string> = {}
          // Nunca envia Authorization em redirect para outro host
          if (salto === 0 || mesmoHost) {
            headers.Authorization = `Bearer ${accessToken}`
          }

          let res: Response
          try {
            res = await fetchFn(urlAtual.toString(), {
              method: "GET",
              headers,
              redirect: "manual",
              signal: controller.signal,
            })
          } catch (err) {
            if (ehErroAbortOuTimeout(err, timedOut)) {
              return erroDownload(
                "DOWNLOAD_TIMEOUT",
                true,
                "O download da mídia excedeu o tempo limite. Tente enviar novamente."
              )
            }
            return erroDownload(
              "DOWNLOAD_TEMPORARIO",
              true,
              "Falha temporária de conexão ao baixar a mídia. Tente novamente em instantes."
            )
          }

          if (STATUS_REDIRECT.has(res.status)) {
            await res.body?.cancel?.().catch(() => {})

            const location = res.headers?.get("location")
            if (!location || salto >= LIMITES_MIDIA.MAX_REDIRECTS_DOWNLOAD) {
              return erroDownload(
                "REDIRECT_NAO_AUTORIZADO",
                false,
                "Redirecionamento não autorizado ou limite de redirecionamentos excedido."
              )
            }

            let proximoUrlStr: string
            try {
              proximoUrlStr = new URL(location, urlAtual).toString()
            } catch {
              return erroDownload(
                "REDIRECT_NAO_AUTORIZADO",
                false,
                "Destino de redirecionamento inválido."
              )
            }

            const validacaoProximo = await validarUrlDestinoMeta(proximoUrlStr, resolverDns)
            if (!validacaoProximo.ok) {
              return erroDownload(
                "REDIRECT_NAO_AUTORIZADO",
                false,
                "Redirecionamento para destino não autorizado bloqueado."
              )
            }

            urlAtual = validacaoProximo.url
            continue
          }

          respostaBinaria = res
          break
        }

        if (!respostaBinaria) {
          return erroDownload(
            "REDIRECT_NAO_AUTORIZADO",
            false,
            "Limite de redirecionamentos excedido ao baixar a mídia."
          )
        }

        if (!respostaBinaria.ok) {
          await respostaBinaria.body?.cancel?.().catch(() => {})
          return classificarErroStatusHttp(respostaBinaria.status, "binario")
        }

        let leitura: { ok: true; bytes: Buffer } | { ok: false; excedeuLimite: true }
        try {
          leitura = await lerCorpoComLimite(respostaBinaria, maxBytes, controller)
        } catch (err) {
          if (ehErroAbortOuTimeout(err, timedOut)) {
            return erroDownload(
              "DOWNLOAD_TIMEOUT",
              true,
              "O download da mídia excedeu o tempo limite. Tente enviar novamente."
            )
          }
          return erroDownload(
            "DOWNLOAD_TEMPORARIO",
            true,
            "Falha temporária durante a leitura da mídia. Tente novamente em instantes."
          )
        }

        if (!leitura.ok) {
          const limiteMb = Math.max(1, Math.round(maxBytes / (1024 * 1024)))
          return erroDownload(
            "MIDIA_MUITO_GRANDE",
            false,
            `O arquivo excede o limite máximo de ${limiteMb} MB.`
          )
        }

        const validado = validarBufferMidia({
          bytes: leitura.bytes,
          tipoEsperado: input.tipoEsperado,
          duracaoSegundos: input.duracaoSegundos,
          maxBytes,
        })

        if (!validado.ok) {
          leitura.bytes.fill(0)
        }

        return validado
      } finally {
        clearTimeout(timer)
        if (input.signal) {
          input.signal.removeEventListener("abort", onExternalAbort)
        }
      }
    },
  }
}

// ─── 6. Downloader simulado com validação real ─────────────────────────────

/**
 * Downloader de fixture para testes automatizados.
 * Executa obrigatoriamente `validarBufferMidia` sobre os bytes da fixture para garantir
 * que arquivos inválidos, oversized, com MIME incompatível ou PDF longo sejam rejeitados.
 */
export function criarDownloaderMidiaSimulado(
  mapa: Map<string, FixtureMidiaSimulada>
): PortaDownloadMidiaWhatsApp {
  return {
    async baixar(input): Promise<ResultadoDownloadMidia> {
      const fixture = mapa.get(input.mediaId)
      if (!fixture) {
        return erroDownload(
          "DOWNLOAD_NAO_ENCONTRADO",
          false,
          "Mídia não encontrada no repositório simulado."
        )
      }

      if (fixture.erro) {
        return erroDownload(
          fixture.erro.codigo,
          fixture.erro.transitorio,
          fixture.erro.mensagemUsuario
        )
      }

      const copiaBytes = Buffer.from(fixture.bytes)
      const duracao =
        fixture.duracaoSegundos !== undefined ? fixture.duracaoSegundos : input.duracaoSegundos

      const resultado = validarBufferMidia({
        bytes: copiaBytes,
        tipoEsperado: input.tipoEsperado,
        duracaoSegundos: duracao,
      })

      if (!resultado.ok) {
        copiaBytes.fill(0)
      }

      return resultado
    },
  }
}
