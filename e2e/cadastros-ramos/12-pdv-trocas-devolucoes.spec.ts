import { expect, test, type Page } from "@playwright/test"
import { STORES, USERS, closeDb, guardOnboarding, login, readDb, switchStore } from "./support"

/**
 * OMNI-PDV-TROCAS-DEVOLUCOES-FINAL-RECOVERY-P1-002 — trocas e devoluções no app real (build de
 * produção, NextAuth real, PostgreSQL descartável). As vendas de origem entram pela rota real
 * de venda do PDV; a troca passa pela tela compartilhada (PDV Clássico e Histórico) e pela rota
 * autoritativa. O banco só é LIDO aqui. Capturas em test-results/cadastros-ramos-e2e/trocas/.
 */

test.afterAll(closeDb)

const B = STORES.variedades
const SHOTS = "test-results/cadastros-ramos-e2e/trocas"
const PS4 = { id: "e2e-b-ps4", name: "CONTROLE SINTÉTICO PS4 WIRELESS", price: 119.9 }
const X360 = { id: "e2e-b-x360", name: "CONTROLE SINTÉTICO X-360 SEM FIO", price: 129.9 }
const PEL = { id: "e2e-b-pelicula", name: "PELÍCULA SINTÉTICA 3D", price: 30 }
const H = { "x-assistec-loja-id": B }
const shot = (page: Page, nome: string) => page.screenshot({ path: `${SHOTS}/${nome}.png`, fullPage: false })

async function abrirPdvComCaixa(page: Page) {
  guardOnboarding(page)
  await page.goto("/dashboard/vendas")
  const usar = page.getByRole("button", { name: "Usar" }).first()
  const semTerminal = page.getByText("Continuar sem terminal")
  const bipe = page.getByPlaceholder("Bipe ou digite o código do produto")
  await usar.or(semTerminal).or(bipe).first().waitFor({ timeout: 60_000 })
  if (await usar.isVisible()) await usar.click()
  else if (await semTerminal.isVisible()) await semTerminal.click()
  await expect(bipe).toBeVisible({ timeout: 60_000 })
  const abrir = page.getByRole("button", { name: "Abrir Caixa", exact: true }).first()
  if (await abrir.isVisible().catch(() => false)) {
    await abrir.click()
    const dialog = page.getByRole("dialog").filter({ has: page.getByText("Saldo Inicial do Caixa") })
    await dialog.getByPlaceholder("0,00").fill("0")
    await dialog.getByPlaceholder("Ex.: Caixa 1 / Nome").fill("Caixa E2E trocas")
    await dialog.getByRole("button", { name: "Abrir Caixa", exact: true }).click()
    await expect(page.getByRole("button", { name: "Abrir Caixa", exact: true })).toHaveCount(0, { timeout: 30_000 })
    if (await page.getByRole("dialog").count()) await page.keyboard.press("Escape")
  }
}

/**
 * Fecha o diálogo de troca como o operador: Escape até fechar. O toast de confirmação do Radix
 * é uma camada dispensável por cima do diálogo — o primeiro Escape fecha o toast, o seguinte o
 * diálogo (comportamento padrão; sem isso o atalho CTRL seguinte era ignorado com a troca aberta).
 */
async function fecharTroca(page: Page) {
  const troca = page.getByRole("dialog", { name: "Troca / Devolução" })
  for (let i = 0; i < 3 && (await troca.count()) > 0; i += 1) {
    await page.keyboard.press("Escape")
    await troca.waitFor({ state: "detached", timeout: 2_000 }).catch(() => {})
  }
  await expect(troca).toHaveCount(0)
}

