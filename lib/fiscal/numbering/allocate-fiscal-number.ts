/**
 * Alocador oficial de número fiscal por série (GOAL_010) — orquestração PURA.
 *
 * Garante que a NotaFiscal vigente tenha (modelo, série, número, ambiente) ANTES da emissão.
 * Regras:
 *  - Nunca repete número e nunca volta número (a porta `reserveNextNumber` só INCREMENTA).
 *  - Concorrência segura: a reserva é um incremento ATÔMICO no banco (porta), não um read-modify-write aqui.
 *  - Idempotência: se a nota já tem série+número, devolve o existente sem tocar no contador.
 *  - Compare-and-swap: duas chamadas da mesma nota convergem para a mesma numeração.
 *  - Série ausente/inativa/incompatível → erro CLARO; NÃO incrementa, NÃO emite.
 *  - Sequência válida: aloca somente 1..999.999.999; nunca reinicia nem ultrapassa o limite.
 *  - "Se falhar após reservar, o número não é reutilizado": a reserva (incremento) é definitiva;
 *    uma falha posterior ao vincular QUEIMA o número e segue para o próximo (retry controlado).
 *  - Conflito de gravação → retry controlado; esgotado → erro claro. Nunca duplica.
 *
 * Sem Prisma, sem rede, sem XML/DANFE. Apenas decide e coordena as portas.
 */
import type {
  AllocateFiscalNumberInput,
  FiscalNumberAllocation,
  FiscalNumberAllocationError,
  FiscalNumberAllocationOutcome,
  FiscalNumberingGap,
  FiscalNumberingErrorCode,
  FiscalNumberingPorts,
  NumberingNota,
  NumberingReservation,
  NumberingReservationFailure,
} from "./numbering.types"
import {
  FISCAL_NUMERO_MAXIMO,
  FISCAL_NUMERO_MINIMO,
} from "./numbering.types"

const MAX_TENTATIVAS_TETO = 10
const MAX_TENTATIVAS_PADRAO = 3

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim()
}

function err(
  errorCode: FiscalNumberingErrorCode,
  mensagem: string,
  lacunas: FiscalNumberingGap[] = [],
): FiscalNumberAllocationError {
  return { ok: false, errorCode, mensagem, lacunas }
}

function numeroFiscalValido(numero: number): boolean {
  return Number.isSafeInteger(numero) && numero >= FISCAL_NUMERO_MINIMO && numero <= FISCAL_NUMERO_MAXIMO
}

function allocationFromNumberedNota(
  nota: NumberingNota,
  reused: boolean,
  lacunas: FiscalNumberingGap[],
): FiscalNumberAllocationOutcome | null {
  // Série e serieFiscalId podem ser pré-configurados antes da alocação. O estado só é
  // inconsistente quando há número persistido sem todos os componentes que o identificam.
  if (nota.numero == null) return null

  if (nota.serie == null || !s(nota.serieFiscalId)) {
    return err(
      "nota_numeracao_inconsistente",
      "NotaFiscal possui numeração parcial; o contador não será tocado até reconciliação.",
      lacunas,
    )
  }
  if (!numeroFiscalValido(nota.numero)) {
    return err(
      "nota_numeracao_inconsistente",
      `NotaFiscal possui número fora do intervalo fiscal: ${nota.numero}.`,
      lacunas,
    )
  }

  return {
    ok: true,
    reused,
    storeId: nota.storeId,
    notaFiscalId: nota.id,
    localKey: nota.localKey ?? null,
    serieFiscalId: s(nota.serieFiscalId),
    serie: nota.serie,
    numero: nota.numero,
    modelo: nota.modelo,
    ambiente: nota.ambiente,
    lacunas,
  }
}

function isReservationFailure(
  reserva: NumberingReservation | NumberingReservationFailure,
): reserva is NumberingReservationFailure {
  return "ok" in reserva && reserva.ok === false
}

