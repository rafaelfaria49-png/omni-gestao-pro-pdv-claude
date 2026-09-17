/**
 * Elegibilidade da SESSÃO DE CAIXA para o estorno simples —
 * GOAL CAIXA-CONFERENCIA-VENDAS-ACOES-REAIS-007B (INVARIANTE 3).
 *
 * O estorno deste fluxo não cria `CaixaOperacao` negativa: ele reconcilia a gaveta
 * porque a venda cancelada sai dos agregados do fechamento
 * (`computeFechamentoResumo` filtra `status !== "cancelada"`). Essa aritmética só
 * fecha enquanto a venda pertence à sessão que está sendo conferida.
 *
 * Numa venda de sessão JÁ FECHADA o mesmo caminho produz o oposto: a saída financeira
 * nasce hoje, o snapshot histórico não é reescrito (e nem deve ser), e o fechamento de
 * hoje não conhece essa venda — então o dinheiro sai da gaveta sem o esperado cair.
 * Bloquear é a única resposta correta dentro deste GOAL; "estorno retroativo" é
 * explicitamente fora de escopo.
 *
 * Função PURA: recebe o estado já lido do banco e decide. Sem Prisma, sem React.
 */

/** Status da sessão como vem de `SessaoCaixa.status`. */
export type SessaoEstado = { status: string | null | undefined } | null

export const ESTORNO_BLOQUEIO_SESSAO_FECHADA =
  "Esta venda pertence a uma sessão de caixa já fechada. O estorno por aqui deixaria o caixa de hoje sem contrapartida — trate pelo Financeiro."

export const ESTORNO_BLOQUEIO_SESSAO_CODE = "sessao_fechada"

export type SessaoEstornoVeredito =
  | { bloqueado: false; motivoPermissao: "sessao_aberta" | "sem_vinculo_de_sessao" }
  | { bloqueado: true; motivo: string; code: string }

/**
 * Decide a partir do vínculo de sessão da venda.
 *
 * POLÍTICA PARA VENDA SEM `sessaoId` (documentada, não inventada): libera.
 *
 * A Conferência resolve as vendas da sessão por `payload.sessaoId` e, em sessões
 * legadas, por janela de tempo + terminal (`escolherEscopoVendas`). Uma venda anterior
 * ao vínculo aparece legitimamente na conferência da sessão aberta e não tem `sessaoId`
 * para provar nada. Bloquear por ausência puniria essas vendas legítimas; e a ausência
 * NÃO é evidência de sessão fechada. Inventar um vínculo por proximidade de horário
 * seria pior: decisão financeira sobre um palpite.
 *
 * Então o contrato é estrito no que dá para provar — sessão encontrada e FECHADA
 * bloqueia — e honesto onde não dá. `motivoPermissao` deixa os dois casos distinguíveis
 * em log e em teste, para a política não virar silêncio.
 */
export function avaliarSessaoParaEstorno(input: {
  /** `payload.sessaoId` da venda. Ausente/vazio = venda sem vínculo. */
  sessaoId: string | null | undefined
  /** Linha de `SessaoCaixa` já carregada, ou `null` se não existir. */
  sessao: SessaoEstado
}): SessaoEstornoVeredito {
  const id = (input.sessaoId ?? "").trim()
  if (!id) return { bloqueado: false, motivoPermissao: "sem_vinculo_de_sessao" }

  // Vínculo aponta para sessão inexistente (apagada/outra loja): não é prova de
  // fechamento, e a query já é escopada por loja. Mesmo tratamento do sem-vínculo.
  if (!input.sessao) return { bloqueado: false, motivoPermissao: "sem_vinculo_de_sessao" }

  const status = (input.sessao.status ?? "").trim().toUpperCase()
  if (status === "FECHADA") {
    return {
      bloqueado: true,
      motivo: ESTORNO_BLOQUEIO_SESSAO_FECHADA,
      code: ESTORNO_BLOQUEIO_SESSAO_CODE,
    }
  }
  return { bloqueado: false, motivoPermissao: "sessao_aberta" }
}
