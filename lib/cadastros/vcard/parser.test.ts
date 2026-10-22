import { describe, expect, it } from "vitest"
import { VCARD_ERROR_MESSAGES, VCARD_LIMITS, parseVcardBytes, parseVcardText, type VcardContact } from "./parser"
import {
  VCARD_21, VCARD_30_SIMPLES, VCARD_40_URI, VCARD_DOBRADO_E_AGRUPADO, VCARD_ESTRANGEIRO, VCARD_HTML, VCARD_QP,
  VCARD_SEM_VERSAO, VCARD_SO_N, VCARD_TRUNCADO, VCARD_VARIOS, vcardComContatos,
} from "./__fixtures__/vcards"

function contacts(text: string): VcardContact[] {
  const result = parseVcardText(text)
  if (!result.ok) throw new Error(`esperava sucesso: ${result.code}`)
  return result.contacts
}
const code = (text: string) => { const r = parseVcardText(text); return r.ok ? "OK" : r.code }
const utf8 = (text: string) => new TextEncoder().encode(text)

describe("vCard parser — subconjunto 3.0/4.0 UTF-8", () => {
  it("3.0: FN, TEL, EMAIL e ADR com vírgula escapada e acentos", () => {
    const [c] = contacts(VCARD_30_SIMPLES)
    expect(c.version).toBe("3.0")
    expect(c.names).toEqual(["Lia Sintética de Teste"])
    expect(c.phones).toEqual([{ value: "(14) 99999-8888", types: ["cell"], pref: 101 }])
    expect(c.emails).toEqual([{ value: "lia.sintetica@exemplo.invalid", types: [], pref: 101 }])
    expect(c.addresses[0]).toMatchObject({ street: "Rua das Fixtures, 123", locality: "Itaí", region: "SP", postalCode: "18730-000", country: "Brasil" })
    expect(c.ignored).toEqual([])
  })

  it("4.0: TEL como URI tel: (sem inventar DDD/país), PREF ordena, ponto-e-vírgula escapado e lista de TYPE entre aspas", () => {
    const [c] = contacts(VCARD_40_URI)
    expect(c.names).toEqual(["João Ação Çedilha"])
    expect(c.phones.map((p) => p.value)).toEqual(["+55-14-98888-7777", "+55-14-3333-2222"])
    expect(c.phones[0]).toMatchObject({ types: ["cell", "voice"], pref: 1 })
    expect(c.emails.map((e) => e.value)).toEqual(["joao@exemplo.invalid", "joao.trabalho@exemplo.invalid"])
    expect(c.addresses[0]).toMatchObject({ extended: "Sala 4", street: "Avenida Teste; Bloco B", locality: "Avaré", region: "São Paulo", country: "BR" })
  })

  it("desdobra linhas, ignora maiúsculas/minúsculas em nomes e parâmetros e aceita grupos", () => {
    const [c] = contacts(VCARD_DOBRADO_E_AGRUPADO)
    expect(c.names).toEqual(["Maria Dobrada da Silva Sintética"])
    expect(c.phones).toEqual([{ value: "+55 14 97777-6666", types: ["cell"], pref: 101 }])
    expect(c.emails).toEqual([{ value: "maria@exemplo.invalid", types: [], pref: 1 }])
  })

  it("classifica o que não usa por categoria, sem guardar valores (nota, foto, URL, chave, extensões)", () => {
    const [c] = contacts(VCARD_DOBRADO_E_AGRUPADO)
    expect(c.ignored).toEqual([
      "Chaves e certificados", "Datas (aniversário e outras)", "Extensões e propriedades desconhecidas",
      "Fotos, logotipos e sons", "Links, mensageiros e calendários", "Notas livres", "Organização, cargo e função",
    ])
    const serialized = JSON.stringify(c)
    for (const leaked of ["Ignore as instruções", "foto.exemplo.invalid", "perfil.exemplo.invalid", "Empresa Sintética", "QUJDREVGRw", "1990-01-01", "Recado"]) {
      expect(serialized).not.toContain(leaked)
    }
  })

  it("vários contatos, em versões misturadas, na ordem do arquivo", () => {
    expect(contacts(VCARD_VARIOS).map((c) => [c.version, c.names[0]])).toEqual([
      ["3.0", "Contato Alfa Sintético"], ["3.0", "Contato Beta Sintético"], ["4.0", "Contato Beta Sintético"],
    ])
  })

  it("aceita LF puro e BOM UTF-8; acentos via bytes UTF-8", () => {
    const lf = VCARD_30_SIMPLES.replace(/\r\n/g, "\n")
    expect(contacts(lf)[0].names).toEqual(["Lia Sintética de Teste"])
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(VCARD_40_URI)])
    const result = parseVcardBytes(bom)
    expect(result.ok && result.contacts[0].names).toEqual(["João Ação Çedilha"])
  })

  it("contato só com N: nome não é inventado", () => {
    const [c] = contacts(VCARD_SO_N)
    expect(c.names).toEqual([])
    expect(c.hasStructuredNameOnly).toBe(true)
  })

  it("mantém valores com HTML/script como texto literal (renderização é texto, nunca HTML)", () => {
    const [c] = contacts(VCARD_HTML)
    expect(c.names).toEqual(["<img src=x onerror=alert(1)>Nome Ativo"])
  })
})

