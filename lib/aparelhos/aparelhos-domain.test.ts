import { describe, expect, it } from "vitest"
import { formatImei, luhnCheckDigit, maskImei, validateImei } from "./imei"
import { addDaysKey, calcularGarantia, GARANTIA_LEGAL_DIAS, rotuloPrazo, validateContratualDias, normalizePresets } from "./warranty"
import { canTransition, contaNoEstoque, transicoesManuais } from "./lifecycle"
import { resumoChecklist, sanitizeChecklist } from "./checklist"
import { aparelhoPermissionsForRole, podeAprovarAquisicao } from "./permissions"
import { assertDeviceSaleLinesShape, parseDeviceSaleLine } from "./sale-hook"
import { isSerializedDeviceProduct } from "./serialized-product"
import { renderComprovanteVenda, renderTermoGarantia, renderProtocoloAquisicao, type GarantiaSnapshot } from "./documents"
import { textoCondicoesGarantia } from "./policy"
import { maskDocumento } from "./sale-hook-shared"

/** IMEI sintético válido: corpo de 14 dígitos + DV Luhn. */
export function imeiValido(body14: string): string {
  return body14 + String(luhnCheckDigit(body14))
}

describe("IMEI", () => {
  it("aceita IMEI com dígito verificador correto (04: inválido rejeitado)", () => {
    const ok = imeiValido("35678912345678")
    expect(validateImei(ok)).toEqual({ ok: true, imei: ok })
    expect(validateImei(`${ok.slice(0, 2)} ${ok.slice(2)}`).ok).toBe(true)
    const errado = ok.slice(0, 14) + String((Number(ok[14]) + 1) % 10)
    expect(validateImei(errado)).toMatchObject({ ok: false, reason: "DIGITO_VERIFICADOR" })
    expect(validateImei("12345")).toMatchObject({ ok: false, reason: "TAMANHO" })
    expect(validateImei("000000000000000")).toMatchObject({ ok: false, reason: "SEQUENCIA_INVALIDA" })
    expect(validateImei("")).toMatchObject({ ok: false, reason: "VAZIO" })
  })
  it("formata e mascara sem expor o número completo", () => {
    const imei = imeiValido("35678912345678")
    expect(formatImei(imei)).toBe(`35 678912 345678 ${imei[14]}`)
    expect(maskImei(imei)).toBe(`••••••••••${imei.slice(-5)}`)
    expect(maskImei(imei)).not.toContain(imei.slice(0, 10))
  })
})

describe("Garantia (25–31)", () => {
  it("legal é sempre 90 dias e a contratual soma (leitura mais favorável)", () => {
    expect(GARANTIA_LEGAL_DIAS).toBe(90)
    const sem = calcularGarantia("2026-01-10", 0)
    expect(sem).toMatchObject({ legalDias: 90, contratualDias: 0, contratualFim: null, coberturaFim: addDaysKey("2026-01-10", 90) })
    for (const dias of [30, 90, 180, 365, 45]) {
      const g = calcularGarantia("2026-01-10", dias)
      expect(g.contratualFim).toBe(addDaysKey("2026-01-10", dias))
      expect(g.coberturaFim).toBe(addDaysKey("2026-01-10", dias + 90))
      expect(g.totalDias).toBe(dias + 90)
    }
  })
  it("conta pelo calendário (exclui o dia do começo, inclui o vencimento), inclusive ano bissexto", () => {
    expect(addDaysKey("2028-02-28", 1)).toBe("2028-02-29")
    expect(calcularGarantia("2026-12-01", 0).coberturaFim).toBe("2027-03-01")
  })
  it("nunca aceita contratual negativa, fracionada ou acima do limite (31)", () => {
    expect(validateContratualDias(-1, 730).ok).toBe(false)
    expect(validateContratualDias(10.5, 730).ok).toBe(false)
    expect(validateContratualDias("abc", 730).ok).toBe(false)
    expect(validateContratualDias(731, 730)).toMatchObject({ ok: false, code: "CONTRATUAL_ACIMA_DO_LIMITE" })
    expect(validateContratualDias(45, 730)).toEqual({ ok: true, dias: 45 })
    expect(() => calcularGarantia("2026-01-10", -30)).toThrow()
  })
  it("presets sempre incluem 'sem adicional' e respeitam o limite", () => {
    expect(normalizePresets([30, 9999, 90, "x"], 365)).toEqual([0, 30, 90])
    expect(rotuloPrazo(180)).toBe("6 meses")
    expect(rotuloPrazo(365)).toBe("1 ano")
  })
  it("texto do termo preserva os direitos legais mesmo com condições da loja", () => {
    const t = textoCondicoesGarantia("Película não coberta.")
    expect(t[0]).toContain("90 dias")
    expect(t.join(" ")).toContain("não a substitui")
    expect(t.at(-1)).toBe("Película não coberta.")
  })
})

