import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.env.QA_BASE_URL || "http://127.0.0.1:3145";
const remoto = /^https:\/\/omni-ops-edicao-v3-v4-[a-z0-9]+-rafaelfaria49-4373s-projects\.vercel\.app$/.test(base);
if (base !== "http://127.0.0.1:3145" && !remoto) throw new Error("Este smoke está restrito ao servidor local ou à Preview exclusiva de QA.");
if (remoto && !process.env.VERCEL_OIDC_TOKEN) throw new Error("Token temporário da Preview QA ausente.");
const headersQA = remoto ? { "x-vercel-trusted-oidc-idp-token": process.env.VERCEL_OIDC_TOKEN } : {};
if (!process.env.QA_PASSWORD || !process.env.QA_SUPERVISOR_PIN) throw new Error("Credenciais QA ausentes.");
await mkdir(".vercel", { recursive: true });
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
let page;
try {
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
if (remoto) await context.route("**/*", (route) => new URL(route.request().url()).origin === new URL(base).origin ? route.continue({ headers: { ...route.request().headers(), ...headersQA } }) : route.continue());
const csrfResponse = await context.request.get(`${base}/api/auth/csrf`, { headers: headersQA, maxRedirects: 0 });
if (csrfResponse.status() !== 200) throw new Error(`Acesso QA recusado: HTTP ${csrfResponse.status()}`);
const csrf = await csrfResponse.json();
await context.request.post(`${base}/api/auth/callback/credentials`, { headers: headersQA, maxRedirects: 0, form: { csrfToken: csrf.csrfToken, email: process.env.QA_ADMIN_EMAIL, password: process.env.QA_PASSWORD, callbackUrl: `${base}/dashboard`, json: "true" } });
console.log("Login QA concluído.");
page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

async function abrirV4(codigo) {
  await page.goto(`${base}/dashboard/operacoes-v4-preview`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const adiar = page.getByRole("button", { name: "Voltar depois", exact: true });
  await page.getByText(codigo, { exact: true }).first().waitFor({ timeout: 120000 });
  if (await adiar.isVisible().catch(() => false)) await adiar.press("Enter");
  await page.getByRole("button", { name: new RegExp(codigo) }).first().press("Enter", { timeout: 120000 });
  await page.getByTitle("Mais ações", { exact: true }).press("Enter", { timeout: 60000 });
  await page.getByRole("button", { name: /Editar OS/ }).press("Enter");
  const dialog = page.getByRole("dialog", { name: new RegExp(`Editar OS ${codigo}`) });
  await dialog.getByLabel("Nome do cliente", { exact: true }).waitFor({ timeout: 60000 });
  return dialog;
}
async function salvar(dialog, motivo) {
  await dialog.getByLabel(/Motivo obrigatório/).fill(motivo);
  await expect(dialog.getByRole("button", { name: "Revisar alterações", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Revisar alterações", exact: true }).press("Enter");
  await dialog.getByRole("heading", { name: "Confira antes de autorizar" }).waitFor({ timeout: 60000 });
  await dialog.getByRole("button", { name: "Autorizar e salvar", exact: true }).press("Enter");
  const gate = page.getByRole("dialog", { name: "Autorizar edição da OS", exact: true });
  await gate.getByLabel(/Senha|PIN/).fill(process.env.QA_SUPERVISOR_PIN);
  await expect(gate.getByRole("button", { name: "Confirmar edição", exact: true })).toBeEnabled();
  await gate.getByRole("button", { name: "Confirmar edição", exact: true }).press("Enter");
  await expect(gate).not.toBeVisible({ timeout: 60000 });
  await expect(dialog).not.toBeVisible({ timeout: 60000 });
}
  let dialog = await abrirV4("QA-OS-PRAZO-330");
  if (await dialog.getByLabel("Preço de venda do serviço 1", { exact: true }).inputValue() !== "330") {
    await dialog.getByLabel("Preço de venda do serviço 1", { exact: true }).fill("330");
    await salvar(dialog, "QA navegador: preparar novamente o cenário sintético de 330");
    dialog = await abrirV4("QA-OS-PRAZO-330");
  }
  await expect(dialog.getByLabel("Preço de venda do serviço 1", { exact: true })).toHaveValue("330");
  await dialog.getByLabel("Preço de venda do serviço 1", { exact: true }).fill("400");
  if (process.env.QA_CAPTURE_SCREENSHOTS === "1") await page.screenshot({ path: ".vercel/edicao-os-desktop.png", animations: "disabled", timeout: 8000 }).catch(() => console.warn("Screenshot desktop indisponível; fluxo funcional continua."));
  await salvar(dialog, "QA navegador: corrigir preço a prazo de 330 para 400");
  console.log("PIN real: preço sintético alterado para 400.");
  dialog = await abrirV4("QA-OS-PRAZO-330");
  await expect(dialog.getByLabel("Preço de venda do serviço 1", { exact: true })).toHaveValue("400");
  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.QA_CAPTURE_SCREENSHOTS === "1") await page.screenshot({ path: ".vercel/edicao-os-mobile.png", animations: "disabled", timeout: 8000 }).catch(() => console.warn("Screenshot mobile indisponível; dimensões serão verificadas."));
  const bounds = await dialog.boundingBox();
  if (!bounds || bounds.width > 390 || bounds.x < 0) throw new Error("Dialog fora do viewport mobile.");
  await dialog.getByLabel("Preço de venda do serviço 1", { exact: true }).fill("330");
  await salvar(dialog, "QA navegador: restaurar valor sintético de 400 para 330");
  console.log("Mobile: preço sintético restaurado para 330.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  dialog = await abrirV4("QA-OS-PARCIAL");
  await dialog.getByLabel("Preço de venda do serviço 1", { exact: true }).fill("400");
  await dialog.getByLabel(/Motivo obrigatório/).fill("QA navegador: alteração parcial deve exigir ajuste seguro");
  await dialog.getByRole("button", { name: "Revisar alterações", exact: true }).press("Enter");
  await expect(dialog.getByRole("alert")).toContainText("ajuste/compensação", { timeout: 60000 });
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).press("Enter");
  await page.goto(`${base}/dashboard/operacoes-v3`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByRole("navigation", { name: "Operações", exact: true }).waitFor({ timeout: 120000 });
  const adiarV3 = page.getByRole("button", { name: "Voltar depois", exact: true });
  if (await adiarV3.isVisible().catch(() => false)) await adiarV3.press("Enter");
  await page.getByRole("navigation", { name: "Operações", exact: true }).getByRole("button", { name: /Fila/ }).press("Enter");
  await page.getByRole("button", { name: /QA-OS-ABERTA/ }).first().press("Enter", { timeout: 120000 });
  await page.getByRole("button", { name: /Editar OS/ }).press("Enter", { timeout: 60000 });
  dialog = page.getByRole("dialog", { name: /Editar OS QA-OS-ABERTA/ });
  await expect(dialog.getByLabel("Nome do cliente", { exact: true })).toHaveValue("Cliente sintético · QA-OS-ABERTA", { timeout: 60000 });
  if (process.env.QA_CAPTURE_SCREENSHOTS === "1") await page.screenshot({ path: ".vercel/edicao-os-v3.png", animations: "disabled", timeout: 8000 }).catch(() => console.warn("Screenshot V3 indisponível."));
  if (errors.length) throw new Error(`Erros no navegador: ${errors.join("; ")}`);
  console.log("PASS: login real, formulário V3/V4, prévia, PIN real, correção 330→400→330, bloqueio parcial, desktop e mobile, sem pageerror.");
} catch (e) {
  console.error("Falha funcional:", e.message);
  if (page) console.error((await page.locator("body").innerText({ timeout: 2000 }).catch(() => "Página indisponível")).slice(-2200));
  throw e;
} finally { await browser.close(); }
