/**
 * Contador HUB · Pacote do Contador — carga detalhada por fonte (GOAL 008B).
 *
 * Adapter interno (SOMENTE em lib/contador/pacote/**): carrega as fontes reais UMA vez,
 * com selects estreitos, read-only, escopadas por `scope.storeId` (nunca pela query).
 * A MESMA carga alimenta:
 *  - os CSVs detalhados (linhas saneadas, sem PII/payload);
 *  - o DTO agregado do GOAL 006 (via `montarDados`, formato `FontesContador`, que precisa
 *    do `payload` das vendas — lido aqui e nunca serializado ao ZIP).
 *
 * Não chama `construirDadosContador` (evita uma segunda rodada de queries). A quantidade de
 * queries é contabilizada dinamicamente por página e por lote de Produto (não há número fixo):
 * 7 fontes paginadas por cursor em `Promise.allSettled` + N lotes de Produto (códigos dos itens,
 * dependente do sucesso de vendas). Uma falha isolada NÃO cancela as demais e NÃO vaza stack/erro
 * Prisma. O limite por fonte é aplicado às linhas CRUAS (antes de qualquer filtragem): `paginarFonte`
 * lança `PacoteLimiteExcedidoError` ao detectar a linha MAX+1 — uma linha filtrável não burla o teto.
 */
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { resolvePeriodoUtc, type Competencia, type PeriodoUtc } from "@/lib/contador/competencia"
import type { ContadorScopeInterno } from "@/lib/contador/scope-core"
import type { FontesContador, FonteContador } from "@/lib/contador/readers"
import { parseVencimento } from "@/lib/contador/readers/financeiro"
import {
  isOrigemDevolucaoPdv,
  isOrigemEstorno,
  isOrigemTransferenciaInterna,
} from "@/lib/financeiro/services/movimentacao-financeira-classify"
import { assertRegistrosFonte, MAX_REGISTROS_POR_FONTE, PacoteLimiteExcedidoError } from "./seguranca"
import type { EstadoFonte, FonteResultado } from "./tipos"

/* ─────────────────────────── linhas detalhadas (saneadas) ─────────────────────────── */

export type VendaDetalhe = Readonly<{
  vendaId: string
  numero: string
  data: string
  status: string
  totalBruto: number
  descontoInformativo: number | null
  devolucoes: number
  totalLiquido: number
  formaPagamentoStatus: string
}>

export type ItemDetalhe = Readonly<{
  vendaId: string
  itemId: string
  produtoCodigo: string
  produtoDescricao: string
  quantidade: number
  valorUnitario: number
  desconto: number
  totalItem: number
}>

export type DevolucaoDetalhe = Readonly<{
  devolucaoId: string
  vendaId: string
  dataDevolucao: string
  valor: number
  status: string
}>

export type MovimentacaoDetalhe = Readonly<{
  movimentacaoId: string
  data: string
  tipo: string
  classificacao: string
  valor: number
  origem: string
}>

export type TituloDetalhe = Readonly<{
  tituloId: string
  vencimento: string
  status: string
  valorOriginal: number
  valorAberto: number
  disponibilidade: EstadoFonte
}>

export type SessaoDetalhe = Readonly<{
  sessaoId: string
  abertura: string
  fechamento: string
  status: string
  saldoInicial: number
  saldoFinal: number | null
  saldoContado: number | null
  diferencaDisponivel: boolean
  diferenca: number | null
}>

export type OperacaoDetalhe = Readonly<{
  operacaoId: string
  sessaoId: string
  data: string
  tipo: string
  classificacao: string
  valor: number
}>

export type FontesDetalhadasPacote = Readonly<{
  vendas: FonteResultado<VendaDetalhe>
  itens: FonteResultado<ItemDetalhe>
  devolucoes: FonteResultado<DevolucaoDetalhe>
  movimentacoes: FonteResultado<MovimentacaoDetalhe>
  contasReceber: FonteResultado<TituloDetalhe>
  contasPagar: FonteResultado<TituloDetalhe>
  sessoes: FonteResultado<SessaoDetalhe>
  operacoes: FonteResultado<OperacaoDetalhe>
  /** Fontes puras derivadas da MESMA carga, no formato consumido por `montarDados`. */
  agregado: FontesContador
  /** Nº de queries efetivamente disparadas (para relatório/manifesto). */
  totalQueries: number
}>

/* ─────────────────────────── shapes crus (selects estreitos) ─────────────────────────── */

