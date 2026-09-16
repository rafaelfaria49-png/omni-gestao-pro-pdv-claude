/**
 * Política das ações de venda na Conferência do Fechamento de Caixa.
 *
 * GOAL CAIXA-CONFERENCIA-VENDAS-ACOES-REAIS-007 (§26/§27): o menu ⋮ deixa de mostrar
 * "Em breve". Cada ação ou está LIGADA a backend real, ou aparece desabilitada com a
 * razão REAL — nunca um rótulo de promessa.
 *
 * Função pura, sem React: o estado do menu é derivado de dados, não de `useState`.
 *
 * ── Por que Troca e Devolução ficam bloqueadas AQUI ────────────────────────────
 * Não é falta de backend: `TrocasDevolucao` + `POST /api/ops/devolucao` são reais e
 * continuam disponíveis no PDV (F8). O bloqueio é do CONTEXTO: a Conferência é a tela
 * em que o operador está contando a gaveta, e uma devolução paga em dinheiro tira
 * dinheiro dessa mesma gaveta SEM que o fechamento consiga recalcular o esperado —
 * `DevolucaoVenda` não persiste a forma de pagamento do reembolso e
 * `aggregateCaixaOperacoes` (lib/caixa-fechamento-resumo.ts) não tem ramo `devolucao`.
 * Ligar o botão aqui produziria uma quebra de caixa falsa do valor devolvido. Fechar
 * essa lacuna exige campo novo em `DevolucaoVenda` → migration → fora do escopo
 * protegido do GOAL (§35). Documentado em `ACAO_BLOQUEADA_POS_VENDA`.
 *
 * ── Por que "Estornar" e não "Cancelar" ───────────────────────────────────────
 * O domínio tem UM conceito de reversão de venda: `POST /api/vendas/[id]/cancelar`,
 * que repõe estoque, estorna o ledger, cancela/estorna os títulos a receber e
 * restaura o vale consumido. Não existe um segundo conceito "cancelar" distinto —
 * exibir duas opções seria redundância inventada (§12: CANCEL_AND_REVERSAL_DISTINCT=NO).
 */

import { ESTORNO_BLOQUEIO_RECEBIVEL_QUITADO } from "@/lib/vendas/estorno-recebivel-guard"

export type AcaoVendaKey =
  | "detalhes"
  | "historico"
  | "reimprimir"
  | "copiar"
  | "troca"
  | "devolucao"
  | "estorno"

export type AcaoVendaEstado = {
  habilitada: boolean
  /** Razão real da desabilitação — exibida no menu. Ausente quando habilitada. */
  motivo?: string
}

/**
 * Estados de `Venda.fiscalStatus` que impedem o cancelamento OPERACIONAL.
 *
 * Espelho de leitura do gate autoritativo do servidor
 * (`canCancelarOperacionalmente` em `lib/fiscal/venda-fiscal-state-machine.ts`), mantido
 * como string literal para não arrastar o enum runtime do Prisma para o bundle do
 * cliente. O servidor continua sendo a autoridade: mesmo que esta lista divirja, o POST
 * recusa com 409. `conferencia-acoes.static.test.ts` trava as duas listas juntas.
 */
export const FISCAL_BLOQUEIA_ESTORNO: readonly string[] = [
  "EMITINDO",
  "AUTORIZADA",
  "EM_CONTINGENCIA",
  "CANCELADA_FISCAL",
  "BLOQUEADA_FISCAL",
] as const

export const ACAO_BLOQUEADA_POS_VENDA =
  "Indisponível durante a contagem: o reembolso altera a gaveta e o fechamento ainda não recalcula esse valor. Use Troca/Devolução no PDV."

export const ACAO_BLOQUEADA_JA_ESTORNADA = "Venda já estornada"
export const ACAO_BLOQUEADA_SESSAO_FECHADA = "Sessão de caixa já fechada"
export const ACAO_BLOQUEADA_NAO_SINCRONIZADA = "Venda ainda não sincronizada com o servidor"
export const ACAO_BLOQUEADA_FISCAL = "Documento fiscal emitido — use o fluxo fiscal apropriado"
/**
 * Recebível já quitado (GOAL 007A · BLOCKER-2). O texto é o MESMO que o servidor
 * devolve em `estorno-recebivel-guard`, para a razão no menu e a razão do 409 não
 * divergirem.
 */
