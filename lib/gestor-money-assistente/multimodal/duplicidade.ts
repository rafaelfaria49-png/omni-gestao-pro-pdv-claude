/**
 * Detecção e resolução segura de duplicidade multimodal — G008 / G009 / G010.
 *
 * Detecta 5 camadas de possível duplicidade (sempre isoladas ao perfil + loja autorizados via `ctx`):
 * 1. Mesmo ID de mensagem WhatsApp (idempotência de turno no motor/repositório).
 * 2. Mesmo hash SHA-256 de arquivo (comprovante/documento já enviado).
 * 3. Mesmo identificador de transação (E2EID Pix / NSU / autenticação).
 * 4. Mesmo número de documento + emitente/fornecedor.
 * 5. Correspondência aproximada por valor + data (±3 dias) + fornecedor/descrição + conta.
 *
 * Regras de segurança:
 * - Correspondência aproximada NUNCA funde ou descarta automaticamente: gera sugestão explícita
 *   para o usuário escolher (vincular documento ao lançamento existente, criar outra operação ou cancelar).
 * - Nunca pesquisa em perfis/lojas/usuários fora do contexto autorizado `ctx`.
 */
import { normalizarTexto } from "../texto"
import type {
  CandidatoDuplicidade,
  MotivoDuplicidade,
  PortaDuplicidadeFinanceira,
} from "./contratos"

export type RegistroRecenteConversa = {
  assinatura: string
  em: string
  operacaoId: string
  perfilId?: string
  valorCentavos?: string
  data?: string
  contraparte?: string
  descricao?: string
  contaNome?: string
  sha256?: string
  identificadorTransacao?: string
  numeroDocumento?: string
  alvoTipo?: "MOVIMENTACAO" | "PAGAR" | "RECEBER"
  alvoId?: string
}

const JANELA_APROXIMADA_DIAS = 3

