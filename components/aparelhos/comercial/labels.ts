/** Rótulos e regras de exibição do prontuário comercial (puro; espelha o servidor, que é a autoridade). */
import {
  CUSTO_CATEGORIA_LABEL, CUSTO_ORIGEM_LABEL, CUSTO_STATUS_LABEL, ETAPA_LABEL,
  type CustoCategoria, type CustoOrigem, type CustoStatus, type EtapaPreparacao,
} from "@/lib/comercial/custos/contracts"
import { formatCentavos } from "@/lib/comercial/custos/money"
import type { ConferenciaValor } from "./api"

export const EVENTO_COMERCIAL_LABEL: Record<string, string> = {
  // existentes (Aparelhos)
  cadastro: "Cadastro", liberacao: "Liberado para venda", status: "Situação alterada", bloqueio: "Bloqueado",
  conferencia_restricao: "Conferência de restrição", edicao: "Dados editados", alteracao_preco: "Preço alterado",
  fotos: "Fotos adicionadas", reserva: "Reservado", reserva_cancelada: "Reserva cancelada", venda: "Vendido",
  aquisicao_confirmada: "Aquisição confirmada", aquisicao_recusada: "Aquisição recusada", reaquisicao: "Recomprado",
  venda_cancelada: "Venda cancelada", avaliacao_iniciada: "Avaliação iniciada",
  // comerciais
  custo_aplicado: "Custo aplicado", custo_estornado: "Custo estornado",
  preparacao_iniciada: "Preparação iniciada", preparacao_etapa: "Etapa de preparação",
  preparacao_concluida: "Preparação concluída", prontuario_atualizado: "Prontuário atualizado",
}

export const CONFERENCIA_VALOR_LABEL: Record<ConferenciaValor, string> = {
  PASS: "Conferido (OK)", FAIL: "Falhou", NAO_TESTADO: "Não testado", NAO_APLICAVEL: "Não se aplica",
}

/** Transições de etapa aceitas pelo servidor (`moverPreparacao`). */
export const PROXIMAS_ETAPAS: Record<EtapaPreparacao, readonly Exclude<EtapaPreparacao, "nenhuma">[]> = {
  nenhuma: ["em_preparacao"],
  concluida: ["em_preparacao"],
  em_preparacao: ["em_testes", "concluida"],
  em_testes: ["em_preparacao", "concluida"],
}

export const ACAO_ETAPA_LABEL: Record<Exclude<EtapaPreparacao, "nenhuma">, string> = {
  em_preparacao: "Iniciar / voltar à preparação", em_testes: "Enviar para testes", concluida: "Concluir preparação",
}

export const etapaLabel = (e: string) => ETAPA_LABEL[e as EtapaPreparacao] ?? e
export const origemCustoLabel = (o: string) => CUSTO_ORIGEM_LABEL[o as CustoOrigem] ?? o
export const categoriaCustoLabel = (c: string) => CUSTO_CATEGORIA_LABEL[c as CustoCategoria] ?? c
export const statusCustoLabel = (s: string) => CUSTO_STATUS_LABEL[s as CustoStatus] ?? s

const CAMPO_LABEL: Record<string, string> = {
  categoria: "categoria", funcionamento: "funcionamento", finalidade: "finalidade", defeitos: "defeitos",
  classeEstetica: "classe estética", conferencias: "conferências de segurança", custoAquisicaoStatus: "situação do custo de aquisição",
  custoAquisicaoJustificativa: "justificativa do custo", preexistente: "mercadoria preexistente",
}

/** Resumo de uma linha do evento. `dados` chega null quando o usuário não vê custo. */
export function resumoEventoComercial(tipo: string, dados: unknown): string {
  const d = (dados ?? {}) as Record<string, unknown>
  switch (tipo) {
    case "custo_aplicado": {
      const partes = [typeof d.origem === "string" ? origemCustoLabel(d.origem) : "", typeof d.categoria === "string" ? categoriaCustoLabel(d.categoria) : ""]
      if (d.custoStatus === "desconhecido") partes.push("custo desconhecido")
      else if (typeof d.valorCentavos === "number") partes.push(`${formatCentavos(d.valorCentavos)}${d.custoStatus === "estimado" ? " (estimado)" : ""}`)
      return partes.filter(Boolean).join(" · ")
    }
    case "custo_estornado":
      return [typeof d.motivo === "string" ? d.motivo : "", typeof d.aviso === "string" ? d.aviso : ""].filter(Boolean).join(" · ")
    case "preparacao_etapa":
      return [typeof d.de === "string" && typeof d.para === "string" ? `${etapaLabel(d.de)} → ${etapaLabel(d.para)}` : "", typeof d.observacao === "string" ? d.observacao : ""].filter(Boolean).join(" · ")
    case "prontuario_atualizado":
      return Array.isArray(d.campos) && d.campos.length ? `Alterado: ${d.campos.map((c) => CAMPO_LABEL[String(c)] ?? String(c)).join(", ")}` : ""
    case "conferencia_restricao":
      return `${d.resultado === "sem_restricao" ? "Sem restrição conhecida" : "Restrição registrada"}${d.fonte ? ` · ${String(d.fonte)}` : ""}`
    default:
      if (typeof d.observacao === "string" && d.observacao) return d.observacao
      if (typeof d.motivo === "string") return d.motivo
      if (typeof d.protocolo === "string") return `Protocolo ${d.protocolo}`
      return ""
  }
}

/** Percentual digitado ("2,5") → número; vazio ou inválido = undefined (servidor usa 0). */
export function parsePercent(raw: string): number | undefined {
  const s = raw.trim().replace(",", ".")
  if (!s) return undefined
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}
