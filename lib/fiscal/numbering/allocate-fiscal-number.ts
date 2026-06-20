/**
 * Alocador oficial de número fiscal por série (GOAL_008) — orquestração PURA.
 *
 * Garante que a NotaFiscal vigente tenha (modelo, série, número, ambiente) ANTES da emissão.
 * Regras:
 *  - Nunca repete número e nunca volta número (a porta `reserveNextNumber` só INCREMENTA).
 *  - Concorrência segura: a reserva é um incremento ATÔMICO no banco (porta), não um read-modify-write aqui.
 *  - Idempotência: se a nota já tem série+número, devolve o existente sem tocar no contador.
 *  - Série inativa/inexistente → erro CLARO (`serie_inativa`); NÃO numera, NÃO emite.
 *  - "Se falhar após reservar, o número não é reutilizado": a reserva (incremento) é definitiva;
 *    uma falha posterior ao vincular QUEIMA o número e segue para o próximo (retry controlado).
 *  - Conflito de gravação → retry controlado; esgotado → erro claro. Nunca duplica.
 *
 * Sem Prisma, sem rede, sem XML/DANFE. Apenas decide e coordena as portas.
 */
import type {
  AllocateFiscalNumberInput,
  FiscalNumberAllocationError,
  FiscalNumberAllocationOutcome,
  FiscalNumberingErrorCode,
  FiscalNumberingPorts,
} from "./numbering.types"

const MAX_TENTATIVAS_TETO = 10
const MAX_TENTATIVAS_PADRAO = 3

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim()
}

function err(errorCode: FiscalNumberingErrorCode, mensagem: string): FiscalNumberAllocationError {
  return { ok: false, errorCode, mensagem }
}

/**
 * Aloca (ou reaproveita) o número fiscal da NotaFiscal vigente. Idempotente por nota:
 * se já houver número, devolve-o. Caso contrário, resolve a série ativa, reserva o próximo
 * número de forma atômica e o vincula à nota.
 */
export async function allocateFiscalNumber(
  input: AllocateFiscalNumberInput,
  ports: FiscalNumberingPorts,
): Promise<FiscalNumberAllocationOutcome> {
  const storeId = s(input.storeId)
  const notaFiscalId = s(input.notaFiscalId)
  if (!storeId || !notaFiscalId) {
    return err("parametros_invalidos", "Loja e nota fiscal são obrigatórias para a numeração.")
  }
  const maxTentativas = Math.max(1, Math.min(input.maxTentativas ?? MAX_TENTATIVAS_PADRAO, MAX_TENTATIVAS_TETO))

  const nota = await ports.getNota({ storeId, notaFiscalId })
  if (!nota) {
    return err("nota_nao_encontrada", "NotaFiscal vigente não encontrada nesta loja.")
  }

  // Idempotência: nota já numerada → devolve o número existente (NÃO toca o contador).
  if (nota.numero != null && nota.serie != null) {
    return {
      ok: true,
      reused: true,
      serieFiscalId: nota.serieFiscalId ?? "",
      serie: nota.serie,
      numero: nota.numero,
      modelo: nota.modelo,
      ambiente: nota.ambiente,
    }
  }

  const serie = await ports.findActiveSerie({
    storeId,
    modelo: nota.modelo,
    ambiente: nota.ambiente,
    serie: nota.serie,
  })
  if (!serie) {
    const sufixo = nota.serie != null ? ` série ${nota.serie}` : ""
    return err(
      "serie_inativa",
      `Nenhuma série fiscal ativa para ${nota.modelo || "modelo"}/${nota.ambiente || "ambiente"}${sufixo}. Numeração indisponível.`,
    )
  }

  let ultimaMensagem = "Falha ao vincular o número fiscal à NotaFiscal."
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    // RESERVA atômica — o contador avança no banco; o número é definitivamente consumido.
    const reserva = await ports.reserveNextNumber({ serieFiscalId: serie.id })
    const bind = await ports.bindNotaNumero({
      notaFiscalId,
      serieFiscalId: serie.id,
      serie: reserva.serie,
      numero: reserva.numero,
    })

    if (bind.ok) {
      return {
        ok: true,
        reused: false,
        serieFiscalId: serie.id,
        serie: reserva.serie,
        numero: reserva.numero,
        modelo: nota.modelo,
        ambiente: nota.ambiente,
      }
    }

    ultimaMensagem = s(bind.mensagem) || ultimaMensagem
    if (!bind.conflito) {
      // Falha não-conflito: o número já foi reservado (queimado) e NÃO será reutilizado.
      return err("bind_falhou", ultimaMensagem)
    }
    // Conflito de numeração: o número fica queimado; tenta o próximo (retry controlado).
  }

  return err("conflito_persistente", `Conflito de numeração após ${maxTentativas} tentativa(s): ${ultimaMensagem}`)
}
