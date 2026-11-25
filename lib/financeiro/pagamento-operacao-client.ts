/** Somente recibo local da intenção; dinheiro/histórico persistem no servidor. */
type Armazenamento = Pick<Storage, "getItem" | "setItem" | "removeItem">
type Trava = <T>(nome: string, executar: () => Promise<T>) => Promise<T>
export type PagamentoPendenteInput = {
  principalId: string
  storeId: string
  canal: "financeiro" | "pdv"
  tipo: "pagar" | "receber"
  referencia: string
  op: "parcial" | "liquidar"
  sessaoId?: string
  pedido: Record<string, unknown>
}
type ReciboLocal = { v: 1; operacaoId: string; pedidoHash: string; principalHash: string; sessaoId?: string }
function objeto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}
/** Limites conhecidos dos três handlers; não reserva uma intenção nova inválida. */
function validarPedido(input: PagamentoPendenteInput) {
  const p = input.pedido
  const texto = (v: unknown, max: number, min = 0) => v === undefined || (typeof v === "string" && v.length >= min && v.length <= max)
  if (p.op !== input.op || !texto(p.localKey, 260, 1) || !texto(p.observacao, 2000)
    || !texto(p.lojaId, 120) || !texto(p.formaPagamento, input.canal === "pdv" ? 120 : 80)
    || (input.canal === "pdv" && (!texto(p.sessaoId, 120, 1) || !input.sessaoId || input.sessaoId.length > 120))
    || (input.op === "parcial" && (typeof p.valor !== "number" || !Number.isFinite(p.valor) || p.valor <= 0
      || (input.canal === "pdv" && p.valor > 1e12)))) {
    throw new Error("Dados do pagamento inválidos. Confira o valor e os campos antes de enviar.")
  }
}
async function hash(texto: string) {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, "0")).join("")
}
const travaBrowser: Trava = (nome, executar) => {
  if (typeof navigator === "undefined" || !navigator.locks) throw new Error("Não foi possível preparar o pagamento com segurança. Atualize a página e tente novamente.")
  return navigator.locks.request(nome, executar)
}
function ler(storage: Armazenamento, chave: string): ReciboLocal | null {
  const raw = storage.getItem(chave)
  if (raw === null) return null
  const data: unknown = JSON.parse(raw)
  if (!objeto(data) || data.v !== 1 || typeof data.operacaoId !== "string" || !data.operacaoId
    || typeof data.pedidoHash !== "string" || typeof data.principalHash !== "string"
    || (data.sessaoId !== undefined && (typeof data.sessaoId !== "string" || !data.sessaoId))) {
    throw new Error("Há uma confirmação pendente que não pôde ser lida. Confira o histórico antes de enviar outro pagamento.")
  }
  return { v: 1, operacaoId: data.operacaoId, pedidoHash: data.pedidoHash, principalHash: data.principalHash,
    ...(typeof data.sessaoId === "string" ? { sessaoId: data.sessaoId } : {}),
  }
}

/** Identificador de cache, nunca autoridade: os guards do servidor continuam obrigatórios. */
export async function principalPagamentoBrowser(): Promise<string> {
  const res = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
  if (!res.ok) throw new Error("Não foi possível confirmar sua sessão. Tente novamente.")
  const json: unknown = await res.json()
  if (objeto(json) && objeto(json.user) && typeof json.user.id === "string" && json.user.id.trim()) return `usuario:${json.user.id}`
  // Mantém o ingresso administrativo legado existente; não inventa AdminUser nem loja.
  if (json === null || (objeto(json) && Object.keys(json).length === 0)) return "admin-legado"
  throw new Error("Não foi possível confirmar sua sessão. Tente novamente.")
}

/**
 * Reserva sob Web Lock (também entre abas), libera antes da rede e só remove após
 * ACK da mesma identidade. Reabrir a tela/recarregar não transforma retry em nova
 * intenção. O armazenamento contém UUID/hashes, sem payload financeiro ou credencial.
 * `ambiente` permite ensaiar o contrato do browser sem simular persistência financeira.
 */
export async function executarPagamentoPendente(
  input: PagamentoPendenteInput,
  enviar: (operacaoId: string, sessaoOriginal?: string) => Promise<Response>,
  ambiente?: { storage: Armazenamento; trava: Trava },
): Promise<Record<string, unknown>> {
  if (!input.storeId.trim() || !input.principalId.trim() || !input.referencia.trim() || (input.canal === "pdv" && !input.sessaoId)) {
    throw new Error("Selecione a unidade e confirme sua sessão antes de pagar.")
  }
  validarPedido(input)
  const storage = ambiente?.storage ?? window.localStorage
  const trava = ambiente?.trava ?? travaBrowser
  const chave = `omni:financeiro:pagamento:v1:${await hash(JSON.stringify([input.storeId, input.canal, input.tipo, input.referencia, input.op]))}`
  const pedido = JSON.stringify(Object.fromEntries(Object.entries(input.pedido).filter(([k, v]) => v !== undefined && !(input.canal === "pdv" && k === "sessaoId")).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))
  const pedidoHash = await hash(pedido), principalHash = await hash(input.principalId)
  const pendente = await trava(chave, async () => {
    const atual = ler(storage, chave)
    if (atual) {
      if (input.canal === "pdv" && !atual.sessaoId) throw new Error("Não foi possível recuperar a sessão do pagamento pendente. Confira o histórico antes de pagar novamente.")
      if (atual.principalHash !== principalHash) throw new Error("Há uma confirmação pendente de outra sessão neste navegador. Conclua-a na conta original.")
      if (atual.pedidoHash !== pedidoHash) throw new Error("Há uma confirmação pendente deste título com outros dados. Reenvie os dados originais antes de registrar outro pagamento.")
      return atual
    }
    const novo: ReciboLocal = { v: 1, operacaoId: globalThis.crypto.randomUUID(), pedidoHash, principalHash,
      ...(input.canal === "pdv" ? { sessaoId: input.sessaoId } : {}),
    }
    storage.setItem(chave, JSON.stringify(novo)) // Falha impede o envio; sem fallback volátil.
    return novo
  })
  const remover = () => trava(chave, async () => {
    if (ler(storage, chave)?.operacaoId === pendente.operacaoId) storage.removeItem(chave)
  })
  const response = await enviar(pendente.operacaoId, pendente.sessaoId)
  const json: unknown = await response.json() // JSON/resposta perdida conserva a chave.
  if (!objeto(json)) throw new Error("Não foi possível confirmar o pagamento. Reenvie a mesma operação.")
  if (!response.ok || json.ok !== true) {
    if (json.operacaoId === pendente.operacaoId && json.operacaoRejeitada === true && response.status >= 400 && response.status < 500) await remover()
    throw new Error(typeof json.error === "string" ? json.error : "Não foi possível confirmar o pagamento. Reenvie a mesma operação.")
  }
  if (json.operacaoId !== pendente.operacaoId) throw new Error("Não foi possível confirmar a identidade do pagamento. Reenvie a mesma operação.")
  try { await remover() }
  catch { throw new Error("Pagamento confirmado. Não envie outro pagamento; atualize a página para concluir a confirmação.") }
  return json
}