type ItemRaw = {
  id: string
  inventoryId: string | null
  nome: string
  quantidade: number
  precoUnitario: number
  lineTotal: number
}
type VendaRaw = {
  id: string
  pedidoId: string
  total: number
  status: string | null
  at: Date
  payload: unknown
  itens: ItemRaw[]
}
type ProdutoRaw = { id: string; sku: string | null; barcode: string | null }
type DevolucaoRaw = {
  id: string
  localId: string
  vendaLocalId: string
  tipo: string
  valorTotal: number
  at: Date
}
type MovimentacaoRaw = {
  id: string
  tipo: string
  origem: string | null
  valor: number
  createdAt: Date
}
type TituloRaw = { id: string; valor: number; status: string; vencimento: string }
type SessaoRaw = {
  id: string
  status: string
  saldoInicial: number
  saldoFinal: number | null
  saldoContado: number | null
  abertaEm: Date
  fechadaEm: Date | null
}
type OperacaoRaw = { id: string; sessaoId: string; tipo: string; valor: number; at: Date }

type FindMany<T> = (args: Record<string, unknown>) => Promise<T[]>

/** Porta mínima injetável para testar as fronteiras das queries sem banco real. */
export type PacoteReaderClient = {
  venda: { findMany: FindMany<VendaRaw> }
  produto: { findMany: FindMany<ProdutoRaw> }
  devolucaoVenda: { findMany: FindMany<DevolucaoRaw> }
  movimentacaoFinanceira: { findMany: FindMany<MovimentacaoRaw> }
  contaReceberTitulo: { findMany: FindMany<TituloRaw> }
  contaPagarTitulo: { findMany: FindMany<TituloRaw> }
  sessaoCaixa: { findMany: FindMany<SessaoRaw> }
  caixaOperacao: { findMany: FindMany<OperacaoRaw> }
}

/* ─────────────────────────── helpers ─────────────────────────── */

const OBS_FALHA = "A leitura desta fonte falhou. Tente novamente; o pacote saiu parcial."

/**
 * Tamanho de página da paginação por cursor. Pequeno o bastante para não materializar
 * a fonte inteira de uma vez (a query de vendas ainda traz os itens aninhados), grande
 * o bastante para manter o número de round-trips baixo no volume mensal esperado.
 */
const PAGE_SIZE_PACOTE = 500

/**
 * Tamanho máximo de IDs por consulta de Produto no lookup de códigos. O chunking evita um
 * `id: { in: [...] }` gigante em uma única query; cada lote é UMA consulta contabilizada.
 */
export const PRODUTO_LOOKUP_CHUNK = 500

/** Cursor opaco de paginação — sempre o `id` (cuid único) da última linha da página. */
type CursorPagina = string

type PaginarFonteInput<T> = Readonly<{
  /** Nome lógico da fonte (para a mensagem de `PacoteLimiteExcedidoError`). */
  nomeFonte: string
  /** Busca UMA página a partir do cursor (exclusivo); `tamanho` é o teto de linhas. */
  buscarPagina: (cursor: CursorPagina | null, tamanho: number) => Promise<T[]>
  /** Extrai o cursor estável (id) da última linha de uma página. */
  extrairCursor: (linha: T) => CursorPagina
  /** Teto de linhas CRUAS; ao detectar `maxRegistros + 1`, lança PacoteLimiteExcedidoError. */
  maxRegistros: number
  tamanhoPagina?: number
}>

/**
 * Paginação real por páginas pequenas (cursor por id). Percorre a fonte página a página até
 * esgotá-la (última página vem incompleta). O LIMITE por fonte é aplicado às linhas CRUAS,
 * ANTES de qualquer filtragem: ao acumular `maxRegistros + 1` linhas (a `+1` é a sonda de
 * excedente), lança `PacoteLimiteExcedidoError` — nunca devolve MAX+1 ao caller. Assim uma linha
 * que seria filtrada (inválida, cancelada, de outro mês, título fechado) NÃO burla o teto.
 * Nunca materializa mais que `maxRegistros + 1` linhas.
 */
