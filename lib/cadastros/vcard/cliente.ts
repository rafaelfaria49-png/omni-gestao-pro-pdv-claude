import { normalizeClientPhoneDigits } from "../client-identity/phone"
import { validClientEmail, validClientPhone, type ClientEditorValues } from "../natural-text/cliente"
import type { VcardAddress, VcardContact, VcardValue } from "./parser"

/**
 * Mapeia UM contato vCard para os campos que o editor de Clientes comporta.
 * Documento, tipo PF/PJ, tags e observações nunca vêm do arquivo.
 * DTO transitório: vive só no navegador, na montagem do editor.
 */
export const VCARD_CLIENT_FIELDS = ["nome", "telefone", "email", "endereco", "cidade", "uf"] as const
export type VcardClientField = typeof VCARD_CLIENT_FIELDS[number]
export type VcardDraft = Record<VcardClientField, string>
export type VcardOption = { id: string; label: string; value: string }
export type VcardAddressOption = { id: string; label: string; values: Pick<VcardDraft, "endereco" | "cidade" | "uf">; notImported: string[] }
export type VcardClientPreview = {
  names: VcardOption[]
  phones: VcardOption[]
  emails: VcardOption[]
  addresses: VcardAddressOption[]
  /** Categorias do contato que esta importação não utiliza (sem valores). */
  ignored: string[]
  missingName: boolean
}

const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "))
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()
// Map, não objeto: texto do arquivo como "constructor"/"__proto__" não pode achar propriedade herdada.
const STATE_NAMES = new Map<string, string>(Object.entries({
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
}).map(([uf, name]) => [fold(name), uf] as [string, string]))
const BRAZIL = new Set(["brasil", "brazil", "br", "bra", "republica federativa do brasil"])
const TYPE_LABELS = new Map(Object.entries({
  cell: "celular", home: "residencial", work: "trabalho", voice: "voz", fax: "fax", pager: "pager",
  text: "mensagem", video: "vídeo", textphone: "texto", main: "principal", other: "outro",
}))

function optionLabel(item: Pick<VcardValue, "types" | "pref">): string {
  const parts = item.types.map((t) => TYPE_LABELS.get(t)).filter((label): label is string => !!label)
  if (item.pref <= 100) parts.push("preferencial no arquivo")
  return parts.join(" · ")
}

/** Região só vira UF quando é UF ou nome de estado brasileiro, e o país é vazio ou Brasil. */
function resolveUf(address: VcardAddress): { uf: string; note?: string } {
  const region = address.region.trim()
  if (!region) return { uf: "" }
  if (address.country && !BRAZIL.has(fold(address.country))) return { uf: "", note: "Estado/região de endereço fora do Brasil (não convertido em UF)" }
  const upper = region.toUpperCase()
  if (UFS.has(upper)) return { uf: upper }
  const byName = STATE_NAMES.get(fold(region))
  if (byName) return { uf: byName }
  return { uf: "", note: `Estado/região “${region}” não corresponde a uma UF brasileira` }
}

function addressOption(address: VcardAddress, index: number): VcardAddressOption {
  const { uf, note } = resolveUf(address)
  const notImported = [
    ...(note ? [note] : []),
    ...(address.postalCode ? ["CEP / código postal"] : []),
    ...(address.country ? ["País"] : []),
    ...(address.poBox ? ["Caixa postal"] : []),
  ]
  const endereco = [address.street, address.extended].filter(Boolean).join(", ")
  const summary = [endereco, address.locality, uf || address.region].filter(Boolean).join(" — ")
  const kind = optionLabel(address)
  return { id: `adr-${index}`, label: [summary || "Endereço sem rua/cidade", kind].filter(Boolean).join(" · "), values: { endereco, cidade: address.locality, uf }, notImported }
}

export function previewContato(contact: VcardContact): VcardClientPreview {
  const values = (prefix: string, list: VcardValue[]) => list.map((item, i) => ({ id: `${prefix}-${i}`, label: optionLabel(item), value: item.value }))
  return {
    names: contact.names.map((value, i) => ({ id: `fn-${i}`, label: "", value })),
    phones: values("tel", contact.phones),
    emails: values("email", contact.emails),
    addresses: contact.addresses.map(addressOption),
    ignored: contact.ignored,
    missingName: !contact.names.length,
  }
}

