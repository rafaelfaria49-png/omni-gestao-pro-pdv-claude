import { mkdirSync } from "node:fs"
import path from "node:path"
import { expect, test, type Page } from "@playwright/test"
import { buildPrintDocument } from "../../apps/desktop/src/shared/print-protocol"
import {
  renderComprovanteVenda,
  renderProtocoloAquisicao,
  renderTermoEntrega,
  renderTermoGarantia,
  type AquisicaoDoc,
  type GarantiaSnapshot,
} from "../../lib/aparelhos/documents"
import { documentoTesteAparelho80mm, fragmentoAparelho80mm } from "../../lib/aparelhos/print-client"
import { calcularGarantia } from "../../lib/aparelhos/warranty"

/**
 * OMNI-APARELHOS-TERMO-80MM-PRINT-LAYOUT-P1-001 — o fragmento EFETIVAMENTE enviado à POS-80
 * (`fragmentoAparelho80mm`) é montado no mesmo documento da ponte Electron (`buildPrintDocument`,
 * janela de 302 px) e medido em Chromium real. Dados 100% sintéticos; nada toca banco ou API.
 */
const LABEL = process.env.EVIDENCE_LABEL || "depois"
const OUT = path.join(__dirname, "../../test-results/aparelhos-80mm", LABEL)
mkdirSync(OUT, { recursive: true })

const base: GarantiaSnapshot = {
  versao: "v1",
  numeroGarantia: "GAR-2026-000123",
  politicaVersao: 2,
  loja: { nome: "Loja Sintética de Testes", cnpj: "00.000.000/0001-00", telefone: "(00) 0000-0000", email: "", endereco: { rua: "Rua Exemplo", numero: "100", bairro: "Centro", cidade: "São Paulo", uf: "SP" } },
  cliente: { nome: "Cliente Sintético", documentoMascarado: "***.456.789-**", telefone: "" },
  aparelho: {
    codigoInterno: "AP-000123", marca: "Apple", modelo: "iPhone 13", variante: "", armazenamento: "128 GB", memoriaRam: "", cor: "Azul",
    condicao: "seminovo", condicaoLabel: "Seminovo", imei1: "354678123456014", imei2: "354678123456022", serial: "F2LXQ0QX0D",
    estadoFisico: "Leves marcas de uso na lateral", bateriaSaude: 87, acessoriosEntregues: "Cabo USB-C e caixa original",
  },
  venda: { pedidoId: "VDA-2026-0042", dataVenda: "2026-11-20", preco: 3299.9, operador: "Operador Sintético" },
  garantia: { ...calcularGarantia("2026-11-20", 0), fabricanteInfo: "" },
  condicoes: [
    "A garantia cobre defeitos de funcionamento não causados por mau uso.",
    "Não cobre quedas, umidade, oxidação, tela trincada ou violação do lacre.",
  ],
  observacoes: "",
}

const LONGO = "Maria Aparecida da Conceição Albuquerque Gonçalves de Assunção Figueiredo"
const casos: Array<{ nome: string; html: string }> = [
  { nome: "teste-sintetico-botao", html: documentoTesteAparelho80mm(new Date("2026-11-20T12:00:00Z")) },
  { nome: "termo-90-sem-adicional", html: renderTermoGarantia(base, "80mm") },
  {
    nome: "termo-com-adicional-365",
    html: renderTermoGarantia({ ...base, garantia: { ...calcularGarantia("2026-11-20", 365), fabricanteInfo: "" } }, "80mm"),
  },
  {
    nome: "termo-nomes-longos-acentos",
    html: renderTermoGarantia(
      {
        ...base,
        cliente: { ...base.cliente, nome: LONGO },
        aparelho: {
          ...base.aparelho,
          marca: "Samsung Electrônica da Amazônia",
          modelo: "Galaxy S24 Ultra Edição Titânio Violeta Especial",
          variante: "Dual Chip", armazenamento: "512 GB", memoriaRam: "12 GB", cor: "Titânio Violeta",
          estadoFisico: "Pequeno risco na câmera traseira; tela sem marcas; botões e conectores íntegros após conferência",
        },
        garantia: { ...calcularGarantia("2026-11-20", 90), fabricanteInfo: "" },
        condicoes: [
          "A garantia cobre defeitos de funcionamento não causados por mau uso, inclusive vício oculto evidenciado após a entrega, nos termos do Código de Defesa do Consumidor.",
          "Não cobre quedas, umidade, oxidação, tela trincada, violação do lacre ou reparo feito por terceiros não autorizados pela loja.",
          "Para acionar, apresente este termo e o comprovante de venda; o atendimento é feito na loja em horário comercial.",
        ],
        observacoes: "Cliente ciente de que acessórios não originais não possuem garantia contratual adicional.",
      },
      "80mm",
    ),
  },
  { nome: "comprovante-venda", html: renderComprovanteVenda(base, [{ label: "Pix", valor: 1299.9 }, { label: "Cartão de crédito", valor: 2000 }], "80mm") },
  { nome: "termo-entrega", html: renderTermoEntrega({ ...base, cliente: { ...base.cliente, nome: LONGO } }, "80mm") },
  {
    nome: "protocolo-aquisicao",
    html: renderProtocoloAquisicao(
      {
        protocolo: "AQ-2026-0007", tipo: "compra_cliente", status: "confirmada", dataKey: "2026-11-20",
        loja: { nome: "Loja Sintética de Testes", cnpj: "00.000.000/0001-00", telefone: "" },
        vendedor: { nome: LONGO, documentoMascarado: "***.111.222-**" }, documentoOrigem: "Declaração de propriedade",
        valorTotal: 1800, formaPagamento: "pix", pagamentoStatus: "pago",
        aparelhos: [{ codigoInterno: "AP-000124", descricao: "Motorola Moto Edge 30 Neo · 256 GB · Verde", imei1: "354678123456030", imei2: "", serial: "", condicao: "Usado", checklist: "Tela, câmera, áudio, carga e biometria conferidos" }],
        observacoes: "",
      } satisfies AquisicaoDoc,
      "80mm",
    ),
  },
]

