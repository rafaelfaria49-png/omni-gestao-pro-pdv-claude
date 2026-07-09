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
export function novoServicoManualV4(input: { descricao: string; valor: number; custo?: number; garantiaDias?: number }): ServicoV3 {
  const garantia = Math.max(0, Math.trunc(Number(input.garantiaDias ?? 0) || 0));
  const custo = nonNeg(input.custo);
  return {
    id: uid("srv"),
    descricao: (input.descricao ?? "").trim(),
    valor: nonNeg(input.valor),
    desconto: 0,
    kindV3: "cobrado",
    ...(custo > 0 ? { custoV3: custo } : {}),
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

function servicoValidoV4(s: ServicoV3): boolean {
  return (s.descricao ?? "").trim().length > 0;
}
function pecaValidaV4(p: PecaV3): boolean {
  return (p.nome ?? "").trim().length > 0 && (p.quantidade || 0) > 0;
}

/**
 * Custo interno "informado" = número > 0. Um custo ausente ou zerado (peça do
 * catálogo sem custo cadastrado; serviço manual ainda não preenchido) é tratado
 * como NÃO informado — mesma convenção usada em outras telas de custo/margem do
 * OmniGestão. Não confundir com "custo realmente igual a zero".
 */
export function custoInformadoServico(s: ServicoV3): boolean {
  return typeof s.custoV3 === "number" && s.custoV3 > 0;
}
export function custoInformadoPeca(p: PecaV3): boolean {
  return typeof p.custoUnitario === "number" && p.custoUnitario > 0;
}

/** Conta, entre as linhas válidas (que seriam persistidas), quantas não têm custo interno informado. */
export function itensSemCustoV4(editor: OrcamentoEditorV4): number {
  const servicos = editor.servicos.filter(servicoValidoV4).filter((s) => !custoInformadoServico(s)).length;
  const pecas = editor.pecas.filter(pecaValidaV4).filter((p) => !custoInformadoPeca(p)).length;
  return servicos + pecas;
}

export interface EditorValidacaoV4 {
  ok: boolean;
  erro?: string;
}

/**
 * GOAL OPS-V4-ORCAMENTO-READBACK-EDIT-002: validação PRÉVIA ao salvar. `editorToSalvarInputV4`
 * DESCARTA em silêncio linhas sem descrição/nome — o que fazia o usuário perder um serviço/peça
 * que tinha valor/custo digitado (e o orçamento salvar vazio). Aqui bloqueamos ANTES de persistir:
 * uma linha "preenchida com valor" (valor OU custo informado) mas sem descrição/nome vira erro
 * explícito, nunca um descarte mudo. Linhas totalmente vazias (rascunho em branco) seguem
 * ignoráveis — não são erro, só não são persistidas. Puro, sem I/O.
 */
export function validarEditorParaSalvarV4(editor: OrcamentoEditorV4): EditorValidacaoV4 {
  const servicos = Array.isArray(editor.servicos) ? editor.servicos : [];
  for (const s of servicos) {
    const semDescricao = (s.descricao ?? "").trim().length === 0;
    const temValor = nonNeg(s.valor) > 0 || custoInformadoServico(s);
    if (semDescricao && temValor) return { ok: false, erro: "Informe a descrição do serviço antes de salvar." };
  }
  const pecas = Array.isArray(editor.pecas) ? editor.pecas : [];
  for (const p of pecas) {
    const semNome = (p.nome ?? "").trim().length === 0;
    const temValor = nonNeg(p.valorUnitario) > 0 || custoInformadoPeca(p);
    if (semNome && temValor) return { ok: false, erro: "Informe o nome da peça antes de salvar." };
  }
  return { ok: true };
}

/** Margem estimada (%) = lucro / total ao cliente. `null` quando não há total (sem base de cálculo). */
export function margemPercentualV4(t: Pick<TotaisOrcamentoV3, "total" | "lucro">): number | null {
  if (!t.total || t.total <= 0) return null;
  return (t.lucro / t.total) * 100;
}

/**
 * Normaliza o editor para o input da action `salvarOrcamentoV3`:
 * descarta serviços sem descrição e peças sem nome/quantidade; clampa números.
 */
export function editorToSalvarInputV4(editor: OrcamentoEditorV4): SalvarOrcamentoV3Input {
  const servicos = (Array.isArray(editor.servicos) ? editor.servicos : [])
    .filter(servicoValidoV4)
    .map(({ custoV3, ...s }) => {
      const custo = nonNeg(custoV3);
      return {
        ...s,
        descricao: s.descricao.trim(),
        valor: nonNeg(s.valor),
        desconto: Math.max(0, Number(s.desconto) || 0),
        ...(custo > 0 ? { custoV3: custo } : {}),
      };
    });
  const pecas = (Array.isArray(editor.pecas) ? editor.pecas : [])
    .filter(pecaValidaV4)
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
