/**
 * Aplicação de sugestões externas no formulário (CAD-R2-015) — contrato da UI.
 *
 * Regras (as mesmas que a UI já praticava, agora centralizadas e testadas):
 * - Preenche SOMENTE campos vazios do formulário (nunca sobrescreve o operador).
 * - Aplica SOMENTE campos que o provider pode sugerir (allow-list da governança).
 * - NUNCA aplica preço/custo/estoque/fornecedor/sku (deny-list global — esses
 *   campos nem existem no contrato normalizado, e o helper os recusa mesmo se
 *   injetados via cast).
 * - imagemUrl é sugestão-apenas (referência em metadata): não vira campo aplicado.
 * - NCM/CEST continuam sugestão revisável; só entram quando o provider permite
 *   (na prática: cosmos). UPCitemdb jamais popula NCM/CEST.
 * - Nada aqui salva Produto: o resultado volta para a UI, que só persiste via
 *   upsertProduto após revisão do operador ("Salvar produto").
 */

import { obterProvedor } from "./registry"

/** Campos de formulário elegíveis a receber sugestão aplicada. */
export type CampoAplicavelSugestao = "nome" | "marca" | "categoria" | "descricao" | "ncm" | "cest"

const CAMPOS_APLICAVEIS: ReadonlyArray<CampoAplicavelSugestao> = [
  "nome",
  "marca",
  "categoria",
  "descricao",
  "ncm",
  "cest",
]

export type ValoresAtuaisFormulario = Partial<Record<CampoAplicavelSugestao, string>>

export type CampoAplicado = { campo: CampoAplicavelSugestao; valor: string }

function temValor(valor: string | undefined): boolean {
  return typeof valor === "string" && valor.trim().length > 0
}

/**
 * Calcula quais sugestões podem ser aplicadas sobre os valores atuais do
 * formulário. Função pura — sem efeitos, sem escrita, sem rede.
 */
export function calcularCamposAplicaveis(
  provedorId: string,
  dados: Record<string, unknown>,
  atuais: ValoresAtuaisFormulario,
): CampoAplicado[] {
  const obtido = obterProvedor(provedorId)
  if (!obtido.conhecido) return []
  const permitidos = obtido.registro.camposSugeriveis as ReadonlyArray<string>

  const aplicaveis: CampoAplicado[] = []
  for (const campo of CAMPOS_APLICAVEIS) {
    if (!permitidos.includes(campo)) continue
    if (temValor(atuais[campo])) continue
    const sugerido = dados[campo]
    if (typeof sugerido !== "string" || sugerido.trim().length === 0) continue
    aplicaveis.push({ campo, valor: sugerido })
  }
  return aplicaveis
}
