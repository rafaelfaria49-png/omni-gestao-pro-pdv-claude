import type { CampoTextoLivre } from "./types"

/** Cliente has its own closed schema. Only the suggestion envelope is shared with Produto. */
export const CLIENT_TEXT_FIELDS = ["nome", "telefone", "documento", "email", "cidade", "endereco", "uf"] as const
export type ClientTextField = typeof CLIENT_TEXT_FIELDS[number]
export type ClientTextSuggestion = {
  campos: Record<ClientTextField, CampoTextoLivre<string> & { aviso?: string }>
  source: "local-deterministico"
}
export const CLIENT_TEXT_LABELS: Record<ClientTextField, string> = {
  nome: "Nome", telefone: "Telefone / WhatsApp", documento: "CPF / CNPJ", email: "Email",
  cidade: "Cidade", endereco: "Endereço", uf: "UF",
}
export const CLIENT_TEXT_LIMIT = 2000
