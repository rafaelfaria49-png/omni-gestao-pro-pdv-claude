/**
 * Contagem do dinheiro físico da gaveta por cédulas e moedas (Fechamento de Caixa).
 *
 * Aritmética em CENTAVOS (sem erro de ponto flutuante) + rascunho da contagem escopado por
 * loja + sessão de caixa — GOAL CAIXA-FECHAMENTO-CALCULADORA-MODAL-PREMIUM-005. Puro, sem
 * React: o storage é injetado, então o rascunho é testável e nunca derruba a tela.
 */
import type { DinheiroContadoDetalhado } from "@/lib/caixa-fechamento-resumo"

export interface DenominacaoContagem {
  centavos: number
  tipo: "cedula" | "moeda"
  /** Pouco usada (R$ 0,01) — renderizada com menos destaque. */
  discreta?: boolean
}

/** Denominações do Real, da maior para a menor. A ordem é também a ordem de foco. */
export const DENOMINACOES_CONTAGEM: readonly DenominacaoContagem[] = [
  { centavos: 20000, tipo: "cedula" },
  { centavos: 10000, tipo: "cedula" },
  { centavos: 5000, tipo: "cedula" },
  { centavos: 2000, tipo: "cedula" },
  { centavos: 1000, tipo: "cedula" },
  { centavos: 500, tipo: "cedula" },
  { centavos: 200, tipo: "cedula" },
  { centavos: 100, tipo: "moeda" },
  { centavos: 50, tipo: "moeda" },
  { centavos: 25, tipo: "moeda" },
  { centavos: 10, tipo: "moeda" },
  { centavos: 5, tipo: "moeda" },
  { centavos: 1, tipo: "moeda", discreta: true },
]

/** Quantidade digitada por denominação (chave = centavos). String para permitir campo vazio. */
export type QuantidadesContagem = Record<number, string>

/** Só dígitos → inteiro ≥ 0 sem zeros à esquerda; vazio permanece vazio (sem NaN, negativo ou decimal). */
export function sanitizarQuantidade(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  return digits === "" ? "" : String(parseInt(digits, 10))
}

export function quantidadeContagem(quantidades: QuantidadesContagem, centavos: number): number {
  const n = parseInt(quantidades[centavos] ?? "", 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Σ quantidade × denominação, em centavos. */
export function totalContagemCentavos(quantidades: QuantidadesContagem): number {
  return DENOMINACOES_CONTAGEM.reduce(
    (acc, d) => acc + d.centavos * quantidadeContagem(quantidades, d.centavos),
    0,
  )
}

/** Detalhamento enviado junto do "dinheiro contado" aplicado (metadado JSONB do fechamento). */
export function detalheContagem(quantidades: QuantidadesContagem): DinheiroContadoDetalhado {
  return {
    total: totalContagemCentavos(quantidades) / 100,
    denominacoes: DENOMINACOES_CONTAGEM.map((d) => {
      const quantidade = quantidadeContagem(quantidades, d.centavos)
      return { valor: d.centavos / 100, quantidade, subtotal: (d.centavos * quantidade) / 100 }
    }),
  }
}

/** Algum campo digitado (inclusive "0")? */
export function contagemPreenchida(quantidades: QuantidadesContagem): boolean {
  return Object.values(quantidades).some((q) => q !== "")
}

// ── Rascunho por sessão de caixa ──────────────────────────────────────────────

const PREFIXO_DRAFT = "omnigestao:caixa-count-draft"
const VERSAO_DRAFT = 1

export type StorageContagem = Pick<Storage, "getItem" | "setItem" | "removeItem">

export interface IdentidadeSessaoContagem {
  storeId: string | null | undefined
  sessaoId: string | null | undefined
  /** Identidade de reserva para sessão legada sem `sessaoId`: a abertura local do caixa. */
  dataAbertura?: Date | null
}

/**
 * Chave do rascunho escopada por loja + sessão de caixa. Sem loja, ou sem sessão
 * identificável, não há rascunho persistido (`null`) — nunca uma chave global.
 */
export function chaveDraftContagem({ storeId, sessaoId, dataAbertura }: IdentidadeSessaoContagem): string | null {
  const loja = storeId?.trim()
  if (!loja) return null
  const sessao = sessaoId?.trim()
  if (sessao) return `${PREFIXO_DRAFT}:${loja}:${sessao}`
  const abertura = dataAbertura instanceof Date ? dataAbertura.getTime() : Number.NaN
  return Number.isFinite(abertura) ? `${PREFIXO_DRAFT}:${loja}:abertura-${abertura}` : null
}

/** `sessionStorage` do navegador, ou `null` (SSR, storage bloqueado pela política do navegador). */
export function sessionStorageContagem(): StorageContagem | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** Lê o rascunho da sessão; dado ausente, corrompido ou de outra versão vira contagem vazia. */
export function lerDraftContagem(storage: StorageContagem | null, chave: string | null): QuantidadesContagem {
  if (!storage || !chave) return {}
  try {
    const raw = storage.getItem(chave)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return {}
    const { v, quantidades } = parsed as { v?: unknown; quantidades?: unknown }
    if (v !== VERSAO_DRAFT || !quantidades || typeof quantidades !== "object") return {}
    const out: QuantidadesContagem = {}
    for (const d of DENOMINACOES_CONTAGEM) {
      const q = (quantidades as Record<string, unknown>)[String(d.centavos)]
      if (typeof q !== "string") continue
      const norm = sanitizarQuantidade(q)
      if (norm !== "") out[d.centavos] = norm
    }
    return out
  } catch {
    return {}
  }
}

/** Grava o rascunho da sessão; contagem sem nenhum campo digitado apaga a chave. */
export function salvarDraftContagem(
  storage: StorageContagem | null,
  chave: string | null,
  quantidades: QuantidadesContagem,
): void {
  if (!storage || !chave) return
  try {
    if (!contagemPreenchida(quantidades)) {
      storage.removeItem(chave)
      return
    }
    storage.setItem(chave, JSON.stringify({ v: VERSAO_DRAFT, quantidades }))
  } catch {
    /* quota/política do navegador — a contagem segue em memória */
  }
}

export function limparDraftContagem(storage: StorageContagem | null, chave: string | null): void {
  if (!storage || !chave) return
  try {
    storage.removeItem(chave)
  } catch {
    /* idem */
  }
}