export async function paginarFonte<T>(input: PaginarFonteInput<T>): Promise<T[]> {
  const tamanhoPagina = Math.max(1, input.tamanhoPagina ?? PAGE_SIZE_PACOTE)
  const teto = input.maxRegistros + 1
  const acumulado: T[] = []
  let cursor: CursorPagina | null = null
  for (;;) {
    const restante = teto - acumulado.length
    if (restante <= 0) break
    const tamanho = Math.min(tamanhoPagina, restante)
    const pagina = await input.buscarPagina(cursor, tamanho)
    if (pagina.length === 0) break
    acumulado.push(...pagina)
    if (acumulado.length > input.maxRegistros) {
      throw new PacoteLimiteExcedidoError(
        "registros_por_fonte",
        `Fonte "${input.nomeFonte}" excedeu ${input.maxRegistros} registros na leitura da fonte crua.`,
      )
    }
    if (pagina.length < tamanho) break // última página: fonte esgotada
    cursor = input.extrairCursor(pagina[pagina.length - 1])
  }
  return acumulado
}

/** Argumentos de cursor do Prisma para a próxima página (id único + skip 1). */
function argsCursor(cursor: CursorPagina | null): Record<string, unknown> {
  return cursor ? { cursor: { id: cursor }, skip: 1 } : {}
}

const STATUS_VENDA_CANCELADA = "cancelada"

