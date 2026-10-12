import "server-only"
import { categoriasLegiveis } from "../documentos/politica"
import { exigirBootstrap, listarEscopos } from "../scope"
import { PessoasError } from "../domain"

export async function lerDisponibilidade() {
  const escopos = await listarEscopos("viewCadastro")
  let podeConfigurarEmpregador = false
  try { await exigirBootstrap(); podeConfigurarEmpregador = true }
  catch (error) {
    if (!(error instanceof PessoasError) || error.code !== "BOOTSTRAP_NEGADO") throw error
  }
  return {
    disponivel: escopos.length > 0 || podeConfigurarEmpregador,
    podeConfigurarEmpregador,
    escopos: escopos.map(({ empregadorId, capacidades }) => ({ empregadorId, capacidades: [...capacidades], categoriasDocumentais: categoriasLegiveis(capacidades) })),
  }
}
