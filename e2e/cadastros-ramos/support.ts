import path from "node:path"
import { expect, type Locator, type Page } from "@playwright/test"
import { PrismaClient } from "../../generated/prisma"

/**
 * Suporte do E2E isolado. O banco só é LIDO aqui, para conferir o que a
 * interface gravou; toda escrita da jornada passa pela aplicação real.
 */
const EXPECTED_URL = "postgresql://cad_r2_021:isolated_ci_only@127.0.0.1:5432/cad_r2_021_isolated"

export const STORES = {
  padaria: "e2e-a-padaria",
  variedades: "e2e-b-variedades",
  assistencia: "e2e-c-assistencia",
  acessorios: "e2e-d-acessorios",
} as const

export const USERS = {
  admin: { email: "admin@e2e-cadastros.invalid", password: () => required("RAMOS_E2E_ADMIN_PASSWORD") },
  operador: { email: "operador@e2e-cadastros.invalid", password: () => required("RAMOS_E2E_OPERADOR_PASSWORD") },
  caixa: { email: "caixa@e2e-cadastros.invalid", password: () => required("RAMOS_E2E_CAIXA_PASSWORD") },
} as const

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} ausente: execute pelo runner isolado.`)
  return value
}

let client: PrismaClient | null = null
/** Cliente somente leitura do banco descartável, com identidade positiva conferida. */
export async function readDb(): Promise<PrismaClient> {
  if (client) return client
  if (process.env.RAMOS_E2E_DATABASE_URL !== EXPECTED_URL || process.env.CI !== "true" || process.env.MIGRATION_AUTHORITY_ENABLED !== "false") {
    throw new Error("RAMOS_E2E_DATABASE_REQUIRED")
  }
  const db = new PrismaClient({ datasourceUrl: EXPECTED_URL })
  const [row] = await db.$queryRawUnsafe<Array<{ db: string; role: string }>>("SELECT current_database() AS db, current_user AS role")
  if (row?.db !== "cad_r2_021_isolated" || row?.role !== "cad_r2_021") throw new Error("RAMOS_E2E_DATABASE_IDENTITY_MISMATCH")
  client = db
  return db
}

export async function closeDb() {
  await client?.$disconnect()
  client = null
}

export async function capabilitiesOf(storeId: string) {
  const settings = await (await readDb()).storeSettings.findUnique({ where: { storeId } })
  return (settings?.printerConfig as { capabilities?: Record<string, unknown> } | null)?.capabilities ?? null
}

export const evidence = (name: string) => path.join(__dirname, "../../test-results/cadastros-ramos-e2e", name)

/** O wizard de primeira loja abre assíncrono; não deve existir com as lojas completas, mas não pode travar a prova. */
export function guardOnboarding(page: Page) {
  void page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (dialog) => {
    await dialog.getByRole("button", { name: /^Voltar depois$/i }).click()
  })
}

export async function login(page: Page, user: { email: string; password: () => string }) {
  guardOnboarding(page)
  await page.goto("/login")
  await page.getByLabel("Email").fill(user.email)
  // `fill()` registraria o valor no call log de uma falha; aqui ele só trafega como argumento.
  await page.getByRole("textbox", { name: "Senha" }).evaluate((input, value) => {
    const element = input as HTMLInputElement
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value)
    element.dispatchEvent(new Event("input", { bubbles: true }))
  }, user.password())
  await Promise.all([page.waitForURL(/\/dashboard(\/|\?|$)/), page.getByRole("button", { name: "Entrar" }).click()])
}

export async function logoutViaSeguranca(page: Page) {
  await page.goto("/dashboard/configuracoes?sec=seguranca")
  const signout = page.waitForResponse((res) => res.url().includes("/api/auth/signout") && res.request().method() === "POST")
  await page.getByRole("button", { name: "Encerrar sessão" }).click()
  const response = await signout
  await page.waitForURL(/\/login/)
  await page.waitForLoadState("load")
  // Diagnóstico sem valores: somente status e nomes de cookies de sessão restantes.
  const remaining = (await page.context().cookies()).filter((cookie) => /session-token/.test(cookie.name)).map((cookie) => cookie.name)
  const session = await page.request.get("/api/auth/session")
  const body = await session.json().catch(() => null)
  expect({ signoutStatus: response.status(), remaining, url: new URL(page.url()).pathname, authenticated: !!body?.user })
    .toEqual({ signoutStatus: expect.any(Number), remaining: [], url: "/login", authenticated: false })
}

/** Troca a unidade ativa pelo seletor oficial (Configurações → Lojas → Gerenciar). */
export async function switchStore(page: Page, storeName: string) {
  await page.goto("/dashboard/configuracoes?sec=lojas")
  const card = page.locator("div[role=button]").filter({ hasText: storeName })
  await card.getByRole("button", { name: "Gerenciar" }).click()
  const storeId = ({ "Padaria Sintética A": STORES.padaria, "Variedades Sintética B": STORES.variedades, "Assistência Sintética C": STORES.assistencia, "Acessórios Sintéticos D": STORES.acessorios } as Record<string, string>)[storeName]
  if (!storeId) throw new Error("Unidade sintética desconhecida")
  await expect.poll(() => page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1"))).toBe(storeId)
  await expect.poll(() => page.context().cookies().then((cookies) => cookies.find((cookie) => cookie.name === "assistec-active-store")?.value)).toBe(storeId)
}

export async function openGeral(page: Page): Promise<Locator> {
  await page.goto("/dashboard/configuracoes?sec=geral")
  const card = page.locator("#ramo-recursos")
  await expect(card.getByRole("combobox", { name: "Ramo principal" })).toBeEnabled()
  return card
}

export async function openCadastrosProdutos(page: Page) {
  await page.goto("/dashboard")
  await page.getByRole("link", { name: /Cadastros HUB/ }).first().click()
  await page.waitForURL(/\/dashboard\/cadastros-v2/)
  await expect(page.getByRole("heading", { name: "Cadastros HUB" })).toBeVisible()
  await expect(page.getByText(/^Cadastros: /)).toBeVisible()
  await page.getByRole("button", { name: "Produtos", exact: true }).click()
}

export function productModal(page: Page): Locator {
  return page.locator("div.fixed.inset-0").filter({ has: page.locator('[data-omni-ui-kit="modal-header"]') }).filter({ has: page.getByRole("button", { name: "Salvar produto", exact: true }) })
}

/** Campo do kit Lovable: `<label>` sem `for`, irmão do controle. */
export function field(scope: Locator, label: string): Locator {
  return scope.locator(`xpath=.//div[label[normalize-space()="${label}"]]`).locator("input, textarea").first()
}

export async function openNewProduct(page: Page): Promise<Locator> {
  // Botão "Novo" da barra da listagem de Produtos (o do cabeçalho abre o seletor de tipo).
  const toolbar = page.getByPlaceholder("Buscar em produtos…").locator("xpath=ancestor::div[contains(@class,'mb-4')][1]")
  await toolbar.getByRole("button", { name: "Novo", exact: true }).click()
  const modal = productModal(page)
  await expect(modal).toBeVisible()
  return modal
}

export async function searchProduct(page: Page, query: string) {
  const search = page.getByPlaceholder("Buscar em produtos…")
  await search.fill(query)
}

export function rowOf(page: Page, name: string): Locator {
  return page.locator("tbody tr").filter({ hasText: name })
}

export async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}

/** Salva e espera a confirmação DESTE save: nenhum toast antigo pode valer como sucesso. */
export async function saveProductAndConfirm(page: Page) {
  const success = page.getByText("Produto salvo com sucesso.")
  await expect(success).toHaveCount(0)
  await productModal(page).getByRole("button", { name: "Salvar produto", exact: true }).click()
  await expect(success.first()).toBeVisible()
  await expect(productModal(page)).toHaveCount(0)
}
