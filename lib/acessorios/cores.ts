const CORES_PADRAO_DEFINICOES = [
  { key: "transparente", label: "Transparente" },
  { key: "preto", label: "Preto" },
  { key: "branco", label: "Branco" },
  { key: "azul", label: "Azul" },
  { key: "azul_claro", label: "Azul claro" },
  { key: "azul_escuro", label: "Azul escuro" },
  { key: "verde", label: "Verde" },
  { key: "verde_claro", label: "Verde claro" },
  { key: "verde_escuro", label: "Verde escuro" },
  { key: "rosa", label: "Rosa" },
  { key: "lilas", label: "Lilás" },
  { key: "vermelho", label: "Vermelho" },
  { key: "amarelo", label: "Amarelo" },
  { key: "fume", label: "Fumê" },
  { key: "dourado", label: "Dourado" },
  { key: "prata", label: "Prata" },
  { key: "colorida", label: "Colorida" },
  { key: "outra", label: "Outra" },
] as const

export type AcessorioColorKey = (typeof CORES_PADRAO_DEFINICOES)[number]["key"]

export type AcessorioCor = Readonly<{
  key: AcessorioColorKey
  label: string
}>

export const ACESSORIO_CORES_PADRAO: readonly AcessorioCor[] = Object.freeze(
  CORES_PADRAO_DEFINICOES.map((cor) => Object.freeze({ ...cor })),
)

const COR_POR_KEY = new Map<AcessorioColorKey, AcessorioCor>(
  ACESSORIO_CORES_PADRAO.map((cor) => [cor.key, cor]),
)

export function isAcessorioColorKey(value: unknown): value is AcessorioColorKey {
  return typeof value === "string" && COR_POR_KEY.has(value as AcessorioColorKey)
}

export function getAcessorioCorByKey(key: unknown): AcessorioCor | null {
  return isAcessorioColorKey(key) ? (COR_POR_KEY.get(key) ?? null) : null
}

export function resolveAcessorioColorLabel(key: unknown): string | null {
  return getAcessorioCorByKey(key)?.label ?? null
}