describe("Ciclo de vida e checklist", () => {
  it("transições controladas; vendido só volta por devolução; baixado é terminal", () => {
    expect(canTransition("aguardando_conferencia", "disponivel")).toBe(true)
    expect(canTransition("vendido", "disponivel")).toBe(false)
    expect(canTransition("vendido", "devolvido")).toBe(true)
    expect(canTransition("baixado", "disponivel")).toBe(false)
    expect(transicoesManuais("disponivel")).not.toContain("vendido")
    expect(contaNoEstoque("disponivel") && contaNoEstoque("reservado")).toBe(true)
    expect(contaNoEstoque("bloqueado") || contaNoEstoque("em_revisao")).toBe(false)
  })
  it("NÃO TESTADO nunca vira aprovado (12)", () => {
    const c = sanitizeChecklist({ tela: "PASS", touch: "NAO_TESTADO", cameras: "FAIL", wifi: "lixo" })
    const r = resumoChecklist(c)
    expect(r.aprovados).toBe(1)
    expect(r.falhas).toBe(1)
    expect(r.naoTestados).toBe(r.total - 2)
  })
})

describe("Permissões (42–43)", () => {
  it("caixa vende e reimprime, mas não vê custo nem cadastra", () => {
    const p = aparelhoPermissionsForRole("CAIXA")
    expect(p).toMatchObject({ vender: true, reservar: true, reimprimir: true, verCusto: false, cadastrar: false, dadosSensiveis: false })
  })
  it("técnico avalia mas não vende; vendedor não aprova nem vê custo", () => {
    expect(aparelhoPermissionsForRole("TECNICO")).toMatchObject({ vender: false, cadastrar: true, verCusto: false })
    expect(aparelhoPermissionsForRole("VENDEDOR")).toMatchObject({ vender: true, aprovarAquisicao: false, verCusto: false })
  })
  it("segregação: gerente não aprova a própria compra; proprietário pode", () => {
    const g = aparelhoPermissionsForRole("GERENTE")
    expect(podeAprovarAquisicao(g, "u1", "u1")).toBe(false)
    expect(podeAprovarAquisicao(g, "u1", "u2")).toBe(true)
    expect(podeAprovarAquisicao(aparelhoPermissionsForRole("ADMIN"), "u1", "u1")).toBe(true)
    expect(aparelhoPermissionsForRole("GERENTE").configurarGarantia).toBe(false)
  })
})

describe("Linha de venda de aparelho (19)", () => {
  it("exige cliente, quantidade 1 e unidade não repetida", () => {
    const line = { produtoId: "p1", inventoryId: "SKU-P1", quantity: 1, deviceSale: { version: 1, aparelhoId: "a1", contratualDias: 90 } }
    expect(() => assertDeviceSaleLinesShape([line], null)).toThrow(/cliente/i)
    expect(() => assertDeviceSaleLinesShape([{ ...line, quantity: 2 }], "c1")).toThrow(/quantidade 1/)
    expect(() => assertDeviceSaleLinesShape([line, line], "c1")).toThrow(/duas vezes/)
    expect(assertDeviceSaleLinesShape([line], "c1")).toHaveLength(1)
    expect(assertDeviceSaleLinesShape([{ produtoId: "p2", quantity: 3 }], null)).toHaveLength(0) // 20: venda comum sem cliente
    expect(parseDeviceSaleLine({ version: 2, aparelhoId: "a" })).toBeNull()
    expect(() => assertDeviceSaleLinesShape([{ ...line, inventoryId: "__avulso__1" }], "c1")).toThrow(/item de produto/)
  })
  it("reconhece produto serializado só pelo metadado versionado", () => {
    expect(isSerializedDeviceProduct({ serializedDevice: { version: 1, key: "X" } })).toBe(true)
    expect(isSerializedDeviceProduct({ serializedDevice: true })).toBe(false)
    expect(isSerializedDeviceProduct(null)).toBe(false)
  })
})