async function abrirTrocaNoPdv(page: Page) {
  await page.keyboard.press("Control")
  const avancado = page.getByRole("dialog", { name: "Funções avançadas (CTRL)" })
  await expect(avancado).toBeVisible()
  await avancado.getByRole("button", { name: "Trocas", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Troca / Devolução" })
  await expect(dialog).toBeVisible()
  return dialog
}

type Linha = { id: string; name: string; price: number; qtd?: number; avulso?: boolean }

test("Trocas e devoluções: busca, troca 119,90 → 129,90, recuperação, caixa, histórico e isolamento", async ({ browser }) => {
  test.setTimeout(420_000)
  const ctx = await browser.newContext({ locale: "pt-BR", serviceWorkers: "block", viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await login(page, USERS.admin)
  await switchStore(page, "Variedades Sintética B")
  const db = await readDb()
  await abrirPdvComCaixa(page)
  const sessao = await db.sessaoCaixa.findFirstOrThrow({ where: { storeId: B, status: "ABERTA" }, orderBy: { abertaEm: "desc" } })

  // Vendas de origem pela rota REAL do PDV (writer V1 do ambiente), sem cliente e sem cupom.
  let seq = 9100
  async function vender(linhas: Linha[], pb: "dinheiro" | "cartaoCredito" | "aPrazo" = "cartaoCredito") {
    const id = `VDA-2026-${++seq}`
    const total = Math.round(linhas.reduce((s, l) => s + l.price * (l.qtd ?? 1), 0) * 100) / 100
    const res = await page.request.post("/api/ops/venda-persist", {
      headers: H,
      data: {
        sale: {
          id,
          at: new Date().toISOString(),
          total,
          sessaoId: sessao.id,
          paymentBreakdown: { dinheiro: 0, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0, [pb]: total },
          lines: linhas.map((l) => ({
            inventoryId: l.avulso ? `__avulso__${l.id}` : l.id,
            ...(l.avulso ? { itemType: "avulso", isAvulso: true } : { produtoId: l.id, itemType: "produto" }),
            name: l.name,
            quantity: l.qtd ?? 1,
            unitPrice: l.price,
            lineTotal: Math.round(l.price * (l.qtd ?? 1) * 100) / 100,
          })),
        },
      },
    })
    expect(res.status(), await res.text()).toBe(200)
    return id
  }
  const vTroca = await vender([PS4])
  const vVale = await vender([PS4])
  const vReemb = await vender([PS4], "dinheiro")
  const vMesmo = await vender([X360])
  const vSobra = await vender([X360])
  const vAvulso = await vender([{ id: "e2e-item", name: "ITEM AVULSO SINTÉTICO", price: 25, avulso: true }])
  const vConc = await vender([PEL])
  const vPix = await vender([PS4])
  const vPrazo = await vender([PS4], "aPrazo")
  const vReg = await vender([PS4])
  const vRegAt = (await db.venda.findFirstOrThrow({ where: { storeId: B, pedidoId: vReg } })).at
  const estoque = async (id: string) => (await db.produto.findUniqueOrThrow({ where: { id } })).stock

  await test.step("PDV Clássico → busca por nome sem acento, código de barras e SKU, sem cupom e sem CPF", async () => {
    const dialog = await abrirTrocaNoPdv(page)
    const busca = dialog.getByLabel("Buscar venda por produto, código, cupom ou cliente")
    for (const termo of ["controle sintetico ps4", "0789000000017", "E2E-PS4"]) {
      await busca.fill(termo)
      await busca.press("Enter")
      await expect(dialog.getByRole("button", { name: new RegExp(vTroca) })).toBeVisible()
      await expect(dialog.getByRole("button", { name: new RegExp(vVale) })).toBeVisible()
    }
    await shot(page, "01-busca-codigo-sku-nome")
    await dialog.getByRole("button", { name: new RegExp(vTroca) }).click()
    await expect(dialog.getByTestId("troca-linhas-venda").getByText(/vendido 1 · devolvido 0 · disponível 1/)).toBeVisible()
  })

  const ps4Antes = await estoque(PS4.id)
  const x360Antes = await estoque(X360.id)
  await test.step("Troca imediata 119,90 → 129,90 com R$ 10,00 em dinheiro", async () => {
    const dialog = page.getByRole("dialog", { name: "Troca / Devolução" })
    await dialog.getByRole("button", { name: `Aumentar ${PS4.name}` }).click()
    const novo = dialog.getByLabel("Buscar novo produto")
    await novo.fill("E2E-X360")
    await novo.press("Enter")
    await expect(dialog.getByText(X360.name).first()).toBeVisible()
    await expect(dialog.getByText("Cliente paga")).toBeVisible()
    await expect(dialog.getByText("R$ 10,00").first()).toBeVisible()
    await shot(page, "02-troca-diferenca-10")
    await dialog.getByRole("button", { name: "Finalizar troca" }).click()
    const cupom = page.getByRole("dialog", { name: /Comprovante — TROCA IMEDIATA/ })
    await expect(cupom).toBeVisible()
    await expect(cupom.getByText(/Diferença paga \(Dinheiro\)/)).toBeVisible()
    await shot(page, "03-comprovante-troca")
    await cupom.getByRole("button", { name: "Fechar" }).click()
    // Espera o comprovante sair de vez (animação de saída) antes do próximo atalho/Escape.
    await expect(page.getByRole("dialog", { name: /Comprovante/ })).toHaveCount(0)
  })

  await test.step("Estoque, caixa e financeiro após a troca (servidor)", async () => {
    const devs = await db.devolucaoVenda.findMany({ where: { storeId: B, vendaLocalId: vTroca } })
    expect(devs).toHaveLength(1)
    const nova = await db.venda.findMany({ where: { storeId: B, payload: { path: ["trocaOrigem", "vendaOrigem"], equals: vTroca } } })
    expect(nova).toHaveLength(1)
    expect(nova[0]!.pedidoId).toMatch(/^VDA-E2EB-/)
    expect(await estoque(PS4.id)).toBe(ps4Antes + 1)
    expect(await estoque(X360.id)).toBe(x360Antes - 1)
    const entradas = await db.movimentacaoFinanceira.findMany({ where: { storeId: B, referenciaId: nova[0]!.pedidoId, origem: "venda" } })
    expect(entradas.map((m) => m.valor)).toEqual([10])
    expect(await db.movimentacaoFinanceira.count({ where: { storeId: B, origem: "devolucao_pdv", referenciaId: devs[0]!.id } })).toBe(0)
    const cred = await db.clienteCredito.findMany({ where: { storeId: B, vendaOrigemId: vTroca } })
    expect(cred.map((c) => [c.valorOriginal, c.saldoAtual])).toEqual([[119.9, 0]])
  })

  await test.step("Recarregar: disponível 0, venda substituta no histórico, nada duplicado", async () => {
    await page.reload()
    await abrirPdvComCaixa(page)
    const dialog = await abrirTrocaNoPdv(page)
    const busca = dialog.getByLabel("Buscar venda por produto, código, cupom ou cliente")
    await busca.fill(vTroca)
    await busca.press("Enter")
    await expect(dialog.getByTestId("troca-linhas-venda").getByText(/vendido 1 · devolvido 1 · disponível 0/)).toBeVisible()
    await expect(dialog.getByText(/Venda substituta/).first()).toBeVisible()
    await shot(page, "04-apos-reload-disponivel-zero")
    expect(await db.devolucaoVenda.count({ where: { storeId: B, vendaLocalId: vTroca } })).toBe(1)
    await fecharTroca(page)
  })

  await test.step("Perda de resposta e reenvio da MESMA operação (vale-troca com CPF)", async () => {
    const dialog = await abrirTrocaNoPdv(page)
    const busca = dialog.getByLabel("Buscar venda por produto, código, cupom ou cliente")
    await busca.fill(vVale)
    await busca.press("Enter")
    await dialog.getByRole("button", { name: `Aumentar ${PS4.name}` }).click()
    await dialog.getByRole("radio", { name: /Vale-troca/ }).click()
    await dialog.getByPlaceholder("Somente números").fill("52998224725")
    await dialog.getByPlaceholder("Nome do cliente").fill("Cliente Sintético Vale")
    // O servidor PROCESSA, mas a resposta não chega ao navegador.
    await page.route("**/api/ops/trocas", async (route) => {
      if (route.request().method() !== "POST") return route.continue()
      await route.fetch()
      await route.abort("connectionreset")
    })
    await dialog.getByRole("button", { name: "Confirmar devolução" }).click()
    await expect(dialog.getByRole("button", { name: /Verificar \/ reenviar/ })).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Confirmar devolução" })).toBeDisabled()
    await shot(page, "05-resposta-perdida-pendente")
    expect(await db.devolucaoVenda.count({ where: { storeId: B, vendaLocalId: vVale } })).toBe(1)
    await page.unroute("**/api/ops/trocas")
    await dialog.getByRole("button", { name: /Verificar \/ reenviar/ }).click()
    const cupom = page.getByRole("dialog", { name: /Comprovante — VALE-TROCA/ })
    await expect(cupom).toBeVisible()
    await cupom.getByRole("button", { name: "Fechar" }).click()
    // Espera o comprovante sair de vez (animação de saída) antes do próximo atalho/Escape.
    await expect(page.getByRole("dialog", { name: /Comprovante/ })).toHaveCount(0)
    expect(await db.devolucaoVenda.count({ where: { storeId: B, vendaLocalId: vVale } })).toBe(1)
    expect(await db.clienteCredito.count({ where: { storeId: B, vendaOrigemId: vVale } })).toBe(1)
    await fecharTroca(page)
  })

  await test.step("Reembolso em dinheiro: entra no esperado da gaveta da sessão", async () => {
    const dialog = await abrirTrocaNoPdv(page)
    const busca = dialog.getByLabel("Buscar venda por produto, código, cupom ou cliente")
    await busca.fill(vReemb)
    await busca.press("Enter")
    await dialog.getByRole("button", { name: `Aumentar ${PS4.name}` }).click()
    await dialog.getByRole("radio", { name: /Reembolso/ }).click()
    await dialog.getByRole("button", { name: "Dinheiro", exact: true }).click()
    await dialog.getByRole("button", { name: "Confirmar devolução" }).click()
    await expect(page.getByRole("dialog", { name: /Comprovante — DEVOLUÇÃO \/ REEMBOLSO/ })).toBeVisible()
    await shot(page, "06-reembolso-dinheiro")
    await page.getByRole("dialog", { name: /Comprovante/ }).getByRole("button", { name: "Fechar" }).click()
    // Espera o comprovante sair de vez (animação de saída) antes do próximo atalho/Escape.
    await expect(page.getByRole("dialog", { name: /Comprovante/ })).toHaveCount(0)
    await fecharTroca(page)
    const det = await (await page.request.get(`/api/ops/caixa/sessao-detalhe?sessaoId=${sessao.id}`, { headers: H })).json()
    expect(det.totais.devolucoesCaixa).toMatchObject({ reembolsosDinheiro: 119.9 })
    expect(JSON.stringify(det.sessao.devolucoes)).not.toContain("52998224725") // sem CPF na resposta
  })

  await test.step("Reembolso Pix (fora da gaveta) e venda a prazo em aberto bloqueada, pela interface", async () => {
    let dialog = await abrirTrocaNoPdv(page)
    let busca = dialog.getByLabel("Buscar venda por produto, código, cupom ou cliente")
    await busca.fill(vPix)
    await busca.press("Enter")
    await dialog.getByRole("button", { name: `Aumentar ${PS4.name}` }).click()
    await dialog.getByRole("radio", { name: /Reembolso/ }).click()
    await dialog.getByRole("button", { name: "Pix", exact: true }).click()
    await dialog.getByRole("button", { name: "Confirmar devolução" }).click()
    await expect(page.getByRole("dialog", { name: /Comprovante — DEVOLUÇÃO \/ REEMBOLSO/ })).toBeVisible()
    await page.getByRole("dialog", { name: /Comprovante/ }).getByRole("button", { name: "Fechar" }).click()
    // Espera o comprovante sair de vez (animação de saída) antes do próximo atalho/Escape.
    await expect(page.getByRole("dialog", { name: /Comprovante/ })).toHaveCount(0)
    // Mesmo diálogo, sem recarregar: o foco volta à busca e a próxima venda é aberta normalmente.
    await expect(busca).toBeFocused()
    await busca.fill(vPrazo)
    await busca.press("Enter")
    await dialog.getByRole("button", { name: `Aumentar ${PS4.name}` }).click()
    await dialog.getByRole("radio", { name: /Reembolso/ }).click()
    await dialog.getByRole("button", { name: "Dinheiro", exact: true }).click()
    await dialog.getByRole("button", { name: "Confirmar devolução" }).click()
    await expect(dialog.getByRole("alert")).toContainText("a receber")
    await shot(page, "06b-prazo-em-aberto-bloqueado")
    expect(await db.devolucaoVenda.count({ where: { storeId: B, vendaLocalId: vPrazo } })).toBe(0)
    await fecharTroca(page)
    const det = await (await page.request.get(`/api/ops/caixa/sessao-detalhe?sessaoId=${sessao.id}`, { headers: H })).json()
    expect(det.totais.devolucoesCaixa).toMatchObject({ reembolsosDinheiro: 119.9, reembolsosPix: 119.9 })
    // O atalho do PDV segue funcionando depois de dois comprovantes e um Escape.
    dialog = await abrirTrocaNoPdv(page)
    busca = dialog.getByLabel("Buscar venda por produto, código, cupom ou cliente")
    await expect(busca).toBeVisible()
    await fecharTroca(page)
  })

  // ── Rota autoritativa (mesma que a tela usa) ─────────────────────────────────────────
  const troca = (body: Record<string, unknown>, headers = H) => page.request.post("/api/ops/trocas", { headers, data: { sessaoId: sessao.id, ...body } })
  const opId = () => `trc_e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

  await test.step("Troca sem diferença, troca com sobra devolvida, avulso e caixa fechado", async () => {
    const igual = await troca({ operationId: opId(), pedidoIdOrigem: vMesmo, modo: "troca", linhas: [{ lineIndex: 0, quantidade: 1 }], novosItens: [{ produtoId: X360.id, quantidade: 1 }] })
    expect(igual.status()).toBe(200)
    expect((await igual.json()).resultado).toMatchObject({ diferenca: { valor: 0 }, excedente: { valor: 0 } })
    const sobra = await troca({ operationId: opId(), pedidoIdOrigem: vSobra, modo: "troca", linhas: [{ lineIndex: 0, quantidade: 1 }], novosItens: [{ produtoId: PEL.id, quantidade: 1 }], destinoExcedente: "dinheiro" })
    expect((await sobra.json()).resultado).toMatchObject({ excedente: { valor: 99.9, destino: "dinheiro" }, reembolso: { valor: 99.9, forma: "dinheiro" } })
    const avulsoEstoque = await troca({ operationId: opId(), pedidoIdOrigem: vAvulso, modo: "somente_estoque", linhas: [{ lineIndex: 0, quantidade: 1 }] })
    expect((await avulsoEstoque.json()).code).toBe("SEM_VINCULO_ESTOQUE")
    const avulsoPix = await troca({ operationId: opId(), pedidoIdOrigem: vAvulso, modo: "reembolso", formaReembolso: "pix", linhas: [{ lineIndex: 0, quantidade: 1 }] })
    expect((await avulsoPix.json()).resultado.itensDevolvidos[0].destino).toBe("sem_vinculo_estoque")
    const semCaixa = await troca({ sessaoId: null, operationId: opId(), pedidoIdOrigem: vConc, modo: "troca", linhas: [{ lineIndex: 0, quantidade: 1 }], novosItens: [{ produtoId: PEL.id, quantidade: 1 }] })
    expect(semCaixa.status()).toBe(409)
    expect((await semCaixa.json()).code).toBe("CAIXA_FECHADO")
  })

  await test.step("Duas abas concorrentes: operações diferentes → uma vence; mesma operação → replay", async () => {
    const corpo = { pedidoIdOrigem: vConc, modo: "reembolso", formaReembolso: "pix", linhas: [{ lineIndex: 0, quantidade: 1 }] }
    const [a, b] = await Promise.all([troca({ ...corpo, operationId: opId() }), troca({ ...corpo, operationId: opId() })])
    expect([a.status(), b.status()].sort()).toEqual([200, 409])
    expect(await db.devolucaoVenda.count({ where: { storeId: B, vendaLocalId: vConc } })).toBe(1)
    const mesma = opId()
    const vAbas = await vender([PEL])
    const [c, d] = await Promise.all([
      troca({ pedidoIdOrigem: vAbas, modo: "somente_estoque", linhas: [{ lineIndex: 0, quantidade: 1 }], operationId: mesma }),
      troca({ pedidoIdOrigem: vAbas, modo: "somente_estoque", linhas: [{ lineIndex: 0, quantidade: 1 }], operationId: mesma }),
    ])
    expect([c.status(), d.status()]).toEqual([200, 200])
    expect([(await c.json()).replayed, (await d.json()).replayed].sort()).toEqual([false, true])
    expect(await db.devolucaoVenda.count({ where: { storeId: B, vendaLocalId: vAbas } })).toBe(1)
  })

  await test.step("Isolamento multiloja e permissões", async () => {
    const outraLoja = { "x-assistec-loja-id": STORES.padaria }
    const busca = await (await page.request.get(`/api/ops/trocas/buscar?q=${vTroca}&dias=0`, { headers: outraLoja })).json()
    expect(busca.vendas ?? []).toEqual([])
    const venda = await page.request.get(`/api/ops/trocas/venda?pedidoId=${vTroca}`, { headers: outraLoja })
    expect(venda.status()).toBe(404)
    const anon = await browser.newContext({ serviceWorkers: "block" })
    const semSessao = await anon.request.post(new URL("/api/ops/trocas", page.url()).toString(), { headers: H, data: { operationId: opId() }, maxRedirects: 0 })
    expect([401, 403, 307]).toContain(semSessao.status())
    await anon.close()
    const op = await browser.newContext({ locale: "pt-BR", serviceWorkers: "block" })
    const opPage = await op.newPage()
    await login(opPage, USERS.operador)
    const cruzada = await opPage.request.post("/api/ops/trocas", {
      headers: outraLoja,
      data: { operationId: opId(), pedidoIdOrigem: vConc, modo: "somente_estoque", linhas: [{ lineIndex: 0, quantidade: 1 }] },
    })
    expect(cruzada.status()).toBe(403)
    await op.close()
  })

  await test.step("Histórico de Vendas: detalhe com códigos rotulados e troca a partir da linha", async () => {
    guardOnboarding(page)
    await page.goto("/dashboard/vendas-arquivo-geral")
    const busca = page.getByPlaceholder("Buscar por cupom, cliente, produto/SKU ou ID da venda…")
    await busca.fill(vTroca)
    const linha = page.getByRole("row").filter({ hasText: vTroca })
    await expect(linha).toBeVisible({ timeout: 60_000 })
    await linha.getByText(vTroca).first().click()
    const painel = page.getByText("Identificação e devoluções por item")
    await expect(painel).toBeVisible()
    await expect(page.getByText(/Cadastro atual \(pode diferir da data da venda\): SKU E2E-PS4 · EAN 0789000000017/).first()).toBeVisible()
    await expect(page.getByText(/Venda substituta/).first()).toBeVisible()
    await shot(page, "07-historico-detalhe")
    await page.keyboard.press("Escape")
    await linha.locator("td").last().locator("button").last().click()
    await page.getByRole("menuitem", { name: "Troca / Devolução" }).click()
    const dialog = page.getByRole("dialog").filter({ hasText: vTroca })
    await expect(dialog.getByTestId("troca-linhas-venda").getByText(/vendido 1 · devolvido 1 · disponível 0/)).toBeVisible()
    await shot(page, "08-historico-troca-disponivel-zero")
  })

  await test.step("Regularização retroativa: valor histórico ≠ preço atual, simulação, sessão original e fechamento preservado", async () => {
    // A troca "aconteceu" 2 min depois da venda, dentro desta sessão — que agora é fechada.
    const espera = vRegAt.getTime() + 150_000 - Date.now()
    if (espera > 0) await page.waitForTimeout(espera)
    const det = await (await page.request.get(`/api/ops/caixa/sessao-detalhe?sessaoId=${sessao.id}`, { headers: H })).json()
    const fechar = await page.request.post("/api/ops/caixa/fechar", {
      headers: H,
      data: { sessaoId: sessao.id, saldoFinal: 0, observacao: "E2E trocas", payload: { resumoFechamento: { reembolsosDinheiro: det.totais.devolucoesCaixa.reembolsosDinheiro } } },
    })
    expect(fechar.status(), await fechar.text()).toBe(200)
    const fechada = await db.sessaoCaixa.findUniqueOrThrow({ where: { id: sessao.id } })
    expect(fechada.status).toBe("FECHADA")

    await abrirPdvComCaixa(page)
    const dialog = await abrirTrocaNoPdv(page)
    const busca = dialog.getByLabel("Buscar venda por produto, código, cupom ou cliente")
    await busca.fill(vReg)
    await busca.press("Enter")
    await dialog.getByRole("button", { name: `Aumentar ${PS4.name}` }).click()
    const novo = dialog.getByLabel("Buscar novo produto")
    await novo.fill("E2E-X360")
    await novo.press("Enter")
    await dialog.getByText("Regularizar operação já feita no balcão (data passada)").click()
    const local = await page.evaluate((iso) => {
      const d = new Date(new Date(iso).getTime() + 120_000)
      const p = (n: number) => String(n).padStart(2, "0")
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
    }, vRegAt.toISOString())
    await dialog.getByLabel("Data e hora reais da operação").fill(local)
    await expect(dialog.getByLabel("Sessão de caixa da época")).toHaveValue(sessao.id)
    await dialog.getByText(/Horário exato desconhecido/).click()
    await dialog.getByLabel("Justificativa da regularização").fill("Troca feita no balcão; sistema não concluiu; horário aproximado.")
    // Preço atual 129,90; na ocasião foram cobrados 124,90 (diferença recebida 5,00).
    await dialog.getByLabel("Valor cobrado pela nova compra na ocasião").fill("124,90")
    await dialog.getByLabel("Diferença efetivamente recebida").fill("5,00")
    await expect(dialog.getByRole("button", { name: "Finalizar troca" })).toBeDisabled() // só depois de conferir
    await dialog.getByRole("button", { name: /Conferir efeitos/ }).click()
    const efeitos = dialog.getByTestId("troca-efeitos-simulados")
    await expect(efeitos).toContainText("divergente")
    await expect(efeitos).toContainText("na sessão da época")
    await shot(page, "09-regularizacao-efeitos-conferidos")
    expect(await db.devolucaoVenda.count({ where: { storeId: B, vendaLocalId: vReg } })).toBe(0) // simulação não grava
    await dialog.getByRole("button", { name: "Finalizar troca" }).click()
    const cupom = page.getByRole("dialog", { name: /Comprovante — TROCA IMEDIATA/ })
    await expect(cupom).toBeVisible()
    await cupom.getByRole("button", { name: "Fechar" }).click()
    // Espera o comprovante sair de vez (animação de saída) antes do próximo atalho/Escape.
    await expect(page.getByRole("dialog", { name: /Comprovante/ })).toHaveCount(0)
    await fecharTroca(page)

    const nova = await db.venda.findFirstOrThrow({ where: { storeId: B, payload: { path: ["trocaOrigem", "vendaOrigem"], equals: vReg } } })
    const np = nova.payload as Record<string, unknown> & { regularizacaoTroca?: { precos?: Record<string, unknown> } }
    expect(np.sessaoId).toBe(sessao.id)
    expect(np.retroactiveSync).toBe(true)
    expect(nova.total).toBe(124.9)
    expect(np.regularizacaoTroca?.precos).toMatchObject({ precoConfirmado: 124.9, precoAtual: 129.9, divergente: true })
    const entradas = await db.movimentacaoFinanceira.findMany({ where: { storeId: B, referenciaId: nova.pedidoId, origem: "venda" } })
    expect(entradas.map((m) => m.valor)).toEqual([5])
    expect(entradas[0]!.createdAt.getTime()).toBeLessThanOrEqual(fechada.fechadaEm!.getTime())
    expect(entradas[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(fechada.abertaEm.getTime()) // dentro da sessão da época
    // Fechamento original intocado; a regularização aparece à parte com o total recalculado.
    expect((await db.sessaoCaixa.findUniqueOrThrow({ where: { id: sessao.id } })).saldoFinal).toBe(fechada.saldoFinal)
    const detFechada = await (await page.request.get(`/api/ops/caixa/sessao-detalhe?sessaoId=${sessao.id}`, { headers: H })).json()
    expect(detFechada.regularizacoes).toMatchObject({ dinheiroLiquido: 5 })
    await page.goto("/dashboard/caixa/historico")
    await page.getByText(fechada.operador || "Caixa E2E trocas").first().click()
    const bloco = page.getByTestId("caixa-regularizacoes-posteriores")
    await expect(bloco).toBeVisible({ timeout: 60_000 })
    await expect(bloco).toContainText("Recalculado (não substitui o original)")
    await expect(bloco).toContainText("horário aproximado")
    await shot(page, "10-fechamento-original-e-regularizacao")
  })

  await ctx.close()
})
