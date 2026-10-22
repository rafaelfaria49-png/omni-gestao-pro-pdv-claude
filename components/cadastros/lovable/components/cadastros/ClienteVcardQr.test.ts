// @vitest-environment jsdom
import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { QrCameraOptions } from "@/lib/cadastros/vcard/qr-browser"

const h = vi.hoisted(() => ({
  interpret: vi.fn(),
  save: vi.fn<(...args: unknown[]) => Promise<{ ok: true; id: string } | { ok: false; message: string }>>(),
  start: vi.fn(),
  actualStart: null as null | ((o: QrCameraOptions) => { stop: () => void; readonly stopped: boolean }),
}))
vi.mock("@/app/actions/cliente-texto-livre", () => ({ interpretarClienteTextoLivre: h.interpret, salvarClienteRevisado: h.save }))
// Só a ABERTURA da câmera pode ser controlada pelo teste; a leitura de imagem usa o módulo real (jsQR real).
vi.mock("@/lib/cadastros/vcard/qr-browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cadastros/vcard/qr-browser")>()
  h.actualStart = actual.startQrCamera
  return { ...actual, startQrCamera: (o: QrCameraOptions) => h.start(o) }
})
import { ClienteEditor, ClienteEditorDialog } from "./ClienteEditor"
import { QR_ERROR_MESSAGES } from "@/lib/cadastros/vcard/qr"
import { QR_PIX, QR_URL, QR_VCARD_30, QR_VCARD_40, QR_WIFI, qrPng, qrRgba } from "@/lib/cadastros/vcard/__fixtures__/qr"

const props = () => ({ storeId: "loja-a", editing: null, onClose: vi.fn(), onSaved: vi.fn() })
const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value
const edit = (label: string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } })
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }))
const qrGroup = () => screen.getByRole("group", { name: "QR Code do contato" })
const openImport = () => click("Importar contato")

/** Imagens sintéticas: o PNG real do fixture e os pixels que a "plataforma" devolve ao desenhá-lo. */
const scenes = new Map<string, ReturnType<typeof qrRgba>>()
function qrImage(content: string, name = "qr-sintetico.png", type = "image/png") {
  const png = qrPng(content)
  scenes.set(png.toString("base64"), qrRgba(content))
  return new File([new Uint8Array(png)], name, { type })
}
const RealFileReader = FileReader
const bytesOf = (blob: Blob) => new Promise<ArrayBuffer>((resolve) => {
  const reader = new RealFileReader()
  reader.onload = () => resolve(reader.result as ArrayBuffer)
  reader.readAsArrayBuffer(blob)
})
type Pending = { finish: () => Promise<void>; fail: () => void }
let reads: Pending[] = []
class ControlledReader {
  result: ArrayBuffer | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  readAsArrayBuffer(file: File) { reads.push({ finish: async () => { this.result = await bytesOf(file); this.onload?.() }, fail: () => this.onerror?.() }) }
}
let bitmaps: Array<{ close: ReturnType<typeof vi.fn> }> = []
let drawn: ReturnType<typeof qrRgba> | null = null
async function chooseImage(file: File, opts: { finish?: boolean } = { finish: true }) {
  fireEvent.change(screen.getByLabelText("Escolher imagem de QR Code"), { target: { files: [file] } })
  if (opts.finish === false || !reads.length) return
  await act(async () => { await reads[reads.length - 1].finish() })
  // Depois da leitura do arquivo, a decodificação local segue assíncrona até a prévia ou a recusa.
  await waitFor(() => expect(screen.queryByText("Procurando o QR Code na imagem, neste navegador…")).toBeNull())
}

/** MediaStream sintético para a câmera real (`startQrCamera` sem mock). */
function fakeCamera(result: "grant" | { name: string } = "grant") {
  const track = { stop: vi.fn(), addEventListener: vi.fn() }
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  const getUserMedia = vi.fn(() => result === "grant" ? Promise.resolve(stream) : Promise.reject(Object.assign(new Error("x"), result)))
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } })
  return { track, stream, getUserMedia }
}

