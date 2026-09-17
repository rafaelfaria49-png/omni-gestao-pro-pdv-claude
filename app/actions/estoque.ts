"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import { revalidatePath } from "next/cache";
import { requireCadastrosActionAccess } from "@/lib/cadastros/cadastros-action-access";
import {
  cadastrosAuditPrincipalFromSession,
  type CadastrosAuditPrincipal,
} from "@/lib/cadastros/cadastros-audit-principal";
import {
  applyStockMutationTx,
  type StockLedgerTx,
} from "@/lib/estoque/stock-ledger-service";

/**
 * Movimentação de estoque (livro-razão) — CAD-R2-009.
 *
 * Estas actions são a porta de entrada HUMANA do boundary canônico
 * (`lib/estoque/stock-ledger-service.ts`). Toda entrada/ajuste, na MESMA transação:
 *  - trava a linha do produto (`SELECT ... FOR UPDATE`);
 *  - valida ownership produto+depósito por storeId (fail-closed);
 *  - atualiza Produto.stock + ProdutoDeposito (SUM == stock);
 *  - recalcula custo médio só em entrada com custo (saída/ajuste preservam);
 *  - grava 1 registro imutável em MovimentacaoEstoque (append-only).
 * Não toca o decremento de venda do PDV/OS — apenas entradas e ajustes manuais.
 */

export type MovimentacaoEstoqueDTO = {
  id: string;
  tipo: string;
  origem: string;
  quantidade: number;
  estoqueAntes: number;
  estoqueDepois: number;
  custoUnitario: number;
  custoMedioAntes: number;
  custoMedioDepois: number;
  valorTotal: number;
  documento: string | null;
  fornecedor: string | null;
  motivo: string | null;
  observacao: string | null;
  usuario: string | null;
  produtoNome: string;
  produtoSku: string | null;
  createdAt: string;
};

export type EntradaEstoqueResult =
  | { ok: true; movimentacaoId: string; estoqueDepois: number; custoMedioDepois: number }
  | { ok: false; reason: string };

function arredonda2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/** Mapeia falha do boundary para o reason público destas actions (contrato estável). */
function boundaryReason(
  code: string,
  message: string,
  fallback: string,
): string {
  switch (code) {
    case "NOT_FOUND":
    case "CROSS_STORE":
      return "Produto não encontrado nesta loja";
    case "VALIDATION":
    case "INSUFFICIENT_STOCK":
    case "STOCK_INVARIANT_DRIFT":
    case "IDEMPOTENCY_CONFLICT":
      return message || fallback;
    default:
      return fallback;
  }
}

/**
 * Entrada de mercadoria. quantidade > 0 obrigatória. Recalcula custo médio ponderado:
 *   novoCustoMedio = (estoqueAntes*custoMedioAntes + qtd*custoUnit) / (estoqueAntes + qtd)
 * Delega ao boundary canônico (lock + ownership + depósito + ledger na mesma tx).
 */
export async function registrarEntradaEstoque(
  storeId: string,
  input: {
    produtoId: string;
    quantidade: number;
    custoUnitario?: number;
    documento?: string;
    fornecedor?: string;
    observacao?: string;
    /** Aceito no contrato público; o ator oficial vem da sessão. */
    usuario?: string;
    /**
     * Chave de idempotência estável (CAD-R2-009). Operação manual sem ID estável:
     * omitir (sem fingir idempotência). Chamadas programáticas passam chave real.
     */
    idempotencyKey?: string;
  }
): Promise<EntradaEstoqueResult> {
  let sid: string;
  let principal: CadastrosAuditPrincipal | null;
  try {
    const gate = await requireCadastrosActionAccess(storeId, "shared");
    sid = gate.storeId;
    principal = cadastrosAuditPrincipalFromSession(gate.session);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Não autorizado" };
  }
  if (!input.produtoId?.trim()) return { ok: false, reason: "Produto inválido" };

  const qtd = Math.trunc(Number(input.quantidade));
  if (!Number.isFinite(qtd) || qtd <= 0) {
    return { ok: false, reason: "Quantidade deve ser um inteiro maior que zero" };
  }
  const custoUnit = Math.max(0, Number(input.custoUnitario ?? 0));
  if (!Number.isFinite(custoUnit)) return { ok: false, reason: "Custo unitário inválido" };

  try {
    const out = await prisma.$transaction(async (tx) => {
      const r = await applyStockMutationTx(
        tx as unknown as StockLedgerTx,
        { storeId: sid, principal, source: "estoque-actions" },
        {
          kind: "entrada",
          produtoId: input.produtoId,
          quantidade: qtd,
          custoUnitario: custoUnit,
          origem: "manual",
          documento: input.documento,
          fornecedor: input.fornecedor,
          observacao: input.observacao,
          idempotencyKey: input.idempotencyKey,
        },
      );
      if (!r.ok) return { ok: false as const, reason: boundaryReason(r.code, r.message, "Falha ao registrar entrada") };
      return {
        ok: true as const,
        movimentacaoId: r.movimentacaoId,
        estoqueDepois: r.estoqueDepois,
        custoMedioDepois: r.custoMedioDepois,
      };
    });

    if (out.ok) revalidatePath("/dashboard/cadastros-v2");
    return out;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao registrar entrada" };
  }
}

