/**
 * Leitor de vCard 3.0 (RFC 2426) e 4.0 (RFC 6350), UTF-8, para importar UM
 * contato cadastral no editor de Clientes. Puro e determinístico: sem rede,
 * sem LLM, sem DOM, sem storage. Lê só o subconjunto que o editor comporta
 * (FN, TEL, EMAIL, ADR) e apenas classifica o restante como não utilizado.
 *
 * Não é conformidade completa com as normas: é um recorte deliberado.
 * vCard 2.1, QUOTED-PRINTABLE e charsets que não UTF-8 são recusados com
 * mensagem clara, sem conversão improvisada.
 */

/** Limites de PRODUTO (não regras do formato), documentados na UI e nos testes. */
export const VCARD_LIMITS = {
  /** Arquivo ou conteúdo colado, em bytes UTF-8. */
  maxBytes: 256 * 1024,
  maxContacts: 50,
  /** Linhas físicas do arquivo (antes do desdobramento). */
  maxPhysicalLines: 20_000,
  maxPropertiesPerContact: 300,
  /** Nome + grupo + parâmetros de uma propriedade (tudo antes do ':'). */
  maxHeaderChars: 512,
  /** Valores de nome/telefone/email/endereço por contato. */
  maxValuesPerField: 20,
  /** Valor de uma propriedade utilizada (FN, TEL, EMAIL, ADR). */
  maxValueChars: 1_000,
} as const

export type VcardErrorCode =
  | "EMPTY" | "TOO_LARGE" | "ENCODING" | "NOT_VCARD" | "TRUNCATED" | "STRUCTURE"
  | "VERSION_21" | "VERSION" | "TOO_MANY_CONTACTS" | "LIMIT"

export const VCARD_ERROR_MESSAGES: Record<VcardErrorCode, string> = {
  EMPTY: "O arquivo ou conteúdo está vazio.",
  TOO_LARGE: "O conteúdo passa de 256 KiB. Exporte só o contato do cliente e tente de novo.",
  ENCODING: "Codificação não suportada. Use um vCard 3.0 ou 4.0 salvo em UTF-8 (sem QUOTED-PRINTABLE).",
  NOT_VCARD: "O conteúdo não é um vCard: ele deve começar com BEGIN:VCARD.",
  TRUNCATED: "O vCard está incompleto (falta END:VCARD). Exporte o contato novamente.",
  STRUCTURE: "A estrutura do vCard é inválida. Exporte o contato novamente.",
  VERSION_21: "vCard 2.1 não é suportado. Exporte o contato como vCard 3.0 ou 4.0.",
  VERSION: "Versão de vCard não suportada. Use vCard 3.0 ou 4.0.",
  TOO_MANY_CONTACTS: "O arquivo tem mais de 50 contatos. Esta importação é de um contato por vez, não de agenda completa.",
  LIMIT: "Um contato passa dos limites desta importação (propriedades, valores ou tamanho de campo).",
}

export type VcardValue = { value: string; types: string[]; pref: number }
export type VcardAddress = {
  poBox: string; extended: string; street: string; locality: string; region: string; postalCode: string; country: string
  types: string[]; pref: number
}
export type VcardContact = {
  version: "3.0" | "4.0"
  /** Valores de FN (nome formatado). N não é usado para compor nome. */
  names: string[]
  hasStructuredNameOnly: boolean
  phones: VcardValue[]
  emails: VcardValue[]
  addresses: VcardAddress[]
  /** Categorias presentes e não utilizadas; nunca os valores. */
  ignored: string[]
}
export type VcardParseResult =
  | { ok: true; contacts: VcardContact[] }
  | { ok: false; code: VcardErrorCode; message: string }

const fail = (code: VcardErrorCode): VcardParseResult => ({ ok: false, code, message: VCARD_ERROR_MESSAGES[code] })
class Refusal extends Error { constructor(readonly code: VcardErrorCode) { super(code) } }

