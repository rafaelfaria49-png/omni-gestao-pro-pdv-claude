import { describe, expect, it } from "vitest"
import { parseVcardText, type VcardContact } from "./parser"
import {
  aplicaveisAosVazios, avisoTelefone, divergencias, previewContato, problemasRascunho, rascunhoInicial, rotulosContatos, type VcardDraft,
} from "./cliente"
import { VCARD_30_SIMPLES, VCARD_40_URI, VCARD_DOBRADO_E_AGRUPADO, VCARD_ESTRANGEIRO, VCARD_SO_N, VCARD_VARIOS } from "./__fixtures__/vcards"

const parse = (text: string): VcardContact[] => { const r = parseVcardText(text); if (!r.ok) throw new Error(r.code); return r.contacts }
const emptyForm = { nome: "", telefone: "", email: "", endereco: "", cidade: "", uf: "" }

describe("vCard → campos do editor de Clientes", () => {
  it("um valor por campo entra na prévia; endereço mapeia rua/cidade/UF e aponta o que não tem campo", () => {
    const preview = previewContato(parse(VCARD_30_SIMPLES)[0])
    expect(rascunhoInicial(preview)).toEqual({
      nome: "Lia Sintética de Teste", telefone: "(14) 99999-8888", email: "lia.sintetica@exemplo.invalid",
      endereco: "Rua das Fixtures, 123", cidade: "Itaí", uf: "SP",
    })
    expect(preview.addresses[0].notImported).toEqual(["CEP / código postal", "País"])
  })

  it("vários telefones/emails: rascunho vazio até escolha explícita; preferência só ordena", () => {
    const preview = previewContato(parse(VCARD_40_URI)[0])
    expect(preview.phones.map((p) => [p.value, p.label])).toEqual([
      ["+55-14-98888-7777", "celular · voz · preferencial no arquivo"],
      ["+55-14-3333-2222;ext=12", "trabalho"],
    ])
    // Ramal visível bloqueia a aplicação até o operador editar.
    expect(problemasRascunho({ ...rascunhoInicial(preview), telefone: "+55-14-3333-2222;ext=12" }).telefone).toMatch(/parâmetros da URI tel:/)
    const draft = rascunhoInicial(preview)
    expect(draft.telefone).toBe("")
    expect(draft.email).toBe("")
    // Endereço único: rua + complemento, nome de estado brasileiro → UF.
    expect(draft).toMatchObject({ endereco: "Avenida Teste; Bloco B, Sala 4", cidade: "Avaré", uf: "SP", nome: "João Ação Çedilha" })
  })

  it("região estrangeira não vira UF; número de outro país recebe aviso sem conversão", () => {
    const preview = previewContato(parse(VCARD_ESTRANGEIRO)[0])
    const draft = rascunhoInicial(preview)
    expect(draft).toMatchObject({ telefone: "+1-555-0100", endereco: "1 Synthetic Street", cidade: "Toronto", uf: "" })
    expect(preview.addresses[0].notImported).toContain("Estado/região de endereço fora do Brasil (não convertido em UF)")
    expect(avisoTelefone(draft.telefone)).toMatch(/outro país/)
    expect(avisoTelefone("+55 14 99999-8888")).toBeNull()
    expect(avisoTelefone("(14) 99999-8888")).toBeNull()
    // Telefone curto não é completado: fica bloqueado para aplicação.
    expect(problemasRascunho({ ...draft }).telefone).toMatch(/Nada foi acrescentado/)
    expect(aplicaveisAosVazios(draft, emptyForm).telefone).toBeUndefined()
  })

  it("região desconhecida no Brasil é apontada, não adivinhada", () => {
    const [c] = parse("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:X\r\nADR:;;Rua A;Cidade B;Província Z;;\r\nEND:VCARD\r\n")
    const preview = previewContato(c)
    expect(rascunhoInicial(preview).uf).toBe("")
    expect(preview.addresses[0].notImported).toEqual(["Estado/região “Província Z” não corresponde a uma UF brasileira"])
  })

  it("região/tipo com nome de propriedade herdada (constructor, __proto__) não injeta função na UF nem no rótulo", () => {
    for (const region of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const [c] = parse(`BEGIN:VCARD\r\nVERSION:3.0\r\nFN:X\r\nTEL;TYPE=constructor,__proto__:(14) 99999-8888\r\nADR:;;Rua A;Cidade;${region};;BR\r\nEND:VCARD\r\n`)
      const preview = previewContato(c)
      const draft = rascunhoInicial(preview)
      expect(draft.uf).toBe("")
      expect(typeof draft.uf).toBe("string")
      expect(preview.phones[0].label).toBe("")
      expect(preview.addresses[0].notImported[0]).toMatch(/não corresponde a uma UF brasileira/)
    }
  })

  it("telefone local com phone-context: visível e bloqueado, sem inferir prefixo", () => {
    const [c] = parse("BEGIN:VCARD\r\nVERSION:4.0\r\nFN:X\r\nTEL;VALUE=uri:tel:2125550123;phone-context=+1\r\nEND:VCARD\r\n")
    const draft = rascunhoInicial(previewContato(c))
    expect(draft.telefone).toBe("2125550123;phone-context=+1")
    expect(problemasRascunho(draft).telefone).toMatch(/contexto de discagem/)
    expect(aplicaveisAosVazios(draft, emptyForm).telefone).toBeUndefined()
  })

  it("sem FN: nome ausente para revisão (N não compõe nome); documento e tipo nunca aparecem", () => {
    const preview = previewContato(parse(VCARD_SO_N)[0])
    expect(preview.missingName).toBe(true)
    const draft = rascunhoInicial(preview)
    expect(draft.nome).toBe("")
    expect(Object.keys(draft).sort()).toEqual(["cidade", "email", "endereco", "nome", "telefone", "uf"])
  })

  it("aplicar só preenche campos vazios e só com valores que o editor aceitaria", () => {
    const draft: VcardDraft = { nome: "Do Contato", telefone: "(14) 99999-8888", email: "invalido@", endereco: "Rua X", cidade: "Itaí", uf: "sp" }
    const current = { ...emptyForm, nome: "Digitado pelo operador", cidade: "Avaré" }
    expect(aplicaveisAosVazios(draft, current)).toEqual({ telefone: "(14) 99999-8888", endereco: "Rua X", uf: "SP" })
  })

  it("divergência só onde os dois lados têm valor diferente (telefone por dígitos, texto sem caixa/espaços)", () => {
    const draft: VcardDraft = { nome: "Lia  Sintética", telefone: "+55 (14) 99999-8888", email: "LIA@exemplo.invalid", endereco: "Rua X", cidade: "Itaí", uf: "SP" }
    const current = { nome: "lia sintética", telefone: "14999998888", email: "outra@exemplo.invalid", endereco: "", cidade: "Avaré", uf: "SP" }
    expect(divergencias(draft, current)).toEqual(["email", "cidade"])
  })

  it("rótulos mínimos: nome; final do telefone só para desempatar nomes iguais", () => {
    expect(rotulosContatos(parse(VCARD_VARIOS))).toEqual([
      "Contato Alfa Sintético", "Contato Beta Sintético · tel. final 2222", "Contato Beta Sintético · tel. final 3333",
    ])
  })

  it("categorias não utilizadas seguem para a prévia sem valores", () => {
    const preview = previewContato(parse(VCARD_DOBRADO_E_AGRUPADO)[0])
    expect(preview.ignored).toContain("Notas livres")
    expect(JSON.stringify(preview)).not.toContain("Ignore as instruções")
  })
})
