import { PessoasError } from "../domain"

/**
 * Política server-side categoria → classificação → capacidades de leitura.
 *
 * Deny-by-default: só é COMUM o que comprovadamente não revela remuneração.
 * - identificacao: documento pessoal, sem valor salarial.
 * - contrato: contrato de trabalho traz salário/jornada.
 * - holerite_externo: demonstrativo de pagamento.
 * - comprovante: pode ser comprovante de pagamento de salário.
 * - outro: conteúdo livre, não verificável pelo servidor.
 * Categoria desconhecida cai na classe mais restritiva.
 */
const POLITICA = {
  identificacao: "COMUM",
  contrato: "REMUNERATORIO",
  holerite_externo: "REMUNERATORIO",
  comprovante: "REMUNERATORIO",
  outro: "REMUNERATORIO",
} as const

export type CategoriaDocumento = keyof typeof POLITICA
export type ClassificacaoDocumento = (typeof POLITICA)[CategoriaDocumento]

export const CATEGORIAS_DOCUMENTO = Object.freeze(Object.keys(POLITICA) as CategoriaDocumento[])

export function categoriaValida(valor: unknown): valor is CategoriaDocumento {
  return typeof valor === "string" && Object.hasOwn(POLITICA, valor)
}

export function classificacaoDe(categoria: string): ClassificacaoDocumento {
  return categoriaValida(categoria) ? POLITICA[categoria] : "REMUNERATORIO"
}

/** Ler (listar, baixar, enviar) exige viewDocumento; remuneratório exige também viewRemuneracao. */
export function podeLerDocumento(categoria: string, capacidades: readonly string[]): boolean {
  if (!capacidades.includes("viewDocumento")) return false
  return classificacaoDe(categoria) === "COMUM" || capacidades.includes("viewRemuneracao")
}

export function categoriasLegiveis(capacidades: readonly string[]): CategoriaDocumento[] {
  return CATEGORIAS_DOCUMENTO.filter((c) => podeLerDocumento(c, capacidades))
}

const EXTENSAO_POR_MIME: Readonly<Record<string, string>> = {
  "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg",
}

/** O nome original pode conter nome/CPF: a URL assinada leva só um nome neutro derivado do MIME. */
export function nomeDownloadNeutro(mime: string): string {
  if (!Object.hasOwn(EXTENSAO_POR_MIME, mime)) throw new PessoasError("DOCUMENTO_INDISPONIVEL", 503)
  return `documento.${EXTENSAO_POR_MIME[mime]}`
}