function diferencaDias(diaA?: string, diaB?: string): number | null {
  if (!diaA || !diaB) return null
  const a = Date.parse(`${diaA}T12:00:00Z`)
  const b = Date.parse(`${diaB}T12:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.abs(Math.round((a - b) / 86_400_000))
}

function similaridadeTexto(a?: string, b?: string): boolean {
  if (!a || !b) return false
  const na = normalizarTexto(a)
  const nb = normalizarTexto(b)
  if (!na || !nb) return false
  if (na.includes(nb) || nb.includes(na)) return true
  const tokensA = new Set(na.split(" ").filter((t) => t.length >= 3))
  const tokensB = new Set(nb.split(" ").filter((t) => t.length >= 3))
  for (const t of tokensA) {
    if (tokensB.has(t)) return true
  }
  return false
}

export type CriteriosDuplicidade = {
  perfilId: string
  sha256?: string
  identificadorTransacao?: string
  numeroDocumento?: string
  valorCentavos?: string
  dataReferencia?: string
  contraparte?: string
  descricao?: string
  contaNome?: string
}

/**
 * Avalia duplicidade combinando histórico recente da conversa (somente do MESMO `perfilId`)
 * com a consulta autorizada ao banco (`PortaDuplicidadeFinanceira`, opcional).
 */
export async function detectarCandidatosDuplicidade(input: {
  ctx?: unknown
  criterios: CriteriosDuplicidade
  recentesConversa: readonly RegistroRecenteConversa[]
  portaDuplicidade?: PortaDuplicidadeFinanceira
}): Promise<CandidatoDuplicidade[]> {
  const { criterios, recentesConversa, portaDuplicidade, ctx } = input
  const encontrados = new Map<string, CandidatoDuplicidade>()

  const adicionar = (cand: CandidatoDuplicidade) => {
    const chave = `${cand.alvoTipo}:${cand.alvoId}`
    const prev = encontrados.get(chave)
    // Prioriza correspondência exata sobre aproximada
    if (!prev || (cand.correspondenciaExata && !prev.correspondenciaExata)) {
      encontrados.set(chave, cand)
    }
  }

  // 1. Verificação local na conversa (estritamente filtrada pelo mesmo perfilId)
  for (const reg of recentesConversa) {
    if (reg.perfilId && reg.perfilId !== criterios.perfilId) continue
    const alvoTipo = reg.alvoTipo ?? "MOVIMENTACAO"
    const alvoId = reg.alvoId ?? reg.operacaoId

    if (criterios.sha256 && reg.sha256 && criterios.sha256 === reg.sha256) {
      adicionar({
        alvoTipo,
        alvoId,
        operacaoId: reg.operacaoId,
        descricao: reg.descricao ?? "Lançamento anterior",
        valorCentavos: reg.valorCentavos ?? criterios.valorCentavos ?? "0",
        data: reg.data ?? reg.em.slice(0, 10),
        contraparte: reg.contraparte,
        contaNome: reg.contaNome,
        motivo: "MESMO_HASH_ARQUIVO",
        correspondenciaExata: true,
      })
      continue
    }

    if (
      criterios.identificadorTransacao &&
      reg.identificadorTransacao &&
      normalizarTexto(criterios.identificadorTransacao) === normalizarTexto(reg.identificadorTransacao)
    ) {
      adicionar({
        alvoTipo,
        alvoId,
        operacaoId: reg.operacaoId,
        descricao: reg.descricao ?? "Lançamento anterior",
        valorCentavos: reg.valorCentavos ?? criterios.valorCentavos ?? "0",
        data: reg.data ?? reg.em.slice(0, 10),
        contraparte: reg.contraparte,
        contaNome: reg.contaNome,
        motivo: "MESMO_ID_TRANSACAO",
        correspondenciaExata: true,
      })
      continue
    }

    if (
      criterios.numeroDocumento &&
      reg.numeroDocumento &&
      normalizarTexto(criterios.numeroDocumento) === normalizarTexto(reg.numeroDocumento)
    ) {
      adicionar({
        alvoTipo,
        alvoId,
        operacaoId: reg.operacaoId,
        descricao: reg.descricao ?? "Lançamento anterior",
        valorCentavos: reg.valorCentavos ?? criterios.valorCentavos ?? "0",
        data: reg.data ?? reg.em.slice(0, 10),
        contraparte: reg.contraparte,
        contaNome: reg.contaNome,
        motivo: "MESMO_DOCUMENTO",
        correspondenciaExata: true,
      })
      continue
    }

    // Correspondência aproximada: mesmo valor + data próxima (±3 dias)
    if (criterios.valorCentavos && reg.valorCentavos && criterios.valorCentavos === reg.valorCentavos) {
      const diff = diferencaDias(criterios.dataReferencia, reg.data ?? reg.em.slice(0, 10))
      const dataCompativel = diff === null || diff <= JANELA_APROXIMADA_DIAS
      if (dataCompativel) {
        const mesmoContexto =
          similaridadeTexto(criterios.contraparte, reg.contraparte) ||
          similaridadeTexto(criterios.descricao, reg.descricao) ||
          similaridadeTexto(criterios.contaNome, reg.contaNome) ||
          diff === 0 ||
          diff === 1
        if (mesmoContexto) {
          adicionar({
            alvoTipo,
            alvoId,
            operacaoId: reg.operacaoId,
            descricao: reg.descricao ?? "Lançamento recente",
            valorCentavos: reg.valorCentavos,
            data: reg.data ?? reg.em.slice(0, 10),
            contraparte: reg.contraparte,
            contaNome: reg.contaNome,
            motivo: "CORRESPONDENCIA_APROXIMADA",
            correspondenciaExata: false,
          })
        }
      }
    }
  }

  // 2. Verificação autorizada no banco (estritamente dentro de `ctx`)
  if (portaDuplicidade && ctx) {
    const dbCandidatos = await portaDuplicidade
      .buscarCandidatos(ctx, {
        sha256: criterios.sha256,
        identificadorTransacao: criterios.identificadorTransacao,
        numeroDocumento: criterios.numeroDocumento,
        valorCentavos: criterios.valorCentavos,
        dataReferencia: criterios.dataReferencia,
        contraparte: criterios.contraparte,
        contaNome: criterios.contaNome,
      })
      .catch(() => [] as CandidatoDuplicidade[])

    for (const c of dbCandidatos) {
      adicionar(c)
    }
  }

  // Ordena: correspondências exatas primeiro
  return [...encontrados.values()]
    .sort((a, b) => Number(b.correspondenciaExata) - Number(a.correspondenciaExata))
    .slice(0, 5)
}

export function rotuloMotivoDuplicidade(motivo: MotivoDuplicidade): string {
  switch (motivo) {
    case "MESMA_MENSAGEM":
      return "mesma mensagem recebida anteriormente"
    case "MESMO_HASH_ARQUIVO":
      return "mesmo arquivo/comprovante já enviado antes"
    case "MESMO_ID_TRANSACAO":
      return "mesmo identificador de transação"
    case "MESMO_DOCUMENTO":
      return "mesmo número de documento"
    case "CORRESPONDENCIA_APROXIMADA":
      return "mesmo valor e período próximo"
  }
}
