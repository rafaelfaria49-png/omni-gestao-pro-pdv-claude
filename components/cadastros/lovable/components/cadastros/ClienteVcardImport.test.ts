// @vitest-environment jsdom
import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  interpret: vi.fn(),
  save: vi.fn<(...args: unknown[]) => Promise<{ ok: true; id: string } | { ok: false; message: string }>>(),
}))
vi.mock("@/app/actions/cliente-texto-livre", () => ({ interpretarClienteTextoLivre: h.interpret, salvarClienteRevisado: h.save }))
import { ClienteEditor, ClienteEditorDialog } from "./ClienteEditor"
import {
  VCARD_21, VCARD_30_SIMPLES, VCARD_40_URI, VCARD_DOBRADO_E_AGRUPADO, VCARD_HTML, VCARD_VARIOS,
} from "@/lib/cadastros/vcard/__fixtures__/vcards"

const props = () => ({ storeId: "loja-a", editing: null, onClose: vi.fn(), onSaved: vi.fn() })
const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value
const edit = (label: string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } })
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }))
const region = () => screen.getByRole("region", { name: "Importar contato (vCard)" })
const vcf = (text: string, name = "contato-sintetico.vcf") => new File([text], name, { type: "text/vcard" })

/** FileReader controlado: cada leitura só termina quando o teste manda (bytes lidos pelo FileReader real do jsdom). */
const RealFileReader = FileReader
const readReal = (file: File) => new Promise<ArrayBuffer>((resolve) => {
  const reader = new RealFileReader()
  reader.onload = () => resolve(reader.result as ArrayBuffer)
  reader.readAsArrayBuffer(file)
})
type Pending = { file: File; finish: () => Promise<void> }
let reads: Pending[] = []
class ControlledReader {
  result: ArrayBuffer | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  readAsArrayBuffer(file: File) {
    reads.push({ file, finish: async () => { this.result = await readReal(file); this.onload?.() } })
  }
}
async function upload(text: string | File, opts: { finish?: boolean } = { finish: true }) {
  const file = typeof text === "string" ? vcf(text) : text
  fireEvent.change(screen.getByLabelText("Arquivo de contato (.vcf)"), { target: { files: [file] } })
  if (opts.finish !== false && reads.length) await act(async () => { await reads[reads.length - 1].finish() })
}
function openImport() { click("Importar contato") }