export const ACAO_BLOQUEADA_RECEBIVEL_QUITADO = ESTORNO_BLOQUEIO_RECEBIVEL_QUITADO

export type AvaliarAcoesInput = {
  /** `Venda.status`: concluida | cancelada | parcialmente_devolvida | devolvida. */
  status: string | null | undefined
  /** `Venda.fiscalStatus`. Ausente (sessão legada) = trata como não fiscal. */
  fiscalStatus?: string | null
  /**
   * A linha veio do servidor (`sessao-detalhe`) e não do fallback local. Venda que só
   * existe no localStorage não tem detalhe, comprovante nem estorno server-side.
   */
  servidorConfirmada: boolean
  /** A sessão de caixa desta conferência ainda está aberta. */
  sessaoAberta: boolean
  /**
   * A venda tem Conta a Receber já quitada. Vem agregado de `sessao-detalhe` (uma
   * consulta para a lista inteira) — nunca de um fetch por linha do menu.
   */
  recebivelQuitado?: boolean
}

const BLOQUEADA: AcaoVendaEstado = { habilitada: false, motivo: ACAO_BLOQUEADA_POS_VENDA }

/**
 * Estado de cada item do menu ⋮ para UMA venda.
 *
 * Consulta (detalhes/histórico/reimprimir/copiar) nunca pede autorização nova e só cai
 * quando a venda não existe no servidor. Estorno é destrutivo: exige motivo e step-up
 * do supervisor na camada de UI, e aqui só decide se pode ser OFERECIDO.
 */
export function avaliarAcoesVenda(input: AvaliarAcoesInput): Record<AcaoVendaKey, AcaoVendaEstado> {
  const status = (input.status ?? "").trim().toLowerCase()
  const fiscal = (input.fiscalStatus ?? "").trim().toUpperCase()
  const jaEstornada = status === "cancelada"
  const semServidor = !input.servidorConfirmada
  const fiscalBloqueia = FISCAL_BLOQUEIA_ESTORNO.includes(fiscal)

  const consulta: AcaoVendaEstado = semServidor
    ? { habilitada: false, motivo: ACAO_BLOQUEADA_NAO_SINCRONIZADA }
    : { habilitada: true }

  // Ordem de precedência: o motivo mostrado é o primeiro bloqueio que se aplica —
  // do mais estrutural (não existe no servidor) ao mais circunstancial (sessão).
  const estorno: AcaoVendaEstado = semServidor
    ? { habilitada: false, motivo: ACAO_BLOQUEADA_NAO_SINCRONIZADA }
    : jaEstornada
      ? { habilitada: false, motivo: ACAO_BLOQUEADA_JA_ESTORNADA }
      : fiscalBloqueia
        ? { habilitada: false, motivo: ACAO_BLOQUEADA_FISCAL }
        : input.recebivelQuitado === true
          ? { habilitada: false, motivo: ACAO_BLOQUEADA_RECEBIVEL_QUITADO }
          : !input.sessaoAberta
            ? { habilitada: false, motivo: ACAO_BLOQUEADA_SESSAO_FECHADA }
            : { habilitada: true }

  return {
    detalhes: consulta,
    historico: consulta,
    reimprimir: consulta,
    // Copiar o número é offline e vale inclusive para a venda ainda pendente —
    // é justamente o dado que o operador precisa para tratar o caso no atendimento.
    copiar: { habilitada: true },
    troca: BLOQUEADA,
    devolucao: BLOQUEADA,
    estorno,
  }
}

/**
 * Motivo obrigatório do estorno.
 *
 * O servidor (`POST /api/vendas/[id]/cancelar`) exige apenas motivo NÃO VAZIO — esse é
 * o padrão do projeto e continua valendo. Este mínimo é um guard adicional só desta
 * porta: aqui o estorno é co-assinado por supervisor e o motivo vai para a trilha de
 * auditoria, então "x" não serve como justificativa. Não relaxa nada no servidor.
 */
export const MOTIVO_MIN_CARACTERES = 5

export function motivoEstornoValido(motivo: string): boolean {
  return motivo.trim().length >= MOTIVO_MIN_CARACTERES
}
