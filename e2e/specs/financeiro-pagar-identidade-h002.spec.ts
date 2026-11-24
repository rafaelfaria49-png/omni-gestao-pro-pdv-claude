import { expect, test, type Request } from "@playwright/test"
import { PrismaClient } from "../../generated/prisma"
import { dismissFirstAccessWizardIfPresent } from "../helpers"

/**
 * OMNI-FINANCEIRO-F9-ESTORNOS-FINAL-HARDENING-002 — Contas a Pagar pela TELA do Financeiro HUB.
 *
 * Prova que as pré-condições novas (`restanteEsperado` no pagamento, `pagoEsperado` no estorno)
 * saem com o valor que o operador vê e são ACEITAS pelo servidor — nenhum 409 falso — e que o
 * estorno reverte o pagamento certo, com o valor exato, conciliado com a movimentação.
 * App real (build local, NextAuth real), PostgreSQL LOCAL DESCARTÁVEL `fin_receb_f9_qa*`.
 */

const ROTA = "/api/financeiro/pagar"

function bancoDescartavel(): string {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => (v ?? "").trim())
  if (urls.some((v) => !v)) throw new Error("E2E exige DATABASE_URL e DIRECT_URL do banco local descartável.")
  const parsed = urls.map((v) => new URL(v))
  if (parsed.some((u) => !["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname))) throw new Error("E2E só em loopback.")
  if (!parsed[0]!.pathname.replace(/^\//, "").startsWith("fin_receb_f9_qa")) throw new Error("E2E só no banco fin_receb_f9_qa*.")
  return urls[0]!
}

test.use({ serviceWorkers: "block" })

test("Contas a Pagar — 2 parciais e 2 estornos pela tela: pré-condições aceitas, estorno pela identidade, movimentação conciliada", async ({ page }) => {
  test.setTimeout(180_000)
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (dlg) => {
    await dlg.getByRole("button", { name: /^Voltar depois$/i }).click()
  })
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() })
  const m = `h002p${Date.now().toString(36)}`
  try {
    await page.goto("/dashboard")
    await dismissFirstAccessWizardIfPresent(page)
    await expect.poll(() => page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1"))).toBeTruthy()
    const storeId = (await page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1")))!
    const t = await prisma.contaPagarTitulo.create({
      data: { storeId, localKey: `pagar:e2e-h002:${m}`, descricao: `Fornecedor H002 ${m}`, valor: 300, vencimento: "2026-12-20", status: "pendente", payload: { historico: [] } },
    })

    await page.goto("/dashboard/financeiro-v2")
    await dismissFirstAccessWizardIfPresent(page)
    await expect(page.getByRole("heading", { name: /Financeiro HUB/i })).toBeVisible({ timeout: 45_000 })
    await page.getByRole("tab", { name: /A pagar/i }).click()
    const linha = page.getByRole("row", { name: new RegExp(`Fornecedor H002 ${m}`) })
    await expect(linha).toBeVisible({ timeout: 30_000 })

    const patch = () => page.waitForRequest((r: Request) => r.method() === "PATCH" && new URL(r.url()).pathname === ROTA)
    const resposta = (req: Request) => req.response()

    async function pagarParcial(valor: number, restanteVisto: number) {
      await linha.getByRole("button", { name: "Pagar" }).click()
      const modal = page.getByRole("dialog", { name: /Registrar pagamento/ })
      await expect(modal).toBeVisible()
      await modal.getByRole("switch").click()
      await modal.getByRole("spinbutton").fill(String(valor))
      const req = patch()
      await modal.getByRole("button", { name: "Confirmar pagamento" }).click()
      const r = await req
      expect(r.postDataJSON()).toMatchObject({ op: "parcial", valor, restanteEsperado: restanteVisto })
      expect((await resposta(r))!.status()).toBe(200)
      await expect(modal).toBeHidden()
    }

    async function estornar(pagoVisto: number, valorEsperado: number) {
      await linha.getByRole("button", { name: "Estornar" }).click()
      const modal = page.getByRole("dialog", { name: /Estornar pagamento/ })
      await expect(modal).toBeVisible()
      const req = patch()
      await modal.getByRole("button", { name: "Confirmar estorno" }).click()
      const r = await req
      expect(r.postDataJSON()).toMatchObject({ op: "estornar", pagoEsperado: pagoVisto })
      const res = (await resposta(r))!
      expect(res.status()).toBe(200)
      expect(((await res.json()) as { valorEstornado?: number }).valorEstornado).toBe(valorEsperado)
      await expect(modal).toBeHidden()
    }

    await pagarParcial(100, 300)
    await pagarParcial(50, 200) // a lista recarregou: o saldo exibido (200) é o do servidor
    await estornar(150, 50) // o ÚLTIMO pagamento ativo (50)
    await estornar(100, 100) // o seguinte (100) — nunca o mesmo 50 de novo

    const titulo = await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: t.id } })
    const hist = ((titulo.payload as { historico?: Array<{ tipo: string; refHistoricoIndex?: number }> }).historico ?? [])
    expect(hist.filter((h) => h.tipo === "estorno_pagamento").map((h) => h.refHistoricoIndex)).toEqual([1, 0])
    const movs = await prisma.movimentacaoFinanceira.findMany({ where: { storeId, referenciaId: t.id }, orderBy: { createdAt: "asc" } })
    expect(movs.filter((x) => x.tipo === "saida").map((x) => x.valor)).toEqual([100, 50])
    expect(movs.filter((x) => x.tipo === "entrada").map((x) => x.valor)).toEqual([50, 100])
    test.info().annotations.push({ type: "ledger", description: JSON.stringify({ status: titulo.status, hist, movs: movs.map((x) => [x.tipo, x.origem, x.valor]) }) })
    await page.screenshot({ path: test.info().outputPath("pagar-final.png") })
  } finally {
    await prisma.$disconnect()
  }
})
