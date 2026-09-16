/**
 * Recebimentos da SESSÃO de caixa por ORIGEM e por FORMA
 * (GOAL CAIXA-FECHAMENTO-ORIGENS-PAGAMENTO-003A).
 *
 * Fonte: `CaixaOperacao` da sessão (`recebimento_cr` / `estorno_recebimento_cr`). Helper
 * puro — não lê banco nem altera nada; só classifica o que os fluxos já gravaram.
 *
 * ORIGEM ("Recebido na sessão — por origem"):
 *  - `payload.origem === "operacoes-v3-os"` → O.S. recebidas (recebimento na tela da O.S.);
 *  - qualquer outro `recebimento_cr` → Contas recebidas: é o significado do próprio tipo
 *    (baixa de Conta a Receber) — PDV F5, PDV lote, tela Financeiro. Sem `origem`
 *    explícita NÃO se deduz O.S. pelo título: a classificação fica na conservadora.
 *
 * CANAL (rótulo da Conferência), só por contrato gravado:
 *  - `origem: "pdv_lote"` → PDV (lote) · `origem: "financeiro"` → Financeiro;
 *  - sem `origem` e `localId` `pdv-rc:` (contrato de `/api/pdv/receber-conta`) → PDV (F5);
 *  - o resto fica "não identificado" — nenhum canal é inventado.
 *
 * FORMA: `normalizarFormaPagamento`. Recebimento com forma desconhecida vai para
 * `formaNaoIdentificada`; estorno sem forma (a O.S. hoje não grava) vai para
 * `estornos.semForma` — nunca é atribuído a uma forma nem abatido da gaveta aqui.
 */
import { FORMAS_CANONICAS, normalizarFormaPagamento, type FormaCanonica } from "./formas-pagamento-caixa"

export const ORIGEM_RECEBIMENTO_OS = "operacoes-v3-os"
const ORIGEM_RECEBIMENTO_LOTE = "pdv_lote"
const ORIGEM_RECEBIMENTO_FINANCEIRO = "financeiro"
/** Prefixo do `payload.localId` gravado por `/api/pdv/receber-conta` (F5). */
const LOCAL_ID_PDV_F5 = "pdv-rc:"

export type OrigemRecebimento = "contas" | "os"
export type CanalRecebimento = "os" | "pdv_f5" | "pdv_lote" | "financeiro" | "nao_identificado"

export interface ClassificacaoRecebimento {
  natureza: "recebimento" | "estorno"
  origem: OrigemRecebimento
  canal: CanalRecebimento
  forma: FormaCanonica | null
}

const CANAL_LABEL: Record<Exclude<CanalRecebimento, "nao_identificado">, string> = {
  os: "O.S.",
  pdv_f5: "PDV (F5)",
  pdv_lote: "PDV (lote)",
  financeiro: "Financeiro",
}

/** Rótulo do canal; `null` quando os dados gravados não o determinam. */
export function canalRecebimentoLabel(canal: CanalRecebimento): string | null {
  return canal === "nao_identificado" ? null : CANAL_LABEL[canal]
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100 || 0
}

function lerTexto(payload: unknown, chave: string): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return ""
  const v = (payload as Record<string, unknown>)[chave]
  return typeof v === "string" ? v.trim() : ""
}

/** Classifica `recebimento_cr` / `estorno_recebimento_cr`; `null` para os demais tipos. */
export function classificarRecebimentoCaixa(op: {
  tipo: string
  payload?: unknown
}): ClassificacaoRecebimento | null {
  const tipo = (op.tipo || "").trim().toLowerCase()
  const natureza =
    tipo === "recebimento_cr" ? "recebimento" : tipo === "estorno_recebimento_cr" ? "estorno" : null
  if (!natureza) return null
  const origem = lerTexto(op.payload, "origem").toLowerCase()
  const canal: CanalRecebimento =
    origem === ORIGEM_RECEBIMENTO_OS
      ? "os"
      : origem === ORIGEM_RECEBIMENTO_LOTE
        ? "pdv_lote"
        : origem === ORIGEM_RECEBIMENTO_FINANCEIRO
          ? "financeiro"
          : !origem && lerTexto(op.payload, "localId").startsWith(LOCAL_ID_PDV_F5)
            ? "pdv_f5"
            : "nao_identificado"
  return {
    natureza,
    origem: canal === "os" ? "os" : "contas",
    canal,
    forma: normalizarFormaPagamento(lerTexto(op.payload, "formaPagamento")),
  }
}