const MEDIA = "Fotos, logotipos e sons"
const IGNORED: Record<string, string> = {
  PHOTO: MEDIA, LOGO: MEDIA, SOUND: MEDIA,
  BDAY: "Datas (aniversário e outras)", ANNIVERSARY: "Datas (aniversário e outras)",
  GEO: "Localização e fuso horário", TZ: "Localização e fuso horário",
  KEY: "Chaves e certificados",
  NOTE: "Notas livres",
  URL: "Links, mensageiros e calendários", SOURCE: "Links, mensageiros e calendários", IMPP: "Links, mensageiros e calendários",
  FBURL: "Links, mensageiros e calendários", CALURI: "Links, mensageiros e calendários", CALADRURI: "Links, mensageiros e calendários",
  RELATED: "Relações e grupos", AGENT: "Relações e grupos", MEMBER: "Relações e grupos",
  ORG: "Organização, cargo e função", TITLE: "Organização, cargo e função", ROLE: "Organização, cargo e função",
  NICKNAME: "Apelido",
  LABEL: "Etiqueta de endereço formatada",
  GENDER: "Identificadores e metadados", LANG: "Identificadores e metadados", CATEGORIES: "Identificadores e metadados",
  KIND: "Identificadores e metadados", XML: "Identificadores e metadados", CLIENTPIDMAP: "Identificadores e metadados",
  UID: "Identificadores e metadados", REV: "Identificadores e metadados", PRODID: "Identificadores e metadados",
  "SORT-STRING": "Identificadores e metadados", CLASS: "Identificadores e metadados", NAME: "Identificadores e metadados",
  PROFILE: "Identificadores e metadados", MAILER: "Identificadores e metadados",
}
const UNKNOWN = "Extensões e propriedades desconhecidas"
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

/** Bytes de um arquivo: tamanho primeiro, depois UTF-8 estrito (byte inválido = recusa, nunca substituição). */
export function parseVcardBytes(bytes: ArrayBuffer | Uint8Array): VcardParseResult {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (data.byteLength > VCARD_LIMITS.maxBytes) return fail("TOO_LARGE")
  if (data.byteLength === 0) return fail("EMPTY")
  // BOM de UTF-16/UTF-32: outra codificação, não "converter" por suposição.
  if ((data[0] === 0xff && data[1] === 0xfe) || (data[0] === 0xfe && data[1] === 0xff) || (data[0] === 0 && data[1] === 0)) return fail("ENCODING")
  let text: string
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(data) } catch { return fail("ENCODING") }
  return parseVcardText(text)
}

/** Texto já decodificado (conteúdo colado ou saída de `parseVcardBytes`). */
export function parseVcardText(input: string): VcardParseResult {
  if (typeof input !== "string") return fail("NOT_VCARD")
  // Cada unidade UTF-16 ocupa ao menos 1 byte em UTF-8: comprimento acima do limite já basta para recusar.
  if (input.length > VCARD_LIMITS.maxBytes || new TextEncoder().encode(input).byteLength > VCARD_LIMITS.maxBytes) return fail("TOO_LARGE")
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  if (!text.trim()) return fail("EMPTY")
  if (text.includes("\u0000")) return fail("NOT_VCARD")
  try { return { ok: true, contacts: parseCards(text) } } catch (e) {
    if (e instanceof Refusal) return fail(e.code)
    return fail("STRUCTURE")
  }
}

type ContentLine = { name: string; params: Map<string, string[]>; value: string }

function parseCards(text: string): VcardContact[] {
  const physical = text.split(/\r\n|\n|\r/)
  if (physical.length > VCARD_LIMITS.maxPhysicalLines) throw new Refusal("LIMIT")
  const contacts: VcardContact[] = []
  let card: { lines: ContentLine[] } | null = null
  let seenFirst = false
  for (const raw of unfold(physical)) {
    if (!raw.trim()) continue
    const line = parseContentLine(raw)
    if (!seenFirst) {
      seenFirst = true
      if (line?.name !== "BEGIN" || line.value.trim().toUpperCase() !== "VCARD") throw new Refusal("NOT_VCARD")
    }
    if (!line) throw new Refusal("STRUCTURE")
    if (line.name === "BEGIN") {
      // vCard aninhado (AGENT da 2.1) ou outro objeto: fora do recorte.
      if (card || line.value.trim().toUpperCase() !== "VCARD") throw new Refusal("STRUCTURE")
      card = { lines: [] }
      continue
    }
    if (!card) throw new Refusal("STRUCTURE")
    if (line.name === "END") {
      if (line.value.trim().toUpperCase() !== "VCARD") throw new Refusal("STRUCTURE")
      if (contacts.length >= VCARD_LIMITS.maxContacts) throw new Refusal("TOO_MANY_CONTACTS")
      contacts.push(toContact(card.lines))
      card = null
      continue
    }
    if (card.lines.length >= VCARD_LIMITS.maxPropertiesPerContact) throw new Refusal("LIMIT")
    card.lines.push(line)
  }
  if (card) throw new Refusal("TRUNCATED")
  if (!contacts.length) throw new Refusal("NOT_VCARD")
  return contacts
}