beforeEach(() => {
  vi.clearAllMocks()
  reads = []; bitmaps = []; drawn = null
  vi.stubGlobal("React", React)
  vi.stubGlobal("FileReader", ControlledReader)
  h.save.mockResolvedValue({ ok: true, id: "synthetic" })
  h.start.mockImplementation((o: QrCameraOptions) => h.actualStart!(o))
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true })
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined })
  const createImageBitmap = vi.fn(async (blob: Blob) => {
    const pixels = scenes.get(Buffer.from(await bytesOf(blob)).toString("base64"))
    if (!pixels) throw new Error("decode")
    drawn = pixels
    const bitmap = { width: pixels.width, height: pixels.height, close: vi.fn() }
    bitmaps.push(bitmap)
    return bitmap
  })
  Object.defineProperty(window, "createImageBitmap", { configurable: true, value: createImageBitmap })
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    return { fillRect: () => undefined, drawImage: () => undefined, fillStyle: "", getImageData: () => drawn ?? { data: new Uint8ClampedArray(4), width: 1, height: 1 } } as unknown as CanvasRenderingContext2D
  } as never)
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe("QR Code de contato no importador vCard existente", () => {
  it("fica dentro da importação; a câmera nunca abre sozinha; vCard por arquivo e texto continuam", () => {
    const cam = fakeCamera()
    render(React.createElement(ClienteEditor, props()))
    expect(screen.queryByRole("group", { name: "QR Code do contato" })).toBeNull()
    openImport()
    expect(within(qrGroup()).getByRole("button", { name: "Ler QR Code com câmera" })).toBeTruthy()
    expect((screen.getByLabelText("Escolher imagem de QR Code") as HTMLInputElement).accept).toBe("image/png,image/jpeg,image/webp")
    expect(screen.getByLabelText("Arquivo de contato (.vcf)")).toBeTruthy()
    expect(screen.getByLabelText("Ou cole o conteúdo do vCard")).toBeTruthy()
    expect((screen.getByLabelText("Prévia da câmera") as HTMLVideoElement).hidden).toBe(true)
    expect(cam.getUserMedia).not.toHaveBeenCalled()
    expect(h.start).not.toHaveBeenCalled()
  })

  it("imagem PNG com vCard 3.0 → mesma prévia → campos manuais preservados → aplicar → salvar só após confirmar", async () => {
    render(React.createElement(ClienteEditor, props()))
    edit("Cidade", "Cidade Manual")
    openImport()
    await chooseImage(qrImage(QR_VCARD_30))
    expect(screen.getByText(/QR Code lido da imagem: 1 contato reconhecido/)).toBeTruthy()
    expect(value("Prévia: Nome")).toBe("Lia Sintética do QR")
    expect(value("Prévia: Telefone / WhatsApp")).toBe("(14) 99888-7766")
    expect(within(screen.getByRole("group", { name: "Divergências com o formulário" })).getByText(/no formulário: “Cidade Manual”; no contato: “Itaí”/)).toBeTruthy()
    expect(bitmaps[0].close).toHaveBeenCalledOnce()
    expect(h.save).not.toHaveBeenCalled()
    click("Aplicar aos campos vazios")
    expect(value("Nome *")).toBe("Lia Sintética do QR")
    expect(value("Email")).toBe("lia.qr@exemplo.invalid")
    expect(value("Cidade")).toBe("Cidade Manual")
    expect(h.save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("checkbox")); click("Salvar cliente")
    await waitFor(() => expect(h.save).toHaveBeenCalledOnce())
    const sent = JSON.stringify(h.save.mock.calls)
    for (const raw of ["BEGIN:VCARD", "Brasil", "qr-sintetico.png", "VERSION"]) expect(sent).not.toContain(raw)
  })

  it.each([
    ["link", QR_URL, "LINK"], ["PIX", QR_PIX, "PIX"], ["Wi-Fi", QR_WIFI, "WIFI"],
  ])("QR com %s: mensagem honesta, sem prévia, sem abrir nada", async (_l, content, code) => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null)
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy)
    const href = window.location.href
    render(React.createElement(ClienteEditor, props()))
    openImport()
    await chooseImage(qrImage(content))
    expect(screen.getByRole("alert").textContent).toBe(QR_ERROR_MESSAGES[code as keyof typeof QR_ERROR_MESSAGES])
    expect(screen.queryByLabelText("Prévia: Nome")).toBeNull()
    expect(document.body.textContent).not.toMatch(/exemplo\.invalid|RedeSintetica|FULANO/)
    expect(open).not.toHaveBeenCalled(); expect(fetchSpy).not.toHaveBeenCalled()
    expect(window.location.href).toBe(href)
  })

  it("conteúdo, não extensão: texto com nome .png é recusado; imagem acima de 10 MiB nem é lida", async () => {
    render(React.createElement(ClienteEditor, props()))
    openImport()
    await chooseImage(new File(["BEGIN:VCARD\r\nVERSION:3.0\r\nFN:X\r\nEND:VCARD\r\n"], "contato.png", { type: "image/png" }))
    expect(screen.getByRole("alert").textContent).toBe(QR_ERROR_MESSAGES.IMAGE_FORMAT)
    reads = []
    await chooseImage(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "grande.jpg", { type: "image/jpeg" }))
    expect(reads).toHaveLength(0)
    expect(screen.getByRole("alert").textContent).toBe(QR_ERROR_MESSAGES.IMAGE_TOO_LARGE)
    // PNG válido no cabeçalho mas que a plataforma não consegue abrir.
    const broken = qrPng(QR_VCARD_30); broken[40] ^= 0xff
    await chooseImage(new File([new Uint8Array(broken)], "corrompido.png", { type: "image/png" }))
    expect(screen.getByRole("alert").textContent).toBe(QR_ERROR_MESSAGES.IMAGE_CORRUPT)
    // Arquivo que o navegador não consegue ler: mensagem de leitura, não de decodificador.
    await chooseImage(qrImage(QR_VCARD_30), { finish: false })
    await act(async () => { reads[reads.length - 1].fail() })
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(QR_ERROR_MESSAGES.IMAGE_READ))
    expect(screen.queryByText("Procurando o QR Code na imagem, neste navegador…")).toBeNull()
  })

  it("troca de imagem, cancelar e troca de loja durante a leitura: o resultado atrasado é descartado", async () => {
    const p = props()
    const view = render(React.createElement(ClienteEditor, { ...p, key: "loja-a" }))
    openImport()
    await chooseImage(qrImage(QR_VCARD_40, "a.png"), { finish: false })
    expect(screen.getByText("Procurando o QR Code na imagem, neste navegador…")).toBeTruthy()
    await chooseImage(qrImage(QR_VCARD_30, "b.png"), { finish: false })
    await act(async () => { await reads[1].finish() })
    await act(async () => { await reads[0].finish() })
    await waitFor(() => expect(value("Prévia: Nome")).toBe("Lia Sintética do QR"))
    await new Promise((r) => setTimeout(r, 50))
    expect(value("Prévia: Nome")).toBe("Lia Sintética do QR")
    expect(bitmaps).toHaveLength(1) // a imagem trocada nem chegou a ser aberta

    await chooseImage(qrImage(QR_VCARD_40, "c.png"), { finish: false })
    click("Cancelar leitura")
    await act(async () => { await reads[2].finish() })
    expect(screen.queryByLabelText("Prévia: Nome")).toBeNull()
    expect(screen.queryByText(/contato reconhecido/)).toBeNull()

    await chooseImage(qrImage(QR_VCARD_40, "d.png"), { finish: false })
    view.rerender(React.createElement(ClienteEditor, { ...p, key: "loja-b", storeId: "loja-b" }))
    await act(async () => { await reads[3].finish() })
    expect(screen.queryByLabelText("Escolher imagem de QR Code")).toBeNull()
    expect(value("Nome *")).toBe("")
    expect(h.save).not.toHaveBeenCalled()
  })

  it("câmera: só por clique, indicador visível, primeiro QR encerra a captura e vai à prévia uma vez", async () => {
    let opts!: QrCameraOptions
    const stop = vi.fn()
    h.start.mockImplementation((o: QrCameraOptions) => { opts = o; return { stop, stopped: false } })
    render(React.createElement(ClienteEditor, props()))
    openImport()
    click("Ler QR Code com câmera")
    expect(h.start).toHaveBeenCalledOnce()
    expect(opts.video).toBe(screen.getByLabelText("Prévia da câmera"))
    expect(screen.getByText(/Abrindo a câmera/)).toBeTruthy()
    act(() => opts.onActive())
    expect(screen.getByText(/Câmera ligada: aponte para o QR Code do contato/)).toBeTruthy()
    expect((screen.getByLabelText("Prévia da câmera") as HTMLVideoElement).hidden).toBe(false)
    act(() => opts.onPayload({ source: "text", text: QR_VCARD_40 }))
    expect(screen.getByText(/QR Code lido pela câmera: 1 contato reconhecido/)).toBeTruthy()
    expect(value("Prévia: Nome")).toBe("João Ação Çedilha QR")
    expect((screen.getByLabelText("Prévia da câmera") as HTMLVideoElement).hidden).toBe(true)
    // Leitura repetida do mesmo QR não reimporta nem apaga edições da prévia.
    edit("Prévia: Nome", "João Revisado")
    act(() => opts.onPayload({ source: "text", text: QR_VCARD_40 }))
    act(() => opts.onError("CAMERA_FAILED"))
    expect(value("Prévia: Nome")).toBe("João Revisado")
    expect(screen.queryByRole("alert")).toBeNull()
    expect(h.save).not.toHaveBeenCalled()
  })

  it("nova tentativa invalida a anterior; QR incompatível pela câmera oferece repetir", async () => {
    const all: QrCameraOptions[] = []
    h.start.mockImplementation((o: QrCameraOptions) => { all.push(o); return { stop: vi.fn(), stopped: false } })
    render(React.createElement(ClienteEditor, props()))
    openImport()
    click("Ler QR Code com câmera")
    click("Cancelar leitura")
    click("Ler QR Code com câmera")
    act(() => all[0].onPayload({ source: "text", text: QR_VCARD_30 }))
    expect(screen.queryByLabelText("Prévia: Nome")).toBeNull()
    act(() => all[1].onPayload({ source: "text", text: QR_URL }))
    expect(screen.getByRole("alert").textContent).toBe(QR_ERROR_MESSAGES.LINK)
    click("Repetir tentativa")
    expect(all).toHaveLength(3)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it.each([
    [{ name: "NotAllowedError" }, "CAMERA_DENIED"], [{ name: "NotFoundError" }, "CAMERA_NOT_FOUND"], [{ name: "NotReadableError" }, "CAMERA_BUSY"],
  ] as const)("permissão/dispositivo (%o) → %s, com alternativas e sem câmera ligada", async (failure, code) => {
    const cam = fakeCamera(failure)
    render(React.createElement(ClienteEditor, props()))
    openImport()
    click("Ler QR Code com câmera")
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(QR_ERROR_MESSAGES[code]))
    expect(QR_ERROR_MESSAGES[code]).toMatch(/Escolher imagem de QR Code|arquivo \.vcf/)
    expect(cam.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }))
    expect((screen.getByLabelText("Prévia da câmera") as HTMLVideoElement).hidden).toBe(true)
    expect(screen.getByRole("button", { name: "Repetir tentativa" })).toBeTruthy()
    expect(screen.getByLabelText("Escolher imagem de QR Code")).toBeTruthy()
  })

  it("navegador sem câmera: mensagem honesta; a leitura por imagem continua funcionando", async () => {
    render(React.createElement(ClienteEditor, props()))
    openImport()
    click("Ler QR Code com câmera")
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(QR_ERROR_MESSAGES.CAMERA_UNSUPPORTED))
    await chooseImage(qrImage(QR_VCARD_30))
    expect(value("Prévia: Nome")).toBe("Lia Sintética do QR")
  })

  it.each([
    ["Cancelar leitura", () => click("Cancelar leitura")],
    ["Cancelar importação", () => click("Cancelar importação")],
    ["arquivo .vcf escolhido", () => fireEvent.change(screen.getByLabelText("Arquivo de contato (.vcf)"), { target: { files: [new File(["x"], "a.vcf")] } })],
    ["texto colado", () => edit("Ou cole o conteúdo do vCard", "B")],
    ["aba oculta", () => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); fireEvent(document, new Event("visibilitychange")) }],
    ["saída da página", () => fireEvent(window, new Event("pagehide"))],
  ])("câmera real encerrada ao: %s (tracks paradas, prévia sem fonte)", async (_l, act_) => {
    const cam = fakeCamera()
    render(React.createElement(ClienteEditor, props()))
    openImport()
    click("Ler QR Code com câmera")
    await waitFor(() => expect(screen.getByText(/Câmera ligada/)).toBeTruthy())
    const video = screen.getByLabelText("Prévia da câmera") as HTMLVideoElement
    expect(video.srcObject).toBe(cam.stream)
    act(() => act_())
    expect(cam.track.stop).toHaveBeenCalledOnce()
    expect(video.srcObject).toBeNull()
    expect(screen.queryByText(/Câmera ligada/)).toBeNull()
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
  })

  it("câmera real encerrada ao fechar o diálogo e ao trocar de loja", async () => {
    const p = props()
    const cam = fakeCamera()
    const view = render(React.createElement(ClienteEditorDialog, { ...p, open: true }))
    openImport(); click("Ler QR Code com câmera")
    await waitFor(() => expect(screen.getByText(/Câmera ligada/)).toBeTruthy())
    view.rerender(React.createElement(ClienteEditorDialog, { ...p, open: false }))
    expect(cam.track.stop).toHaveBeenCalledOnce()

    const cam2 = fakeCamera()
    view.rerender(React.createElement(ClienteEditorDialog, { ...p, open: true }))
    openImport(); click("Ler QR Code com câmera")
    await waitFor(() => expect(screen.getByText(/Câmera ligada/)).toBeTruthy())
    view.rerender(React.createElement(ClienteEditorDialog, { ...p, storeId: "loja-b", open: true }))
    expect(cam2.track.stop).toHaveBeenCalledOnce()
    expect(screen.queryByText(/Câmera ligada/)).toBeNull()
  })

  it("permissão que chega depois do cancelamento não liga a câmera", async () => {
    let grant!: (s: unknown) => void
    const track = { stop: vi.fn(), addEventListener: vi.fn() }
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: () => new Promise((r) => { grant = r }) } })
    render(React.createElement(ClienteEditor, props()))
    openImport(); click("Ler QR Code com câmera")
    click("Cancelar leitura")
    await act(async () => { grant({ getTracks: () => [track], getVideoTracks: () => [track] }) })
    expect(track.stop).toHaveBeenCalledOnce()
    expect(screen.queryByText(/Câmera ligada/)).toBeNull()
    expect((screen.getByLabelText("Prévia da câmera") as HTMLVideoElement).srcObject ?? null).toBeNull()
  })

  it("privacidade: sem rede, storage, log nem URL com o conteúdo do QR", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy)
    const xhr = vi.spyOn(XMLHttpRequest.prototype, "open")
    const idb = { open: vi.fn() }; vi.stubGlobal("indexedDB", idb)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m))
    const href = window.location.href
    render(React.createElement(ClienteEditor, props()))
    openImport()
    await chooseImage(qrImage(QR_VCARD_30))
    await chooseImage(qrImage(QR_URL))
    await chooseImage(qrImage(QR_VCARD_30))
    click("Aplicar aos campos vazios")
    expect(fetchSpy).not.toHaveBeenCalled(); expect(xhr).not.toHaveBeenCalled(); expect(idb.open).not.toHaveBeenCalled(); expect(setItem).not.toHaveBeenCalled()
    for (const log of logs) expect(JSON.stringify(log.mock.calls.map((args) => args.map(String)))).not.toMatch(/Sintética|exemplo\.invalid|BEGIN:VCARD|qr-sintetico/)
    expect(window.location.href).toBe(href)
  })
})
