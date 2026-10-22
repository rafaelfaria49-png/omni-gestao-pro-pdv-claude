import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { QR_LIMITS, qrPayloadToVcard, type QrPayload } from "./qr"
import { cameraErrorCode, decodeQrImage, startQrCamera } from "./qr-browser"
import { QR_URL, QR_VCARD_30, qrPng, qrRgba, qrRgbaRow } from "./__fixtures__/qr"

/** Câmera sintética: tracks com `stop` observável e evento `ended`. */
function fakeStream() {
  const listeners: Array<() => void> = []
  const track = { stop: vi.fn(), addEventListener: vi.fn((_: string, fn: () => void) => listeners.push(fn)) }
  return { stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream, track, end: () => listeners.forEach((fn) => fn()) }
}
function fakeVideo() {
  return { play: vi.fn(async () => undefined), pause: vi.fn(), srcObject: null as unknown, muted: false, playsInline: false, videoWidth: 1280, videoHeight: 720 }
}
function fakeWin(getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>, secure = true) {
  return {
    isSecureContext: secure,
    navigator: { mediaDevices: getUserMedia ? { getUserMedia: vi.fn(getUserMedia) } : undefined },
    document: { createElement: () => ({ width: 300, height: 150, getContext: () => null }) },
  }
}
const payload: QrPayload = { source: "text", text: QR_VCARD_30 }
type Opts = Parameters<typeof startQrCamera>[0]
function start(win: ReturnType<typeof fakeWin>, readFrame: NonNullable<Opts["readFrame"]> = async () => null, video = fakeVideo()) {
  const calls = { active: vi.fn(), payload: vi.fn(), error: vi.fn() }
  const handle = startQrCamera({
    win: win as unknown as Window, video: video as unknown as HTMLVideoElement, readFrame,
    onActive: calls.active, onPayload: calls.payload, onError: calls.error,
  })
  return { handle, calls, video }
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe("câmera: permissão, suporte e erros", () => {
  it("sem mediaDevices ou fora de contexto seguro: sem câmera, sem pedido de permissão", async () => {
    const none = start(fakeWin())
    await flush()
    expect(none.calls.error).toHaveBeenCalledWith("CAMERA_UNSUPPORTED")
    const gum = vi.fn()
    const insecure = start(fakeWin(gum, false))
    await flush()
    expect(insecure.calls.error).toHaveBeenCalledWith("CAMERA_UNSUPPORTED")
    expect(gum).not.toHaveBeenCalled()
  })

  it.each([
    ["NotAllowedError", "CAMERA_DENIED"], ["SecurityError", "CAMERA_DENIED"], ["NotFoundError", "CAMERA_NOT_FOUND"],
    ["OverconstrainedError", "CAMERA_NOT_FOUND"], ["NotReadableError", "CAMERA_BUSY"], ["NotSupportedError", "CAMERA_UNSUPPORTED"], ["TypeError", "CAMERA_FAILED"],
  ])("getUserMedia rejeitado com %s → %s", async (name, code) => {
    const { calls } = start(fakeWin(() => Promise.reject(Object.assign(new Error("x"), { name }))))
    await flush()
    expect(calls.error).toHaveBeenCalledWith(code)
    expect(calls.active).not.toHaveBeenCalled()
    expect(cameraErrorCode(null)).toBe("CAMERA_FAILED")
  })

  it("pede só vídeo (sem microfone), câmera traseira preferida", async () => {
    const cam = fakeStream()
    const win = fakeWin(async () => cam.stream)
    start(win).handle.stop()
    const constraints = win.navigator.mediaDevices!.getUserMedia.mock.calls[0][0]
    expect(constraints.audio).toBe(false)
    expect(constraints.video).toMatchObject({ facingMode: { ideal: "environment" } })
  })

  it("play() recusado: tracks encerradas e erro", async () => {
    const cam = fakeStream()
    const video = fakeVideo()
    video.play.mockRejectedValueOnce(new Error("autoplay"))
    const { calls } = start(fakeWin(async () => cam.stream), async () => null, video)
    await flush()
    expect(calls.error).toHaveBeenCalledWith("CAMERA_FAILED")
    expect(cam.track.stop).toHaveBeenCalled()
    expect(video.srcObject).toBeNull()
  })
})

describe("câmera: leitura e encerramento", () => {
  it("lê quadros até o primeiro QR; encerra as tracks ANTES de entregar; uma entrega só", async () => {
    const cam = fakeStream()
    const frames = vi.fn<NonNullable<Opts["readFrame"]>>().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue(payload)
    const { calls, video, handle } = start(fakeWin(async () => cam.stream), frames)
    await flush()
    expect(calls.active).toHaveBeenCalledOnce()
    expect(video.srcObject).toBe(cam.stream)
    calls.payload.mockImplementation(() => {
      expect(cam.track.stop).toHaveBeenCalled()
      expect(video.srcObject).toBeNull()
    })
    await vi.advanceTimersByTimeAsync(QR_LIMITS.cameraIntervalMs * 4)
    expect(calls.payload).toHaveBeenCalledOnce()
    expect(calls.payload).toHaveBeenCalledWith(payload)
    expect(handle.stopped).toBe(true)
    const count = frames.mock.calls.length
    await vi.advanceTimersByTimeAsync(QR_LIMITS.cameraIntervalMs * 10)
    expect(frames.mock.calls.length).toBe(count)
    expect(calls.error).not.toHaveBeenCalled()
  })

  it("intervalo fixo e sem sobreposição de leituras", async () => {
    const cam = fakeStream()
    let inFlight = 0, overlap = false
    const frames = vi.fn(async () => { inFlight++; if (inFlight > 1) overlap = true; await new Promise((r) => setTimeout(r, 400)); inFlight--; return null })
    const { handle } = start(fakeWin(async () => cam.stream), frames)
    await flush()
    await vi.advanceTimersByTimeAsync(2000)
    expect(overlap).toBe(false)
    // Cada leitura leva 400 ms + 250 ms de intervalo: no máximo 4 em 2 s.
    expect(frames.mock.calls.length).toBeLessThanOrEqual(4)
    handle.stop()
  })

  it("cancelar antes da permissão: a track que chega depois é encerrada na hora, sem ativar", async () => {
    const cam = fakeStream()
    let grant!: (s: MediaStream) => void
    const { handle, calls, video } = start(fakeWin(() => new Promise((r) => { grant = r })))
    handle.stop()
    grant(cam.stream)
    await flush()
    expect(cam.track.stop).toHaveBeenCalled()
    expect(calls.active).not.toHaveBeenCalled()
    expect(video.srcObject).toBeNull()
    expect(calls.error).not.toHaveBeenCalled()
  })

  it("cancelar durante a leitura de um quadro: o resultado pendente é descartado", async () => {
    const cam = fakeStream()
    let finish!: (p: QrPayload) => void
    const { handle, calls } = start(fakeWin(async () => cam.stream), () => new Promise((r) => { finish = r }))
    await flush()
    await vi.advanceTimersByTimeAsync(0)
    handle.stop()
    finish(payload)
    await flush()
    expect(calls.payload).not.toHaveBeenCalled()
    expect(cam.track.stop).toHaveBeenCalledOnce()
    handle.stop() // idempotente
    expect(cam.track.stop).toHaveBeenCalledOnce()
  })

  it("play() que nunca resolve: o prazo vale desde a track ligada e desliga a câmera", async () => {
    const cam = fakeStream()
    const video = fakeVideo()
    video.play.mockImplementation(() => new Promise(() => undefined))
    const { calls } = start(fakeWin(async () => cam.stream), async () => null, video)
    await flush()
    expect(calls.active).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(QR_LIMITS.maxCameraMs)
    expect(calls.error).toHaveBeenCalledWith("CAMERA_TIMEOUT")
    expect(cam.track.stop).toHaveBeenCalledOnce()
    expect(video.srcObject).toBeNull()
    expect(calls.active).not.toHaveBeenCalled()
  })

  it("sem QR em 60 s: câmera desligada por tempo", async () => {
    const cam = fakeStream()
    const frames = vi.fn(async () => null)
    const { calls } = start(fakeWin(async () => cam.stream), frames)
    await flush()
    await vi.advanceTimersByTimeAsync(QR_LIMITS.maxCameraMs - 1)
    expect(calls.error).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(calls.error).toHaveBeenCalledWith("CAMERA_TIMEOUT")
    expect(cam.track.stop).toHaveBeenCalled()
    const count = frames.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(frames.mock.calls.length).toBe(count)
  })

  it.each([
    ["track encerrada pelo sistema", (cam: ReturnType<typeof fakeStream>) => cam.end(), "CAMERA_FAILED"],
  ])("%s → erro e tracks paradas", async (_l, act, code) => {
    const cam = fakeStream()
    const { calls } = start(fakeWin(async () => cam.stream))
    await flush()
    act(cam)
    expect(calls.error).toHaveBeenCalledWith(code)
    expect(cam.track.stop).toHaveBeenCalled()
  })

  it("vários QR no quadro ou falha de leitura: encerra com erro", async () => {
    const cam1 = fakeStream()
    const multi = start(fakeWin(async () => cam1.stream), async () => ({ multiple: true as const }))
    await flush(); await vi.advanceTimersByTimeAsync(0)
    expect(multi.calls.error).toHaveBeenCalledWith("MULTIPLE")
    const cam2 = fakeStream()
    const broken = start(fakeWin(async () => cam2.stream), async () => { throw new Error("canvas") })
    await flush(); await vi.advanceTimersByTimeAsync(0)
    expect(broken.calls.error).toHaveBeenCalledWith("CAMERA_FAILED")
    expect(cam1.track.stop).toHaveBeenCalled(); expect(cam2.track.stop).toHaveBeenCalled()
  })
})

/** Canvas sintético que devolve pixels reais do QR desenhado (jsQR real decodifica). */
function imageWin(opts: { pixels?: ReturnType<typeof qrRgba>; bitmap?: { width: number; height: number }; failBitmap?: boolean; native?: unknown } = {}) {
  const close = vi.fn()
  const canvases: Array<{ width: number; height: number }> = []
  const createImageBitmap = vi.fn(async () => {
    if (opts.failBitmap) throw new Error("decode")
    return { width: opts.bitmap?.width ?? opts.pixels?.width ?? 100, height: opts.bitmap?.height ?? opts.pixels?.height ?? 100, close }
  })
  const win = {
    createImageBitmap,
    BarcodeDetector: opts.native,
    document: {
      createElement: () => {
        const canvas = {
          width: 0, height: 0,
          getContext: () => ({
            fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: "",
            getImageData: () => opts.pixels ?? { data: new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(255), width: canvas.width, height: canvas.height },
          }),
        }
        canvases.push(canvas)
        return canvas
      },
    },
  }
  return { win: win as unknown as Window, createImageBitmap, close, canvases }
}

describe("imagem: limites antes de decodificar, leitura local e liberação", () => {
  beforeEach(() => { vi.useRealTimers() })

  it("PNG com vCard: jsQR real lê os bytes; bitmap fechado e canvas liberado", async () => {
    const pixels = qrRgba(QR_VCARD_30)
    const { win, close, canvases } = imageWin({ pixels })
    const outcome = await decodeQrImage(new Uint8Array(qrPng(QR_VCARD_30)), win)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(qrPayloadToVcard(outcome.payload)).toMatchObject({ ok: true, contacts: [{ names: ["Lia Sintética do QR"] }] })
    expect(close).toHaveBeenCalledOnce()
    expect(canvases.every((c) => c.width === 0 && c.height === 0)).toBe(true)
  })

  it("formato inválido ou grande demais: recusado sem decodificar pixels", async () => {
    const a = imageWin()
    expect(await decodeQrImage(new TextEncoder().encode("BEGIN:VCARD"), a.win)).toEqual({ ok: false, code: "IMAGE_FORMAT" })
    const png = qrPng(QR_VCARD_30)
    const huge = new Uint8Array(png)
    new DataView(huge.buffer).setUint32(16, 9000); new DataView(huge.buffer).setUint32(20, 9000)
    expect(await decodeQrImage(huge, a.win)).toEqual({ ok: false, code: "IMAGE_DIMENSIONS" })
    expect(a.createImageBitmap).not.toHaveBeenCalled()
  })

  it("cabeçalho pequeno mas pixels reais enormes: recusado depois de abrir, sem ler", async () => {
    const b = imageWin({ bitmap: { width: 9000, height: 9000 } })
    expect(await decodeQrImage(new Uint8Array(qrPng(QR_VCARD_30)), b.win)).toEqual({ ok: false, code: "IMAGE_DIMENSIONS" })
    expect(b.close).toHaveBeenCalledOnce()
  })

  it("dois QRs reais na mesma imagem (jsQR, sem detector nativo): recusa por vários QR", async () => {
    const pixels = qrRgbaRow([QR_VCARD_30, QR_URL], { scales: [6, 2], gap: 100 })
    expect(await decodeQrImage(new Uint8Array(qrPng(QR_VCARD_30)), imageWin({ pixels }).win)).toEqual({ ok: false, code: "MULTIPLE" })
  })

  it("arquivo corrompido e imagem sem QR", async () => {
    expect(await decodeQrImage(new Uint8Array(qrPng(QR_VCARD_30)), imageWin({ failBitmap: true }).win)).toEqual({ ok: false, code: "IMAGE_CORRUPT" })
    expect(await decodeQrImage(new Uint8Array(qrPng(QR_VCARD_30)), imageWin().win)).toEqual({ ok: false, code: "NOT_FOUND" })
  })

  it("detector nativo com duas cópias do mesmo QR: recusa (conta ocorrências, não valores) (R3)", async () => {
    class Twins { static getSupportedFormats = async () => ["qr_code"]; detect = async () => [{ rawValue: QR_VCARD_30 }, { rawValue: QR_VCARD_30 }] }
    expect(await decodeQrImage(new Uint8Array(qrPng(QR_VCARD_30)), imageWin({ native: Twins }).win)).toEqual({ ok: false, code: "MULTIPLE" })
  })

  it("câmera: quadro com regiões demais para conferir encerra com pedido de enquadrar só o QR", async () => {
    const cam = fakeStream()
    const { calls } = start(fakeWin(async () => cam.stream), async () => ({ crowded: true as const }))
    await flush(); await new Promise((r) => setTimeout(r, 20)) // bloco com timers reais
    expect(calls.error).toHaveBeenCalledWith("CROWDED")
    expect(cam.track.stop).toHaveBeenCalled()
  })

  it("detector nativo só entra quando o jsQR não acha; vários QR distintos = recusa", async () => {
    const detect = vi.fn(async () => [{ rawValue: QR_URL }])
    class One { static getSupportedFormats = async () => ["qr_code"]; detect = detect }
    const one = await decodeQrImage(new Uint8Array(qrPng(QR_VCARD_30)), imageWin({ native: One }).win)
    expect(one).toEqual({ ok: true, payload: { source: "text", text: QR_URL } })
    class Two { static getSupportedFormats = async () => ["qr_code"]; detect = async () => [{ rawValue: "a" }, { rawValue: "b" }] }
    expect(await decodeQrImage(new Uint8Array(qrPng(QR_VCARD_30)), imageWin({ native: Two }).win)).toEqual({ ok: false, code: "MULTIPLE" })
    // Com QR legível pelo jsQR, o nativo nem é consultado.
    const skipped = vi.fn(async () => [])
    class Unused { static getSupportedFormats = async () => ["qr_code"]; detect = skipped }
    expect((await decodeQrImage(new Uint8Array(qrPng(QR_VCARD_30)), imageWin({ pixels: qrRgba(QR_VCARD_30), native: Unused }).win)).ok).toBe(true)
    expect(skipped).not.toHaveBeenCalled()
    // Detector sem suporte a QR é ignorado.
    class NoQr { static getSupportedFormats = async () => ["ean_13"]; detect = vi.fn() }
    expect(await decodeQrImage(new Uint8Array(qrPng(QR_VCARD_30)), imageWin({ native: NoQr }).win)).toEqual({ ok: false, code: "NOT_FOUND" })
  })
})