/** Mesmo caminho do clique real: HTML do endpoint → fragmento → documento da ponte Electron. */
async function montarComoNaPonte(page: Page, html: string): Promise<void> {
  await page.setViewportSize({ width: 302, height: 900 }) // BrowserWindow 80 mm da ponte
  await page.setContent("<!DOCTYPE html><html><body></body></html>")
  // DOMParser só existe no navegador: roda a função real do print-client dentro da página.
  const fragment = await page.evaluate(
    ([src, input]) => (new Function(`return (${src})`)() as (h: string) => { html: string; title: string })(input),
    [fragmentoAparelho80mm.toString(), html] as const,
  )
  await page.setContent(buildPrintDocument(fragment.html, "80mm", fragment.title))
}

async function evidencias(page: Page, nome: string): Promise<void> {
  await page.screenshot({ path: path.join(OUT, `${nome}.png`), fullPage: true })
  const alturaPx = await page.evaluate(() => document.documentElement.scrollHeight)
  await page.emulateMedia({ media: "print" })
  await page.pdf({ path: path.join(OUT, `${nome}.pdf`), width: "80mm", height: `${Math.ceil((alturaPx * 25.4) / 96) + 10}mm`, margin: { top: "0", right: "0", bottom: "0", left: "0" } })
  await page.emulateMedia({ media: "screen" })
}

type Medidas = {
  overflow: string[]
  palavrasPartidas: string[]
  coberturas: Array<{ linhas: string[]; empilhado: boolean }>
  linhasTabela: string[]
  assinaturasSobrepostas: boolean
  texto: string
}

async function medir(page: Page): Promise<Medidas> {
  return page.evaluate(() => {
    const wrap = document.querySelector(".wrap") as HTMLElement
    const limite = wrap.getBoundingClientRect().right + 0.5
    const overflow: string[] = []
    for (const el of Array.from(wrap.querySelectorAll("*"))) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.right > limite) overflow.push(`${el.tagName}.${el.className}: ${(el.textContent ?? "").slice(0, 40)}`)
    }
    if (document.documentElement.scrollWidth > window.innerWidth) overflow.push(`scrollWidth ${document.documentElement.scrollWidth}`)

    // Palavra cujo retângulo ocupa mais de uma linha = quebra no meio da palavra.
    const palavrasPartidas: string[] = []
    const walker = document.createTreeWalker(wrap, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const txt = n.textContent ?? ""
      for (const m of txt.matchAll(/\S+/g)) {
        const range = document.createRange()
        range.setStart(n, m.index!)
        range.setEnd(n, m.index! + m[0].length)
        const tops = new Set(Array.from(range.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top)))
        if (tops.size > 1) palavrasPartidas.push(m[0])
      }
    }

    const coberturas = Array.from(wrap.querySelectorAll(".cover > div")).map((div) => {
      const partes = Array.from(div.children) as HTMLElement[]
      const rects = partes.map((p) => p.getBoundingClientRect())
      const empilhado = rects.length === 3 && rects[1].top >= rects[0].bottom - 0.5 && rects[2].top >= rects[1].bottom - 0.5
      return { linhas: (div as HTMLElement).innerText.split("\n").map((l) => l.trim()).filter(Boolean), empilhado }
    })
    // innerText ignora ::after; o separador impresso é lido do estilo computado do rótulo.
    const linhasTabela = Array.from(wrap.querySelectorAll("tr")).map((tr) => {
      const th = tr.querySelector("th") as HTMLElement | null
      const td = tr.querySelector("td") as HTMLElement | null
      const sep = th ? getComputedStyle(th, "::after").content.replace(/^"|"$/g, "") : ""
      return `${th?.innerText ?? ""}${sep}${td?.innerText ?? ""}`.replace(/\s+/g, " ").trim()
    })
    const sign = Array.from(wrap.querySelectorAll(".sign > div")).map((d) => d.getBoundingClientRect())
    const assinaturasSobrepostas = sign.some((a, i) => sign.some((b, j) => i < j && a.bottom > b.top && b.bottom > a.top && a.right > b.left && b.right > a.left))
    return { overflow, palavrasPartidas, coberturas, linhasTabela, assinaturasSobrepostas, texto: wrap.innerText }
  })
}

