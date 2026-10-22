import { writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test"
import { STORES, USERS, closeDb, login, readDb, switchStore } from "./support"
import { qrMatrix } from "../../lib/cadastros/vcard/__fixtures__/qr"

/**
 * Câmera com DISPOSITIVO SINTÉTICO do Chromium (`--use-fake-device-for-media-stream`):
 * prova o ciclo de vida (permissão, indicador, leitura de quadros reais pelo jsQR,
 * encerramento das tracks), não homologa câmera física. Nenhum mock de decodificação.
 */
test.afterAll(closeDb)
const B = STORES.variedades
const BASE_URL = process.env.RAMOS_E2E_BASE_URL
const CAMERA_NAME = "Cliente QR Câmera Sintética"
const crlf = (lines: string[]) => lines.join("\r\n") + "\r\n"
const CAMERA_VCARD = crlf(["BEGIN:VCARD", "VERSION:4.0", `FN:${CAMERA_NAME}`, "TEL;TYPE=cell:(14) 99321-6655", "EMAIL:camera.qr@e2e-qr.invalid", "END:VCARD"])

/**
 * O "headless shell" do Playwright não tem captura de mídia (getUserMedia → NotSupportedError):
 * a câmera sintética exige o Chromium completo, instalado junto pelo `playwright install chromium`.
 */
const CAMERA_CHANNEL = "chromium"

/**
 * Vídeo Y4M (I420) usado como "sensor" da câmera sintética: QR centralizado em fundo branco,
 * ou só fundo branco (`null`). O padrão animado embutido do Chromium não serve: a track dele
 * pode terminar sozinha em menos de 1 s, o que seria outro cenário (falha da câmera).
 */
function cameraVideo(content: string | null): string {
  const width = 640, height = 480, scale = 6, quiet = 4
  const y = Buffer.alloc(width * height, 235)
  if (content) {
    const matrix = qrMatrix(content)
    const side = (matrix.length + quiet * 2) * scale
    const left = (width - side) >> 1, top = (height - side) >> 1
    for (let r = 0; r < matrix.length; r++) for (let c = 0; c < matrix.length; c++) {
      if (!matrix[r][c]) continue
      for (let dy = 0; dy < scale; dy++) y.fill(16, (top + (r + quiet) * scale + dy) * width + left + (c + quiet) * scale, (top + (r + quiet) * scale + dy) * width + left + (c + quiet + 1) * scale)
    }
  }
  const chroma = Buffer.alloc((width / 2) * (height / 2) * 2, 128)
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y, chroma])
  const file = path.join(os.tmpdir(), `omni-qr-camera-${content ? "qr" : "branco"}-${process.pid}.y4m`)
  writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\n`), frame, frame]))
  return file
}
const cameraArgs = (content: string | null) => ["--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${cameraVideo(content)}`]

/** Instrumentação SÓ de teste: guarda as streams entregues para conferir que todas as tracks terminaram. */
async function cameraContext(browser: Browser, granted: boolean): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: BASE_URL, serviceWorkers: "block", locale: "pt-BR", viewport: { width: 1440, height: 1000 },
    permissions: granted ? ["camera"] : [],
  })
  await context.addInitScript(() => {
    const md = navigator.mediaDevices
    if (!md?.getUserMedia) return
    const original = md.getUserMedia.bind(md)
    const streams: MediaStream[] = []
    Object.defineProperty(window, "__e2eStreams", { value: streams })
    md.getUserMedia = async (constraints) => { const s = await original(constraints); streams.push(s); return s }
  })
  return { context, page: await context.newPage() }
}
const tracks = (page: Page) => page.evaluate(() => {
  const streams = (window as unknown as { __e2eStreams?: MediaStream[] }).__e2eStreams ?? []
  return streams.flatMap((s) => s.getTracks()).map((t) => ({ kind: t.kind, state: t.readyState }))
})

async function openImport(page: Page): Promise<Locator> {
  await page.goto("/dashboard/cadastros-v2")
  await page.getByRole("button", { name: "Clientes", exact: true }).click()
  const toolbar = page.getByPlaceholder("Buscar em clientes…").locator("xpath=ancestor::div[contains(@class,'mb-4')][1]")
  await toolbar.getByRole("button", { name: "Novo", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Novo cliente" })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Importar contato" }).click()
  return dialog
}

