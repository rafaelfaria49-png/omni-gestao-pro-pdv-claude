/**
 * Leitura de QR Code no navegador: imagem escolhida pelo operador ou câmera aberta
 * por clique explícito. Tudo local: o decodificador (jsQR, carregado sob demanda do
 * próprio app, sem CDN) e o detector nativo (`BarcodeDetector`, quando existir) leem
 * pixels em memória. Nenhum quadro, imagem ou conteúdo sai do navegador, vai para
 * storage ou log. Ao parar, as tracks reais do MediaStream são encerradas e os
 * timers/loops cancelados.
 */
import { QR_LIMITS, decodePixels, inspectImage, scaledSize, type JsQrFn, type QrErrorCode, type QrPayload } from "./qr"

let jsqr: Promise<JsQrFn> | null = null
/** O decodificador só é baixado (do próprio app) quando o operador pede uma leitura. */
export function loadQrDecoder(): Promise<JsQrFn> {
  // Pacote CommonJS com `exports.default`: conforme o empacotador, a função vem em `default` ou em `default.default`.
  jsqr ??= import("jsqr").then((m) => {
    const mod = m.default as unknown as JsQrFn | { default: JsQrFn }
    return typeof mod === "function" ? mod : mod.default
  }).catch((e) => { jsqr = null; throw e })
  return jsqr
}

type NativeDetector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue?: unknown }>> }
type DetectorCtor = { new(options: { formats: string[] }): NativeDetector; getSupportedFormats?: () => Promise<string[]> }
const natives = new WeakMap<object, Promise<NativeDetector | null>>()
/** `BarcodeDetector` do sistema, se existir e ler QR; caso contrário, só o jsQR. */
export function nativeQrDetector(win: Window): Promise<NativeDetector | null> {
  const Ctor = (win as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
  if (typeof Ctor !== "function") return Promise.resolve(null)
  let found = natives.get(win)
  if (!found) {
    found = (async () => {
      try {
        const formats = await Ctor.getSupportedFormats?.()
        if (formats && !formats.includes("qr_code")) return null
        return new Ctor({ formats: ["qr_code"] })
      } catch { return null }
    })()
    natives.set(win, found)
  }
  return found
}

type FrameResult = QrPayload | { multiple: true } | null
/** Um quadro: jsQR sobre os bytes exatos; o nativo só tenta quando o jsQR não achou nada. */
async function readFrame(jsQR: JsQrFn, native: NativeDetector | null, canvas: HTMLCanvasElement, invert: boolean): Promise<FrameResult> {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("canvas")
  const found = decodePixels(jsQR, ctx.getImageData(0, 0, canvas.width, canvas.height), invert)
  if (found || !native) return found
  const codes = await native.detect(canvas).catch(() => [])
  const values = [...new Set(codes.map((c) => c.rawValue).filter((v): v is string => typeof v === "string" && v.length > 0))]
  if (values.length > 1) return { multiple: true }
  return values.length ? { source: "text", text: values[0] } : null
}

function release(canvas: HTMLCanvasElement) { canvas.width = 0; canvas.height = 0 }

export type QrImageOutcome = { ok: true; payload: QrPayload } | { ok: false; code: QrErrorCode }

/**
 * Bytes de uma imagem escolhida: formato e dimensões pelo conteúdo, limites antes
 * de decodificar, redução para no máximo `maxProcessedSide` e leitura local.
 */
export async function decodeQrImage(bytes: Uint8Array, win: Window = window): Promise<QrImageOutcome> {
  const info = inspectImage(bytes)
  if (!info.ok) return info
  const [jsQR, native] = await Promise.all([loadQrDecoder(), nativeQrDetector(win)])
  let bitmap: ImageBitmap
  try { bitmap = await win.createImageBitmap(new Blob([bytes as BlobPart], { type: info.mime })) } catch { return { ok: false, code: "IMAGE_CORRUPT" } }
  const canvas = win.document.createElement("canvas")
  try {
    // O cabeçalho pode mentir: as dimensões reais também passam pelos limites.
    if (bitmap.width * bitmap.height > QR_LIMITS.maxImagePixels || Math.max(bitmap.width, bitmap.height) > QR_LIMITS.maxImageSide) return { ok: false, code: "IMAGE_DIMENSIONS" }
    const size = scaledSize(bitmap.width, bitmap.height, QR_LIMITS.maxProcessedSide)
    canvas.width = size.width; canvas.height = size.height
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return { ok: false, code: "IMAGE_CORRUPT" }
    ctx.fillStyle = "#fff" // transparência vira fundo claro, como no papel
    ctx.fillRect(0, 0, size.width, size.height)
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)
    const found = await readFrame(jsQR, native, canvas, true)
    if (!found) return { ok: false, code: "NOT_FOUND" }
    if ("multiple" in found) return { ok: false, code: "MULTIPLE" }
    return { ok: true, payload: found }
  } finally { bitmap.close(); release(canvas) }
}

