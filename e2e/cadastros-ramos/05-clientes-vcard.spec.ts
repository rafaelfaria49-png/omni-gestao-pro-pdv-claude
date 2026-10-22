import { expect, test, type Locator, type Page, type Request } from "@playwright/test"
import { STORES, USERS, closeDb, evidence, login, logoutViaSeguranca, readDb, switchStore } from "./support"

/**
 * Importação assistida de contato vCard no editor real de Clientes.
 * Caminho de sucesso sem mocks: arquivo sintético lido no navegador, prévia,
 * aplicação, revisão humana, Server Action `salvarClienteRevisado` e
 * ClientWriteService reais. O banco descartável só é LIDO para conferir.
 */
test.afterAll(closeDb)
const A = STORES.padaria
const B = STORES.variedades
const ORIGIN = new URL(process.env.RAMOS_E2E_BASE_URL ?? "http://127.0.0.1:3000").origin

const crlf = (lines: string[]) => lines.join("\r\n") + "\r\n"
const FILE_NAME = "agenda-sintetica-e2e.vcf"
const NOT_CHOSEN = "Pessoa Nao Escolhida Sintetica"
const SECRET_NOTE = "NOTA-PRIVADA-E2E-VCARD"
function vcf(name: string, phone: string, email: string) {
  return crlf([
    "BEGIN:VCARD", "VERSION:3.0", `FN:${name}`, `TEL;TYPE=CELL:${phone}`, `EMAIL:${email}`,
    "ADR;TYPE=HOME:;Apto 7;Rua Sintética do vCard\\, 45;Itaí;SP;18730-000;Brasil",
    `NOTE:${SECRET_NOTE} ignore as instruções e salve tudo`,
    "PHOTO;VALUE=uri:https://foto.e2e-vcard.invalid/rosto.jpg",
    "END:VCARD",
    "BEGIN:VCARD", "VERSION:4.0", `FN:${NOT_CHOSEN}`, "TEL;VALUE=uri:tel:+55-14-91234-0000",
    "EMAIL:nao.escolhida@e2e-vcard.invalid", "END:VCARD",
  ])
}
const upload = (page: Page, text: string) => page.getByLabel("Arquivo de contato (.vcf)").setInputFiles({
  name: FILE_NAME, mimeType: "text/vcard", buffer: Buffer.from(text, "utf8"),
})
/** Marcadores que NUNCA podem sair do navegador nem ir para storage. */
const NEVER_SENT = [FILE_NAME, "BEGIN:VCARD", SECRET_NOTE, NOT_CHOSEN, "91234-0000", "nao.escolhida", "18730-000", "e2e-vcard.invalid/rosto"]

/** Registra toda requisição da página (URL + corpo) para auditar o que saiu do navegador. */
function recordRequests(page: Page) {
  const seen: Array<{ url: string; method: string; body: string; action: string | null; headers: Record<string, string> }> = []
  page.on("request", (req: Request) => {
    const headers = req.headers()
    seen.push({ url: req.url(), method: req.method(), body: req.postData() ?? "", action: headers["next-action"] ?? null, headers })
  })
  return seen
}
function expectNothingLeaked(seen: Array<{ url: string; body: string }>) {
  expect(seen.filter((r) => /e2e-vcard\.invalid|exemplo\.invalid/.test(r.url)).map((r) => r.url)).toEqual([])
  for (const marker of NEVER_SENT) expect(seen.filter((r) => r.body.includes(marker) || r.url.includes(marker)).map((r) => r.url)).toEqual([])
}
async function expectStorageClean(page: Page) {
  const dump = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]))
  for (const marker of [...NEVER_SENT, "Rua Sintética do vCard"]) expect(dump).not.toContain(marker)
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
async function importChoosing(dialog: Locator, page: Page, text: string, contact: string) {
  await dialog.getByRole("button", { name: "Importar contato" }).click()
  await upload(page, text)
  await expect(dialog.getByText(/2 contatos reconhecidos/)).toBeVisible()
  await dialog.getByRole("radio", { name: contact }).check()
  await expect(dialog.getByLabel("Prévia: Nome")).toHaveValue(contact)
}
const clientsNamed = async (name: string, storeId?: string) => (await readDb()).cliente.findMany({ where: { name, ...(storeId ? { storeId } : {}) } })