test("câmera sintética com QR: clique → indicador → QR lido → câmera desligada → revisar → salvar uma vez", async ({ playwright }) => {
  const browser = await playwright.chromium.launch({ channel: CAMERA_CHANNEL, args: cameraArgs(CAMERA_VCARD) })
  try {
    const { page } = await cameraContext(browser, true)
    await login(page, USERS.admin)
    await switchStore(page, "Variedades Sintética B")
    // A política do app libera câmera só para a própria origem; o resto segue bloqueado.
    const policy = (await page.request.get("/login")).headers()["permissions-policy"]
    expect(policy).toBe("camera=(self), microphone=(self), geolocation=(), interest-cohort=()")
    const dialog = await openImport(page)
    expect(await tracks(page)).toEqual([]) // nada aberto antes do clique

    await dialog.getByRole("button", { name: "Ler QR Code com câmera" }).click()
    // O QR é reconhecido em poucos quadros; a prévia só aparece depois de a captura terminar.
    await expect(dialog.getByText(/QR Code lido pela câmera: 1 contato reconhecido/)).toBeVisible()
    await expect(dialog.getByLabel("Prévia: Nome")).toHaveValue(CAMERA_NAME)
    await expect(dialog.getByLabel("Prévia: Telefone / WhatsApp")).toHaveValue("(14) 99321-6655")
    await expect(dialog.getByLabel("Prévia da câmera")).toBeHidden()
    await expect(dialog.getByText(/Câmera ligada/)).toHaveCount(0)
    const used = await tracks(page)
    expect(used.map((t) => t.kind)).toEqual(["video"]) // sem microfone
    expect(used.every((t) => t.state === "ended")).toBe(true)
    expect(await dialog.getByLabel("Prévia da câmera").evaluate((v) => (v as HTMLVideoElement).srcObject)).toBeNull()

    await dialog.getByRole("button", { name: "Aplicar aos campos vazios" }).click()
    await dialog.getByRole("checkbox", { name: "Revisei os dados e confirmo o cadastro." }).check()
    await dialog.getByRole("button", { name: "Salvar cliente" }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(async () => (await readDb()).cliente.count({ where: { name: CAMERA_NAME } })).toBe(1)
    const [row] = await (await readDb()).cliente.findMany({ where: { name: CAMERA_NAME } })
    expect({ storeId: row.storeId, phone: row.phone, email: row.email }).toEqual({ storeId: B, phone: "(14) 99321-6655", email: "camera.qr@e2e-qr.invalid" })
  } finally { await browser.close() }
})

test("câmera sintética sem QR: indicador visível; cancelar e fechar o diálogo encerram as tracks; nada gravado", async ({ playwright }) => {
  // Quadros brancos: câmera viva, nenhum QR.
  const browser = await playwright.chromium.launch({ channel: CAMERA_CHANNEL, args: cameraArgs(null) })
  try {
    const { page } = await cameraContext(browser, true)
    await login(page, USERS.admin)
    await switchStore(page, "Variedades Sintética B")
    const dialog = await openImport(page)

    await dialog.getByRole("button", { name: "Ler QR Code com câmera" }).click()
    await expect(dialog.getByText(/Câmera ligada: aponte para o QR Code do contato/)).toBeVisible()
    await expect(dialog.getByLabel("Prévia da câmera")).toBeVisible()
    await expect.poll(() => dialog.getByLabel("Prévia da câmera").evaluate((v) => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0)
    expect((await tracks(page)).map((t) => t.state)).toEqual(["live"])
    await dialog.getByRole("button", { name: "Cancelar leitura" }).click()
    await expect(dialog.getByText(/Câmera ligada/)).toHaveCount(0)
    await expect.poll(async () => (await tracks(page)).map((t) => t.state)).toEqual(["ended"])

    await dialog.getByRole("button", { name: "Ler QR Code com câmera" }).click()
    await expect(dialog.getByText(/Câmera ligada/)).toBeVisible()
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(async () => (await tracks(page)).map((t) => t.state)).toEqual(["ended", "ended"])
    expect(await (await readDb()).cliente.count({ where: { name: { contains: "QR Câmera" }, NOT: { name: CAMERA_NAME } } })).toBe(0)
  } finally { await browser.close() }
})

test("permissão de câmera negada: mensagem com alternativas, sem track; imagem e .vcf continuam disponíveis", async ({ playwright }) => {
  const browser = await playwright.chromium.launch({ channel: CAMERA_CHANNEL, args: cameraArgs(null) })
  try {
    const { page } = await cameraContext(browser, false)
    await login(page, USERS.admin)
    await switchStore(page, "Variedades Sintética B")
    const dialog = await openImport(page)
    await dialog.getByRole("button", { name: "Ler QR Code com câmera" }).click()
    await expect(dialog.getByRole("alert")).toHaveText(/A permissão da câmera foi negada\..*“Escolher imagem de QR Code”, o arquivo \.vcf ou cole o conteúdo do vCard\./)
    await expect(dialog.getByRole("button", { name: "Repetir tentativa" })).toBeVisible()
    await expect(dialog.getByLabel("Prévia da câmera")).toBeHidden()
    expect(await tracks(page)).toEqual([])
    await expect(dialog.getByLabel("Escolher imagem de QR Code")).toBeEnabled()
    await expect(dialog.getByLabel("Arquivo de contato (.vcf)")).toBeEnabled()
    await expect(dialog.getByLabel("Ou cole o conteúdo do vCard")).toBeEnabled()
  } finally { await browser.close() }
})
