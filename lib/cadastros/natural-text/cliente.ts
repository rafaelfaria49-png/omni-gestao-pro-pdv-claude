import { isValidClientDocument, normalizeDocumentDigits } from "../client-identity/document"
import { normalizeClientPhoneDigits, toPhoneSignal } from "../client-identity/phone"
import { normalizeClientEmail } from "../client-identity/email"
import { formatPhoneBrDisplay } from "@/lib/phone-br"
import { CLIENT_TEXT_FIELDS, CLIENT_TEXT_LIMIT, type ClientTextField, type ClientTextSuggestion } from "./cliente-types"

const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "))
const LABELS: Record<string, ClientTextField> = {
  nome: "nome", "nome completo": "nome", "razão social": "nome", "razao social": "nome",
  "novo cliente": "nome", "nova cliente": "nome", cliente: "nome",
  telefone: "telefone", celular: "telefone", whatsapp: "telefone", fone: "telefone",
  cpf: "documento", cnpj: "documento", documento: "documento", email: "email", "e-mail": "email",
  cidade: "cidade", "mora em": "cidade", "reside em": "cidade",
  endereço: "endereco", endereco: "endereco", uf: "uf", estado: "uf",
}
// Labels start a field; label words inside names and addresses remain ordinary data.
const MARKER = /(?:^|(?<=[,;\n]))\s*(?:nome completo|razão social|razao social|novo cliente|nova cliente|mora em|reside em|nome|cliente|telefone|celular|whatsapp|fone|cpf|cnpj|documento|e-mail|email|cidade|endereço|endereco|uf|estado)(?=\s|[:=]|$)\s*(?:[:=]\s*)?/giu
const INSTRUCTION = /(?:ignore|ignorar|apague|delete|execute|system|instruções|instrucoes|https?:|<script|salve automaticamente)/i

export function validClientPhone(raw: string): boolean {
  return /^[+\d\s().-]+$/.test(raw) && toPhoneSignal(raw).present
}
export function validClientEmail(raw: string): boolean {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(raw)
}