/** Desdobra linhas: uma linha iniciada por espaço ou tab continua a anterior, sem esse primeiro caractere. */
function* unfold(lines: string[]): Generator<string> {
  let current: string | null = null
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && current !== null) { current += line.slice(1); continue }
    if (current !== null) yield current
    current = line
  }
  if (current !== null) yield current
}

/** `[grupo.]NOME *(;PARAM) : valor`, com ':' e ';' respeitando parâmetros entre aspas. */
function parseContentLine(raw: string): ContentLine | null {
  let quoted = false, colon = -1
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === "\"") quoted = !quoted
    else if (ch === ":" && !quoted) { colon = i; break }
    if (i >= VCARD_LIMITS.maxHeaderChars) throw new Refusal("LIMIT")
  }
  if (colon <= 0) return null
  const header = splitOutsideQuotes(raw.slice(0, colon), ";")
  const groupName = header[0].split(".")
  const name = groupName[groupName.length - 1].toUpperCase()
  if (groupName.length > 2 || !/^[A-Z0-9-]+$/.test(name) || (groupName.length === 2 && !/^[A-Za-z0-9-]+$/.test(groupName[0]))) return null
  const params = new Map<string, string[]>()
  for (const part of header.slice(1)) {
    if (!part) continue
    const eq = part.indexOf("=")
    // Parâmetro sem nome (`TEL;CELL:`) é estilo 2.1; tratado como TYPE.
    const key = (eq < 0 ? "TYPE" : part.slice(0, eq)).trim().toUpperCase()
    const values = splitOutsideQuotes(eq < 0 ? part : part.slice(eq + 1), ",").map((v) => v.trim().replace(/^"([\s\S]*)"$/, "$1"))
    params.set(key, [...(params.get(key) ?? []), ...values])
  }
  return { name, params, value: raw.slice(colon + 1) }
}

function splitOutsideQuotes(text: string, sep: string): string[] {
  const out: string[] = []
  let quoted = false, start = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\"") quoted = !quoted
    else if (text[i] === sep && !quoted) { out.push(text.slice(start, i)); start = i + 1 }
  }
  out.push(text.slice(start))
  return out
}

/** Separa por delimitador NÃO escapado, preservando os escapes para `unescapeText`. */
function splitEscaped(text: string, sep: string): string[] {
  const out: string[] = []
  let cur = ""
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === "\\" && i + 1 < text.length) { cur += ch + text[i + 1]; i++; continue }
    if (ch === sep) { out.push(cur); cur = "" } else cur += ch
  }
  out.push(cur)
  return out
}

/** `\\`, `\,`, `\;`, `\n`/`\N`. Outro escape vira o próprio caractere. */
function unescapeText(text: string): string {
  let out = ""
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === "\\" && i + 1 < text.length) {
      const next = text[++i]
      out += next === "n" || next === "N" ? "\n" : next
    } else out += ch
  }
  return out
}

/** Valores de uma linha só (quebras viram espaço, visível e editável na prévia). */
function singleLine(text: string): string {
  if (CONTROL.test(text)) throw new Refusal("STRUCTURE")
  return text.replace(/\s+/g, " ").trim()
}

function typesOf(line: ContentLine): string[] {
  return (line.params.get("TYPE") ?? []).flatMap((t) => t.split(",")).map((t) => t.trim().toLowerCase()).filter(Boolean)
}
function prefOf(line: ContentLine, types: string[]): number {
  const pref = Number((line.params.get("PREF") ?? [])[0])
  if (Number.isInteger(pref) && pref >= 1 && pref <= 100) return pref
  return types.includes("pref") ? 1 : 101
}