for (const caso of casos) {
  test(`80 mm legível: ${caso.nome}`, async ({ page }) => {
    await montarComoNaPonte(page, caso.html)
    await evidencias(page, caso.nome) // gerado antes das asserções: serve de evidência "antes" também
    const m = await medir(page)

    expect(m.overflow, "nada pode passar da área útil da bobina").toEqual([])
    expect(m.palavrasPartidas, "nenhuma palavra pode ser quebrada no meio").toEqual([])
    expect(m.assinaturasSobrepostas).toBe(false)
    // Concatenações vistas no papel da RAFACELL (Windows 1.0.3 / POS-80).
    expect(m.texto).not.toMatch(/legal90|diasCDC|adicionalSem|Sem adicionalde|até\d|\d{4}contratual|adicional\d/)
    for (const linha of m.linhasTabela) expect(linha, "rótulo e valor separados por ': '").toMatch(/^[^:]+: \S/)
    if (m.coberturas.length) {
      expect(m.coberturas).toHaveLength(3)
      for (const c of m.coberturas) {
        expect(c.empilhado, `bloco empilhado: ${c.linhas.join(" | ")}`).toBe(true)
        expect(c.linhas).toHaveLength(3)
      }
      expect(m.coberturas.map((c) => c.linhas[0])).toEqual(["Garantia legal", "Garantia contratual adicional", "Cobertura total até"])
      expect(m.coberturas[0].linhas[1]).toBe("90 dias")
    }
  })
}

test("A4 intacto: cobertura em 3 colunas com rótulo e valor em linhas próprias", async ({ page }) => {
  await page.setViewportSize({ width: 794, height: 1123 })
  await page.setContent(renderTermoGarantia({ ...base, garantia: { ...calcularGarantia("2026-11-20", 365), fabricanteInfo: "" } }, "a4"))
  await page.screenshot({ path: path.join(OUT, "a4-termo-com-adicional-365.png"), fullPage: true })
  const cols = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".cover > div")).map((d) => ({ left: Math.round(d.getBoundingClientRect().left), linhas: (d as HTMLElement).innerText.split("\n").filter(Boolean) })),
  )
  expect(new Set(cols.map((c) => c.left)).size).toBe(3)
  expect(cols[0].linhas).toEqual(["Garantia legal", "90 dias", "CDC art. 26, II — sempre garantida"])
})

test("conteúdo de garantia e acentos preservados no fragmento", async ({ page }) => {
  await montarComoNaPonte(page, casos.find((c) => c.nome === "termo-com-adicional-365")!.html)
  const m = await medir(page)
  expect(m.coberturas[1].linhas).toEqual(["Garantia contratual adicional", "1 ano (365 dias)", "de 20/11/2026 a 20/11/2027"])
  expect(m.coberturas[2].linhas).toEqual(["Cobertura total até", "18/02/2028", "contratual + legal, a partir da entrega em 20/11/2026"])
  expect(m.linhasTabela).toContain("Valor: R$ 3.299,90")
  expect(m.linhasTabela).toContain("Entrega: 20/11/2026")
  expect(m.linhasTabela).toContain("Venda: VDA-2026-0042 — 20/11/2026")
  expect(m.linhasTabela).toContain("IMEI 1: 354678123456014")

  await montarComoNaPonte(page, casos[0].html)
  const t = await medir(page)
  expect(t.texto).toContain("TESTE DE IMPRESSÃO — SEM VALIDADE COMERCIAL")
  expect(t.texto).toContain("Acentuação ÇÃÉÕ")
  expect(t.coberturas[1].linhas).toEqual(["Garantia contratual adicional", "Sem adicional", "—"])
})
