/**
 * Cliente HTTP do recebimento no Financeiro HUB (`POST /api/financeiro/receber-lote`) e
 * da 2ª via (`GET /api/financeiro/recibo-recebimento`). Módulo puro (sem React).
 *
 * Leitura honesta da resposta:
 *  - `ok`        → o servidor CONFIRMOU; só aqui a UI mostra sucesso e oferece comprovante;
 *  - `recusado`  → desfecho definitivo (validação, conflito, período fechado, permissão):
 *                  a próxima tentativa nasce com chave nova;
 *  - `incerto`   → rede/timeout/5xx sem corpo confiável: pode ter gravado. A UI mantém a
 *                  MESMA chave para o retry, que vira replay em vez de segunda baixa.
 */
import { normalizeNomeCliente } from "@/lib/contas-receber-cliente-match"

export type RecebimentoHubItemPedido = {
  localKey: string
  saldoEsperado: number
  valorReceber: number
}

export type RecebimentoHubPedido = {
  formaPagamento: string
  observacao?: string
  idempotencyKey: string
  itens: RecebimentoHubItemPedido[]
}

export type RecebimentoHubResultado = {
  jaRegistrado: boolean
  operacaoId: string
  recebidoEm: string
  cliente: string
  formaPagamento: string
  totalRecebido: number
  itens: Array<{ localKey: string; descricao: string; saldoAntes: number; valorRecebido: number; saldoDepois: number; statusFinal: string }>
  saldoDevedorCliente: number | null
}

export type EnvioRecebimentoHub =
  | { kind: "ok"; resultado: RecebimentoHubResultado }
  | { kind: "recusado"; status: number; code: string; mensagem: string }
  | { kind: "incerto"; mensagem: string }

const MSG_INCERTO =
  "Não deu para confirmar o recebimento (conexão ou servidor). Tente de novo — a mesma operação não será duplicada."

