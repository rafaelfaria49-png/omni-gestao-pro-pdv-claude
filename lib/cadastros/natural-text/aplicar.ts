/**
 * Aplicação de sugestão de texto livre no formulário (CAD-R2-016).
 *
 * Função PURA (sem React, sem rede, sem banco): recebe a sugestão temporária
 * + os valores atuais do formulário e devolve as atribuições a fazer.
 *
 * Regras (consistentes com CAD-R2-015):
 * - Preenche SOMENTE campos vazios do formulário (nunca sobrescreve o operador).
 * - Em EDIÇÃO, estoque é ignorado (saldo somente leitura; muda por movimentação).
 * - Campos excluídos pelo operador no preview não são aplicados.
 * - Ausentes (valor null) nunca geram atribuição.
 * - Nada aqui salva Produto: o resultado volta para a UI, que só persiste via
 *   upsertProduto → ProductWriteService após revisão ("Salvar produto").
 */

import type { NomeCampoTextoLivre, SugestaoTextoLivre } from "./types"

/** Valores atuais do formulário (strings dos inputs; vazio = preenchível). */
export type ValoresAtuaisTextoLivre = Partial<Record<NomeCampoTextoLivre, string>>

export type AtribuicaoTextoLivre = {
  campo: NomeCampoTextoLivre
  /** Valor pronto para o input (números já em string). */
  valor: string
}

export type IgnoradoTextoLivre = {
  campo: NomeCampoTextoLivre
  motivo: "ja-preenchido" | "excluido-pelo-operador" | "estoque-somente-leitura" | "ausente"
}

export type ResultadoAplicacaoTextoLivre = {
  aplicacoes: AtribuicaoTextoLivre[]
  ignorados: IgnoradoTextoLivre[]
}

const ORDEM_APLICACAO: ReadonlyArray<NomeCampoTextoLivre> = [
  "nome",
  "marca",
  "categoria",
  "descricao",
  "preco",
  "custo",
  "estoque",
  "fornecedor",
  "sku",
  "ean",
  "garantia",
  "ncm",
  "cest",
]

function temValor(valor: string | undefined): boolean {
  return typeof valor === "string" && valor.trim().length > 0
}

/**
 * Calcula as atribuições da sugestão sobre o formulário. Pura e testável.
 */
export function calcularAplicacaoTextoLivre(
  sugestao: SugestaoTextoLivre,
  atuais: ValoresAtuaisTextoLivre,
  opts?: { modoEdicao?: boolean; excluir?: ReadonlyArray<string> },
): ResultadoAplicacaoTextoLivre {
  const modoEdicao = opts?.modoEdicao === true
  const excluidos = new Set(opts?.excluir ?? [])
  const aplicacoes: AtribuicaoTextoLivre[] = []
  const ignorados: IgnoradoTextoLivre[] = []

  for (const campo of ORDEM_APLICACAO) {
    const proposto = sugestao.campos[campo]
    if (excluidos.has(campo)) {
      if (proposto.valor !== null && proposto.valor !== undefined) {
        ignorados.push({ campo, motivo: "excluido-pelo-operador" })
      }
      continue
    }
    if (proposto.valor === null || proposto.valor === undefined) {
      ignorados.push({ campo, motivo: "ausente" })
      continue
    }
    if (campo === "estoque" && modoEdicao) {
      ignorados.push({ campo, motivo: "estoque-somente-leitura" })
      continue
    }
    if (temValor(atuais[campo])) {
      ignorados.push({ campo, motivo: "ja-preenchido" })
      continue
    }
    aplicacoes.push({ campo, valor: String(proposto.valor) })
  }
  return { aplicacoes, ignorados }
}
