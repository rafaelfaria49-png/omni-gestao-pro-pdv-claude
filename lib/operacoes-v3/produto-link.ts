// ============================================================================
// Operações V3 — SPRINT_3D.1B · Vínculo de peça ao catálogo oficial (puro)
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React). Converte um produto do catálogo oficial em
// uma peça da OS já VINCULADA (carregando `produtoId`/`sku`/`barcode`), o que faz
// o adapter oficial de estoque resolver o produto imediatamente (fim do
// "nothing_to_consume" para peças vinculadas).
//
// Compatibilidade retroativa: todos os campos de vínculo são opcionais e já
// existem em `PecaUsada` (`produtoId`/`sku`/`barcode`/`produtoOrigem`). Peças
// antigas (manuais, sem `produtoId`) continuam válidas e são tratadas como
// "Item manual". NENHUMA mudança de payload/schema.
// ============================================================================

import type { PecaUsada } from "@/types/os";
import type { ProdutoDTO } from "@/app/actions/cadastros";
import type { OrcamentoLinhaKindV3, PecaV3 } from "./orcamento-model";

/** Visão enxuta do catálogo usada pelo Product Picker. */
export interface ProdutoCatalogoV3 {
  id: string;
  nome: string;
  sku: string;
  barcode: string;
  estoque: number;
  custo: number;
  preco: number;
  garantiaDias: number;
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? `peca_${crypto.randomUUID()}` : `peca_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
}

function nonNegNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Normaliza o DTO do cadastro (onde `sku` ausente vira "—") para a visão do picker. */
export function produtoDTOToCatalogoV3(p: ProdutoDTO): ProdutoCatalogoV3 {
  const sku = typeof p.sku === "string" && p.sku.trim() && p.sku.trim() !== "—" ? p.sku.trim() : "";
  return {
    id: p.id,
    nome: p.nome,
    sku,
    barcode: typeof p.barras === "string" ? p.barras.trim() : "",
    estoque: Number(p.estoque ?? 0) || 0,
    custo: nonNegNum(p.custo),
    preco: nonNegNum(p.preco),
    garantiaDias: Math.max(0, Math.trunc(Number(p.garantia ?? 0) || 0)),
  };
}

/**
 * Uma peça está vinculada ao estoque quando carrega um `produtoId` real (ou foi
 * marcada como origem "prisma"). Esse é o sinal que o adapter usa para baixar
 * estoque sem cair em "nothing_to_consume".
 */
export function pecaVinculadaAoEstoqueV3(p: Partial<PecaUsada> | null | undefined): boolean {
  if (!p) return false;
  const pid = typeof p.produtoId === "string" ? p.produtoId.trim() : "";
  if (pid) return true;
  return p.produtoOrigem === "prisma";
}

/** Campos de vínculo derivados de um produto (preço/custo/garantia do catálogo). */
function vinculoFields(produto: ProdutoCatalogoV3): Pick<PecaV3, "produtoId" | "nome" | "sku" | "barcode" | "produtoOrigem" | "valorUnitario" | "custoUnitario" | "prazoGarantiaDias"> {
  return {
    produtoId: produto.id,
    nome: produto.nome,
    sku: produto.sku || undefined,
    barcode: produto.barcode || undefined,
    produtoOrigem: "prisma",
    valorUnitario: Math.max(0, produto.preco),
    custoUnitario: Math.max(0, produto.custo),
    prazoGarantiaDias: produto.garantiaDias > 0 ? produto.garantiaDias : undefined,
  };
}

/** Cria uma PecaV3 NOVA já vinculada ao catálogo (para "Adicionar do catálogo"). */
export function pecaFromProdutoV3(
  produto: ProdutoCatalogoV3,
  opts?: { id?: string; quantidade?: number; kindV3?: OrcamentoLinhaKindV3 },
): PecaV3 {
  return {
    id: opts?.id ?? uid(),
    quantidade: Math.max(1, Math.trunc(opts?.quantidade ?? 1) || 1),
    kindV3: opts?.kindV3 ?? "cobrado",
    ...vinculoFields(produto),
  };
}

/**
 * Patch para VINCULAR uma peça existente a um produto, preservando quantidade,
 * kind e id (apenas reescreve nome/preço/custo/garantia + ids de vínculo).
 */
export function vincularPecaProdutoV3(produto: ProdutoCatalogoV3): Partial<PecaV3> {
  return { ...vinculoFields(produto) };
}
