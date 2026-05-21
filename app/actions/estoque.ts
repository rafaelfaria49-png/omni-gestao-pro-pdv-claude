"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * Movimentação de estoque (livro-razão). Toda entrada/ajuste:
 *  - grava 1 registro imutável em MovimentacaoEstoque (auditoria);
 *  - atualiza Produto.stock e Produto.precoCusto (custo médio) na MESMA transação.
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

/**
 * Entrada de mercadoria. quantidade > 0 obrigatória. Recalcula custo médio ponderado:
 *   novoCustoMedio = (estoqueAntes*custoMedioAntes + qtd*custoUnit) / (estoqueAntes + qtd)
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
    usuario?: string;
  }
): Promise<EntradaEstoqueResult> {
  const sid = (storeId ?? "").trim();
  if (!sid) return { ok: false, reason: "Loja não selecionada" };
  if (!input.produtoId?.trim()) return { ok: false, reason: "Produto inválido" };

  const qtd = Math.trunc(Number(input.quantidade));
  if (!Number.isFinite(qtd) || qtd <= 0) {
    return { ok: false, reason: "Quantidade deve ser um inteiro maior que zero" };
  }
  const custoUnit = Math.max(0, Number(input.custoUnitario ?? 0));
  if (!Number.isFinite(custoUnit)) return { ok: false, reason: "Custo unitário inválido" };

  try {
    const out = await prisma.$transaction(async (tx) => {
      const prod = await tx.produto.findFirst({
        where: { id: input.produtoId, storeId: sid },
        select: { id: true, name: true, sku: true, stock: true, precoCusto: true },
      });
      if (!prod) return { ok: false as const, reason: "Produto não encontrado nesta loja" };

      const estoqueAntes = prod.stock;
      const custoMedioAntes = prod.precoCusto ?? 0;
      const estoqueDepois = estoqueAntes + qtd;
      // Custo médio só muda quando há custo informado; senão preserva o anterior.
      const custoMedioDepois =
        custoUnit > 0 && estoqueDepois > 0
          ? arredonda2((estoqueAntes * custoMedioAntes + qtd * custoUnit) / estoqueDepois)
          : custoMedioAntes;

      const mov = await tx.movimentacaoEstoque.create({
        data: {
          storeId: sid,
          produtoId: prod.id,
          produtoSku: prod.sku,
          produtoNome: prod.name,
          tipo: "entrada",
          origem: "manual",
          quantidade: qtd,
          estoqueAntes,
          estoqueDepois,
          custoUnitario: custoUnit,
          custoMedioAntes,
          custoMedioDepois,
          valorTotal: arredonda2(qtd * custoUnit),
          documento: input.documento?.trim() || null,
          fornecedor: input.fornecedor?.trim() || null,
          observacao: input.observacao?.trim() || null,
          usuario: input.usuario?.trim() || null,
        },
        select: { id: true },
      });

      await tx.produto.update({
        where: { id: prod.id },
        data: {
          stock: estoqueDepois,
          // Só sobrescreve custo quando recalculado (custo informado > 0).
          precoCusto: custoUnit > 0 ? custoMedioDepois : undefined,
        },
      });

      return {
        ok: true as const,
        movimentacaoId: mov.id,
        estoqueDepois,
        custoMedioDepois,
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
    usuario?: string;
  }
): Promise<EntradaEstoqueResult> {
  const sid = (storeId ?? "").trim();
  if (!sid) return { ok: false, reason: "Loja não selecionada" };
  if (!input.produtoId?.trim()) return { ok: false, reason: "Produto inválido" };
  if (!input.motivo?.trim()) return { ok: false, reason: "Motivo do ajuste é obrigatório" };

  const novoSaldo = Math.trunc(Number(input.novoSaldo));
  if (!Number.isFinite(novoSaldo) || novoSaldo < 0) {
    return { ok: false, reason: "Novo saldo deve ser um inteiro >= 0" };
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      const prod = await tx.produto.findFirst({
        where: { id: input.produtoId, storeId: sid },
        select: { id: true, name: true, sku: true, stock: true, precoCusto: true },
      });
      if (!prod) return { ok: false as const, reason: "Produto não encontrado nesta loja" };

      const estoqueAntes = prod.stock;
      const custoMedio = prod.precoCusto ?? 0;
      const delta = novoSaldo - estoqueAntes;
      if (delta === 0) return { ok: false as const, reason: "Novo saldo igual ao atual — nada a ajustar" };

      const mov = await tx.movimentacaoEstoque.create({
        data: {
          storeId: sid,
          produtoId: prod.id,
          produtoSku: prod.sku,
          produtoNome: prod.name,
          tipo: "ajuste",
          origem: "manual",
          quantidade: delta,
          estoqueAntes,
          estoqueDepois: novoSaldo,
          custoUnitario: 0,
          custoMedioAntes: custoMedio,
          custoMedioDepois: custoMedio,
          valorTotal: 0,
          motivo: input.motivo.trim(),
          observacao: input.observacao?.trim() || null,
          usuario: input.usuario?.trim() || null,
        },
        select: { id: true },
      });

      await tx.produto.update({
        where: { id: prod.id },
        data: { stock: novoSaldo },
      });

      return { ok: true as const, movimentacaoId: mov.id, estoqueDepois: novoSaldo, custoMedioDepois: custoMedio };
    });

    if (out.ok) revalidatePath("/dashboard/cadastros-v2");
    return out;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao registrar ajuste" };
  }
}

/** Histórico de movimentações — por produto (se informado) ou geral da loja. */
export async function listMovimentacoesEstoque(
  storeId: string,
  opts?: { produtoId?: string; limit?: number }
): Promise<MovimentacaoEstoqueDTO[]> {
  const sid = (storeId ?? "").trim();
  if (!sid) return [];
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
    produtoNome: m.produtoNome,
    produtoSku: m.produtoSku,
    createdAt: m.createdAt.toISOString(),
  }));
}