export interface RecebimentosSessao {
  contas: { valor: number; qtd: number; dinheiro: number }
  os: { valor: number; qtd: number; dinheiro: number }
  estornos: { valor: number; qtd: number; dinheiro: number; semForma: number }
  /** Contas + O.S. com forma identificada, já líquidos dos estornos na mesma forma. */
  porForma: Record<FormaCanonica, number>
  /** Recebimentos cuja forma gravada falta ou não é reconhecida. */
  formaNaoIdentificada: number
  /** `false` quando só existia o total legado de `recebimento_cr` (contas e O.S. juntos). */
  origemSeparada: boolean
}

export function recebimentosSessaoVazio(): RecebimentosSessao {
  return {
    contas: { valor: 0, qtd: 0, dinheiro: 0 },
    os: { valor: 0, qtd: 0, dinheiro: 0 },
    estornos: { valor: 0, qtd: 0, dinheiro: 0, semForma: 0 },
    porForma: Object.fromEntries(FORMAS_CANONICAS.map((f) => [f, 0])) as Record<FormaCanonica, number>,
    formaNaoIdentificada: 0,
    origemSeparada: true,
  }
}

/** Soma as operações da sessão por origem e por forma (valores ≤ 0 e outros tipos são ignorados). */
export function aggregateRecebimentosSessao(
  operacoes: ReadonlyArray<{ tipo: string; valor: number; payload?: unknown }>,
): RecebimentosSessao {
  const r = recebimentosSessaoVazio()
  for (const op of operacoes) {
    const v = round2(Number(op.valor) || 0)
    if (!(v > 0)) continue
    const c = classificarRecebimentoCaixa(op)
    if (!c) continue
    if (c.natureza === "recebimento") {
      const alvo = c.origem === "os" ? r.os : r.contas
      alvo.valor += v
      alvo.qtd += 1
      if (c.forma === "dinheiro") alvo.dinheiro += v
      if (c.forma) r.porForma[c.forma] += v
      else r.formaNaoIdentificada += v
    } else {
      r.estornos.valor += v
      r.estornos.qtd += 1
      if (!c.forma) {
        r.estornos.semForma += v
      } else {
        r.porForma[c.forma] -= v
        if (c.forma === "dinheiro") r.estornos.dinheiro += v
      }
    }
  }
  for (const g of [r.contas, r.os]) {
    g.valor = round2(g.valor)
    g.dinheiro = round2(g.dinheiro)
  }
  r.estornos.valor = round2(r.estornos.valor)
  r.estornos.dinheiro = round2(r.estornos.dinheiro)
  r.estornos.semForma = round2(r.estornos.semForma)
  for (const f of FORMAS_CANONICAS) r.porForma[f] = round2(r.porForma[f])
  r.formaNaoIdentificada = round2(r.formaNaoIdentificada)
  return r
}

/**
 * Snapshot antigo / chamador legado: só havia o total de `recebimento_cr` (já líquido de
 * estornos) e a parte em dinheiro. Contas × O.S. e as demais formas não são separáveis —
 * tudo fica em "contas" com `origemSeparada: false`, sem inventar a divisão. Quando a
 * parte em dinheiro supera o total, a diferença é o estorno sem forma que o agregado
 * legado abateu do total mas não da gaveta.
 */
export function recebimentosDeTotaisLegados(totais: {
  recebimentosContas?: number
  recebimentosContasDinheiro?: number
  qtdRecebimentosContas?: number
}): RecebimentosSessao {
  const r = recebimentosSessaoVazio()
  const valor = round2(Math.max(0, Number(totais.recebimentosContas) || 0))
  const dinheiro = round2(Math.max(0, Number(totais.recebimentosContasDinheiro) || 0))
  const qtd = Math.max(0, Math.trunc(Number(totais.qtdRecebimentosContas) || 0))
  const diferenca = round2(valor - dinheiro)
  r.contas = { valor, qtd, dinheiro }
  r.porForma.dinheiro = dinheiro
  r.formaNaoIdentificada = Math.max(0, diferenca)
  r.estornos.semForma = Math.max(0, -diferenca)
  r.origemSeparada = false
  return r
}

export interface ResumoRecebidoPorOrigem {
  /** Recebido à vista das vendas (`totalLiquido − aPrazo − creditoVale`). */
  vendasAVista: number
  contasRecebidas: number
  qtdContasRecebidas: number
  osRecebidas: number
  qtdOsRecebidas: number
  estornosRecebimento: number
  qtdEstornosRecebimento: number
  /** `false` em snapshot antigo: contas e O.S. vêm somadas e já líquidas de estornos. */
  origemSeparada: boolean
  total: number
}