/** Pure, closed, deterministic extraction. No product interpreter/provider is imported. */
export function interpretarTextoCliente(texto: unknown): ClientTextSuggestion {
  if (typeof texto !== "string" || !texto.trim() || texto.length > CLIENT_TEXT_LIMIT) {
    throw new Error("Descreva o cliente em até 2000 caracteres.")
  }
  const result: ClientTextSuggestion = {
    source: "local-deterministico",
    campos: Object.fromEntries(CLIENT_TEXT_FIELDS.map((k) => [k, { valor: null, estado: "ausente" }])) as ClientTextSuggestion["campos"],
  }
  const text = texto.trim()
  const found = Array.from(text.matchAll(new RegExp(MARKER)))
  const candidates = new Map<ClientTextField, { raw: string; label: string }[]>()
  const add = (field: ClientTextField, raw: string, label = "") => {
    const clean = raw.replace(/^[\s,:;=-]+|[\s,;.!?]+$/g, "").replace(/\s+/g, " ").trim()
    candidates.set(field, [...(candidates.get(field) ?? []), { raw: clean, label }])
  }
  for (let i = 0; i < found.length; i++) {
    const match = found[i]
    const label = match[0].replace(/[\s:=]+$/g, "").trim().toLowerCase()
    const field = LABELS[label]
    const value = text.slice(match.index! + match[0].length, found[i + 1]?.index ?? text.length)
    // Commas delimit prose, except within an explicitly labelled address.
    const raw = field === "endereco" ? value : value.split(/[,;\n]/)[0]
    const cityState = field === "cidade" ? raw.trim().replace(/[.!?]+$/, "").match(/^(.+?)\s*\/\s*([a-z]{2})$/i) : null
    if (cityState && UFS.has(cityState[2].toUpperCase())) {
      add("cidade", cityState[1], label)
      add("uf", cityState[2], label)
    } else add(field, raw, label)
  }
  const prefix = text.slice(0, found[0]?.index ?? text.length).split(/[,;\n]/)[0].trim()
  if (prefix && !candidates.has("nome") && /^[\p{L}][\p{L}\s'.&-]*$/u.test(prefix) && !INSTRUCTION.test(prefix)) add("nome", prefix)

  for (const field of CLIENT_TEXT_FIELDS) {
    const values = candidates.get(field)
    if (!values?.length) continue
    const distinct = new Set(values.map(({ raw }) => field === "documento" ? normalizeDocumentDigits(raw) : field === "telefone" ? normalizeClientPhoneDigits(raw) : raw.toLowerCase()))
    if (distinct.size > 1) {
      result.campos[field] = { valor: null, estado: "ambiguo", aviso: "Mais de um valor identificado. Preencha este campo manualmente." }
      continue
    }
    const { raw, label } = values[0]
    let value = raw, valid = !!raw
    if (field === "nome") valid = valid && raw.length <= 160 && /^[\p{L}\p{N}][\p{L}\p{N}\s'.&/-]*$/u.test(raw) && !INSTRUCTION.test(raw)
    if (field === "telefone") {
      valid = validClientPhone(raw)
      if (valid) value = formatPhoneBrDisplay(normalizeClientPhoneDigits(raw))
    }
    if (field === "documento") {
      valid = /^[\d\s./-]+$/.test(raw) && isValidClientDocument(raw)
      const digits = normalizeDocumentDigits(raw)
      if ((label === "cpf" && digits.length !== 11) || (label === "cnpj" && digits.length !== 14)) valid = false
      if (valid) value = digits
    }
    if (field === "email") { valid = validClientEmail(raw) && raw.length <= 254; if (valid) value = normalizeClientEmail(raw) }
    if (field === "cidade") {
      valid = value.length <= 120 && /^[\p{L}][\p{L}\s'.-]*$/u.test(value) && !INSTRUCTION.test(value)
    }
    if (field === "endereco") valid = valid && raw.length <= 240 && !INSTRUCTION.test(raw) && !/[<>{}]/.test(raw)
    if (field === "uf") { value = raw.toUpperCase(); valid = UFS.has(value) }
    result.campos[field] = { valor: value || null, estado: valid ? "extraido" : "ambiguo", ...(!valid ? { aviso: "Valor incompleto ou inválido. Corrija antes de aplicar." } : {}) }
  }
  // Unlabelled numbers are never guessed to be a phone or a document.
  if (!found.length && /\d{8,}/.test(text.replace(/[\s()./-]/g, ""))) {
    for (const field of ["telefone", "documento"] as const) result.campos[field] = { valor: null, estado: "ambiguo", aviso: "Número sem identificação. Informe telefone, CPF ou CNPJ explicitamente." }
  }
  return result
}

export type ClientEditorValues = Record<ClientTextField, string> & {
  tipo: "PF" | "PJ"; tags: string; observacoes: string; active: boolean
}
export function validateClientEditor(values: ClientEditorValues): Partial<Record<keyof ClientEditorValues, string>> {
  const errors: Partial<Record<keyof ClientEditorValues, string>> = {}
  if (!values.nome.trim() || values.nome.length > 160) errors.nome = "Informe o nome (até 160 caracteres)."
  if (values.telefone && !validClientPhone(values.telefone)) errors.telefone = "Informe DDD e número, com 10 ou 11 dígitos."
  if (values.documento && (!/^[\d\s./-]+$/.test(values.documento) || !isValidClientDocument(values.documento) || normalizeDocumentDigits(values.documento).length !== (values.tipo === "PF" ? 11 : 14))) errors.documento = "CPF/CNPJ inválido ou incompatível com o tipo. Revise os dígitos."
  if (values.email && !validClientEmail(values.email)) errors.email = "Revise o email."
  if (values.uf && !UFS.has(values.uf.toUpperCase())) errors.uf = "Informe uma UF válida."
  for (const [field, limit] of [["email", 254], ["cidade", 120], ["endereco", 240], ["tags", 500], ["observacoes", 1000]] as const) if (values[field].length > limit) errors[field] = `Use até ${limit} caracteres.`
  return errors
}

/** Same fill-empty-only policy as Produto 016, with the separate Cliente schema. */
export function aplicarSugestaoCliente(suggestion: ClientTextSuggestion, current: ClientEditorValues, opts?: { preservarTipo?: boolean }): ClientEditorValues {
  const next = { ...current }
  for (const field of CLIENT_TEXT_FIELDS) {
    const proposed = suggestion.campos[field]
    if (!current[field].trim() && proposed.estado === "extraido" && proposed.valor !== null) next[field] = proposed.valor
  }
  if (!opts?.preservarTipo && !current.documento && next.documento) next.tipo = normalizeDocumentDigits(next.documento).length === 14 ? "PJ" : "PF"
  return next
}