beforeEach(() => {
  vi.clearAllMocks()
  reads = []
  vi.stubGlobal("React", React)
  vi.stubGlobal("FileReader", ControlledReader)
  h.save.mockResolvedValue({ ok: true, id: "synthetic" })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe("Importar contato (vCard) no editor real de Clientes", () => {
  it("é uma entrada separada no novo cliente, fechada por padrão, sem esconder texto/voz; ausente na edição", () => {
    const view = render(React.createElement(ClienteEditor, props()))
    expect(screen.getByRole("region", { name: "Cadastro assistido por texto ou voz" })).toBeTruthy()
    expect(within(region()).getByText(/Não importa agenda completa, clientes em lote nem backup/)).toBeTruthy()
    expect(screen.queryByLabelText("Arquivo de contato (.vcf)")).toBeNull()
    openImport()
    expect(within(region()).getByText(/até 256 KiB e 50 contatos por arquivo, 1\.000 caracteres por campo/)).toBeTruthy()
    view.unmount()
    render(React.createElement(ClienteEditor, { ...props(), editing: { id: "c1", nome: "Existente", tipo: "PF", telefone: "", email: "", documento: "", cidade: "", uf: "", endereco: "", observacoes: "", totalGasto: 0, ultimaCompra: "", tags: [], tagsRaw: null, status: "Ativo" } }))
    expect(screen.queryByRole("region", { name: "Importar contato (vCard)" })).toBeNull()
  })

  it("arquivo 3.0 → prévia → aplica só aos campos vazios → nada salvo até confirmar e salvar", async () => {
    const p = props(); render(React.createElement(ClienteEditor, p))
    openImport(); await upload(VCARD_30_SIMPLES)
    expect(screen.getByText(/1 contato reconhecido/)).toBeTruthy()
    expect(value("Prévia: Nome")).toBe("Lia Sintética de Teste")
    expect(value("Prévia: UF")).toBe("SP")
    expect(screen.getByText(/Não importado deste endereço \(sem campo no cadastro\): CEP \/ código postal; País/)).toBeTruthy()
    expect(value("Nome *")).toBe("")
    edit("Prévia: Cidade", "Itaí Corrigida")
    click("Aplicar aos campos vazios")
    expect(value("Nome *")).toBe("Lia Sintética de Teste")
    expect(value("Telefone / WhatsApp")).toBe("(14) 99999-8888")
    expect(value("Email")).toBe("lia.sintetica@exemplo.invalid")
    expect(value("Endereço")).toBe("Rua das Fixtures, 123")
    expect(value("Cidade")).toBe("Itaí Corrigida")
    expect(value("CPF / CNPJ")).toBe("")
    expect(value("Tipo")).toBe("PF")
    expect(screen.getAllByText("Importado do contato").length).toBeGreaterThanOrEqual(5)
    expect(screen.getByText("Dados do contato aplicados aos campos vazios. Revise e confirme os dados abaixo.")).toBeTruthy()
    // A importação se encerra ao aplicar: arquivo e prévia descartados.
    expect(screen.queryByLabelText("Prévia: Nome")).toBeNull()
    expect(h.save).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Salvar cliente" }).hasAttribute("disabled")).toBe(true)
    fireEvent.click(screen.getByRole("checkbox")); click("Salvar cliente")
    await waitFor(() => expect(h.save).toHaveBeenCalledOnce())
    expect(h.save).toHaveBeenCalledWith("loja-a", null, expect.objectContaining({ nome: "Lia Sintética de Teste", cidade: "Itaí Corrigida", uf: "SP", documento: "", tipo: "PF", tags: "", observacoes: "" }), true)
    const sent = JSON.stringify(h.save.mock.calls)
    for (const raw of ["BEGIN:VCARD", "18730-000", "Brasil", "contato-sintetico.vcf", "N:Sintética"]) expect(sent).not.toContain(raw)
  })

  it("campos digitados ficam intactos; divergência é mostrada e só muda por decisão explícita", async () => {
    render(React.createElement(ClienteEditor, props()))
    edit("Nome *", "Nome Digitado Manualmente")
    edit("Cidade", "Avaré")
    openImport(); await upload(VCARD_30_SIMPLES)
    const conflicts = screen.getByRole("group", { name: "Divergências com o formulário" })
    expect(within(conflicts).getByText(/no formulário: “Nome Digitado Manualmente”; no contato: “Lia Sintética de Teste”/)).toBeTruthy()
    expect(within(conflicts).getByText(/no formulário: “Avaré”; no contato: “Itaí”/)).toBeTruthy()
    click("Substituir Cidade pelo do contato")
    expect(value("Cidade")).toBe("Itaí")
    expect(value("Nome *")).toBe("Nome Digitado Manualmente")
    expect(within(screen.getByRole("group", { name: "Divergências com o formulário" })).queryByText(/Avaré/)).toBeNull()
    click("Aplicar aos campos vazios")
    expect(value("Nome *")).toBe("Nome Digitado Manualmente")
    expect(value("Telefone / WhatsApp")).toBe("(14) 99999-8888")
    expect(h.save).not.toHaveBeenCalled()
  })

  it("vários contatos: escolha explícita; trocar de contato não mistura pessoas; os não escolhidos não seguem ao salvar", async () => {
    render(React.createElement(ClienteEditor, props()))
    openImport(); await upload(VCARD_VARIOS)
    expect(screen.getByText(/3 contatos reconhecidos/)).toBeTruthy()
    expect(screen.queryByLabelText("Prévia: Nome")).toBeNull()
    const radios = screen.getAllByRole("radio")
    expect(radios.map((r) => r.closest("label")?.textContent)).toEqual([
      "Contato Alfa Sintético", "Contato Beta Sintético · tel. final 2222", "Contato Beta Sintético · tel. final 3333",
    ])
    fireEvent.click(radios[1])
    expect(value("Prévia: Email")).toBe("beta@exemplo.invalid")
    edit("Prévia: Nome", "Beta Editado")
    fireEvent.click(radios[0])
    expect(value("Prévia: Nome")).toBe("Contato Alfa Sintético")
    expect(value("Prévia: Telefone / WhatsApp")).toBe("(11) 91111-1111")
    expect(value("Prévia: Email")).toBe("")
    click("Aplicar aos campos vazios")
    expect(value("Email")).toBe("")
    fireEvent.click(screen.getByRole("checkbox")); click("Salvar cliente")
    await waitFor(() => expect(h.save).toHaveBeenCalledOnce())
    const sent = JSON.stringify(h.save.mock.calls)
    expect(sent).toContain("Contato Alfa Sintético")
    for (const other of ["Beta", "92222", "93333", "beta@exemplo.invalid"]) expect(sent).not.toContain(other)
  })

  it("vários valores no mesmo campo exigem escolha; preferência do arquivo só ordena", async () => {
    render(React.createElement(ClienteEditor, props()))
    openImport(); await upload(VCARD_40_URI)
    expect(value("Prévia: Telefone / WhatsApp")).toBe("")
    expect(screen.getAllByText("Escolha entre os 2 valores do contato", { exact: false })).toHaveLength(2)
    const options = Array.from((screen.getByLabelText("Telefone / WhatsApp: o contato tem 2 valores") as HTMLSelectElement).options).map((o) => o.text)
    expect(options).toEqual(["Escolha um valor…", "+55-14-98888-7777 (celular · voz · preferencial no arquivo)", "+55-14-3333-2222 (trabalho)", "Não usar"])
    click("Aplicar aos campos vazios")
    expect(value("Telefone / WhatsApp")).toBe("")
    expect(value("Email")).toBe("")
    expect(value("UF")).toBe("SP")
    openImport(); await upload(VCARD_40_URI)
    fireEvent.change(screen.getByLabelText("Telefone / WhatsApp: o contato tem 2 valores"), { target: { value: "tel-1" } })
    fireEvent.change(screen.getByLabelText("Email: o contato tem 2 valores"), { target: { value: "none" } })
    expect(screen.getByText("Não será usado", { exact: false })).toBeTruthy()
    click("Aplicar aos campos vazios")
    expect(value("Telefone / WhatsApp")).toBe("+55-14-3333-2222")
    expect(value("Email")).toBe("")
  })

  it("texto colado: lê sob comando, editar o texto descarta a prévia, erro claro e remoção", async () => {
    render(React.createElement(ClienteEditor, props()))
    openImport()
    expect(screen.getByRole("button", { name: "Ler conteúdo colado" }).hasAttribute("disabled")).toBe(true)
    edit("Ou cole o conteúdo do vCard", VCARD_DOBRADO_E_AGRUPADO)
    expect(screen.queryByLabelText("Prévia: Nome")).toBeNull()
    click("Ler conteúdo colado")
    expect(value("Prévia: Nome")).toBe("Maria Dobrada da Silva Sintética")
    expect(screen.getByText(/Não utilizados deste contato: .*Notas livres.*Esses dados não são importados nem guardados/)).toBeTruthy()
    expect(screen.getByRole("group", { name: "Prévia do contato" }).textContent).not.toMatch(/Ignore as instruções|Empresa Sintética|foto\.exemplo/)
    edit("Ou cole o conteúdo do vCard", VCARD_21)
    expect(screen.queryByLabelText("Prévia: Nome")).toBeNull()
    click("Ler conteúdo colado")
    expect(screen.getByRole("alert").textContent).toBe("vCard 2.1 não é suportado. Exporte o contato como vCard 3.0 ou 4.0.")
    click("Remover arquivo ou conteúdo")
    expect(value("Ou cole o conteúdo do vCard")).toBe("")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("cancelar não altera o formulário e reabrir começa vazio", async () => {
    render(React.createElement(ClienteEditor, props()))
    edit("Nome *", "Manual")
    openImport(); await upload(VCARD_30_SIMPLES)
    edit("Prévia: Telefone / WhatsApp", "(14) 98888-0000")
    click("Cancelar importação")
    expect(value("Nome *")).toBe("Manual")
    expect(value("Telefone / WhatsApp")).toBe("")
    expect(screen.queryByLabelText("Arquivo de contato (.vcf)")).toBeNull()
    openImport()
    expect(screen.queryByLabelText("Prévia: Nome")).toBeNull()
    expect(screen.queryByText(/contato reconhecido/)).toBeNull()
    expect(h.save).not.toHaveBeenCalled()
  })

  it("valida o conteúdo, não a extensão; arquivo acima de 256 KiB é recusado sem ser lido", async () => {
    render(React.createElement(ClienteEditor, props()))
    openImport()
    await upload(vcf("Nome: Fulano Sintético", "contato.vcf"))
    expect(screen.getByRole("alert").textContent).toMatch(/não é um vCard/)
    await upload(vcf(VCARD_30_SIMPLES, "exportado.txt"))
    expect(value("Prévia: Nome")).toBe("Lia Sintética de Teste")
    reads = []
    await upload(vcf("x".repeat(256 * 1024 + 1)))
    expect(reads).toHaveLength(0)
    expect(screen.getByRole("alert").textContent).toMatch(/passa de 256 KiB/)
    expect(screen.queryByLabelText("Prévia: Nome")).toBeNull()
  })

  it("leitura antiga é invalidada: trocar de arquivo, cancelar ou trocar de loja descarta o resultado atrasado", async () => {
    const p = props()
    const view = render(React.createElement(ClienteEditor, { ...p, key: "loja-a" }))
    openImport()
    await upload(vcf(VCARD_VARIOS, "a.vcf"), { finish: false })
    await upload(vcf(VCARD_30_SIMPLES, "b.vcf"), { finish: false })
    await act(async () => { await reads[1].finish() })
    await act(async () => { await reads[0].finish() })
    expect(value("Prévia: Nome")).toBe("Lia Sintética de Teste")
    expect(screen.queryAllByRole("radio")).toHaveLength(0)

    await upload(vcf(VCARD_VARIOS, "c.vcf"), { finish: false })
    click("Cancelar importação")
    await act(async () => { await reads[2].finish() })
    expect(screen.queryByText(/contatos reconhecidos/)).toBeNull()

    openImport()
    await upload(vcf(VCARD_30_SIMPLES, "d.vcf"), { finish: false })
    view.rerender(React.createElement(ClienteEditor, { ...p, key: "loja-b", storeId: "loja-b" }))
    await act(async () => { await reads[3].finish() })
    expect(screen.queryByLabelText("Arquivo de contato (.vcf)")).toBeNull()
    expect(value("Nome *")).toBe("")
    expect(h.save).not.toHaveBeenCalled()
  })

  it("fechar e reabrir o diálogo descarta a importação", async () => {
    const p = props()
    const view = render(React.createElement(ClienteEditorDialog, { ...p, open: true }))
    openImport(); await upload(VCARD_30_SIMPLES)
    view.rerender(React.createElement(ClienteEditorDialog, { ...p, open: false }))
    view.rerender(React.createElement(ClienteEditorDialog, { ...p, open: true }))
    expect(screen.queryByLabelText("Prévia: Nome")).toBeNull()
    expect(screen.queryByLabelText("Arquivo de contato (.vcf)")).toBeNull()
  })

  it("privacidade: sem rede, sem storage, sem log, sem URL e sem conteúdo ativo", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy)
    const beacon = vi.fn(); Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon })
    const xhr = vi.spyOn(XMLHttpRequest.prototype, "open")
    const idb = { open: vi.fn() }; vi.stubGlobal("indexedDB", idb)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m))
    const href = window.location.href
    const imageSrc = vi.spyOn(HTMLImageElement.prototype, "src", "set")
    render(React.createElement(ClienteEditor, props()))
    openImport()
    await upload(VCARD_DOBRADO_E_AGRUPADO)
    edit("Ou cole o conteúdo do vCard", VCARD_HTML); click("Ler conteúdo colado")
    expect(value("Prévia: Nome")).toBe("<img src=x onerror=alert(1)>Nome Ativo")
    expect(document.querySelector("img, script, iframe")).toBeNull()
    click("Aplicar aos campos vazios")
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
    expect(xhr).not.toHaveBeenCalled()
    expect(idb.open).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(imageSrc).not.toHaveBeenCalled()
    // O editor pode emitir avisos próprios (ex.: act do suporte de voz); nenhum pode carregar conteúdo do contato.
    for (const log of logs) expect(JSON.stringify(log.mock.calls.map((args) => args.map(String)))).not.toMatch(/Sintética|exemplo\.invalid|BEGIN:VCARD|contato-sintetico|Nome Ativo/)
    expect(window.location.href).toBe(href)
    expect(JSON.stringify({ ...localStorage })).not.toContain("Sintética")
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("Sintética")
  })

  it("Enter numa caixa da prévia não submete o cadastro, mesmo com a confirmação marcada", async () => {
    render(React.createElement(ClienteEditor, props()))
    edit("Nome *", "Manual Confirmado")
    fireEvent.click(screen.getByRole("checkbox"))
    openImport(); await upload(VCARD_30_SIMPLES)
    // keyDown devolve false quando o default (submissão implícita do formulário) foi impedido.
    expect(fireEvent.keyDown(screen.getByLabelText("Prévia: Email"), { key: "Enter" })).toBe(false)
    expect(fireEvent.keyDown(screen.getByLabelText("Ou cole o conteúdo do vCard"), { key: "Enter" })).toBe(true)
    expect(h.save).not.toHaveBeenCalled()
  })

  it("resposta incerta: informa a incerteza, preserva o formulário e não repete sozinho; dupla submissão = 1 chamada", async () => {
    let reject!: (e: Error) => void
    h.save.mockImplementationOnce(() => new Promise((_, r) => { reject = r }))
    render(React.createElement(ClienteEditor, props()))
    openImport(); await upload(VCARD_30_SIMPLES)
    click("Aplicar aos campos vazios")
    fireEvent.click(screen.getByRole("checkbox"))
    click("Salvar cliente"); fireEvent.submit(screen.getByRole("button", { name: "Salvando…" }).closest("form")!)
    await act(async () => reject(new Error("network")))
    expect(h.save).toHaveBeenCalledOnce()
    expect(await screen.findByText("Não foi possível confirmar o salvamento: o cadastro pode ter sido gravado. Confira a lista de clientes antes de salvar de novo.")).toBeTruthy()
    expect(value("Nome *")).toBe("Lia Sintética de Teste")
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false)
  })

  it("recusa de duplicidade do servidor é exibida sem fundir e sem limpar o formulário", async () => {
    h.save.mockResolvedValueOnce({ ok: false, message: "Possível cliente já cadastrado nesta loja. Revise antes de continuar." })
    const p = props(); render(React.createElement(ClienteEditor, p))
    openImport(); await upload(VCARD_30_SIMPLES)
    click("Aplicar aos campos vazios")
    fireEvent.click(screen.getByRole("checkbox")); click("Salvar cliente")
    await screen.findByText("Possível cliente já cadastrado nesta loja. Revise antes de continuar.")
    expect(value("Telefone / WhatsApp")).toBe("(14) 99999-8888")
    expect(p.onSaved).not.toHaveBeenCalled()
  })
})