function gapFromReservation(
  nota: NumberingNota,
  reserva: NumberingReservation,
  motivo: FiscalNumberingGap["motivo"],
): FiscalNumberingGap {
  return {
    storeId: nota.storeId,
    notaFiscalId: nota.id,
    localKey: nota.localKey ?? null,
    serieFiscalId: reserva.serieFiscalId,
    modelo: nota.modelo,
    ambiente: nota.ambiente,
    serie: reserva.serie,
    numero: reserva.numero,
    motivo,
    requerInutilizacao: true,
  }
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
  const requestedAttempts = input.maxTentativas ?? MAX_TENTATIVAS_PADRAO
  const maxTentativas = Number.isInteger(requestedAttempts)
    ? Math.max(1, Math.min(requestedAttempts, MAX_TENTATIVAS_TETO))
    : MAX_TENTATIVAS_PADRAO

  const nota = await ports.getNota({ storeId, notaFiscalId })
  if (!nota) {
    return err("nota_nao_encontrada", "NotaFiscal vigente não encontrada nesta loja.")
  }
  // Defesa em profundidade: portas reais já filtram ambos os campos, mas uma implementação
  // incorreta nunca pode fazer o allocator aceitar uma nota de outra loja ou outro id.
  if (s(nota.id) !== notaFiscalId || s(nota.storeId) !== storeId) {
    return err("nota_nao_encontrada", "NotaFiscal vigente não encontrada nesta loja.")
  }

  // Idempotência e fail-closed para estado parcial: nunca sobrescreve numeração existente.
  const existente = allocationFromNumberedNota(nota, true, [])
  if (existente) return existente

  const serie = await ports.findActiveSerie({
    storeId,
    modelo: nota.modelo,
    ambiente: nota.ambiente,
    serie: nota.serie,
    serieFiscalId: nota.serieFiscalId,
  })
  if (!serie) {
    const sufixo = nota.serie != null ? ` série ${nota.serie}` : ""
    return err(
      "serie_nao_encontrada",
      `Nenhuma série fiscal configurada para ${nota.modelo || "modelo"}/${nota.ambiente || "ambiente"}${sufixo}. Numeração indisponível.`,
    )
  }
  if (serie.storeId != null && s(serie.storeId) !== storeId) {
    return err("serie_outra_loja", "A série fiscal resolvida pertence a outra loja.")
  }
  if (s(serie.modelo) !== s(nota.modelo)) {
    return err("modelo_incompativel", "A série fiscal não é compatível com o modelo da NotaFiscal.")
  }
  if (s(serie.ambiente) !== s(nota.ambiente)) {
    return err("ambiente_incompativel", "A série fiscal não é compatível com o ambiente da NotaFiscal.")
  }
  if (serie.ativo === false) {
    return err("serie_inativa", "A série fiscal está inativa.")
  }
  if (!Number.isSafeInteger(serie.serie) || serie.serie < 0 || (nota.serie != null && serie.serie !== nota.serie)) {
    return err("serie_invalida", "A série fiscal resolvida é inválida ou diverge da série da NotaFiscal.")
  }
  if (serie.proximoNumero != null) {
    if (!Number.isSafeInteger(serie.proximoNumero) || serie.proximoNumero < FISCAL_NUMERO_MINIMO) {
      return err("sequencia_invalida", "O próximo número fiscal deve ser inteiro e maior ou igual a 1.")
    }
    if (serie.proximoNumero > FISCAL_NUMERO_MAXIMO) {
      return err("sequencia_esgotada", "A série fiscal atingiu o limite de 999.999.999.")
    }
  }

  let ultimaMensagem = "Falha ao vincular o número fiscal à NotaFiscal."
  let ultimoConflito: FiscalNumberingErrorCode = "conflito_persistente"
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    // RESERVA atômica, revalidando a chave completa e o limite no mesmo UPDATE.
    const reserva = await ports.reserveNextNumber({
      serieFiscalId: serie.id,
      storeId,
      modelo: nota.modelo,
      ambiente: nota.ambiente,
      serie: serie.serie,
    })
    if (isReservationFailure(reserva)) {
      ultimaMensagem = reserva.mensagem
      ultimoConflito = reserva.errorCode
      if (reserva.retryable) continue
      return err(reserva.errorCode, reserva.mensagem)
    }
    if (
      reserva.serieFiscalId !== serie.id ||
      reserva.serie !== serie.serie ||
      !numeroFiscalValido(reserva.numero)
    ) {
      const lacunas = numeroFiscalValido(reserva.numero)
        ? [gapFromReservation(nota, reserva, "bind_falhou")]
        : []
      return err("reserva_falhou", "A reserva retornou contexto ou número fiscal inválido.", lacunas)
    }

    const bind = await ports.bindNotaNumero({
      notaFiscalId,
      storeId,
      modelo: nota.modelo,
      ambiente: nota.ambiente,
      serieFiscalId: serie.id,
      serie: reserva.serie,
      numero: reserva.numero,
    })

    if (bind.ok) {
      return {
        ok: true,
        reused: false,
        storeId,
        notaFiscalId,
        localKey: nota.localKey ?? null,
        serieFiscalId: serie.id,
        serie: reserva.serie,
        numero: reserva.numero,
        modelo: nota.modelo,
        ambiente: nota.ambiente,
        lacunas: [],
      }
    }

    ultimaMensagem = s(bind.mensagem) || ultimaMensagem
    // Outra chamada pode ter vencido o CAS da mesma nota. Converge para o valor persistido;
    // a reserva desta chamada permanece consumida e é reportada como lacuna.
    const notaDepoisDoBind = await ports.getNota({ storeId, notaFiscalId })
    if (notaDepoisDoBind) {
      const mesmaReserva =
        notaDepoisDoBind.numero === reserva.numero &&
        notaDepoisDoBind.serie === reserva.serie &&
        notaDepoisDoBind.serieFiscalId === reserva.serieFiscalId
      const lacunas = mesmaReserva
        ? []
        : [gapFromReservation(nota, reserva, "nota_ja_numerada")]
      const concorrente = allocationFromNumberedNota(notaDepoisDoBind, true, lacunas)
      if (concorrente?.ok) return concorrente
    }

    if (!bind.conflito) {
      // Falha não-conflito: o número já foi reservado (queimado) e NÃO será reutilizado.
      return err("bind_falhou", ultimaMensagem, [gapFromReservation(nota, reserva, "bind_falhou")])
    }
    // Conflito de numeração: o número fica queimado; tenta o próximo (retry controlado).
  }

  return err(
    ultimoConflito === "reserva_conflito" ? "conflito_persistente" : ultimoConflito,
    `Conflito de numeração após ${maxTentativas} tentativa(s): ${ultimaMensagem}`,
  )
}