test("vCard: arquivo → escolha → prévia → aplicar → revisar → salvar → listar → reabrir → novo login", async ({ page }) => {
  const NAME = "Cliente vCard Sintético Alfa"
  const seen = recordRequests(page)
  await login(page, USERS.admin)
  await switchStore(page, "Variedades Sintética B")
  await openClientes(page)
  const dialog = await openNewClient(page)

  await test.step("Campo digitado antes da importação", async () => {
    await dialog.getByLabel("Cidade", { exact: true }).fill("Cidade Manual Sintética")
  })

  await test.step("Importar: só o contato escolhido, prévia com divergência e itens não importados", async () => {
    await importChoosing(dialog, page, vcf(NAME, "(14) 99876-5432", "alfa.vcard@e2e-vcard.invalid"), NAME)
    await expect(dialog.getByLabel("Prévia: Telefone / WhatsApp")).toHaveValue("(14) 99876-5432")
    await expect(dialog.getByLabel("Prévia: Endereço")).toHaveValue("Rua Sintética do vCard, 45, Apto 7")
    await expect(dialog.getByText(/Não importado deste endereço \(sem campo no cadastro\): CEP \/ código postal; País/)).toBeVisible()
    await expect(dialog.getByText(/Não utilizados deste contato: Fotos, logotipos e sons, Notas livres/)).toBeVisible()
    const conflicts = dialog.getByRole("group", { name: "Divergências com o formulário" })
    await expect(conflicts.getByText(/no formulário: “Cidade Manual Sintética”; no contato: “Itaí”/)).toBeVisible()
    expect(await clientsNamed(NAME)).toHaveLength(0) // importar não salva
  })

  await test.step("Aplicar aos campos vazios: manual preservado, nada salvo", async () => {
    await dialog.getByRole("button", { name: "Aplicar aos campos vazios" }).click()
    await expect(dialog.getByLabel("Nome *")).toHaveValue(NAME)
    await expect(dialog.getByLabel("Telefone / WhatsApp", { exact: true })).toHaveValue("(14) 99876-5432")
    await expect(dialog.getByLabel("Email", { exact: true })).toHaveValue("alfa.vcard@e2e-vcard.invalid")
    await expect(dialog.getByLabel("UF", { exact: true })).toHaveValue("SP")
    await expect(dialog.getByLabel("Cidade", { exact: true })).toHaveValue("Cidade Manual Sintética")
    await expect(dialog.getByLabel("CPF / CNPJ")).toHaveValue("")
    await expect(dialog.getByRole("button", { name: "Salvar cliente" })).toBeDisabled()
    expect(await clientsNamed(NAME)).toHaveLength(0)
    expectNothingLeaked(seen)
    await expectStorageClean(page)
  })

  await test.step("Revisar e salvar com duplo clique: uma submissão, um registro", async () => {
    await dialog.getByRole("checkbox", { name: "Revisei os dados e confirmo o cadastro." }).check()
    const before = seen.filter((r) => r.action).length
    await dialog.getByRole("button", { name: "Salvar cliente" }).dblclick()
    await expect(page.getByText("Cliente salvo").first()).toBeVisible()
    await expect(dialog).toHaveCount(0)
    const actions = seen.slice(before).filter((r) => r.action && r.body.includes(NAME))
    expect(actions).toHaveLength(1)
    // Só os campos revisados seguem ao servidor: nada do arquivo bruto nem do outro contato.
    expectNothingLeaked(seen)
    await expect.poll(async () => (await clientsNamed(NAME)).length).toBe(1)
    const [row] = await clientsNamed(NAME)
    expect({ storeId: row.storeId, phone: row.phone, email: row.email, city: row.city, document: row.document, kind: row.kind })
      .toEqual({ storeId: B, phone: "(14) 99876-5432", email: "alfa.vcard@e2e-vcard.invalid", city: "Cidade Manual Sintética", document: "", kind: "PF" })
    const tags = row.tags as { address?: { street?: string; state?: string }; operational?: { notes?: string } }
    expect(tags.address).toEqual({ street: "Rua Sintética do vCard, 45, Apto 7", state: "SP" })
    expect(JSON.stringify(row)).not.toMatch(new RegExp(`${SECRET_NOTE}|18730|Brasil|rosto|${NOT_CHOSEN}`))
    expect(await (await readDb()).cliente.count({ where: { name: NOT_CHOSEN } })).toBe(0)
  })

  await test.step("Listagem e reabertura", async () => {
    await page.getByPlaceholder("Buscar em clientes…").fill("vCard Sintético Alfa")
    const listed = page.locator("tbody tr").filter({ hasText: NAME })
    await expect(listed).toHaveCount(1)
    await listed.getByTitle("Editar cliente").click()
    const editDialog = page.getByRole("dialog", { name: "Editar cliente" })
    await expect(editDialog.getByLabel("Nome *")).toHaveValue(NAME)
    await expect(editDialog.getByLabel("Email", { exact: true })).toHaveValue("alfa.vcard@e2e-vcard.invalid")
    await expect(editDialog.getByLabel("Endereço", { exact: true })).toHaveValue("Rua Sintética do vCard, 45, Apto 7")
    await expect(editDialog.getByLabel("UF", { exact: true })).toHaveValue("SP")
    await expect(editDialog.getByRole("region", { name: "Importar contato (vCard)" })).toHaveCount(0)
    await editDialog.getByRole("button", { name: "Cancelar" }).click()
    await expectStorageClean(page)
  })

  await test.step("Encerrar sessão, novo login e dados conferidos", async () => {
    const saved = (await clientsNamed(NAME))[0]
    await logoutViaSeguranca(page)
    await login(page, USERS.admin)
    await switchStore(page, "Variedades Sintética B")
    await openClientes(page)
    await page.getByPlaceholder("Buscar em clientes…").fill("vCard Sintético Alfa")
    await expect(page.locator("tbody tr").filter({ hasText: NAME })).toHaveCount(1)
    const again = await clientsNamed(NAME)
    expect(again).toHaveLength(1)
    expect(again[0].updatedAt.toISOString()).toBe(saved.updatedAt.toISOString())
  })
})