/**
 * Ajuste de saldo: define o novo saldo absoluto. Registra o delta (positivo ou negativo).
 * Não altera custo médio (correção de contagem, não compra).
 */
export async function registrarAjusteEstoque(
  storeId: string,
  input: {
    produtoId: string;
    novoSaldo: number;
    motivo: string;
    observacao?: string;
    /** Aceito no contrato público; o ator oficial vem da sessão. */
    usuario?: string;
    /**
     * Chave de idempotência estável (CAD-R2-009). Inventário passa
     * `inventario:<sessaoId>:<produtoId>`; operação manual omite.
     */
    idempotencyKey?: string;
  }
): Promise<EntradaEstoqueResult> {
  let sid: string;
  let principal: CadastrosAuditPrincipal | null;
  try {
    const gate = await requireCadastrosActionAccess(storeId, "shared");
    sid = gate.storeId;
    principal = cadastrosAuditPrincipalFromSession(gate.session);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Não autorizado" };
  }
  if (!input.produtoId?.trim()) return { ok: false, reason: "Produto inválido" };
  if (!input.motivo?.trim()) return { ok: false, reason: "Motivo do ajuste é obrigatório" };

  const novoSaldo = Math.trunc(Number(input.novoSaldo));
  if (!Number.isFinite(novoSaldo) || novoSaldo < 0) {
    return { ok: false, reason: "Novo saldo deve ser um inteiro >= 0" };
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      const r = await applyStockMutationTx(
        tx as unknown as StockLedgerTx,
        { storeId: sid, principal, source: "estoque-actions" },
        {
          kind: "ajuste",
          produtoId: input.produtoId,
          novoSaldo,
          origem: "manual",
          motivo: input.motivo,
          observacao: input.observacao,
          idempotencyKey: input.idempotencyKey,
        },
      );
      if (!r.ok) return { ok: false as const, reason: boundaryReason(r.code, r.message, "Falha ao registrar ajuste") };
      return {
        ok: true as const,
        movimentacaoId: r.movimentacaoId,
        estoqueDepois: r.estoqueDepois,
        custoMedioDepois: r.custoMedioDepois,
      };
    });

    if (out.ok) revalidatePath("/dashboard/cadastros-v2");
    return out;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao registrar ajuste" };
  }
}

export type EstoqueResumo = {
  totalSkus: number;
  skusComEstoque: number;
  skusSemEstoque: number;
  totalUnidades: number;
  valorCusto: number; // Σ stock × precoCusto
  valorVenda: number; // Σ stock × price
  margemPotencial: number; // valorVenda − valorCusto
};

/** KPIs de estoque da loja: valor a custo, valor a venda, unidades e cobertura de SKUs. */
export async function getEstoqueResumo(storeId: string): Promise<EstoqueResumo> {
  const sid = (await requireCadastrosActionAccess(storeId, "shared")).storeId;

  // Produto.stock × precoCusto/price não é expressável em aggregate do Prisma → soma em JS.
  const rows = await prisma.produto.findMany({
    where: { storeId: sid, active: true },
    select: { stock: true, precoCusto: true, price: true },
  });

  let totalUnidades = 0;
  let valorCusto = 0;
  let valorVenda = 0;
  let skusComEstoque = 0;
  for (const r of rows) {
    const stock = r.stock ?? 0;
    if (stock > 0) skusComEstoque += 1;
    totalUnidades += stock;
    valorCusto += stock * (r.precoCusto ?? 0);
    valorVenda += stock * (r.price ?? 0);
  }
  valorCusto = arredonda2(valorCusto);
  valorVenda = arredonda2(valorVenda);

  return {
    totalSkus: rows.length,
    skusComEstoque,
    skusSemEstoque: rows.length - skusComEstoque,
    totalUnidades,
    valorCusto,
    valorVenda,
    margemPotencial: arredonda2(valorVenda - valorCusto),
  };
}

