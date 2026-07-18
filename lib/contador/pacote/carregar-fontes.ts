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
 * Não chama `construirDadosContador` (evita uma segunda rodada de 7 queries). São 8 queries:
 * 7 fontes em `Promise.allSettled` + 1 lookup de Produto (códigos dos itens), dependente
 * do sucesso de vendas. Uma falha isolada NÃO cancela as demais e NÃO vaza stack/erro Prisma.
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
import { assertRegistrosFonte, MAX_REGISTROS_POR_FONTE } from "./seguranca"
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
const TAKE = MAX_REGISTROS_POR_FONTE + 1

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
): Promise<FontesDetalhadasPacote> {
  const noPeriodo = { gte: periodo.inicio, lt: periodo.fimExclusivo }
  const storeId = scope.storeId

  const resultados = await Promise.allSettled([
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
      orderBy: { at: "asc" },
      take: TAKE,
    }),
    cliente.devolucaoVenda.findMany({
      where: { storeId, at: noPeriodo },
      select: { id: true, localId: true, vendaLocalId: true, tipo: true, valorTotal: true, at: true },
      orderBy: { at: "asc" },
      take: TAKE,
    }),
    cliente.movimentacaoFinanceira.findMany({
      where: { storeId, createdAt: noPeriodo },
      select: { id: true, tipo: true, origem: true, valor: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: TAKE,
    }),
    cliente.contaReceberTitulo.findMany({
      where: { storeId },
      select: { id: true, valor: true, status: true, vencimento: true },
      take: TAKE,
    }),
    cliente.contaPagarTitulo.findMany({
      where: { storeId },
      select: { id: true, valor: true, status: true, vencimento: true },
      take: TAKE,
    }),
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
      orderBy: { abertaEm: "asc" },
      take: TAKE,
    }),
    cliente.caixaOperacao.findMany({
      where: { storeId, at: noPeriodo },
      select: { id: true, sessaoId: true, tipo: true, valor: true, at: true },
      orderBy: { at: "asc" },
      take: TAKE,
    }),
  ] as const)

  let totalQueries = 7
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

  // Lookup de Produto para códigos dos itens (dependente do sucesso de vendas).
  const produtoMap = new Map<string, string>()
  if (vendasRaw) {
    const invIds = Array.from(
      new Set(
        vendasRaw.flatMap((v) => v.itens).map((i) => i.inventoryId).filter((x): x is string => idOk(x)),
      ),
    )
    if (invIds.length > 0) {
      totalQueries += 1
      try {
        const produtos = await cliente.produto.findMany({
          where: { storeId, id: { in: invIds } },
          select: { id: true, sku: true, barcode: true },
        })
        for (const p of produtos) {
          const codigo = (p.sku ?? p.barcode ?? "").trim()
          if (idOk(p.id) && codigo) produtoMap.set(p.id, codigo)
        }
      } catch {
        // Produto indisponível não invalida vendas: código do item fica vazio.
      }
    }
  }

  // ── devoluções por venda (link exato vendaLocalId == numero da venda) ──
  const devPorVenda = new Map<string, number>()
  for (const d of devolucoesRaw ?? []) {
    if (idOk(d.vendaLocalId)) devPorVenda.set(d.vendaLocalId, (devPorVenda.get(d.vendaLocalId) ?? 0) + num(d.valorTotal))
  }

  // ── vendas ──
  let vendas: FonteResultado<VendaDetalhe>
  if (!vendasRaw) {
    vendas = fonteIndisponivel<VendaDetalhe>()
  } else {
    let rej = 0
    const linhas: VendaDetalhe[] = []
    for (const v of vendasRaw) {
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
    const linhas: ItemDetalhe[] = []
    for (const v of vendasRaw) {
      if (String(v.status ?? "").toLowerCase().trim() === "cancelada") continue
      for (const it of v.itens ?? []) {
        if (!idOk(it.id) || !idOk(v.id)) {
          rej += 1
          continue
        }
        const qtd = num(it.quantidade)
        const unit = arred(num(it.precoUnitario))
        const totalItem = arred(num(it.lineTotal))
        linhas.push({
          vendaId: v.id,
          itemId: it.id,
          produtoCodigo: idOk(it.inventoryId) ? (produtoMap.get(it.inventoryId) ?? "") : "",
          produtoDescricao: String(it.nome ?? ""),
          quantidade: qtd,
          valorUnitario: unit,
          desconto: arred(Math.max(0, qtd * unit - totalItem)),
          totalItem,
        })
      }
    }
    assertRegistrosFonte("itens", linhas.length)
    itens = { linhas, registros: linhas.length, ...estadoDe(rej, linhas.length) }
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

  // ── títulos (receber / pagar) ──
  const mapTitulos = (raw: TituloRaw[] | null): FonteResultado<TituloDetalhe> => {
    if (!raw) return fonteIndisponivel<TituloDetalhe>()
    let rej = 0
    const linhas: TituloDetalhe[] = []
    for (const t of raw) {
      if (!idOk(t.id)) {
        rej += 1
        continue
      }
      const original = arred(num(t.valor))
      linhas.push({
        tituloId: t.id,
        vencimento: String(t.vencimento ?? ""),
        status: String(t.status ?? ""),
        valorOriginal: original,
        valorAberto: tituloFechado(String(t.status ?? "")) ? 0 : original,
        disponibilidade: parseVencimento(String(t.vencimento ?? "")) ? "real" : "parcial",
      })
    }
    assertRegistrosFonte("titulos", linhas.length)
    // Estado da fonte: parcial se algum título sem vencimento reconhecível (cobertura).
    const semVenc = linhas.filter((l) => l.disponibilidade === "parcial").length
    if (rej > 0 || semVenc > 0) {
      const partes: string[] = []
      if (rej > 0) partes.push(`${rej} linha(s) rejeitada(s)`)
      if (semVenc > 0) partes.push(`${semVenc} título(s) sem vencimento reconhecível`)
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