/** Um único valor entra na prévia; vários exigem escolha explícita (rascunho vazio). */
export function rascunhoInicial(preview: VcardClientPreview): VcardDraft {
  const only = (list: VcardOption[]) => list.length === 1 ? list[0].value : ""
  const address = preview.addresses.length === 1 ? preview.addresses[0].values : { endereco: "", cidade: "", uf: "" }
  return { nome: only(preview.names), telefone: only(preview.phones), email: only(preview.emails), ...address }
}

/** Mesmos critérios de `validateClientEditor`: um valor que o editor recusaria não é aplicado. */
export function problemasRascunho(draft: VcardDraft): Partial<Record<VcardClientField, string>> {
  const issues: Partial<Record<VcardClientField, string>> = {}
  if (draft.nome.length > 160) issues.nome = "Nome com mais de 160 caracteres: encurte antes de aplicar."
  if (draft.telefone.includes(";")) issues.telefone = "O número traz parâmetros da URI tel: (ramal ou contexto de discagem). Edite para deixar só DDD e número; nada foi convertido."
  else if (draft.telefone && !validClientPhone(draft.telefone)) issues.telefone = "Confira DDD e número (10 ou 11 dígitos). Nada foi acrescentado ao número do arquivo."
  if (draft.email && (!validClientEmail(draft.email) || draft.email.length > 254)) issues.email = "Email inválido: corrija antes de aplicar."
  if (draft.endereco.length > 240) issues.endereco = "Endereço com mais de 240 caracteres: encurte antes de aplicar."
  if (draft.cidade.length > 120) issues.cidade = "Cidade com mais de 120 caracteres: encurte antes de aplicar."
  if (draft.uf && !UFS.has(draft.uf.trim().toUpperCase())) issues.uf = "Informe uma UF brasileira válida."
  return issues
}

/** Aviso informativo (não bloqueia): número com DDI que não é do Brasil. */
export function avisoTelefone(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith("+")) return null
  return trimmed.replace(/\D/g, "").startsWith("55") ? null : "Número com código de outro país: confira antes de aplicar."
}

function comparable(field: VcardClientField, value: string): string {
  if (field === "telefone") return normalizeClientPhoneDigits(value) || fold(value)
  return fold(value)
}

/** Valores válidos da prévia que caberiam em campos VAZIOS do formulário. */
export function aplicaveisAosVazios(draft: VcardDraft, current: Pick<ClientEditorValues, VcardClientField>): Partial<VcardDraft> {
  const issues = problemasRascunho(draft)
  const out: Partial<VcardDraft> = {}
  for (const field of VCARD_CLIENT_FIELDS) {
    const value = field === "uf" ? draft.uf.trim().toUpperCase() : draft[field].trim()
    if (value && !issues[field] && !current[field].trim()) out[field] = value
  }
  return out
}

/** Campos com valor nos dois lados e conteúdo diferente: exigem decisão explícita do operador. */
export function divergencias(draft: VcardDraft, current: Pick<ClientEditorValues, VcardClientField>): VcardClientField[] {
  const issues = problemasRascunho(draft)
  return VCARD_CLIENT_FIELDS.filter((field) => draft[field].trim() && !issues[field] && current[field].trim()
    && comparable(field, draft[field]) !== comparable(field, current[field]))
}

/** Rótulos mínimos para distinguir contatos: nome; final do telefone só quando o nome se repete. */
export function rotulosContatos(contacts: VcardContact[]): string[] {
  const base = contacts.map((c) => c.names[0] ?? "Contato sem nome")
  return base.map((label, i) => {
    if (base.filter((other) => other === label).length < 2) return label
    const digits = (contacts[i].phones[0]?.value ?? "").replace(/\D/g, "")
    return digits.length >= 4 ? `${label} · tel. final ${digits.slice(-4)}` : `${label} · contato ${i + 1}`
  })
}