export interface ResumoRecebidoPorForma {
  dinheiro: number
  pix: number
  cartaoDebito: number
  cartaoCredito: number
  /** Carnê/boleto das vendas + baixas nessa forma — regra atual do PDV, não redefinida aqui. */
  carne: number
  /** Só baixa de conta paga com crédito/vale; o vale usado nas vendas fica fora. */
  creditoVale: number
  /** Só se algum recebimento gravar "à prazo"; o à prazo das vendas fica fora. */
  aPrazo: number
  formaNaoIdentificada: number
  /** Parte das vendas à vista sem componente de forma (ex.: venda sem `paymentBreakdown`). */
  vendasSemForma: number
  estornosSemForma: number
  /** Igual a `ResumoRecebidoPorOrigem.total` por construção. */
  total: number
}

export interface ResumoGavetaDinheiro {
  abertura: number
  dinheiroVendas: number
  dinheiroContas: number
  dinheiroOs: number
  estornosDinheiro: number
  suprimentos: number
  sangrias: number
  /** `saldoDinheiroEsperado` — fórmula da gaveta preservada. */
  esperado: number
}

/** Componentes à vista do `porPagamento` das vendas (à prazo e crédito/vale ficam fora). */
export interface PagamentosAVistaVendas {
  dinheiro: number
  pix: number
  cartaoDebito: number
  cartaoCredito: number
  carne: number
}

/** Monta os blocos "Recebido na sessão" (origem e forma) e a composição da gaveta. */
export function calcularRecebidoSessao(input: {
  pagamentosVendas: PagamentosAVistaVendas
  vendasAVista: number
  recebimentos: RecebimentosSessao
  saldoInicial: number
  suprimentos: number
  sangrias: number
  dinheiroEsperado: number
}): {
  recebidoPorOrigem: ResumoRecebidoPorOrigem
  recebidoPorForma: ResumoRecebidoPorForma
  gavetaDinheiro: ResumoGavetaDinheiro
} {
  const pg = input.pagamentosVendas
  const rec = input.recebimentos
  const vendasAVista = round2(input.vendasAVista)
  const estornosNaOrigem = rec.origemSeparada ? rec.estornos.valor : 0

  const recebidoPorOrigem: ResumoRecebidoPorOrigem = {
    vendasAVista,
    contasRecebidas: rec.contas.valor,
    qtdContasRecebidas: rec.contas.qtd,
    osRecebidas: rec.os.valor,
    qtdOsRecebidas: rec.os.qtd,
    estornosRecebimento: estornosNaOrigem,
    qtdEstornosRecebimento: rec.origemSeparada ? rec.estornos.qtd : 0,
    origemSeparada: rec.origemSeparada,
    total: round2(vendasAVista + rec.contas.valor + rec.os.valor - estornosNaOrigem),
  }

  const vendasComForma = round2(pg.dinheiro + pg.pix + pg.cartaoDebito + pg.cartaoCredito + pg.carne)
  const porForma = {
    dinheiro: round2(pg.dinheiro + rec.porForma.dinheiro),
    pix: round2(pg.pix + rec.porForma.pix),
    cartaoDebito: round2(pg.cartaoDebito + rec.porForma.cartaoDebito),
    cartaoCredito: round2(pg.cartaoCredito + rec.porForma.cartaoCredito),
    carne: round2(pg.carne + rec.porForma.carne),
    creditoVale: rec.porForma.creditoVale,
    aPrazo: rec.porForma.aPrazo,
    formaNaoIdentificada: rec.formaNaoIdentificada,
    vendasSemForma: round2(vendasAVista - vendasComForma),
    estornosSemForma: rec.estornos.semForma,
  }
  const recebidoPorForma: ResumoRecebidoPorForma = {
    ...porForma,
    total: round2(
      porForma.dinheiro +
        porForma.pix +
        porForma.cartaoDebito +
        porForma.cartaoCredito +
        porForma.carne +
        porForma.creditoVale +
        porForma.aPrazo +
        porForma.formaNaoIdentificada +
        porForma.vendasSemForma -
        porForma.estornosSemForma,
    ),
  }

  const gavetaDinheiro: ResumoGavetaDinheiro = {
    abertura: round2(input.saldoInicial),
    dinheiroVendas: round2(pg.dinheiro),
    dinheiroContas: rec.contas.dinheiro,
    dinheiroOs: rec.os.dinheiro,
    estornosDinheiro: rec.estornos.dinheiro,
    suprimentos: round2(input.suprimentos),
    sangrias: round2(input.sangrias),
    esperado: round2(input.dinheiroEsperado),
  }

  return { recebidoPorOrigem, recebidoPorForma, gavetaDinheiro }
}
