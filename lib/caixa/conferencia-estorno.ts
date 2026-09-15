/**
 * Estorno de venda a partir da Conferência do Fechamento — GOAL
 * CAIXA-CONFERENCIA-VENDAS-ACOES-REAIS-007 (§10, §19, §24, §25).
 *
 * NÃO é um motor novo. Chama `POST /api/vendas/[id]/cancelar`, que já é o ÚNICO
 * mecanismo de reversão de venda do domínio e faz, numa transação:
 *   - repõe o estoque LÍQUIDO (vendido − já devolvido), com ledger `MovimentacaoEstoque`;
 *   - cria a saída financeira `cancelamento_pdv` pelo valor líquido já recebido;
 *   - estorna e cancela os títulos a receber `pdv-aprazo-<pedido>*` (N parcelas);
 *   - restaura o crédito/vale consumido (`UsoCreditoCliente` → `ClienteCredito`);
 *   - aplica o gate fiscal (`assertVendaFiscalCancelavel`) e o de período fechado.
 *
 * O que ESTA camada acrescenta (e o Histórico de Vendas não tinha):
 *   - step-up de supervisor obrigatório ANTES do POST, com o autorizador registrado;
 *   - motivo obrigatório com mínimo coerente;
 *   - idempotência de UI: um POST em voo por vez, e `409 já cancelada` tratado como
 *     resultado terminal e não como erro (duplo clique / retry / refresh).
 *
 * Reconciliação com a gaveta: a venda estornada passa a `status = "cancelada"`, e
 * `computeFechamentoResumo` exclui venda cancelada de TODOS os totais. Como a
 * Conferência só lista vendas da sessão ABERTA, o dinheiro que sai da gaveta é
 * exatamente a parcela em dinheiro que deixa de ser contada no esperado. Por isso o
 * chamador precisa recarregar o resumo depois do sucesso (§22).
 */

export type EstornoVendaInput = {
  pedidoId: string
  storeId: string
  motivo: string
  /** Rótulo do operador que executa (não é o autorizador). */
  operador: string
  /** Nome do supervisor que co-assinou o step-up. Vai para a trilha de auditoria. */
  autorizadoPor: string
  /** Segunda confirmação: a venda tem devoluções vinculadas e o operador confirmou. */
  forcar?: boolean
}

export type EstornoVendaResult =
  | { status: "estornada"; pedidoId: string; estoqueReposto: number; estornoFinanceiro: boolean }
  /** A venda já estava cancelada — estado final desejado, não é erro. */
  | { status: "ja_estornada"; pedidoId: string }
  /** Há devoluções vinculadas: precisa de confirmação explícita (`forcar`). */
  | { status: "require_confirm"; devolucoes: number }
  | { status: "in_flight" }
  | { status: "erro"; error: string; code?: string; httpStatus?: number }

function lerMensagem(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error?: unknown }).error
    if (typeof e === "string" && e.trim()) return e.trim()
  }
  return fallback
}

function lerCodigo(body: unknown): string | undefined {
  if (body && typeof body === "object" && "code" in body) {
    const c = (body as { code?: unknown }).code
    if (typeof c === "string" && c.trim()) return c.trim()
  }
  return undefined
}

function lerNumero(body: unknown, chave: string): number {
  if (body && typeof body === "object" && chave in body) {
    const v = (body as Record<string, unknown>)[chave]
    if (typeof v === "number" && Number.isFinite(v)) return v
  }
  return 0
}

/**
 * Executa o estorno. `inFlight` é um ref compartilhado pelo chamador: enquanto um POST
 * estiver em voo, chamadas novas retornam `in_flight` sem tocar a rede — é o que impede
 * duplo estorno por duplo clique. O servidor tem as próprias guardas de idempotência
 * (409 para venda já cancelada, `findFirst` por documento antes de repor estoque e de
 * criar a saída financeira), então um retry após timeout também não duplica efeito.
 */
export async function estornarVendaConferencia(
  input: EstornoVendaInput,
  inFlight: { current: boolean },
  deps?: { fetch?: typeof fetch },
): Promise<EstornoVendaResult> {
  const pedidoId = input.pedidoId.trim()
  const motivo = input.motivo.trim()
  if (!pedidoId || !motivo) {
    return { status: "erro", error: "Informe o motivo do estorno." }
  }
  if (inFlight.current) return { status: "in_flight" }
  inFlight.current = true

  const fetchFn = deps?.fetch ?? globalThis.fetch
  try {
    const res = await fetchFn(`/api/vendas/${encodeURIComponent(pedidoId)}/cancelar`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-assistec-loja-id": input.storeId,
      },
      body: JSON.stringify({
        // O servidor grava `canceladaPor`; a trilha completa (operador + autorizador)
        // vai no motivo para não depender de coluna que o schema não tem.
        motivo: `${motivo} [autorizado por ${input.autorizadoPor}]`,
        canceladaPor: input.operador || "Operador",
        forcar: input.forcar === true,
      }),
    })

    let data: unknown = null
    try {
      data = await res.json()
    } catch {
      data = null
    }
    const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : null

    if (payload?.ok === true) {
      return {
        status: "estornada",
        pedidoId,
        estoqueReposto: lerNumero(payload, "estoqueReposto"),
        estornoFinanceiro: payload.estornoFinanceiro === true,
      }
    }

    if (res.status === 409 && payload?.requireConfirm === true && input.forcar !== true) {
      return { status: "require_confirm", devolucoes: lerNumero(payload, "devolucoes") }
    }

    // Já cancelada: o efeito desejado já está no banco. Tratar como erro faria o
    // operador tentar de novo por nada — e um duplo clique acabaria sempre em alerta.
    if (res.status === 409 && /já foi cancelada/i.test(lerMensagem(payload, ""))) {
      return { status: "ja_estornada", pedidoId }
    }

    return {
      status: "erro",
      error: lerMensagem(payload, "Falha ao estornar a venda."),
      code: lerCodigo(payload),
      httpStatus: res.status,
    }
  } catch {
    return { status: "erro", error: "Falha ao estornar a venda. Verifique a conexão." }
  } finally {
    inFlight.current = false
  }
}