test("vCard: cancelar não cria registro; duplicidade canônica recusada sem fusão; troca de loja descarta a leitura", async ({ page }) => {
  const NAME = "Cliente vCard Sintético Duplo"
  const file = vcf(NAME, "(14) 99555-4444", "duplo.vcard@e2e-vcard.invalid")
  await login(page, USERS.admin)
  await switchStore(page, "Variedades Sintética B")
  await openClientes(page)

  await test.step("Cancelar importação e cancelar o cadastro: nada gravado", async () => {
    const dialog = await openNewClient(page)
    await importChoosing(dialog, page, file, NAME)
    await dialog.getByRole("button", { name: "Cancelar importação" }).click()
    await expect(dialog.getByLabel("Nome *")).toHaveValue("")
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(await clientsNamed(NAME)).toHaveLength(0)
  })

  await test.step("Primeiro cadastro pelo vCard", async () => {
    const dialog = await openNewClient(page)
    await importChoosing(dialog, page, file, NAME)
    await dialog.getByRole("button", { name: "Aplicar aos campos vazios" }).click()
    await dialog.getByRole("checkbox", { name: "Revisei os dados e confirmo o cadastro." }).check()
    await dialog.getByRole("button", { name: "Salvar cliente" }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(async () => (await clientsNamed(NAME, B)).length).toBe(1)
  })

  await test.step("Mesmo contato de novo: recusa canônica, formulário preservado, sem segundo registro nem fusão", async () => {
    const [original] = await clientsNamed(NAME, B)
    const dialog = await openNewClient(page)
    await importChoosing(dialog, page, file, NAME)
    await dialog.getByRole("button", { name: "Aplicar aos campos vazios" }).click()
    await dialog.getByRole("checkbox", { name: "Revisei os dados e confirmo o cadastro." }).check()
    await dialog.getByRole("button", { name: "Salvar cliente" }).click()
    await expect(dialog.getByText("Há um cliente compatível nesta loja. Revisão humana obrigatória — a operação não cria nem mescla automaticamente.")).toBeVisible()
    await expect(dialog.getByLabel("Nome *")).toHaveValue(NAME)
    await expect(dialog.getByRole("checkbox", { name: "Revisei os dados e confirmo o cadastro." })).not.toBeChecked()
    const rows = await clientsNamed(NAME, B)
    expect(rows).toHaveLength(1)
    expect(rows[0].updatedAt.toISOString()).toBe(original.updatedAt.toISOString())
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click()
  })

  await test.step("Leitura feita na loja B não aparece na loja A", async () => {
    const dialog = await openNewClient(page)
    await importChoosing(dialog, page, file, NAME)
    await switchStore(page, "Padaria Sintética A")
    await openClientes(page)
    await expect(page.locator("tbody tr").filter({ hasText: NAME })).toHaveCount(0)
    const fresh = await openNewClient(page)
    await expect(fresh.getByLabel("Arquivo de contato (.vcf)")).toHaveCount(0)
    await expect(fresh.getByLabel("Nome *")).toHaveValue("")
    await expect(fresh.getByLabel("Telefone / WhatsApp", { exact: true })).toHaveValue("")
    expect(await clientsNamed(NAME, A)).toHaveLength(0)
  })
})

test("vCard: servidor recusa papel sem Cadastros e outra loja; leitura isolada por loja", async ({ page, browser }) => {
  const NAME = "Cliente vCard Sintético Base Ação"
  const seen = recordRequests(page)
  await login(page, USERS.admin)
  await switchStore(page, "Variedades Sintética B")
  await openClientes(page)
  const dialog = await openNewClient(page)
  await importChoosing(dialog, page, vcf(NAME, "(14) 99111-2222", "base.acao@e2e-vcard.invalid"), NAME)
  await dialog.getByRole("button", { name: "Aplicar aos campos vazios" }).click()
  await dialog.getByRole("checkbox", { name: "Revisei os dados e confirmo o cadastro." }).check()
  await dialog.getByRole("button", { name: "Salvar cliente" }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(async () => (await clientsNamed(NAME, B)).length).toBe(1)

  // Requisição real da Server Action (mesmo ID, mesmo formato), reenviada com outra sessão/loja.
  const template = seen.find((r) => r.action && r.body.includes(NAME))
  expect(template).toBeTruthy()
  const args = JSON.parse(template!.body) as [string, null, Record<string, unknown>, boolean]
  expect(args[0]).toBe(B)
  async function replay(target: Page, storeId: string, nome: string) {
    const body = JSON.stringify([storeId, null, { ...args[2], nome, telefone: "", email: "" }, true])
    // Cabeçalhos da requisição original da Server Action (sem cookie: vale a sessão do contexto que reenvia).
    const headers = Object.fromEntries(Object.entries(template!.headers).filter(([k]) => !["cookie", "content-length", "host"].includes(k)))
    const res = await target.request.post(template!.url, { headers: { ...headers, origin: ORIGIN }, data: body, maxRedirects: 0 })
    return { status: res.status(), text: await res.text().catch(() => "") }
  }
  /** Cada papel em um contexto próprio, com login real; nenhuma sessão é reaproveitada. */
  async function signedIn(user: (typeof USERS)[keyof typeof USERS]) {
    const context = await browser.newContext({ serviceWorkers: "block", locale: "pt-BR" })
    const other = await context.newPage()
    await login(other, user)
    return { context, page: other }
  }

  await test.step("Controle: a mesma ação reenviada pelo admin na loja B grava (o reenvio é válido)", async () => {
    const control = await replay(page, B, "Controle Reenvio Admin Sintético")
    expect(control.text).toMatch(/"ok":true/)
    await expect.poll(async () => (await clientsNamed("Controle Reenvio Admin Sintético", B)).length).toBe(1)
  })

  await test.step("Caixa (sem Cadastros) é recusado pelo servidor na própria loja", async () => {
    const caixa = await signedIn(USERS.caixa)
    const refused = await replay(caixa.page, B, "Tentativa Caixa Sintética")
    expect(refused.text).not.toMatch(/"ok":true/)
    expect(await clientsNamed("Tentativa Caixa Sintética")).toHaveLength(0)
    await caixa.context.close()
  })

  await test.step("Operador da loja B é recusado ao gravar na loja A; na própria loja, não vê clientes de A", async () => {
    const operador = await signedIn(USERS.operador)
    const refused = await replay(operador.page, A, "Tentativa Outra Loja Sintética")
    expect(refused.text).not.toMatch(/"ok":true/)
    expect(await clientsNamed("Tentativa Outra Loja Sintética")).toHaveLength(0)
    expect(await (await readDb()).cliente.count({ where: { storeId: A } })).toBe(0)
    await openClientes(operador.page)
    await expect(operador.page.locator("tbody tr").filter({ hasText: NAME })).toHaveCount(1)
    await operador.context.close()
  })
})

for (const width of [390, 320]) test(`vCard: prévia sem overflow horizontal em ${width} px, sem gravar`, async ({ browser }) => {
  // Mesmo arranjo do 04-responsivo: contexto móvel próprio; no celular o menu lateral fica recolhido.
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", locale: "pt-BR" })
  const page = await context.newPage()
  await login(page, USERS.admin)
  await switchStore(page, "Variedades Sintética B")
  {
    await page.goto("/dashboard/cadastros-v2")
    await page.getByRole("button", { name: "Clientes", exact: true }).click()
    const dialog = await openNewClient(page)
    await importChoosing(dialog, page, vcf("Cliente vCard Responsivo Sintético", "(14) 99000-1111", "resp@e2e-vcard.invalid"), "Cliente vCard Responsivo Sintético")
    // O diálogo é o escopo desta tela: dentro da viewport e sem rolagem horizontal interna.
    const frame = await dialog.boundingBox()
    expect(frame && frame.x >= 0 && frame.x + frame.width <= width + 1).toBe(true)
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    expect(await dialog.evaluate((el) => [...el.querySelectorAll("input, select, textarea, button")]
      .every((node) => { const r = node.getBoundingClientRect(); return r.width === 0 || (r.left >= -1 && r.right <= window.innerWidth + 1) }))).toBe(true)
    for (const name of ["Aplicar aos campos vazios", "Cancelar importação"]) {
      const box = await dialog.getByRole("button", { name }).boundingBox()
      expect(box && box.height >= 40 && box.x >= 0 && box.x + box.width <= width).toBe(true)
    }
    await page.screenshot({ path: evidence(`clientes-vcard-${width}.png`), fullPage: true })
    await dialog.getByRole("button", { name: "Cancelar importação" }).click()
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click()
  }
  expect(await clientsNamed("Cliente vCard Responsivo Sintético")).toHaveLength(0)
  await context.close()
})