export function mensagemRecusaRecebimento(status: number, code: string, serverMsg?: string): string {
  switch (code) {
    case "saldo_divergente":
    case "titulo_alterado":
      return "O título mudou desde que a tela carregou (outra baixa ou estorno). Atualizei a lista — confira e receba de novo."
    case "cliente_divergente":
      return "Os títulos não pertencem comprovadamente ao mesmo cliente (homônimo ou sem vínculo). Receba título a título."
    case "periodo_fechado":
      return "Período financeiro fechado. Reabra o fechamento para receber."
    case "idempotency_conflict":
      return "Esta tentativa já foi usada com outros valores. Atualize a lista e receba de novo."
    case "movimentacao_financeira_falhou":
      return "A movimentação financeira não pôde ser lançada — nada foi gravado. Tente de novo."
    default:
      break
  }
  if (status === 401) return "Sessão expirada. Entre novamente."
  if (status === 403) return "Sem permissão para receber contas nesta loja."
  return serverMsg?.trim() || `Recebimento recusado (HTTP ${status}).`
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function parseResultado(j: Record<string, unknown>): RecebimentoHubResultado | null {
  const itensRaw = Array.isArray(j.itens) ? j.itens : null
  const operacaoId = typeof j.operacaoId === "string" ? j.operacaoId : ""
  if (!itensRaw || itensRaw.length === 0 || !operacaoId) return null
  return {
    jaRegistrado: j.jaRegistrado === true,
    operacaoId,
    recebidoEm: typeof j.recebidoEm === "string" ? j.recebidoEm : new Date().toISOString(),
    cliente: typeof j.cliente === "string" ? j.cliente : "—",
    formaPagamento: typeof j.formaPagamento === "string" ? j.formaPagamento : "",
    totalRecebido: num(j.totalRecebido),
    itens: itensRaw.map((raw) => {
      const i = (raw ?? {}) as Record<string, unknown>
      return {
        localKey: String(i.localKey ?? ""),
        descricao: String(i.descricao ?? "Título"),
        saldoAntes: num(i.saldoAntes),
        valorRecebido: num(i.valorRecebido),
        saldoDepois: num(i.saldoDepois),
        statusFinal: String(i.statusFinal ?? ""),
      }
    }),
    saldoDevedorCliente: j.saldoDevedorCliente == null ? null : num(j.saldoDevedorCliente),
  }
}

export async function enviarRecebimentoHub(params: {
  fetchImpl: typeof fetch
  storeId: string
  lojaHeader: string
  pedido: RecebimentoHubPedido
}): Promise<EnvioRecebimentoHub> {
  let res: Response
  try {
    res = await semThis(params.fetchImpl)("/api/financeiro/receber-lote", {
      method: "POST",
      headers: { "content-type": "application/json", [params.lojaHeader]: params.storeId },
      body: JSON.stringify({ lojaId: params.storeId, ...params.pedido }),
      credentials: "include",
      cache: "no-store",
    })
  } catch {
    return { kind: "incerto", mensagem: MSG_INCERTO }
  }
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (res.ok && j && j.ok === true) {
    const resultado = parseResultado(j)
    // 200 sem corpo coerente: o servidor pode ter gravado — tratar como incerto, nunca sucesso.
    return resultado ? { kind: "ok", resultado } : { kind: "incerto", mensagem: MSG_INCERTO }
  }
  const code = j && typeof j.code === "string" ? j.code : ""
  // 5xx genérico (sem código de domínio) = desfecho desconhecido: retry com a MESMA chave.
  if (res.status >= 500 && code !== "movimentacao_financeira_falhou") return { kind: "incerto", mensagem: MSG_INCERTO }
  const serverMsg = j && typeof j.error === "string" ? j.error : undefined
  return { kind: "recusado", status: res.status, code, mensagem: mensagemRecusaRecebimento(res.status, code, serverMsg) }
}

/**
 * Chave de AGRUPAMENTO por cliente no HUB. `Cliente.id` quando a origem gravou; senão o
 * nome normalizado — e, se esse nome é homônimo na loja, a chave fica marcada como
 * ambígua para a UI não juntar dívidas de pessoas diferentes.
 */
export function chaveClienteTitulo(
  conta: { clienteId?: string | null; cliente: string },
  nomesAmbiguos: ReadonlySet<string>,
): { chave: string; ambiguo: boolean } {
  const id = String(conta.clienteId ?? "").trim()
  if (id) return { chave: `id:${id}`, ambiguo: false }
  const nome = normalizeNomeCliente(conta.cliente)
  return { chave: `nome:${nome}`, ambiguo: !nome || nomesAmbiguos.has(nome) }
}

// ─── 2ª via ───────────────────────────────────────────────────────────────────

export type PagamentoTitulo = { index: number; loteId: string | null; valor: number; at: string | null; estornado: boolean }

export type ReciboSegundaVia = {
  operacaoId: string | null
  cliente: string
  recebidoEm: string | null
  formaPagamento: string | null
  itens: Array<{ localKey: string; descricao: string; valorRecebido: number; saldoRestante: number }>
  totalRecebido: number
}

export async function listarPagamentosTitulo(params: {
  fetchImpl: typeof fetch
  storeId: string
  lojaHeader: string
  localKey: string
}): Promise<{ ok: true; pagamentos: PagamentoTitulo[] } | { ok: false; mensagem: string }> {
  try {
    const res = await semThis(params.fetchImpl)(
      `/api/financeiro/recibo-recebimento?localKey=${encodeURIComponent(params.localKey)}`,
      { headers: { [params.lojaHeader]: params.storeId }, credentials: "include", cache: "no-store" },
    )
    const j = (await res.json().catch(() => null)) as { ok?: boolean; pagamentos?: PagamentoTitulo[]; error?: string } | null
    if (!res.ok || !j?.ok || !Array.isArray(j.pagamentos)) {
      return { ok: false, mensagem: j?.error || `Falha ao carregar pagamentos (HTTP ${res.status}).` }
    }
    return { ok: true, pagamentos: j.pagamentos }
  } catch {
    return { ok: false, mensagem: "Sem conexão com o servidor." }
  }
}

export async function buscarSegundaVia(params: {
  fetchImpl: typeof fetch
  storeId: string
  lojaHeader: string
  localKey: string
  index: number
}): Promise<{ ok: true; recibo: ReciboSegundaVia } | { ok: false; mensagem: string }> {
  try {
    const res = await semThis(params.fetchImpl)(
      `/api/financeiro/recibo-recebimento?localKey=${encodeURIComponent(params.localKey)}&index=${params.index}`,
      { headers: { [params.lojaHeader]: params.storeId }, credentials: "include", cache: "no-store" },
    )
    const j = (await res.json().catch(() => null)) as { ok?: boolean; recibo?: ReciboSegundaVia; error?: string } | null
    if (!res.ok || !j?.ok || !j.recibo) return { ok: false, mensagem: j?.error || `Falha ao montar o comprovante (HTTP ${res.status}).` }
    return { ok: true, recibo: j.recibo }
  } catch {
    return { ok: false, mensagem: "Sem conexão com o servidor." }
  }
}

/**
 * `window.fetch` exige `this === window` (ou indefinido): chamá-lo como `params.fetchImpl(...)`
 * lança "Illegal invocation" no navegador ANTES de qualquer requisição — invisível em node/jsdom.
 */
function semThis(f: typeof fetch): typeof fetch {
  return (input, init) => f.call(undefined, input, init)
}
