import { test, expect, type Page } from "@playwright/test"
import { PrismaClient } from "../../generated/prisma"
import { hashSync } from "bcryptjs"
import { randomUUID } from "node:crypto"
const db = new PrismaClient()
const enabled = process.env.PESSOAS_DP_ENABLED === "on"
const suffix = randomUUID().slice(0, 8)
const email = "frontend-e2e-" + suffix + "@example.invalid"
const password = "Synthetic-only-001B!"
const storeId = "frontend-e2e-" + suffix
let userId = ""
test.beforeAll(async () => {
  const url = process.env.PESSOAS_HOMOLOGATION_DATABASE_URL
  if (!url || url !== process.env.DATABASE_URL || !url.includes("@127.0.0.1:55439/omni_pessoas_001a_homolog")) throw new Error("BANCO_NAO_ISOLADO")
  await db.store.create({ data: { id: storeId, name: "Loja E2E sintética" } })
  userId = (await db.adminUser.create({ data: { name: "Admin sintético", email, password: hashSync(password, 10), role: "ADMIN", lojaId: storeId } })).id
})
test.afterAll(async () => { await db.$disconnect() })
async function login(page: Page) {
  await page.goto("/login")
  await page.getByLabel("Email", { exact: true }).fill(email)
  await page.getByLabel("Senha", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Entrar", exact: true }).click()
  await page.waitForURL("**/dashboard")
  await expect.poll(async () => (await page.context().cookies()).some(cookie => cookie.name.includes("loja") && cookie.value === storeId)).toBe(true)
}
async function fill(page: Page, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) await page.locator('[name="' + name + '"]').fill(value)
}
if (!enabled) {
  test("OFF: URL direta e endpoint negam sem dados cadastrais", async ({ page }) => {
    await login(page)
    await page.goto("/dashboard/pessoas")
    await expect(page.getByText("Pessoas está desativado neste ambiente.")).toBeVisible()
    const response = await page.request.get("/api/pessoas/disponibilidade")
    expect(response.status()).toBe(404)
    expect(response.headers()["cache-control"]).toContain("no-store")
    await expect(page.getByRole("link", { name: "Pessoas", exact: true })).toHaveCount(0)
  })
} else {
  test("cadastro real, reload, pendências, contrato, histórico, capacidades e temas", async ({ page }, info) => {
    test.setTimeout(240_000)
    await login(page)
    await page.goto("/dashboard/pessoas")
    await expect(page.getByRole("heading", { name: "Configure seu primeiro empregador" })).toBeVisible()
    await page.getByRole("link", { name: "Configurar empregador", exact: true }).click()
    await fill(page, { nome: "Empregador E2E sintético", tipoInscricao: "CNPJ", inscricao: "E2E-" + suffix,
      est_nome: "Sede sintética", est_tipoInscricao: "CNPJ", est_inscricao: "EST-" + suffix, validFrom: "2020-01-01", motivo: "Setup sintético" })
    await page.getByRole("button", { name: "Criar empregador e estabelecimento" }).click()
    await expect(page.getByRole("heading", { name: "Empregador E2E sintético", exact: true })).toBeVisible()
    await page.reload()
    await page.getByRole("link", { name: "Funcionários", exact: true }).click()
    await page.getByRole("link", { name: "Novo funcionário", exact: true }).click()
    await fill(page, { nome: "Pessoa E2E sintética", motivo: "Cadastro sintético" })
    await page.getByRole("button", { name: "Salvar cadastro" }).click()
    await page.getByRole("link", { name: "Pessoa E2E sintética", exact: true }).click()
    await expect(page.getByText(/RASCUNHO · Vínculo/)).toBeVisible()
    await page.reload()
    await page.getByRole("button", { name: "Editar dados pessoais" }).click()
    await fill(page, { cpf: "52998224725", nascimento: "1990-01-01", motivo: "Completar dados sintéticos" })
    await page.getByRole("button", { name: "Salvar", exact: true }).click()
    await expect(page.getByText("52998224725", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Preencher lacunas do vínculo" }).click()
    await fill(page, { matricula: "E2E001", admissao: "2020-01-01", regime: "CLT", categoria: "101", motivo: "Completar vínculo sintético" })
    await page.getByRole("button", { name: "Salvar", exact: true }).click()
    await expect(page.getByText("E2E001", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Criar versão do contrato" }).click()
    await fill(page, { cargo: "Analista sintético", cbo: "123456", salarioBase: "9876,54", unidadeSalario: "MENSAL", jornadaSemanal: "40", divisor: "200", validFrom: "2020-01-01", motivo: "Salário sintético 9876.54" })
    await page.locator('[name="tipoMudanca"]').selectOption("ALTERACAO")
    await page.getByRole("button", { name: "Salvar", exact: true }).click()
    await expect(page.getByText(/ATIVO · Vínculo/)).toBeVisible()
    await page.reload()
    await expect(page.getByRole("heading", { name: "Histórico", exact: true })).toBeVisible()
    const employee = await db.dpVinculo.findFirstOrThrow({ where: { storeId, matricula: "E2E001" }, include: { contratos: true } })
    expect(employee.status).toBe("ATIVO")
    expect(employee.contratos).toHaveLength(2)
    await page.locator('input[type="file"]').setInputFiles({ name: "sintetico.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 synthetic") })
    await page.locator('[name="origem"]').selectOption("INTERNO")
    await page.getByRole("button", { name: "Enviar documento", exact: true }).click()
    await expect(page.getByText("O armazenamento privado está indisponível.")).toBeVisible()
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 360, height: 800 }]) {
      await page.setViewportSize(viewport)
      for (const [theme, label] of [["light", "Light"], ["soft-ice", "Soft Ice"], ["midnight", "Midnight"], ["black-edition", "Black"]]) {
        await page.getByRole("button", { name: /Tema atual:/ }).click()
        await page.getByRole("option", { name: label, exact: true }).click()
        await expect(page.locator("html")).toHaveAttribute("data-studio-theme", theme)
        await page.keyboard.press("Escape")
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.screenshot({ path: info.outputPath(theme + "-" + viewport.width + ".png"), fullPage: true })
      }
      if (viewport.width < 1000) {
        await page.getByRole("button", { name: "Abrir menu de navegação" }).click()
        await expect(page.getByRole("dialog").getByRole("link", { name: "Pessoas", exact: true })).toBeVisible()
        await page.keyboard.press("Escape")
      }
    }
    const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))
    expect(storage).not.toContain("52998224725")
    expect(storage).not.toContain("9876.54")
    await db.dpAcesso.updateMany({ where: { adminUserId: userId, empregadorId: employee.empregadorId }, data: { capacidades: ["viewCadastro"] } })
    await page.reload()
    await expect(page.getByText("Remuneração restrita").first()).toBeVisible()
    await expect(page.getByText("Salário sintético 9876.54")).toHaveCount(0)
    expect(await page.content()).not.toContain("9.876,54")
    await db.dpAcesso.updateMany({ where: { adminUserId: userId }, data: { revogadoEm: new Date() } })
    await page.reload()
    await expect(page.getByText("Você não tem acesso a este cadastro nesta loja.")).toBeVisible()
  })
}
