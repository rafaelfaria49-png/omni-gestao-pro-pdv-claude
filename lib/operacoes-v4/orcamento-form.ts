// ============================================================================
// Operações V4 — Orçamento · mapeamento PURO do editor V4 ↔ contrato da V3.
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React, sem Prisma). O editor de orçamento V4-native
// trabalha com as MESMAS estruturas persistidas da V3 (`ServicoV3`/`PecaV3`),
// então este helper só: semeia o editor a partir da OS real, cria linhas novas
// (serviço manual / peça do catálogo), calcula totais (reusando `computeTotaisV3`)
// e normaliza o editor para o `SalvarOrcamentoV3Input` da action `salvarOrcamentoV3`.
//
// NÃO persiste, NÃO valida regra de negócio, NÃO toca estoque/financeiro. A peça
// do catálogo é criada por `pecaFromProdutoV3` (V3, reuso) apenas como REFERÊNCIA
// de orçamento — nenhuma baixa/reserva de estoque acontece aqui.
// ============================================================================

import type { OrdemServico, Orcamento } from "@/types/os";
import {
  computeTotaisV3,
  type OrcamentoLinhaKindV3,
  type PecaV3,
  type ServicoV3,
  type SalvarOrcamentoV3Input,
  type TotaisOrcamentoV3,
} from "@/lib/operacoes-v3/orcamento-model";
import {
  pecaFromProdutoV3,
  type ProdutoCatalogoV3,
} from "@/lib/operacoes-v3/produto-link";

/** Estado do editor de orçamento V4 (espelha o contrato `SalvarOrcamentoV3Input`). */
export interface OrcamentoEditorV4 {
  servicos: ServicoV3[];
  pecas: PecaV3[];
  desconto: number;
  observacao?: string;
}

function uid(prefix: string): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
}

function nonNeg(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Editor vazio (orçamento ainda sem linhas). */
export function editorVazioV4(): OrcamentoEditorV4 {
  return { servicos: [], pecas: [], desconto: 0 };
}

/**
 * Semeia o editor a partir do orçamento REAL da OS (servicos/pecas/desconto),
 * preservando os campos V3 (`kindV3`/`custoV3`). Sem orçamento → editor vazio.
 */
export function seedEditorFromOS(os: OrdemServico | null | undefined): OrcamentoEditorV4 {
  const orc = (os as { orcamento?: Orcamento } | null | undefined)?.orcamento;
  if (!orc || typeof orc !== "object") return editorVazioV4();
  const servicos = Array.isArray(orc.servicos) ? (orc.servicos as ServicoV3[]).map((s) => ({ ...s })) : [];
  const pecas = Array.isArray(orc.pecas) ? (orc.pecas as PecaV3[]).map((p) => ({ ...p })) : [];
  return {
    servicos,
    pecas,
    desconto: nonNeg(orc.desconto),
    observacao: typeof orc.observacao === "string" ? orc.observacao : undefined,
  };
}

/** Cria uma linha de SERVIÇO manual (sempre "cobrado" nesta fase). */
export function novoServicoManualV4(input: { descricao: string; valor: number; garantiaDias?: number }): ServicoV3 {
  const garantia = Math.max(0, Math.trunc(Number(input.garantiaDias ?? 0) || 0));
  return {
    id: uid("srv"),
    descricao: (input.descricao ?? "").trim(),
    valor: nonNeg(input.valor),
    desconto: 0,
    kindV3: "cobrado",
    ...(garantia > 0 ? { prazoGarantiaDias: garantia } : {}),
  };
}

/** Cria uma linha de PEÇA a partir de um produto do catálogo (reuso de `pecaFromProdutoV3`). */
export function pecaFromProdutoV4(
  produto: ProdutoCatalogoV3,
  opts?: { quantidade?: number; kindV3?: OrcamentoLinhaKindV3 },
): PecaV3 {
  return pecaFromProdutoV3(produto, { quantidade: opts?.quantidade, kindV3: opts?.kindV3 });
}

/** Totais ao vivo do editor (reusa a regra de brindes/custo da V3). */
export function totaisEditorV4(editor: OrcamentoEditorV4): TotaisOrcamentoV3 {
  return computeTotaisV3({ servicos: editor.servicos, pecas: editor.pecas, desconto: editor.desconto });
}

/**
 * Normaliza o editor para o input da action `salvarOrcamentoV3`:
 * descarta serviços sem descrição e peças sem nome/quantidade; clampa números.
 */
export function editorToSalvarInputV4(editor: OrcamentoEditorV4): SalvarOrcamentoV3Input {
  const servicos = (Array.isArray(editor.servicos) ? editor.servicos : [])
    .filter((s) => (s.descricao ?? "").trim().length > 0)
    .map((s) => ({
      ...s,
      descricao: s.descricao.trim(),
      valor: nonNeg(s.valor),
      desconto: Math.max(0, Number(s.desconto) || 0),
    }));
  const pecas = (Array.isArray(editor.pecas) ? editor.pecas : [])
    .filter((p) => (p.nome ?? "").trim().length > 0 && (p.quantidade || 0) > 0)
    .map((p) => ({
      ...p,
      nome: p.nome.trim(),
      quantidade: Math.max(1, Math.trunc(p.quantidade) || 1),
      valorUnitario: nonNeg(p.valorUnitario),
      desconto: Math.max(0, Number(p.desconto) || 0),
    }));
  const observacao = typeof editor.observacao === "string" && editor.observacao.trim() ? editor.observacao.trim() : undefined;
  return { servicos, pecas, desconto: Math.max(0, Number(editor.desconto) || 0), observacao };
}