export function cameraErrorCode(error: unknown): QrErrorCode {
  const name = error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : ""
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "CAMERA_DENIED"
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "CAMERA_NOT_FOUND"
  if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") return "CAMERA_BUSY"
  // Navegador sem captura de mídia (ex.: Chromium "headless shell") rejeita com NotSupportedError.
  if (name === "NotSupportedError") return "CAMERA_UNSUPPORTED"
  return "CAMERA_FAILED"
}

export type QrCameraOptions = {
  win: Window
  video: HTMLVideoElement
  /** Câmera aberta e quadros chegando: mostrar o indicador de funcionamento. */
  onActive: () => void
  /** Primeiro QR reconhecido. A captura já foi encerrada antes desta chamada. */
  onPayload: (payload: QrPayload) => void
  /** Falha, tempo esgotado ou vários QR no quadro. A captura já foi encerrada. */
  onError: (code: QrErrorCode) => void
  /** Leitura de um quadro (injetável nos testes de ciclo de vida). */
  readFrame?: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<FrameResult>
}
export type QrCameraHandle = { stop: () => void; readonly stopped: boolean }

async function defaultCameraFrame(win: Window, video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<FrameResult> {
  if (!video.videoWidth || !video.videoHeight) return null
  const [jsQR, native] = await Promise.all([loadQrDecoder(), nativeQrDetector(win)])
  const size = scaledSize(video.videoWidth, video.videoHeight, QR_LIMITS.maxCameraSide)
  if (canvas.width !== size.width || canvas.height !== size.height) { canvas.width = size.width; canvas.height = size.height }
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("canvas")
  ctx.drawImage(video, 0, 0, size.width, size.height)
  return readFrame(jsQR, native, canvas, false)
}

/**
 * Abre a câmera (só chamada a partir de um clique do operador) e lê quadros em
 * intervalo fixo, sem sobreposição. Encerra sozinha ao reconhecer um QR, em erro e
 * após `maxCameraMs`. `stop()` é idempotente e vale mesmo antes da permissão
 * responder: a track que chegar depois é encerrada na hora.
 */
export function startQrCamera(options: QrCameraOptions): QrCameraHandle {
  const { win, video } = options
  let stopped = false
  let stream: MediaStream | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  const canvas = win.document.createElement("canvas")
  const frame = options.readFrame ?? ((v, c) => defaultCameraFrame(win, v, c))
  const stop = () => {
    if (stopped) return
    stopped = true
    clearTimeout(timer); clearTimeout(deadline)
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    try { video.pause() } catch { /* elemento já desmontado */ }
    video.srcObject = null
    release(canvas)
  }
  const fail = (code: QrErrorCode) => { if (stopped) return; stop(); options.onError(code) }
  const scan = async () => {
    if (stopped) return
    let found: FrameResult
    try { found = await frame(video, canvas) } catch { return fail("CAMERA_FAILED") }
    if (stopped) return
    if (found && "multiple" in found) return fail("MULTIPLE")
    if (found) { stop(); options.onPayload(found); return }
    timer = setTimeout(scan, QR_LIMITS.cameraIntervalMs)
  }

  const media = win.navigator.mediaDevices
  if (!win.isSecureContext || typeof media?.getUserMedia !== "function") {
    queueMicrotask(() => fail("CAMERA_UNSUPPORTED"))
  } else {
    // O decodificador começa a baixar junto com o pedido de permissão.
    void loadQrDecoder().catch(() => undefined)
    media.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } }).then(async (granted) => {
      if (stopped) { granted.getTracks().forEach((track) => track.stop()); return }
      stream = granted
      for (const track of granted.getVideoTracks()) track.addEventListener("ended", () => fail("CAMERA_FAILED"))
      video.muted = true
      video.playsInline = true
      video.srcObject = granted
      try { await video.play() } catch { return fail("CAMERA_FAILED") }
      if (stopped) return
      options.onActive()
      deadline = setTimeout(() => fail("CAMERA_TIMEOUT"), QR_LIMITS.maxCameraMs)
      timer = setTimeout(scan, 0)
    }, (error) => fail(cameraErrorCode(error)))
  }
  return { stop, get stopped() { return stopped } }
}

