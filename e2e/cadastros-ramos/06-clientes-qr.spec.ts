import { expect, test, type Locator, type Page, type Request } from "@playwright/test"
import { STORES, USERS, closeDb, evidence, login, logoutViaSeguranca, readDb, switchStore } from "./support"
import { QR_PIX, QR_URL, pngFromGray, qrPng, qrPngRow } from "../../lib/cadastros/vcard/__fixtures__/qr"

/**
 * Contato por QR Code (imagem) no editor real de Clientes, sem mock do decodificador:
 * imagem sintética escolhida → jsQR real no navegador (Chromium de CI não tem
 * BarcodeDetector, então este é o caminho "sem suporte nativo") → mesma prévia do
 * vCard → aplicar → revisar → `salvarClienteRevisado` → ClientWriteService.
 * O banco descartável só é LIDO para conferir.
 */
test.afterAll(closeDb)
const A = STORES.padaria
const B = STORES.variedades

const crlf = (lines: string[]) => lines.join("\r\n") + "\r\n"
const SECRET_NOTE = "NOTA-PRIVADA-E2E-QR"
function vcard(name: string, phone: string, email: string) {
  return crlf([
    "BEGIN:VCARD", "VERSION:3.0", `FN:${name}`, `TEL;TYPE=CELL:${phone}`, `EMAIL:${email}`,
    "ADR;TYPE=HOME:;;Rua Sintética do QR\\, 77;Avaré;SP;18700-000;Brasil",
    `NOTE:${SECRET_NOTE} abra https://exfiltra.e2e-qr.invalid`,
    "URL:https://site.e2e-qr.invalid/perfil",
    "END:VCARD",
  ])
}
const IMAGE_NAME = "qr-contato-sintetico-e2e.png"
/** Marcadores que NUNCA podem sair do navegador nem ir para storage. */
const NEVER_SENT = [IMAGE_NAME, "BEGIN:VCARD", SECRET_NOTE, "e2e-qr.invalid/perfil", "exfiltra", "18700-000", "iVBORw0KGgo"]

const chooseImage = (page: Page, name: string, mimeType: string, buffer: Buffer) =>
  page.getByLabel("Escolher imagem de QR Code").setInputFiles({ name, mimeType, buffer })

/** Corpo em UTF-8 para asserções de texto (nomes acentuados) e bytes crus para assinaturas de imagem. */
function recordRequests(page: Page) {
  const seen: Array<{ url: string; method: string; body: string; raw: Buffer; action: string | null }> = []
  page.on("request", (req: Request) => {
    const raw = req.postDataBuffer() ?? Buffer.alloc(0)
    seen.push({ url: req.url(), method: req.method(), body: raw.toString("utf8"), raw, action: req.headers()["next-action"] ?? null })
  })
  return seen
}
const IMAGE_SIGNATURES = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("WEBPVP8")]
function expectNothingLeaked(seen: Array<{ url: string; body: string; raw: Buffer }>) {
  // Nenhuma requisição a endereços do QR e nenhum byte da imagem ou do conteúdo bruto no corpo/URL.
  expect(seen.filter((r) => /e2e-qr\.invalid|exemplo\.invalid/.test(r.url)).map((r) => r.url)).toEqual([])
  for (const marker of NEVER_SENT) expect(seen.filter((r) => r.body.includes(marker) || r.url.includes(marker)).map((r) => r.url)).toEqual([])
  expect(seen.filter((r) => IMAGE_SIGNATURES.some((sig) => r.raw.includes(sig))).map((r) => r.url)).toEqual([])
}
async function expectStorageClean(page: Page) {
  const dump = await page.evaluate(async () => {
    const dbs = typeof indexedDB.databases === "function" ? (await indexedDB.databases()).map((d) => d.name) : []
    return JSON.stringify([{ ...localStorage }, { ...sessionStorage }, dbs, location.href])
  })
  for (const marker of [...NEVER_SENT, "Rua Sintética do QR", "Cliente QR Sintético"]) expect(dump).not.toContain(marker)
}