function assertDecodable(line: ContentLine) {
  const encoding = (line.params.get("ENCODING") ?? []).map((v) => v.toUpperCase())
  const charset = (line.params.get("CHARSET") ?? []).map((v) => v.toUpperCase())
  if (encoding.includes("QUOTED-PRINTABLE") || charset.some((c) => c !== "UTF-8")) throw new Refusal("ENCODING")
  return encoding
}

function toContact(lines: ContentLine[]): VcardContact {
  const versions = lines.filter((l) => l.name === "VERSION").map((l) => l.value.trim())
  if (versions.includes("2.1")) throw new Refusal("VERSION_21")
  if (!versions.length || new Set(versions).size > 1) throw new Refusal(versions.length ? "STRUCTURE" : "VERSION")
  const version = versions[0]
  if (version !== "3.0" && version !== "4.0") throw new Refusal("VERSION")
  const contact: VcardContact = { version, names: [], hasStructuredNameOnly: false, phones: [], emails: [], addresses: [], ignored: [] }
  const ignored = new Set<string>()
  let hasN = false
  for (const line of lines) {
    const encoding = assertDecodable(line)
    if (line.name === "VERSION") continue
    const used = line.name === "FN" || line.name === "TEL" || line.name === "EMAIL" || line.name === "ADR"
    if (!used) {
      if (line.name === "N") { hasN = true; continue }
      ignored.add(IGNORED[line.name] ?? UNKNOWN)
      continue
    }
    // Conteúdo binário/base64 numa propriedade de texto não é texto: recusa explícita.
    if (encoding.length) throw new Refusal("ENCODING")
    if (line.value.length > VCARD_LIMITS.maxValueChars) throw new Refusal("LIMIT")
    const types = typesOf(line)
    const pref = prefOf(line, types)
    if (line.name === "FN") {
      const value = singleLine(unescapeText(line.value))
      if (value) contact.names.push(value)
    } else if (line.name === "TEL") {
      const value = singleLine(telValue(line))
      if (value) contact.phones.push({ value, types: types.filter((t) => t !== "pref"), pref })
    } else if (line.name === "EMAIL") {
      const value = singleLine(unescapeText(line.value))
      if (value) contact.emails.push({ value, types: types.filter((t) => t !== "pref" && t !== "internet"), pref })
    } else {
      const parts = splitEscaped(line.value, ";")
      if (parts.length > 7) throw new Refusal("STRUCTURE")
      // Cada componente pode ser lista separada por vírgula não escapada.
      const [poBox, extended, street, locality, region, postalCode, country] = Array.from({ length: 7 }, (_, i) =>
        singleLine(splitEscaped(parts[i] ?? "", ",").map(unescapeText).filter((v) => v.trim()).join(", ")))
      if ([poBox, extended, street, locality, region, postalCode, country].some(Boolean)) {
        contact.addresses.push({ poBox, extended, street, locality, region, postalCode, country, types: types.filter((t) => t !== "pref"), pref })
      }
    }
  }
  for (const list of [contact.names, contact.phones, contact.emails, contact.addresses]) {
    if (list.length > VCARD_LIMITS.maxValuesPerField) throw new Refusal("LIMIT")
  }
  // Preferência do arquivo só ORDENA a apresentação (sort estável); nunca escolhe sozinha.
  contact.phones.sort((a, b) => a.pref - b.pref)
  contact.emails.sort((a, b) => a.pref - b.pref)
  contact.addresses.sort((a, b) => a.pref - b.pref)
  contact.names = [...new Set(contact.names)]
  contact.hasStructuredNameOnly = hasN && !contact.names.length
  contact.ignored = [...ignored].sort((a, b) => a.localeCompare(b, "pt-BR"))
  return contact
}

/** TEL: texto (3.0) ou URI `tel:` (4.0, VALUE=uri). Remove só o esquema e os parâmetros da URI; não acrescenta DDD nem país. */
function telValue(line: ContentLine): string {
  const isUri = (line.params.get("VALUE") ?? []).some((v) => v.toLowerCase() === "uri") || /^tel:/i.test(line.value.trim())
  if (!isUri) return unescapeText(line.value)
  const uri = line.value.trim()
  if (!/^tel:/i.test(uri)) return ""
  let number = uri.slice(4).split(";")[0]
  try { number = decodeURIComponent(number) } catch { /* mantém literal; a validação da prévia aponta */ }
  return number
}