const snap: GarantiaSnapshot = {
  versao: "APA-TERMO-1", numeroGarantia: "GAR-2026-00001",
  loja: { nome: "Loja <QA>", cnpj: "00.000.000/0001-00", telefone: "11 9999-0000", email: "", endereco: null },
  cliente: { nome: "Cliente QA", documentoMascarado: maskDocumento("12345678909"), telefone: "" },
  aparelho: { codigoInterno: "APA-000001", marca: "Apple", modelo: "iPhone 14", variante: "", armazenamento: "128 GB", memoriaRam: "", cor: "Preto", condicao: "seminovo", condicaoLabel: "Seminovo", imei1: "35 678912 345678 9", imei2: "", serial: "", estadoFisico: "Marcas leves", bateriaSaude: 88, acessoriosEntregues: "Cabo" },
  venda: { pedidoId: "VDA-2026-0001", dataVenda: "2026-11-10", preco: 4999, operador: "Op" },
  garantia: { dataEntrega: "2026-11-10", legalDias: 90, contratualDias: 180, contratualFim: "2027-05-09", legalFim: "2027-08-07", coberturaFim: "2027-08-07", fabricanteInfo: "" },
  condicoes: textoCondicoesGarantia(""), politicaVersao: 1, observacoes: "",
}

describe("Documentos (33–35)", () => {
  it("A4 usa @page A4 e mostra legal + contratual + assinatura; escapa HTML", () => {
    const html = renderTermoGarantia(snap, "a4")
    expect(html).toContain("@page { size: A4")
    expect(html).toContain("90 dias")
    expect(html).toContain("6 meses (180 dias)")
    expect(html).toContain("07/08/2027")
    expect(html).toContain("Responsável pela loja")
    expect(html).toContain("Loja &lt;QA&gt;")
    expect(html).not.toContain("RASCUNHO")
    expect(maskDocumento("12345678909")).toBe("***.456.789-**")
  })
  it("80 mm nunca usa o CSS inválido 'size: 80mm auto'", () => {
    const html = renderComprovanteVenda(snap, [{ label: "Pix", valor: 4999 }], "80mm")
    expect(html).not.toMatch(/size:\s*80mm\s+auto/)
    expect(html).toMatch(/size: 80mm 200mm/)
    expect(html).toContain("sem valor fiscal")
  })
  it("garantia cancelada/recomprada reimprime com aviso de sem efeito", () => {
    expect(renderTermoGarantia(snap, "a4", "SEM EFEITO — garantia cancelada com a venda.")).toContain("SEM EFEITO")
  })
  it("prévia é marcada como RASCUNHO", () => {
    expect(renderTermoGarantia({ ...snap, numeroGarantia: "RASCUNHO" }, "a4", true)).toContain("RASCUNHO — prévia sem validade")
  })
  it("protocolo de aquisição pendente aparece como sem efeito", () => {
    const html = renderProtocoloAquisicao({ protocolo: "AQ-2026-0001", tipo: "compra_cliente", status: "aguardando_aprovacao", dataKey: "2026-11-10", loja: { nome: "L", cnpj: "", telefone: "" }, vendedor: { nome: "V", documentoMascarado: "***.456.789-**" }, documentoOrigem: "Declaração de procedência", valorTotal: 1000, formaPagamento: "pix", pagamentoStatus: "pendente", aparelhos: [], observacoes: "" }, "a4")
    expect(html).toContain("AGUARDANDO APROVAÇÃO")
    expect(html).toContain("Não substitui nota fiscal")
  })
})