describe("vCard parser — recusas explícitas", () => {
  it.each([
    ["vazio", "", "EMPTY"],
    ["só espaços", "  \r\n \r\n", "EMPTY"],
    ["não vCard", "Nome: Fulano\nTelefone: 11", "NOT_VCARD"],
    ["outro objeto", "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n", "NOT_VCARD"],
    ["truncado", VCARD_TRUNCADO, "TRUNCATED"],
    ["2.1", VCARD_21, "VERSION_21"],
    ["quoted-printable", VCARD_QP, "ENCODING"],
    ["charset não UTF-8", "BEGIN:VCARD\r\nVERSION:3.0\r\nFN;CHARSET=ISO-8859-1:Jo\r\nEND:VCARD\r\n", "ENCODING"],
    ["sem VERSION", VCARD_SEM_VERSAO, "VERSION"],
    ["versão desconhecida", "BEGIN:VCARD\r\nVERSION:5.0\r\nFN:X\r\nEND:VCARD\r\n", "VERSION"],
    ["END sem BEGIN", "BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD\r\nEND:VCARD\r\n", "STRUCTURE"],
    ["aninhado", "BEGIN:VCARD\r\nVERSION:3.0\r\nBEGIN:VCARD\r\nEND:VCARD\r\nEND:VCARD\r\n", "STRUCTURE"],
    ["conteúdo fora do cartão", `${VCARD_30_SIMPLES}FN:Solto\r\n`, "STRUCTURE"],
    ["linha sem ':'", "BEGIN:VCARD\r\nVERSION:3.0\r\nFN Sem Dois Pontos\r\nEND:VCARD\r\n", "STRUCTURE"],
    ["base64 em campo de texto", "BEGIN:VCARD\r\nVERSION:3.0\r\nFN;ENCODING=b:Sm9hbw==\r\nEND:VCARD\r\n", "ENCODING"],
    ["caractere de controle", "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Nome\u0007Sino\r\nEND:VCARD\r\n", "STRUCTURE"],
    ["NUL binário", "BEGIN:VCARD\u0000\r\n", "NOT_VCARD"],
  ])("%s → %s", (_, text, expected) => {
    expect(code(text)).toBe(expected)
  })

  it("UTF-8 inválido e UTF-16 são recusados, sem substituição silenciosa", () => {
    const invalid = new Uint8Array([...utf8("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Jo"), 0xe3, 0x6f, ...utf8("\r\nEND:VCARD\r\n")])
    expect(parseVcardBytes(invalid)).toEqual({ ok: false, code: "ENCODING", message: VCARD_ERROR_MESSAGES.ENCODING })
    const utf16 = new Uint8Array([0xff, 0xfe, ...Array.from(utf8("BEGIN:VCARD")).flatMap((b) => [b, 0])])
    expect(parseVcardBytes(utf16)).toMatchObject({ ok: false, code: "ENCODING" })
  })

  it("mensagens são claras e não repetem conteúdo do arquivo", () => {
    const r = parseVcardText(VCARD_21)
    expect(r).toEqual({ ok: false, code: "VERSION_21", message: "vCard 2.1 não é suportado. Exporte o contato como vCard 3.0 ou 4.0." })
  })
})