/** Venda cancelada (status canônico `cancelada`; normaliza caixa/espaços por robustez). */
function vendaCancelada(status: string | null | undefined): boolean {
  return String(status ?? "").toLowerCase().trim() === STATUS_VENDA_CANCELADA
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}
function arred(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
function idOk(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}

const STATUS_TITULO_FECHADO = new Set([
  "pago",
  "paga",
  "quitado",
  "quitada",
  "liquidado",
  "liquidada",
  "baixado",
  "baixada",
  "recebido",
  "recebida",
  "cancelado",
  "cancelada",
])

const ORIGENS_ENTRADA = new Set(["venda", "pdv", "os", "marketplace"])
const ORIGENS_BIDIRECIONAIS = new Set(["manual", "ajuste", "importacao", "sistema", "legado"])

function isOrigemReversao(origem: string): boolean {
  const n = origem.toLowerCase().trim()
  return (
    isOrigemEstorno(n) ||
    n === "estorno" ||
    n.startsWith("estorno_") ||
    isOrigemDevolucaoPdv(n) ||
    n === "cancelamento_pdv"
  )
}

/** Espelha `classificarMovimento` do reader do GOAL 006 (mantido em paridade). */
function classificarMovimento(tipoRaw: string, origemRaw: string | null): string {
  const origem = (origemRaw ?? "").toLowerCase().trim()
  const tipo = (tipoRaw ?? "").toLowerCase().trim()
  if (isOrigemReversao(origem)) return "estorno"
  if (isOrigemTransferenciaInterna(origem)) return "transferencia"
  if (ORIGENS_ENTRADA.has(origem)) return tipo === "entrada" ? "entrada" : "nao_classificado"
  if (origem === "receber" || origem.startsWith("receber_")) {
    return tipo === "entrada" ? "entrada" : "nao_classificado"
  }
  if (origem === "pagar" || origem.startsWith("pagar_")) {
    return tipo === "saida" ? "saida" : "nao_classificado"
  }
  if (ORIGENS_BIDIRECIONAIS.has(origem)) {
    if (tipo === "entrada") return "entrada"
    if (tipo === "saida") return "saida"
  }
  return "nao_classificado"
}

function classificarOperacaoCaixa(tipoRaw: string): string {
  const t = (tipoRaw ?? "").toLowerCase().trim()
  if (t === "sangria" || t === "suprimento" || t === "devolucao") return t
  return "nao_classificado"
}

function lerDiscountTotal(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null
  const d = (payload as { discountTotal?: unknown }).discountTotal
  return typeof d === "number" && Number.isFinite(d) && d >= 0 ? d : null
}

/** Status coarse de forma de pagamento por venda (sem expor valores por forma). */
function formaPagamentoStatus(payload: unknown, total: number): string {
  if (!payload || typeof payload !== "object") return "sem_breakdown"
  const pb = (payload as { paymentBreakdown?: unknown }).paymentBreakdown
  if (!pb || typeof pb !== "object" || Array.isArray(pb)) return "sem_breakdown"
  let soma = 0
  let algum = false
  for (const v of Object.values(pb as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      soma += v
      algum = true
    }
  }
  if (!algum) return "sem_breakdown"
  return Math.abs(soma - Math.max(0, num(total))) <= 0.01 ? "identificado" : "parcial"
}

function tituloFechado(status: string): boolean {
  return STATUS_TITULO_FECHADO.has((status ?? "").toLowerCase().trim())
}

function estadoDe(rejeitados: number, total: number): { estado: EstadoFonte; observacao?: string } {
  if (rejeitados > 0) {
    return {
      estado: "parcial",
      observacao: `${rejeitados} de ${total + rejeitados} linha(s) rejeitada(s) por dado inválido.`,
    }
  }
  return { estado: "real" }
}

function fonteIndisponivel<T>(): FonteResultado<T> {
  return { linhas: [], registros: 0, estado: "indisponivel", observacao: OBS_FALHA }
}

/* ─────────────────────────── carga ─────────────────────────── */

/**
 * Carrega todas as fontes detalhadas em uma única passagem e deriva o agregado.
 * Read-only, escopado por `scope.storeId`. Cliente injetável para teste.
 */
export async function carregarFontesPacoteComCliente(
  scope: ContadorScopeInterno,
  periodo: PeriodoUtc,
  competencia: Competencia,
  cliente: PacoteReaderClient,
  maxRegistros: number = MAX_REGISTROS_POR_FONTE,
): Promise<FontesDetalhadasPacote> {
  const noPeriodo = { gte: periodo.inicio, lt: periodo.fimExclusivo }
  const storeId = scope.storeId

  // Contador central de queries por execução: TODA chamada real (cada página de cada fonte e
  // cada lote de Produto) passa por aqui. O total devolvido é EXATAMENTE o nº de chamadas
  // disparadas ao cliente injetado — sem estimativa. A chamada que falhar também é contada
  // (o incremento acontece antes de invocar `fn`).
  let totalQueries = 0
  const contarQuery = <T>(fn: () => Promise<T>): Promise<T> => {
    totalQueries += 1
    return fn()
  }

  // Cada fonte pagina de forma independente e concorrente (cursor por id + tiebreak);
  // uma falha isolada NÃO cancela as demais (Promise.allSettled). Ordenação temporal com
  // `id` como desempate torna o cursor determinístico mesmo com timestamps repetidos.
  const MAX = Math.max(1, maxRegistros)
  const resultados = await Promise.allSettled([
    paginarFonte<VendaRaw>({
      nomeFonte: "vendas",
      buscarPagina: (cursor, tamanho) =>
        contarQuery(() =>
          cliente.venda.findMany({
            where: { storeId, at: noPeriodo },
            select: {
              id: true,
              pedidoId: true,
              total: true,
              status: true,
              at: true,
              payload: true,
              itens: {
                select: {
                  id: true,
                  inventoryId: true,
                  nome: true,
                  quantidade: true,
                  precoUnitario: true,
                  lineTotal: true,
                },
              },
            },
            orderBy: [{ at: "asc" }, { id: "asc" }],
            take: tamanho,
            ...argsCursor(cursor),
          }),
        ),
      extrairCursor: (v) => v.id,
      maxRegistros: MAX,
    }),
    paginarFonte<DevolucaoRaw>({
      nomeFonte: "devolucoes",
      buscarPagina: (cursor, tamanho) =>
        contarQuery(() =>
          cliente.devolucaoVenda.findMany({
            where: { storeId, at: noPeriodo },
            select: { id: true, localId: true, vendaLocalId: true, tipo: true, valorTotal: true, at: true },
            orderBy: [{ at: "asc" }, { id: "asc" }],
            take: tamanho,
            ...argsCursor(cursor),
          }),
        ),
      extrairCursor: (d) => d.id,
      maxRegistros: MAX,
    }),
    paginarFonte<MovimentacaoRaw>({
      nomeFonte: "movimentacoes",
      buscarPagina: (cursor, tamanho) =>
        contarQuery(() =>
          cliente.movimentacaoFinanceira.findMany({
            where: { storeId, createdAt: noPeriodo },
            select: { id: true, tipo: true, origem: true, valor: true, createdAt: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: tamanho,
            ...argsCursor(cursor),
          }),
        ),
      extrairCursor: (m) => m.id,
      maxRegistros: MAX,
    }),
    paginarFonte<TituloRaw>({
      nomeFonte: "contas_receber",
      buscarPagina: (cursor, tamanho) =>
        contarQuery(() =>
          cliente.contaReceberTitulo.findMany({
            where: { storeId },
            select: { id: true, valor: true, status: true, vencimento: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: tamanho,
            ...argsCursor(cursor),
          }),
        ),
      extrairCursor: (t) => t.id,
      maxRegistros: MAX,
    }),
    paginarFonte<TituloRaw>({
      nomeFonte: "contas_pagar",
      buscarPagina: (cursor, tamanho) =>
        contarQuery(() =>
          cliente.contaPagarTitulo.findMany({
            where: { storeId },
            select: { id: true, valor: true, status: true, vencimento: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: tamanho,
            ...argsCursor(cursor),
          }),
        ),
      extrairCursor: (t) => t.id,
      maxRegistros: MAX,
    }),
    paginarFonte<SessaoRaw>({
      nomeFonte: "sessoes",
      buscarPagina: (cursor, tamanho) =>
        contarQuery(() =>
          cliente.sessaoCaixa.findMany({
            where: { storeId, abertaEm: noPeriodo },
            select: {
              id: true,
              status: true,
              saldoInicial: true,
              saldoFinal: true,
              saldoContado: true,
              abertaEm: true,
              fechadaEm: true,
            },
            orderBy: [{ abertaEm: "asc" }, { id: "asc" }],
            take: tamanho,
            ...argsCursor(cursor),
          }),
        ),
      extrairCursor: (s) => s.id,
      maxRegistros: MAX,
    }),
    paginarFonte<OperacaoRaw>({
      nomeFonte: "operacoes",
      buscarPagina: (cursor, tamanho) =>
        contarQuery(() =>
          cliente.caixaOperacao.findMany({
            where: { storeId, at: noPeriodo },
            select: { id: true, sessaoId: true, tipo: true, valor: true, at: true },
            orderBy: [{ at: "asc" }, { id: "asc" }],
            take: tamanho,
            ...argsCursor(cursor),
          }),
        ),
      extrairCursor: (o) => o.id,
      maxRegistros: MAX,
    }),
  ] as const)

  // Estouro de limite (linha crua MAX+1) é fail-closed → 413: `paginarFonte` lança
  // PacoteLimiteExcedidoError, mas como cada fonte corre em allSettled (falha isolada vira
  // "indisponível"), o estouro precisa ser RE-PROPAGADO em vez de degradar para indisponível.
  for (const r of resultados) {
    if (r.status === "rejected" && r.reason instanceof PacoteLimiteExcedidoError) {
      throw r.reason
    }
  }

  const falhas: FonteContador[] = []
  const ok = <T>(r: PromiseSettledResult<T[]>): T[] | null => (r.status === "fulfilled" ? r.value : null)

  const vendasRaw = ok<VendaRaw>(resultados[0] as PromiseSettledResult<VendaRaw[]>)
  const devolucoesRaw = ok<DevolucaoRaw>(resultados[1] as PromiseSettledResult<DevolucaoRaw[]>)
  const movRaw = ok<MovimentacaoRaw>(resultados[2] as PromiseSettledResult<MovimentacaoRaw[]>)
  const receberRaw = ok<TituloRaw>(resultados[3] as PromiseSettledResult<TituloRaw[]>)
  const pagarRaw = ok<TituloRaw>(resultados[4] as PromiseSettledResult<TituloRaw[]>)
  const sessoesRaw = ok<SessaoRaw>(resultados[5] as PromiseSettledResult<SessaoRaw[]>)
  const operacoesRaw = ok<OperacaoRaw>(resultados[6] as PromiseSettledResult<OperacaoRaw[]>)

  if (!vendasRaw) falhas.push("vendas")
  if (!devolucoesRaw) falhas.push("devolucoes")
  if (!movRaw) falhas.push("movimentacoes")
  if (!receberRaw) falhas.push("receber")
  if (!pagarRaw) falhas.push("pagar")
  if (!sessoesRaw) falhas.push("sessoes")
  if (!operacoesRaw) falhas.push("operacoes")

  // Lookup de Produto para códigos dos itens (dependente do sucesso de vendas), em LOTES de até
  // PRODUTO_LOOKUP_CHUNK ids — nenhum `id: { in: [...] }` recebe todos os ids de uma só vez.
  const produtoMap = new Map<string, string>()
  // Ids cujo LOTE falhou tecnicamente: seus itens ficam sem código POR FALHA (≠ ausência
  // legítima de match), o que torna a fonte `itens` `parcial`. A falha de um lote NÃO derruba
  // os demais lotes nem contamina a fonte vendas.
  const invIdsSemCodigoPorFalha = new Set<string>()
  let lotesProdutoFalhos = 0
  if (vendasRaw) {
    // Só itens de vendas NÃO canceladas alimentam os CSVs → o lookup ignora canceladas.
    const invIds = Array.from(
      new Set(
        vendasRaw
          .filter((v) => !vendaCancelada(v.status))
          .flatMap((v) => v.itens)
          .map((i) => i.inventoryId)
          .filter((x): x is string => idOk(x)),
      ),
    )
    for (let i = 0; i < invIds.length; i += PRODUTO_LOOKUP_CHUNK) {
      const lote = invIds.slice(i, i + PRODUTO_LOOKUP_CHUNK)
      try {
        const produtos = await contarQuery(() =>
          cliente.produto.findMany({
            where: { storeId, id: { in: lote } },
            select: { id: true, sku: true, barcode: true },
          }),
        )
        for (const p of produtos) {
          const codigo = (p.sku ?? p.barcode ?? "").trim()
          if (idOk(p.id) && codigo) produtoMap.set(p.id, codigo)
        }
      } catch {
        // Lote indisponível: os ids deste lote ficam sem código e a fonte `itens` passa a
        // `parcial` (marcada abaixo). Os demais lotes seguem aproveitados.
        lotesProdutoFalhos += 1
        for (const id of lote) invIdsSemCodigoPorFalha.add(id)
      }
    }
  }

  // ── devoluções por venda (link exato vendaLocalId == numero da venda) ──
  const devPorVenda = new Map<string, number>()
  for (const d of devolucoesRaw ?? []) {
    if (idOk(d.vendaLocalId)) devPorVenda.set(d.vendaLocalId, (devPorVenda.get(d.vendaLocalId) ?? 0) + num(d.valorTotal))
  }

  // ── vendas (somente NÃO canceladas) ──
  // GOAL 008D: canceladas ficam FORA dos CSVs detalhados (nenhuma linha, nem zerada). Seu bruto
  // permanece informativo apenas no agregado (canceladasTotal/canceladasQuantidade do GOAL 006),
  // derivado mais abaixo da carga crua intacta.
  let vendas: FonteResultado<VendaDetalhe>
  if (!vendasRaw) {
    vendas = fonteIndisponivel<VendaDetalhe>()
  } else {
    let rej = 0
    const linhas: VendaDetalhe[] = []
    for (const v of vendasRaw) {
      if (vendaCancelada(v.status)) continue // cancelada: fora dos CSVs detalhados
      if (!idOk(v.id)) {
        rej += 1
        continue
      }
      const totalBruto = arred(num(v.total))
      const dev = arred(devPorVenda.get(v.pedidoId) ?? 0)
      linhas.push({
        vendaId: v.id,
        numero: v.pedidoId ?? "",
        data: v.at instanceof Date ? v.at.toISOString() : String(v.at ?? ""),
        status: String(v.status ?? ""),
        totalBruto,
        descontoInformativo: lerDiscountTotal(v.payload),
        devolucoes: dev,
        totalLiquido: arred(Math.max(0, totalBruto - dev)),
        formaPagamentoStatus: formaPagamentoStatus(v.payload, num(v.total)),
      })
    }
    assertRegistrosFonte("vendas", linhas.length)
    vendas = { linhas, registros: linhas.length, ...estadoDe(rej, linhas.length) }
  }

  // ── itens (somente de vendas não canceladas) ──
  let itens: FonteResultado<ItemDetalhe>
  if (!vendasRaw) {
    itens = fonteIndisponivel<ItemDetalhe>()
  } else {
    let rej = 0
    let itensSemCodigoPorFalha = 0
    const linhas: ItemDetalhe[] = []
    for (const v of vendasRaw) {
      if (vendaCancelada(v.status)) continue
      for (const it of v.itens ?? []) {
        if (!idOk(it.id) || !idOk(v.id)) {
          rej += 1
          continue
        }
        const inv = idOk(it.inventoryId) ? it.inventoryId : null
        const codigo = inv ? (produtoMap.get(inv) ?? "") : ""
        // Código vazio POR FALHA de lote (≠ ausência legítima de match) marca a parcialidade.
        if (inv && codigo === "" && invIdsSemCodigoPorFalha.has(inv)) itensSemCodigoPorFalha += 1
        const qtd = num(it.quantidade)
        const unit = arred(num(it.precoUnitario))
        const totalItem = arred(num(it.lineTotal))
        linhas.push({
          vendaId: v.id,
          itemId: it.id,
          produtoCodigo: codigo,
          produtoDescricao: String(it.nome ?? ""),
          quantidade: qtd,
          valorUnitario: unit,
          desconto: arred(Math.max(0, qtd * unit - totalItem)),
          totalItem,
        })
      }
    }
    assertRegistrosFonte("itens", linhas.length)
    const base = estadoDe(rej, linhas.length)
    if (lotesProdutoFalhos > 0) {
      // Um ou mais lotes de Produto falharam: descrições/valores vieram, mas os códigos dos
      // itens afetados ficaram vazios (ausência legítima de match NÃO entra nesta contagem).
      const nota = `Código de produto indisponível para ${itensSemCodigoPorFalha} item(ns) devido à falha em ${lotesProdutoFalhos} lote(s) de consulta.`
      itens = {
        linhas,
        registros: linhas.length,
        estado: "parcial",
        observacao: base.observacao ? `${base.observacao} ${nota}` : nota,
      }
    } else {
      itens = { linhas, registros: linhas.length, ...base }
    }
  }

  // ── devoluções ──
  let devolucoes: FonteResultado<DevolucaoDetalhe>
  if (!devolucoesRaw) {
    devolucoes = fonteIndisponivel<DevolucaoDetalhe>()
  } else {
    let rej = 0
    const linhas: DevolucaoDetalhe[] = []
    for (const d of devolucoesRaw) {
      if (!idOk(d.id)) {
        rej += 1
        continue
      }
      linhas.push({
        devolucaoId: d.localId || d.id,
        vendaId: d.vendaLocalId ?? "",
        dataDevolucao: d.at instanceof Date ? d.at.toISOString() : String(d.at ?? ""),
        valor: arred(num(d.valorTotal)),
        status: String(d.tipo ?? ""),
      })
    }
    assertRegistrosFonte("devolucoes", linhas.length)
    devolucoes = { linhas, registros: linhas.length, ...estadoDe(rej, linhas.length) }
  }

  // ── movimentações ──
  let movimentacoes: FonteResultado<MovimentacaoDetalhe>
  if (!movRaw) {
    movimentacoes = fonteIndisponivel<MovimentacaoDetalhe>()
  } else {
    let rej = 0
    const linhas: MovimentacaoDetalhe[] = []
    for (const m of movRaw) {
      if (!idOk(m.id)) {
        rej += 1
        continue
      }
      linhas.push({
        movimentacaoId: m.id,
        data: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt ?? ""),
        tipo: String(m.tipo ?? ""),
        classificacao: classificarMovimento(String(m.tipo ?? ""), m.origem ?? null),
        valor: arred(num(m.valor)),
        origem: String(m.origem ?? ""),
      })
    }
    assertRegistrosFonte("movimentacoes", linhas.length)
    movimentacoes = { linhas, registros: linhas.length, ...estadoDe(rej, linhas.length) }
  }

  // ── títulos (receber / pagar) — posição atual, SÓ abertos com vencimento na competência ──
  // Espelha a regra canônica do GOAL 006 (`agregarTitulos`): normaliza status → remove
  // fechados → `parseVencimento` estrito → compara ano/mês → inclui só os correspondentes.
  //   • fechado          → fora (nunca "aberto", nunca valor_aberto = 0);
  //   • outro mês        → fora (pertence a outra competência; não rejeita, não vira parcial);
  //   • aberto sem venc. → fora + cobertura rejeitada → fonte parcial.
  const mapTitulos = (raw: TituloRaw[] | null): FonteResultado<TituloDetalhe> => {
    if (!raw) return fonteIndisponivel<TituloDetalhe>()
    let rej = 0
    let semVencimento = 0
    const linhas: TituloDetalhe[] = []
    for (const t of raw) {
      if (!idOk(t.id)) {
        rej += 1
        continue
      }
      if (tituloFechado(String(t.status ?? ""))) continue
      const venc = parseVencimento(String(t.vencimento ?? ""))
      if (!venc) {
        semVencimento += 1
        continue
      }
      if (venc.ano !== competencia.ano || venc.mes !== competencia.mes) continue
      const original = arred(num(t.valor))
      linhas.push({
        tituloId: t.id,
        vencimento: String(t.vencimento ?? ""),
        status: String(t.status ?? ""),
        valorOriginal: original,
        valorAberto: original, // aberto por construção (fechados já foram descartados)
        disponibilidade: "real", // vencimento válido e dentro da competência
      })
    }
    assertRegistrosFonte("titulos", linhas.length)
    if (rej > 0 || semVencimento > 0) {
      const partes: string[] = []
      if (rej > 0) partes.push(`${rej} linha(s) rejeitada(s) por dado inválido`)
      if (semVencimento > 0) {
        partes.push(`${semVencimento} título(s) aberto(s) sem vencimento reconhecível ficaram fora`)
      }
      return { linhas, registros: linhas.length, estado: "parcial", observacao: partes.join("; ") + "." }
    }
    return { linhas, registros: linhas.length, estado: "real" }
  }
  const contasReceber = mapTitulos(receberRaw)
  const contasPagar = mapTitulos(pagarRaw)

  // ── sessões ──
  let sessoes: FonteResultado<SessaoDetalhe>
  if (!sessoesRaw) {
    sessoes = fonteIndisponivel<SessaoDetalhe>()
  } else {
    let rej = 0
    const linhas: SessaoDetalhe[] = []
    for (const s of sessoesRaw) {
      if (!idOk(s.id)) {
        rej += 1
        continue
      }
      const sf = typeof s.saldoFinal === "number" && Number.isFinite(s.saldoFinal) ? s.saldoFinal : null
      const sc = typeof s.saldoContado === "number" && Number.isFinite(s.saldoContado) ? s.saldoContado : null
      const disp = sc !== null && sf !== null
      linhas.push({
        sessaoId: s.id,
        abertura: s.abertaEm instanceof Date ? s.abertaEm.toISOString() : String(s.abertaEm ?? ""),
        fechamento: s.fechadaEm instanceof Date ? s.fechadaEm.toISOString() : "",
        status: String(s.status ?? ""),
        saldoInicial: arred(num(s.saldoInicial)),
        saldoFinal: sf === null ? null : arred(sf),
        saldoContado: sc === null ? null : arred(sc),
        diferencaDisponivel: disp,
        diferenca: disp ? arred((sc as number) - (sf as number)) : null,
      })
    }
    assertRegistrosFonte("sessoes", linhas.length)
    sessoes = { linhas, registros: linhas.length, ...estadoDe(rej, linhas.length) }
  }

  // ── operações de caixa ──
  let operacoes: FonteResultado<OperacaoDetalhe>
  if (!operacoesRaw) {
    operacoes = fonteIndisponivel<OperacaoDetalhe>()
  } else {
    let rej = 0
    const linhas: OperacaoDetalhe[] = []
    for (const o of operacoesRaw) {
      if (!idOk(o.id)) {
        rej += 1
        continue
      }
      linhas.push({
        operacaoId: o.id,
        sessaoId: o.sessaoId ?? "",
        data: o.at instanceof Date ? o.at.toISOString() : String(o.at ?? ""),
        tipo: String(o.tipo ?? ""),
        classificacao: classificarOperacaoCaixa(String(o.tipo ?? "")),
        valor: arred(num(o.valor)),
      })
    }
    assertRegistrosFonte("operacoes", linhas.length)
    operacoes = { linhas, registros: linhas.length, ...estadoDe(rej, linhas.length) }
  }

  // ── agregado (formato do GOAL 006) derivado da MESMA carga crua ──
  const agregado: FontesContador = {
    vendas: (vendasRaw ?? []).map((v) => ({ total: num(v.total), status: v.status, payload: v.payload })),
    devolucoes: (devolucoesRaw ?? []).map((d) => ({ valorTotal: num(d.valorTotal) })),
    movimentacoes: (movRaw ?? []).map((m) => ({ tipo: String(m.tipo ?? ""), origem: m.origem ?? null, valor: num(m.valor) })),
    receber: (receberRaw ?? []).map((t) => ({ valor: num(t.valor), status: String(t.status ?? ""), vencimento: String(t.vencimento ?? "") })),
    pagar: (pagarRaw ?? []).map((t) => ({ valor: num(t.valor), status: String(t.status ?? ""), vencimento: String(t.vencimento ?? "") })),
    sessoes: (sessoesRaw ?? []).map((s) => ({ status: String(s.status ?? ""), saldoFinal: s.saldoFinal, saldoContado: s.saldoContado })),
    operacoes: (operacoesRaw ?? []).map((o) => ({ tipo: String(o.tipo ?? ""), valor: num(o.valor) })),
    falhas: Object.freeze(falhas),
  }

  return {
    vendas,
    itens,
    devolucoes,
    movimentacoes,
    contasReceber,
    contasPagar,
    sessoes,
    operacoes,
    agregado,
    totalQueries,
  }
}

/** Carga real via Prisma usando apenas um scope já validado. Read-only. */
export async function carregarFontesPacote(input: {
  scope: ContadorScopeInterno
  competencia: Competencia
}): Promise<FontesDetalhadasPacote> {
  await prismaEnsureConnected()
  return carregarFontesPacoteComCliente(
    input.scope,
    resolvePeriodoUtc(input.competencia),
    input.competencia,
    prisma as unknown as PacoteReaderClient,
  )
}