/** Histórico de movimentações — por produto (se informado) ou geral da loja. */
export async function listMovimentacoesEstoque(
  storeId: string,
  opts?: { produtoId?: string; limit?: number }
): Promise<MovimentacaoEstoqueDTO[]> {
  const sid = (await requireCadastrosActionAccess(storeId, "shared")).storeId;
  const limit = Math.min(Math.max(1, opts?.limit ?? 50), 500);

  const rows = await prisma.movimentacaoEstoque.findMany({
    where: {
      storeId: sid,
      ...(opts?.produtoId?.trim() ? { produtoId: opts.produtoId.trim() } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((m) => ({
    id: m.id,
    tipo: m.tipo,
    origem: m.origem,
    quantidade: m.quantidade,
    estoqueAntes: m.estoqueAntes,
    estoqueDepois: m.estoqueDepois,
    custoUnitario: m.custoUnitario,
    custoMedioAntes: m.custoMedioAntes,
    custoMedioDepois: m.custoMedioDepois,
    valorTotal: m.valorTotal,
    documento: m.documento,
    fornecedor: m.fornecedor,
    motivo: m.motivo,
    observacao: m.observacao,
    usuario: m.usuario,
    produtoNome: m.produtoNome,
    produtoSku: m.produtoSku,
    createdAt: m.createdAt.toISOString(),
  }));
}

// ─── Auditoria operacional de estoque ────────────────────────────────────────

export type AuditoriaEstoqueFiltro = {
  /** YYYY-MM-DD (início, inclusivo). */
  dataInicio?: string;
  /** YYYY-MM-DD (fim, inclusivo). */
  dataFim?: string;
  produtoId?: string;
  usuario?: string;
  /** "entrada" | "ajuste" | "saida" */
  tipo?: string;
  /** "manual" | "importacao" | "os" | "pdv" */
  origem?: string;
  /** Somente movimentações que deixaram o saldo negativo. */
  somenteNegativos?: boolean;
  /** Atalho: força tipo = "ajuste". */
  somenteAjustes?: boolean;
  limit?: number;
};

export type AuditoriaEstoqueKpis = {
  movimentacoesHoje: number;
  entradasHoje: number;
  ajustesHoje: number;
  produtosNegativos: number;
  valorMovimentadoHoje: number;
};

export type AuditoriaProdutoAlerta = {
  id: string;
  nome: string;
  sku: string | null;
  stock: number;
  precoCusto: number;
  detalhe?: string;
};

export type AuditoriaEstoqueAlertas = {
  estoqueNegativo: AuditoriaProdutoAlerta[];
  custoZerado: AuditoriaProdutoAlerta[];
  semBarcode: AuditoriaProdutoAlerta[];
  ajustesExcessivos: AuditoriaProdutoAlerta[];
  totais: {
    estoqueNegativo: number;
    custoZerado: number;
    semBarcode: number;
    ajustesExcessivos: number;
  };
};

export type AuditoriaEstoqueData = {
  movimentacoes: MovimentacaoEstoqueDTO[];
  total: number;
  kpis: AuditoriaEstoqueKpis;
  alertas: AuditoriaEstoqueAlertas;
  filtros: {
    usuarios: string[];
    produtos: { id: string; nome: string }[];
  };
};

const ALERTA_LIMITE = 50;
/** Nº de ajustes no período recente que caracteriza "ajustes excessivos" sobre o mesmo produto. */
const AJUSTES_EXCESSIVOS_MINIMO = 3;
const AJUSTES_EXCESSIVOS_JANELA_DIAS = 30;

function parseDiaInicio(s?: string): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseDiaFim(s?: string): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function inicioDeHoje(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function vazioAuditoria(): AuditoriaEstoqueData {
  return {
    movimentacoes: [],
    total: 0,
    kpis: {
      movimentacoesHoje: 0,
      entradasHoje: 0,
      ajustesHoje: 0,
      produtosNegativos: 0,
      valorMovimentadoHoje: 0,
    },
    alertas: {
      estoqueNegativo: [],
      custoZerado: [],
      semBarcode: [],
      ajustesExcessivos: [],
      totais: { estoqueNegativo: 0, custoZerado: 0, semBarcode: 0, ajustesExcessivos: 0 },
    },
    filtros: { usuarios: [], produtos: [] },
  };
}

/**
 * Auditoria operacional de estoque: livro-razão filtrado + KPIs do dia + alertas + opções de filtro.
 * Somente leitura — não altera saldos, custo, nem decremento de PDV/OS.
 */
export async function getAuditoriaEstoque(
  storeId: string,
  filtro?: AuditoriaEstoqueFiltro
): Promise<AuditoriaEstoqueData> {
  const sid = (await requireCadastrosActionAccess(storeId, "shared")).storeId;

  const limit = Math.min(Math.max(1, filtro?.limit ?? 300), 1000);
  const tipoEfetivo = filtro?.somenteAjustes ? "ajuste" : filtro?.tipo?.trim() || undefined;
  const di = parseDiaInicio(filtro?.dataInicio);
  const df = parseDiaFim(filtro?.dataFim);

  const where: Prisma.MovimentacaoEstoqueWhereInput = {
    storeId: sid,
    ...(filtro?.produtoId?.trim() ? { produtoId: filtro.produtoId.trim() } : {}),
    ...(filtro?.usuario?.trim() ? { usuario: filtro.usuario.trim() } : {}),
    ...(tipoEfetivo ? { tipo: tipoEfetivo } : {}),
    ...(filtro?.origem?.trim() ? { origem: filtro.origem.trim() } : {}),
    ...(filtro?.somenteNegativos ? { estoqueDepois: { lt: 0 } } : {}),
    ...(di || df
      ? { createdAt: { ...(di ? { gte: di } : {}), ...(df ? { lte: df } : {}) } }
      : {}),
  };

  const hoje = inicioDeHoje();
  const janelaAjustes = new Date(Date.now() - AJUSTES_EXCESSIVOS_JANELA_DIAS * 24 * 60 * 60 * 1000);

  try {
    const [
      rows,
      total,
      movsHoje,
      produtosNegativos,
      negativosRows,
      custoZeroRows,
      custoZeroTotal,
      semBarcodeRows,
      semBarcodeTotal,
      ajustesAgrupados,
      usuariosRows,
      produtosRows,
    ] = await Promise.all([
      prisma.movimentacaoEstoque.findMany({ where, orderBy: { createdAt: "desc" }, take: limit }),
      prisma.movimentacaoEstoque.count({ where }),
      prisma.movimentacaoEstoque.findMany({
        where: { storeId: sid, createdAt: { gte: hoje } },
        select: { tipo: true, valorTotal: true },
      }),
      prisma.produto.count({ where: { storeId: sid, stock: { lt: 0 } } }),
      prisma.produto.findMany({
        where: { storeId: sid, stock: { lt: 0 } },
        select: { id: true, name: true, sku: true, stock: true, precoCusto: true },
        orderBy: { stock: "asc" },
        take: ALERTA_LIMITE,
      }),
      prisma.produto.findMany({
        where: { storeId: sid, active: true, stock: { gt: 0 }, precoCusto: { lte: 0 } },
        select: { id: true, name: true, sku: true, stock: true, precoCusto: true },
        orderBy: { stock: "desc" },
        take: ALERTA_LIMITE,
      }),
      prisma.produto.count({
        where: { storeId: sid, active: true, stock: { gt: 0 }, precoCusto: { lte: 0 } },
      }),
      prisma.produto.findMany({
        where: { storeId: sid, active: true, OR: [{ barcode: null }, { barcode: "" }] },
        select: { id: true, name: true, sku: true, stock: true, precoCusto: true },
        orderBy: { name: "asc" },
        take: ALERTA_LIMITE,
      }),
      prisma.produto.count({
        where: { storeId: sid, active: true, OR: [{ barcode: null }, { barcode: "" }] },
      }),
      prisma.movimentacaoEstoque.groupBy({
        by: ["produtoId", "produtoNome", "produtoSku"],
        where: { storeId: sid, tipo: "ajuste", produtoId: { not: null }, createdAt: { gte: janelaAjustes } },
        _count: { _all: true },
      }),
      prisma.movimentacaoEstoque.findMany({
        where: { storeId: sid, usuario: { not: null } },
        select: { usuario: true },
        distinct: ["usuario"],
        orderBy: { usuario: "asc" },
        take: 200,
      }),
      prisma.movimentacaoEstoque.findMany({
        where: { storeId: sid, produtoId: { not: null } },
        select: { produtoId: true, produtoNome: true },
        distinct: ["produtoId"],
        orderBy: { produtoNome: "asc" },
        take: 1000,
      }),
    ]);

    let entradasHoje = 0;
    let ajustesHoje = 0;
    let valorMovimentadoHoje = 0;
    for (const m of movsHoje) {
      if (m.tipo === "entrada") entradasHoje += 1;
      else if (m.tipo === "ajuste") ajustesHoje += 1;
      valorMovimentadoHoje += Math.abs(m.valorTotal ?? 0);
    }

    const ajustesExcessivos: AuditoriaProdutoAlerta[] = ajustesAgrupados
      .filter((g) => (g._count?._all ?? 0) >= AJUSTES_EXCESSIVOS_MINIMO && g.produtoId)
      .sort((a, b) => (b._count?._all ?? 0) - (a._count?._all ?? 0))
      .slice(0, ALERTA_LIMITE)
      .map((g) => ({
        id: g.produtoId as string,
        nome: g.produtoNome,
        sku: g.produtoSku,
        stock: 0,
        precoCusto: 0,
        detalhe: `${g._count?._all ?? 0} ajustes em ${AJUSTES_EXCESSIVOS_JANELA_DIAS} dias`,
      }));
    const ajustesExcessivosTotal = ajustesAgrupados.filter(
      (g) => (g._count?._all ?? 0) >= AJUSTES_EXCESSIVOS_MINIMO && g.produtoId
    ).length;

    const mapAlerta = (
      p: { id: string; name: string; sku: string | null; stock: number; precoCusto: number },
      detalhe?: string
    ): AuditoriaProdutoAlerta => ({
      id: p.id,
      nome: p.name,
      sku: p.sku,
      stock: p.stock,
      precoCusto: p.precoCusto,
      detalhe,
    });

    return {
      movimentacoes: rows.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        origem: m.origem,
        quantidade: m.quantidade,
        estoqueAntes: m.estoqueAntes,
        estoqueDepois: m.estoqueDepois,
        custoUnitario: m.custoUnitario,
        custoMedioAntes: m.custoMedioAntes,
        custoMedioDepois: m.custoMedioDepois,
        valorTotal: m.valorTotal,
        documento: m.documento,
        fornecedor: m.fornecedor,
        motivo: m.motivo,
        observacao: m.observacao,
        usuario: m.usuario,
        produtoNome: m.produtoNome,
        produtoSku: m.produtoSku,
        createdAt: m.createdAt.toISOString(),
      })),
      total,
      kpis: {
        movimentacoesHoje: movsHoje.length,
        entradasHoje,
        ajustesHoje,
        produtosNegativos,
        valorMovimentadoHoje: arredonda2(valorMovimentadoHoje),
      },
      alertas: {
        estoqueNegativo: negativosRows.map((p) => mapAlerta(p)),
        custoZerado: custoZeroRows.map((p) => mapAlerta(p)),
        semBarcode: semBarcodeRows.map((p) => mapAlerta(p)),
        ajustesExcessivos,
        totais: {
          estoqueNegativo: produtosNegativos,
          custoZerado: custoZeroTotal,
          semBarcode: semBarcodeTotal,
          ajustesExcessivos: ajustesExcessivosTotal,
        },
      },
      filtros: {
        usuarios: usuariosRows.map((u) => u.usuario).filter((u): u is string => !!u),
        produtos: produtosRows
          .filter((p) => p.produtoId)
          .map((p) => ({ id: p.produtoId as string, nome: p.produtoNome })),
      },
    };
  } catch (e) {
    console.error("[getAuditoriaEstoque]", e instanceof Error ? e.message : e);
    return vazioAuditoria();
  }
}