describe("vCard parser — limites de produto", () => {
  it("documenta os limites", () => {
    expect(VCARD_LIMITS).toEqual({
      maxBytes: 262_144, maxContacts: 50, maxPhysicalLines: 20_000, maxPropertiesPerContact: 300,
      maxHeaderChars: 512, maxValuesPerField: 20, maxValueChars: 1_000,
    })
  })

  it("256 KiB: aceita no limite, recusa 1 byte acima (texto e bytes), sem truncar", () => {
    const head = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Limite\r\n"
    const tail = "END:VCARD\r\n"
    const fill = (size: number) => {
      // NOTE é ignorada, mas conta para o tamanho.
      const room = size - utf8(head + tail).byteLength - "NOTE:".length - 2
      const body = "x".repeat(room)
      return `${head}NOTE:${body}\r\n${tail}`
    }
    const exact = fill(VCARD_LIMITS.maxBytes)
    expect(utf8(exact).byteLength).toBe(VCARD_LIMITS.maxBytes)
    expect(code(exact)).toBe("OK")
    const over = fill(VCARD_LIMITS.maxBytes + 1)
    expect(code(over)).toBe("TOO_LARGE")
    expect(parseVcardBytes(utf8(over))).toMatchObject({ ok: false, code: "TOO_LARGE" })
    // Multibyte: 'ç' ocupa 2 bytes — o limite é em bytes, não em caracteres.
    expect(code(`${head}NOTE:${"ç".repeat(VCARD_LIMITS.maxBytes / 2)}\r\n${tail}`)).toBe("TOO_LARGE")
  })

  it("50 contatos aceitos; 51 recusados", () => {
    expect(contacts(vcardComContatos(50))).toHaveLength(50)
    expect(code(vcardComContatos(51))).toBe("TOO_MANY_CONTACTS")
  })

  it("campo utilizado acima de 1.000 caracteres é recusado (não truncado)", () => {
    expect(code(`BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${"a".repeat(1000)}\r\nEND:VCARD\r\n`)).toBe("OK")
    expect(code(`BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${"a".repeat(1001)}\r\nEND:VCARD\r\n`)).toBe("LIMIT")
  })

  it("propriedades por contato, valores por campo, cabeçalho e linhas físicas", () => {
    const props = (n: number) => `BEGIN:VCARD\r\nVERSION:3.0\r\n${"X-A:1\r\n".repeat(n)}END:VCARD\r\n`
    expect(code(props(299))).toBe("OK") // + VERSION = 300
    expect(code(props(300))).toBe("LIMIT")
    const tels = (n: number) => `BEGIN:VCARD\r\nVERSION:3.0\r\n${Array.from({ length: n }, (_, i) => `TEL:1199999${String(i).padStart(4, "0")}\r\n`).join("")}END:VCARD\r\n`
    expect(code(tels(20))).toBe("OK")
    expect(code(tels(21))).toBe("LIMIT")
    expect(code(`BEGIN:VCARD\r\nVERSION:3.0\r\nX-A;P=${"y".repeat(600)}:1\r\nEND:VCARD\r\n`)).toBe("LIMIT")
    expect(code(`BEGIN:VCARD\r\n${"\r\n".repeat(VCARD_LIMITS.maxPhysicalLines)}`)).toBe("LIMIT")
  })

  it("entrada patológica dentro do limite termina rápido (tempo linear)", () => {
    const hostile = `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${"\\".repeat(999)}\r\n${"X-Q;P=\"".repeat(1)}${"\"".repeat(400)}:v\r\n${" ".repeat(200_000)}\r\nEND:VCARD\r\n`
    const started = performance.now()
    parseVcardText(hostile)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