async function openClientes(page: Page) {
  await page.goto("/dashboard")
  await page.getByRole("link", { name: /Cadastros HUB/ }).first().click()
  await page.waitForURL(/\/dashboard\/cadastros-v2/)
  await expect(page.getByRole("heading", { name: "Cadastros HUB" })).toBeVisible()
  await page.getByRole("button", { name: "Clientes", exact: true }).click()
  await expect(page.getByPlaceholder("Buscar em clientes…")).toBeVisible()
}
async function openNewClient(page: Page): Promise<Locator> {
  const toolbar = page.getByPlaceholder("Buscar em clientes…").locator("xpath=ancestor::div[contains(@class,'mb-4')][1]")
  await toolbar.getByRole("button", { name: "Novo", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Novo cliente" })
  await expect(dialog).toBeVisible()
  return dialog
}
const clientsNamed = async (name: string, storeId?: string) => (await readDb()).cliente.findMany({ where: { name, ...(storeId ? { storeId } : {}) } })

/** JPEG e WebP reais, codificados pelo próprio Chromium a partir do PNG sintético (página em branco, sem rede). */
async function reencode(page: Page, png: Buffer, type: "image/jpeg" | "image/webp"): Promise<Buffer> {
  const other = await page.context().newPage()
  try {
    const b64 = await other.evaluate(async ({ data, type }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${data}`
      await img.decode()
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
      const ctx = canvas.getContext("2d")!
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      return canvas.toDataURL(type, 0.92).split(",")[1]
    }, { data: png.toString("base64"), type })
    return Buffer.from(b64, "base64")
  } finally { await other.close() }
}

test("QR por imagem: PNG → prévia → aplicar → revisar → salvar → listar → reabrir → novo login", async ({ page }) => {
  const NAME = "Cliente QR Sintético Alfa"
  const png = qrPng(vcard(NAME, "(14) 99712-3456", "alfa.qr@e2e-qr.invalid"), { scale: 6 })
  const seen = recordRequests(page)
  await login(page, USERS.admin)
  await switchStore(page, "Variedades Sintética B")
  await openClientes(page)
  const dialog = await openNewClient(page)

  await test.step("Campo digitado antes; a câmera não abre sozinha", async () => {
    await dialog.getByLabel("Cidade", { exact: true }).fill("Cidade Manual QR")
    await dialog.getByRole("button", { name: "Importar contato" }).click()
    await expect(dialog.getByRole("button", { name: "Ler QR Code com câmera" })).toBeVisible()
    await expect(dialog.getByLabel("Prévia da câmera")).toBeHidden()
  })

  await test.step("Imagem PNG → decodificação local → prévia do importador existente", async () => {
    await chooseImage(page, IMAGE_NAME, "image/png", png)
    await expect(dialog.getByText(/QR Code lido da imagem: 1 contato reconhecido/)).toBeVisible()
    await expect(dialog.getByLabel("Prévia: Nome")).toHaveValue(NAME)
    await expect(dialog.getByLabel("Prévia: Telefone / WhatsApp")).toHaveValue("(14) 99712-3456")
    await expect(dialog.getByLabel("Prévia: Endereço")).toHaveValue("Rua Sintética do QR, 77")
    await expect(dialog.getByText(/Não utilizados deste contato: .*Links, mensageiros e calendários.*Notas livres/)).toBeVisible()
    const conflicts = dialog.getByRole("group", { name: "Divergências com o formulário" })
    await expect(conflicts.getByText(/no formulário: “Cidade Manual QR”; no contato: “Avaré”/)).toBeVisible()
    expect(await clientsNamed(NAME)).toHaveLength(0)
  })

  await test.step("Mesma imagem lida de novo: uma prévia, nenhuma gravação", async () => {
    await chooseImage(page, IMAGE_NAME, "image/png", png)
    await expect(dialog.getByLabel("Prévia: Nome")).toHaveValue(NAME)
    await expect(dialog.getByText(/QR Code lido da imagem: 1 contato reconhecido/)).toHaveCount(1)
    expect(await clientsNamed(NAME)).toHaveLength(0)
  })

  await test.step("Aplicar aos campos vazios: manual preservado, nada salvo", async () => {
    await dialog.getByRole("button", { name: "Aplicar aos campos vazios" }).click()
    await expect(dialog.getByLabel("Nome *")).toHaveValue(NAME)
    await expect(dialog.getByLabel("Email", { exact: true })).toHaveValue("alfa.qr@e2e-qr.invalid")
    await expect(dialog.getByLabel("Cidade", { exact: true })).toHaveValue("Cidade Manual QR")
    await expect(dialog.getByLabel("CPF / CNPJ")).toHaveValue("")
    await expect(dialog.getByRole("button", { name: "Salvar cliente" })).toBeDisabled()
    expect(await clientsNamed(NAME)).toHaveLength(0)
    expectNothingLeaked(seen)
    await expectStorageClean(page)
  })

  await test.step("Revisar e salvar (duplo clique): uma Server Action, um registro na loja B", async () => {
    await dialog.getByRole("checkbox", { name: "Revisei os dados e confirmo o cadastro." }).check()
    const before = seen.filter((r) => r.action).length
    await dialog.getByRole("button", { name: "Salvar cliente" }).dblclick()
    await expect(page.getByText("Cliente salvo").first()).toBeVisible()
    await expect(dialog).toHaveCount(0)
    expect(seen.slice(before).filter((r) => r.action && r.body.includes(NAME))).toHaveLength(1)
    expectNothingLeaked(seen)
    await expect.poll(async () => (await clientsNamed(NAME)).length).toBe(1)
    const [row] = await clientsNamed(NAME)
    expect({ storeId: row.storeId, phone: row.phone, email: row.email, city: row.city, document: row.document, kind: row.kind })
      .toEqual({ storeId: B, phone: "(14) 99712-3456", email: "alfa.qr@e2e-qr.invalid", city: "Cidade Manual QR", document: "", kind: "PF" })
    expect(JSON.stringify(row)).not.toMatch(new RegExp(`${SECRET_NOTE}|18700|Brasil|e2e-qr\\.invalid/perfil|exfiltra|BEGIN:VCARD`))
    expect(await (await readDb()).cliente.count({ where: { name: NAME, storeId: A } })).toBe(0)
  })

  await test.step("Buscar, reabrir e conferir que a edição não oferece importação", async () => {
    await page.getByPlaceholder("Buscar em clientes…").fill("QR Sintético Alfa")
    const listed = page.locator("tbody tr").filter({ hasText: NAME })
    await expect(listed).toHaveCount(1)
    await listed.getByTitle("Editar cliente").click()
    const editDialog = page.getByRole("dialog", { name: "Editar cliente" })
    await expect(editDialog.getByLabel("Nome *")).toHaveValue(NAME)
    await expect(editDialog.getByLabel("Endereço", { exact: true })).toHaveValue("Rua Sintética do QR, 77")
    await expect(editDialog.getByRole("group", { name: "QR Code do contato" })).toHaveCount(0)
    await editDialog.getByRole("button", { name: "Cancelar" }).click()
    await expectStorageClean(page)
  })

  await test.step("Novo login: persistência conferida, sem regravação", async () => {
    const saved = (await clientsNamed(NAME))[0]
    await logoutViaSeguranca(page)
    await login(page, USERS.admin)
    await switchStore(page, "Variedades Sintética B")
    await openClientes(page)
    await page.getByPlaceholder("Buscar em clientes…").fill("QR Sintético Alfa")
    await expect(page.locator("tbody tr").filter({ hasText: NAME })).toHaveCount(1)
    const again = await clientsNamed(NAME)
    expect(again).toHaveLength(1)
    expect(again[0].updatedAt.toISOString()).toBe(saved.updatedAt.toISOString())
    expectNothingLeaked(seen)
  })
})

test("QR por imagem: JPEG e WebP reais, conteúdo incompatível, imagem grande e corrompida, nada gravado", async ({ page }) => {
  const NAME = "Cliente QR Sintético Formatos"
  const png = qrPng(vcard(NAME, "(14) 99600-1122", "formatos.qr@e2e-qr.invalid"), { scale: 6 })
  const jpeg = await reencode(page, png, "image/jpeg")
  const webp = await reencode(page, png, "image/webp")
  expect([jpeg[0], jpeg[1], webp.subarray(8, 12).toString("latin1")]).toEqual([0xff, 0xd8, "WEBP"])
  const seen = recordRequests(page)
  await login(page, USERS.admin)
  await switchStore(page, "Variedades Sintética B")
  await openClientes(page)
  const dialog = await openNewClient(page)
  await dialog.getByRole("button", { name: "Importar contato" }).click()
  const alert = dialog.getByRole("alert")

  await test.step("JPEG e WebP: mesma prévia", async () => {
    for (const [name, type, buffer] of [["qr.jpg", "image/jpeg", jpeg], ["qr.webp", "image/webp", webp]] as const) {
      await chooseImage(page, name, type, buffer)
      await expect(dialog.getByLabel("Prévia: Nome")).toHaveValue(NAME)
      await dialog.getByRole("button", { name: "Remover arquivo ou conteúdo" }).click()
      await expect(dialog.getByLabel("Prévia: Nome")).toHaveCount(0)
    }
  })

  await test.step("Link, PIX e texto: recusa honesta, nada aberto nem requisitado", async () => {
    const pages = page.context().pages().length
    for (const [content, message] of [
      [QR_URL, /ele contém um link ou endereço de outro aplicativo\. O link não foi aberto\./],
      [QR_PIX, /ele contém uma cobrança PIX/],
      ["Texto comum sintético do QR", /ele contém texto comum/],
    ] as const) {
      await chooseImage(page, "qr-outro.png", "image/png", qrPng(content, { scale: 6 }))
      await expect(alert).toHaveText(message)
      await expect(dialog.getByLabel("Prévia: Nome")).toHaveCount(0)
    }
    expect(page.context().pages()).toHaveLength(pages)
    expect(new URL(page.url()).pathname).toBe("/dashboard/cadastros-v2")
  })

  await test.step("Dois QRs diferentes na mesma imagem: recusa, sem escolher um deles", async () => {
    await chooseImage(page, "dois-qr.png", "image/png", qrPngRow([vcard(NAME, "(14) 99600-1122", "formatos.qr@e2e-qr.invalid"), QR_URL], { scales: [6, 2], gap: 100 }))
    await expect(alert).toHaveText("Há mais de um QR Code na imagem. Use uma imagem só com o QR Code do contato.")
    await expect(dialog.getByLabel("Prévia: Nome")).toHaveCount(0)
  })

  await test.step("Conteúdo, não extensão: vCard em texto com nome .png; imagem sem QR; corrompida; acima de 10 MiB", async () => {
    await chooseImage(page, "contato.png", "image/png", Buffer.from(vcard(NAME, "(14) 99600-1122", "x@e2e-qr.invalid")))
    await expect(alert).toHaveText("O arquivo não é uma imagem PNG, JPG ou WebP válida.")
    await chooseImage(page, "branca.png", "image/png", pngFromGray(320, 320, () => 255))
    await expect(alert).toHaveText(/^Nenhum QR Code foi reconhecido na imagem/)
    const corrupt = Buffer.from(png); corrupt.fill(0, 40, 200)
    await chooseImage(page, "corrompida.png", "image/png", corrupt)
    await expect(alert).toHaveText(/Não foi possível abrir a imagem|Nenhum QR Code foi reconhecido/)
    const big = Buffer.alloc(10 * 1024 * 1024 + 1); png.copy(big)
    await chooseImage(page, "grande.png", "image/png", big)
    await expect(alert).toHaveText("A imagem passa de 10 MiB. Recorte ou reduza a foto do QR Code e tente de novo.")
  })

  await test.step("Cancelar e fechar: nenhum registro; nada vazou", async () => {
    await chooseImage(page, "qr.png", "image/png", png)
    await expect(dialog.getByLabel("Prévia: Nome")).toHaveValue(NAME)
    await dialog.getByRole("button", { name: "Cancelar importação" }).click()
    await expect(dialog.getByLabel("Nome *")).toHaveValue("")
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click()
    expect(await clientsNamed(NAME)).toHaveLength(0)
    // O HUB usa Server Actions para as próprias leituras; nenhuma pode levar o contato (= tentativa de salvar).
    expect(seen.filter((r) => r.action && (r.body.includes(NAME) || r.body.includes("formatos.qr"))).map((r) => r.url)).toEqual([])
    expectNothingLeaked(seen)
    await expectStorageClean(page)
  })
})

test("QR por imagem: leitura feita na loja B não chega à loja A", async ({ page }) => {
  const NAME = "Cliente QR Sintético Troca Loja"
  await login(page, USERS.admin)
  await switchStore(page, "Variedades Sintética B")
  await openClientes(page)
  const dialog = await openNewClient(page)
  await dialog.getByRole("button", { name: "Importar contato" }).click()
  await chooseImage(page, "qr.png", "image/png", qrPng(vcard(NAME, "(14) 99500-3344", "troca.qr@e2e-qr.invalid"), { scale: 6 }))
  await expect(dialog.getByLabel("Prévia: Nome")).toHaveValue(NAME)
  await switchStore(page, "Padaria Sintética A")
  await openClientes(page)
  const fresh = await openNewClient(page)
  await expect(fresh.getByLabel("Escolher imagem de QR Code")).toHaveCount(0)
  await expect(fresh.getByLabel("Nome *")).toHaveValue("")
  await expect(fresh.getByLabel("Telefone / WhatsApp", { exact: true })).toHaveValue("")
  expect(await clientsNamed(NAME)).toHaveLength(0)
})

for (const width of [390, 320]) test(`QR: seção sem overflow horizontal em ${width} px, sem gravar`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", locale: "pt-BR" })
  const page = await context.newPage()
  const NAME = "Cliente QR Responsivo Sintético"
  await login(page, USERS.admin)
  await switchStore(page, "Variedades Sintética B")
  await page.goto("/dashboard/cadastros-v2")
  await page.getByRole("button", { name: "Clientes", exact: true }).click()
  const dialog = await openNewClient(page)
  await dialog.getByRole("button", { name: "Importar contato" }).click()
  await chooseImage(page, "qr.png", "image/png", qrPng(vcard(NAME, "(14) 99400-5566", "resp.qr@e2e-qr.invalid"), { scale: 6 }))
  await expect(dialog.getByLabel("Prévia: Nome")).toHaveValue(NAME)
  const frame = await dialog.boundingBox()
  expect(frame && frame.x >= 0 && frame.x + frame.width <= width + 1).toBe(true)
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  expect(await dialog.evaluate((el) => [...el.querySelectorAll("input, select, textarea, button, video")]
    .every((node) => { const r = node.getBoundingClientRect(); return r.width === 0 || (r.left >= -1 && r.right <= window.innerWidth + 1) }))).toBe(true)
  const camera = await dialog.getByRole("button", { name: "Ler QR Code com câmera" }).boundingBox()
  expect(camera && camera.height >= 40 && camera.x >= 0 && camera.x + camera.width <= width).toBe(true)
  await page.screenshot({ path: evidence(`clientes-qr-${width}.png`), fullPage: true })
  await dialog.getByRole("button", { name: "Cancelar importação" }).click()
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click()
  expect(await clientsNamed(NAME)).toHaveLength(0)
  await context.close()
})

test("QR: desktop 1440 px com a seção aberta, sem overflow", async ({ page }) => {
  await login(page, USERS.admin)
  await switchStore(page, "Variedades Sintética B")
  await openClientes(page)
  const dialog = await openNewClient(page)
  await dialog.getByRole("button", { name: "Importar contato" }).click()
  await expect(dialog.getByRole("group", { name: "QR Code do contato" })).toBeVisible()
  expect(await page.evaluate(() => window.innerWidth)).toBe(1440)
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await page.screenshot({ path: evidence("clientes-qr-1440.png") })
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click()
})
