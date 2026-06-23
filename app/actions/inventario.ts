"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { auth } from "@/auth";
import { canAccessStore } from "@/lib/auth/enterprise-permissions";
import { registrarAjusteEstoque } from "@/app/actions/estoque";
import {
  aplicarBipe,
  aplicarModoContagem,
  diferencaContagem,
  montarRelatorioInventario,
  normalizarCodigo,
  normalizarModoContagem,
  STATUS_CONTAGEM,
  STATUS_SESSAO,
  type ContagemLinha,
  type ModoContagem,
  type ProdutoEstoque,
} from "@/lib/estoque/inventario-core";
import {
  lerAjusteContagem,
  marcarAjusteContagemPayload,
  lerAjustesNaoBipados,
  naoBipadoAjustado,
  marcarAjusteNaoBipadoPayload,
  novoSaldoParaContagem,
  NOVO_SALDO_NAO_BIPADO,
  montarMotivoInventario,
} from "@/lib/estoque/inventario-ajuste";
import {
  lerClassificacaoReconciliacao,
  marcarClassificacaoReconciliacao,
  normalizarClassificacao,
  type ClassificacaoReconciliacao,
} from "@/lib/estoque/inventario-reconciliacao";
import {
  lerPendencia,
  marcarPendenciaPayload,
  lerVinculoPendencia,
  marcarVinculoPendencia,
  pendenciaResolvida,
  type TipoVinculoPendencia,
  type VinculoPendencia,
} from "@/lib/estoque/inventario-pendencia";
import {
  normalizarCodigoAlias,
  produtoResolveCodigo,
  adicionarCodigoAliasMetadata,
} from "@/lib/estoque/produto-codigo-alias";
import {
  montarConciliacao,
  simularAplicacaoConciliacao,
  saldoAplicavel,
  somarMovimentacoesApos,
  GRUPO_CONCILIACAO,
  type ItemConciliado,
  type ItemNaoEncontrado,
  type TotaisConciliacao,
  type SimulacaoConciliacao,
  type MovimentoEstoqueConc,
} from "@/lib/estoque/inventario-conciliacao";

/**
 * INVENTARIO_ASSISTIDO_V1 — Fase 2 (Sessão + Bipagem + Armazenamento).
 *
 * Orquestra o núcleo PURO (`lib/estoque/inventario-core.ts`) sobre o Prisma. Esta camada é
 * INERTE por contrato (espelha o Gate #1):
 *   - NUNCA altera `Produto.stock` (o ajuste real é humano — Fase 4, reusa `registrarAjusteEstoque`).
 *   - Código sem produto NÃO vira cadastro: entra na FILA DE RECONCILIAÇÃO (status "reconciliacao").
 *   - Encerrar a sessão apenas grava `status = finalizada` (relatório/ajuste ficam para F3/F4).
 *
 * Multi-loja: toda query é escopada por `storeId` e protegida por `canAccessStore` (ADR-0003 —
 * sem fallback de loja). A sessão só é tocada quando pertence à loja informada.
 */

export type InventarioSessaoDTO = {
  id: string;
  storeId: string;
  status: string;
  operador: string | null;
  nome: string | null;
  observacao: string | null;
  iniciadoEm: string;
  finalizadoEm: string | null;
};

export type InventarioContagemDTO = {
  id: string;
  produtoId: string | null;
  codigoBipado: string;
  produtoNome: string | null;
  produtoSku: string | null;
  /** Snapshot de `Produto.stock` no 1º bipe (null na fila de reconciliação). */
  estoqueSistema: number | null;
  quantidadeContada: number;
  /** Contado − Sistema (null quando não há produto resolvido). */
  diferenca: number | null;
  status: string;
  ultimoBipeEm: string;
};

type GuardOk = { ok: true; sid: string; usuario: string | null };
type ActionFail = { ok: false; reason: string };

/**
 * Autentica, valida a loja e resolve o operador padrão (nome/email da sessão NextAuth).
 * Sem fallback silencioso de loja (ADR-0003).
 */
async function guard(storeId: string): Promise<GuardOk | ActionFail> {
  const session = await auth();
  if (!session?.user) return { ok: false, reason: "Não autenticado" };
  const sid = (storeId ?? "").trim();
  if (!sid) return { ok: false, reason: "Loja não selecionada" };
  if (!canAccessStore(session, sid)) return { ok: false, reason: "Sem acesso à loja" };
  const u = session.user;
  const usuario = (u.name || u.email || "").trim() || null;
  return { ok: true, sid, usuario };
}

type SessaoRow = {
  id: string;
  storeId: string;
  status: string;
  operador: string | null;
  nome: string | null;
  observacao: string | null;
  iniciadoEm: Date;
  finalizadoEm: Date | null;
};

function sessaoToDTO(s: SessaoRow): InventarioSessaoDTO {
  return {
    id: s.id,
    storeId: s.storeId,
    status: s.status,
    operador: s.operador,
    nome: s.nome,
    observacao: s.observacao,
    iniciadoEm: s.iniciadoEm.toISOString(),
    finalizadoEm: s.finalizadoEm ? s.finalizadoEm.toISOString() : null,
  };
}

type ContagemRow = {
  id: string;
  produtoId: string | null;
  codigoBipado: string;
  produtoNomeSnapshot: string | null;
  produtoSkuSnapshot: string | null;
  estoqueSistemaSnapshot: number | null;
  quantidadeContada: number;
  status: string;
  ultimoBipeEm: Date;
};

function contagemToDTO(c: ContagemRow): InventarioContagemDTO {
  const resolvido = c.status === STATUS_CONTAGEM.ENCONTRADO && c.estoqueSistemaSnapshot != null;
  return {
    id: c.id,
    produtoId: c.produtoId,
    codigoBipado: c.codigoBipado,
    produtoNome: c.produtoNomeSnapshot,
    produtoSku: c.produtoSkuSnapshot,
    estoqueSistema: c.estoqueSistemaSnapshot,
    quantidadeContada: c.quantidadeContada,
    diferenca: resolvido
      ? diferencaContagem(c.quantidadeContada, c.estoqueSistemaSnapshot as number)
      : null,
    status: c.status,
    ultimoBipeEm: c.ultimoBipeEm.toISOString(),
  };
}

const CONTAGEM_SELECT = {
  id: true,
  produtoId: true,
  codigoBipado: true,
  produtoNomeSnapshot: true,
  produtoSkuSnapshot: true,
  estoqueSistemaSnapshot: true,
  quantidadeContada: true,
  status: true,
  ultimoBipeEm: true,
} as const;

const SESSAO_SELECT = {
  id: true,
  storeId: true,
  status: true,
  operador: true,
  nome: true,
  observacao: true,
  iniciadoEm: true,
  finalizadoEm: true,
} as const;

/** Lista as contagens da sessão (mais recentes primeiro — o último bipe fica no topo). */
async function loadContagens(sid: string, sessaoId: string): Promise<InventarioContagemDTO[]> {
  const rows = await prisma.inventarioContagem.findMany({
    where: { storeId: sid, sessaoId },
    orderBy: { ultimoBipeEm: "desc" },
    select: CONTAGEM_SELECT,
  });
  return rows.map(contagemToDTO);
}

// ─── Ações ────────────────────────────────────────────────────────────────────

export type IniciarInventarioResult =
  | { ok: true; sessao: InventarioSessaoDTO }
  | ActionFail;

/** Abre uma nova sessão de inventário (status "aberta"). Não toca em estoque. */
export async function iniciarInventario(
  storeId: string,
  input: { nome?: string; operador?: string; observacao?: string }
): Promise<IniciarInventarioResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;

  const operador = (input.operador ?? "").trim() || g.usuario;
  try {
    // Anti-duplicidade: só pode existir UMA sessão aberta por loja. Se já houver, devolve a
    // existente (a UI retoma) em vez de criar outra.
    const aberta = await prisma.inventarioSessao.findFirst({
      where: { storeId: g.sid, status: STATUS_SESSAO.ABERTA },
      orderBy: { iniciadoEm: "desc" },
      select: SESSAO_SELECT,
    });
    if (aberta) {
      return { ok: false, reason: "Já existe uma sessão de inventário em andamento. Continue ou encerre a sessão atual." };
    }

    const s = await prisma.inventarioSessao.create({
      data: {
        storeId: g.sid,
        status: STATUS_SESSAO.ABERTA,
        operador,
        nome: (input.nome ?? "").trim() || null,
        observacao: (input.observacao ?? "").trim() || null,
      },
      select: SESSAO_SELECT,
    });
    return { ok: true, sessao: sessaoToDTO(s) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao iniciar inventário" };
  }
}

export type InventarioAtivoResult =
  | { ok: true; sessao: InventarioSessaoDTO | null; contagens: InventarioContagemDTO[] }
  | ActionFail;

/**
 * Sessão aberta mais recente da loja + suas contagens (para retomar ao recarregar a tela).
 * `sessao = null` quando não há contagem em andamento.
 */
export async function getInventarioAtivo(storeId: string): Promise<InventarioAtivoResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;

  try {
    const s = await prisma.inventarioSessao.findFirst({
      where: { storeId: g.sid, status: STATUS_SESSAO.ABERTA },
      orderBy: { iniciadoEm: "desc" },
      select: SESSAO_SELECT,
    });
    if (!s) return { ok: true, sessao: null, contagens: [] };
    const contagens = await loadContagens(g.sid, s.id);
    return { ok: true, sessao: sessaoToDTO(s), contagens };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao carregar inventário" };
  }
}

export type RegistrarContagemProdutoResult =
  | { ok: true; contagem: InventarioContagemDTO; contagens: InventarioContagemDTO[] }
  | ActionFail;

/**
 * Registra a quantidade física contada de um produto JÁ CADASTRADO, informada explicitamente pelo
 * operador (em vez do +1 fixo da bipagem). Dois modos (`inventario-core`):
 *   - "substituir": a quantidade vira o total contado ("contei X no total agora");
 *   - "somar":      a quantidade é adicionada ao já contado ("achei mais X").
 *
 * Igual à bipagem normal: NUNCA altera `Produto.stock` — só grava a contagem física + o instante
 * da observação (`ultimoBipeEm = agora`), que a conciliação usa como `contadoEm` por produto para
 * projetar vendas/movimentações posteriores. O snapshot autoritativo do produto vem do banco
 * (re-busca por id NA LOJA), nunca do cliente. O ajuste real de estoque continua só no
 * fechamento/conciliação (F4/conciliação).
 */
export async function registrarContagemProduto(
  storeId: string,
  input: { sessaoId: string; codigo: string; produtoId: string; quantidade: number; modo: ModoContagem }
): Promise<RegistrarContagemProdutoResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;

  const sessaoId = (input.sessaoId ?? "").trim();
  if (!sessaoId) return { ok: false, reason: "Sessão inválida" };
  const codigo = normalizarCodigo(input.codigo);
  if (!codigo) return { ok: false, reason: "Código bipado vazio" };
  const pid = (input.produtoId ?? "").trim();
  if (!pid) return { ok: false, reason: "Produto inválido" };
  const modo = normalizarModoContagem(input.modo);

  try {
    const sessao = await prisma.inventarioSessao.findFirst({
      where: { id: sessaoId, storeId: g.sid, status: STATUS_SESSAO.ABERTA },
      select: { id: true },
    });
    if (!sessao) return { ok: false, reason: "Sessão não encontrada ou já encerrada" };

    // Snapshot autoritativo: re-busca o produto por id NA LOJA (ignora dados do cliente).
    const row = await prisma.produto.findFirst({
      where: { id: pid, storeId: g.sid },
      select: { id: true, name: true, sku: true, stock: true },
    });
    if (!row) return { ok: false, reason: "Produto não encontrado nesta loja" };

    const existente = await prisma.inventarioContagem.findFirst({
      where: { sessaoId, codigoBipado: codigo, storeId: g.sid },
      select: { id: true, quantidadeContada: true, estoqueSistemaSnapshot: true },
    });

    const novaQuantidade = aplicarModoContagem(modo, existente?.quantidadeContada ?? 0, input.quantidade);
    const estoqueSnapshot = Math.trunc(Number(row.stock)) || 0;

    let saved: ContagemRow;
    if (!existente) {
      saved = await prisma.inventarioContagem.create({
        data: {
          storeId: g.sid,
          sessaoId,
          produtoId: row.id,
          codigoBipado: codigo,
          produtoNomeSnapshot: row.name,
          produtoSkuSnapshot: row.sku,
          estoqueSistemaSnapshot: estoqueSnapshot,
          quantidadeContada: novaQuantidade,
          status: STATUS_CONTAGEM.ENCONTRADO,
        },
        select: CONTAGEM_SELECT,
      });
    } else {
      saved = await prisma.inventarioContagem.update({
        where: { id: existente.id },
        data: {
          produtoId: row.id,
          produtoNomeSnapshot: row.name,
          produtoSkuSnapshot: row.sku,
          // Preserva o snapshot do 1º bipe; só preenche se ainda nulo (promove linha de reconciliação).
          ...(existente.estoqueSistemaSnapshot == null ? { estoqueSistemaSnapshot: estoqueSnapshot } : {}),
          quantidadeContada: novaQuantidade,
          status: STATUS_CONTAGEM.ENCONTRADO,
          ultimoBipeEm: new Date(),
        },
        select: CONTAGEM_SELECT,
      });
    }

    const contagens = await loadContagens(g.sid, sessaoId);
    return { ok: true, contagem: contagemToDTO(saved), contagens };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao registrar contagem" };
  }
}

export type ContextoContagemProdutoDTO = {
  /** Quantidade já contada deste produto nesta sessão (0 = ainda não contado). */
  jaContado: number;
  /** Horário (ISO) da última contagem deste produto na sessão. null = ainda não contado. */
  ultimaContagemEm: string | null;
  /** Σ de deltas de estoque (venda −, entrada +) APÓS a última contagem deste produto. */
  movimentacaoPosContagem: number;
  /** true quando há movimentação após a contagem → a conciliação final projetará o saldo. */
  temMovimentacaoPos: boolean;
};

export type ContextoContagemProdutoResult =
  | { ok: true; contexto: ContextoContagemProdutoDTO }
  | ActionFail;

/**
 * Contexto de observabilidade para o modal de contagem de um produto JÁ CADASTRADO: quanto já foi
 * contado nesta sessão, quando foi a última contagem e se houve movimentação depois (venda/OS/
 * devolução/entrada). SOMENTE LEITURA — não toca estoque. Reusa o helper PURO
 * `somarMovimentacoesApos` (mesmo corte temporal estrito da conciliação dinâmica).
 */
export async function getContextoContagemProduto(
  storeId: string,
  sessaoId: string,
  produtoId: string
): Promise<ContextoContagemProdutoResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;
  const sid = (sessaoId ?? "").trim();
  const pid = (produtoId ?? "").trim();
  if (!sid || !pid) return { ok: false, reason: "Sessão ou produto inválido" };

  try {
    const contagem = await prisma.inventarioContagem.findFirst({
      where: { storeId: g.sid, sessaoId: sid, produtoId: pid, status: STATUS_CONTAGEM.ENCONTRADO },
      select: { quantidadeContada: true, ultimoBipeEm: true },
    });
    if (!contagem) {
      return { ok: true, contexto: { jaContado: 0, ultimaContagemEm: null, movimentacaoPosContagem: 0, temMovimentacaoPos: false } };
    }

    const rows = await prisma.movimentacaoEstoque.findMany({
      where: { storeId: g.sid, produtoId: pid, createdAt: { gte: contagem.ultimoBipeEm } },
      select: { quantidade: true, createdAt: true },
    });
    const movs: MovimentoEstoqueConc[] = rows.map((r) => ({ produtoId: pid, quantidade: r.quantidade, em: r.createdAt }));
    const movimentacaoPosContagem = somarMovimentacoesApos(movs, contagem.ultimoBipeEm);

    return {
      ok: true,
      contexto: {
        jaContado: contagem.quantidadeContada,
        ultimaContagemEm: contagem.ultimoBipeEm.toISOString(),
        movimentacaoPosContagem,
        temMovimentacaoPos: movimentacaoPosContagem !== 0,
      },
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao consultar contexto da contagem" };
  }
}

export type RegistrarPendenciaResult =
  | { ok: true; contagem: InventarioContagemDTO; contagens: InventarioContagemDTO[] }
  | ActionFail;

/**
 * Registra (ou soma) uma leitura de PENDÊNCIA — código bipado sem produto resolvido — vinda do
 * modal de captura: quantidade observada explícita pelo operador (em vez do +1 fixo) e nome
 * rápido opcional. Sibling de `registrarContagemProduto`, mesma validação de sessão/unicidade; a
 * soma de quantidade reusa `aplicarBipe` (núcleo PURO) e o nome/contador de leituras usa
 * `inventario-pendencia.ts` (payload, sem schema novo). NUNCA cria produto, NUNCA toca estoque.
 */
export async function registrarPendenciaInventario(
  storeId: string,
  input: { sessaoId: string; codigo: string; quantidade: number; nomeRapido?: string | null }
): Promise<RegistrarPendenciaResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;

  const sessaoId = (input.sessaoId ?? "").trim();
  if (!sessaoId) return { ok: false, reason: "Sessão inválida" };
  const codigo = normalizarCodigo(input.codigo);
  if (!codigo) return { ok: false, reason: "Código bipado vazio" };

  try {
    const sessao = await prisma.inventarioSessao.findFirst({
      where: { id: sessaoId, storeId: g.sid, status: STATUS_SESSAO.ABERTA },
      select: { id: true },
    });
    if (!sessao) return { ok: false, reason: "Sessão não encontrada ou já encerrada" };

    const existente = await prisma.inventarioContagem.findFirst({
      where: { sessaoId, codigoBipado: codigo, storeId: g.sid },
      select: { id: true, quantidadeContada: true, status: true, payload: true },
    });
    // Código já resolvido para um produto nesta sessão: a quantidade é controlada pelo modal de
    // contagem (registrarContagemProduto), não pelo modal de pendência.
    if (existente && existente.status === STATUS_CONTAGEM.ENCONTRADO) {
      return { ok: false, reason: "Este código já está associado a um produto nesta sessão" };
    }

    const { linha } = aplicarBipe(
      existente
        ? {
            produtoId: null,
            codigoBipado: codigo,
            quantidadeContada: existente.quantidadeContada,
            estoqueSistemaSnapshot: null,
            status: STATUS_CONTAGEM.RECONCILIACAO,
          }
        : null,
      { codigoBipado: codigo, produto: null, incremento: input.quantidade }
    );
    const novoPayload = marcarPendenciaPayload(existente?.payload ?? null, { nomeRapido: input.nomeRapido });

    const saved = await prisma.inventarioContagem.upsert({
      where: { sessaoId_codigoBipado: { sessaoId, codigoBipado: codigo } },
      create: {
        storeId: g.sid,
        sessaoId,
        produtoId: null,
        codigoBipado: codigo,
        estoqueSistemaSnapshot: null,
        quantidadeContada: linha.quantidadeContada,
        status: STATUS_CONTAGEM.RECONCILIACAO,
        payload: novoPayload as Prisma.InputJsonValue,
      },
      update: {
        quantidadeContada: linha.quantidadeContada,
        ultimoBipeEm: new Date(),
        payload: novoPayload as Prisma.InputJsonValue,
      },
      select: CONTAGEM_SELECT,
    });

    const contagens = await loadContagens(g.sid, sessaoId);
    return { ok: true, contagem: contagemToDTO(saved), contagens };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao registrar pendência" };
  }
}

export type ListContagensResult =
  | { ok: true; contagens: InventarioContagemDTO[] }
  | ActionFail;

/** Recarrega a lista ao vivo de uma sessão (botão "Atualizar"). */
export async function listInventarioContagens(
  storeId: string,
  sessaoId: string
): Promise<ListContagensResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;
  const sid = (sessaoId ?? "").trim();
  if (!sid) return { ok: false, reason: "Sessão inválida" };
  try {
    const contagens = await loadContagens(g.sid, sid);
    return { ok: true, contagens };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao listar contagens" };
  }
}

export type EncerrarInventarioResult = { ok: true } | ActionFail;

/**
 * Encerra a sessão (status "finalizada" + `finalizadoEm`). NÃO altera estoque, NÃO cadastra,
 * NÃO reconcilia — apenas congela a contagem. Grava também um SNAPSHOT de resumo no payload
 * (auditoria histórica + lista de sessões), preservando marcas de ajuste já existentes (F4).
 */
export async function encerrarInventario(
  storeId: string,
  sessaoId: string
): Promise<EncerrarInventarioResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;
  const sid = (sessaoId ?? "").trim();
  if (!sid) return { ok: false, reason: "Sessão inválida" };
  try {
    const sessao = await prisma.inventarioSessao.findFirst({
      where: { id: sid, storeId: g.sid, status: STATUS_SESSAO.ABERTA },
      select: { ...SESSAO_SELECT, payload: true },
    });
    if (!sessao) return { ok: false, reason: "Sessão não encontrada ou já encerrada" };

    // Snapshot do resumo no momento do fechamento (best-effort — não impede o encerramento).
    let resumoSnapshot: RelatorioInventarioDTO["resumo"] | null = null;
    try {
      resumoSnapshot = (await construirRelatorioSessao(g.sid, sessao)).resumo;
    } catch {
      resumoSnapshot = null;
    }
    const basePayload =
      sessao.payload && typeof sessao.payload === "object" && !Array.isArray(sessao.payload)
        ? (sessao.payload as Record<string, unknown>)
        : {};
    const novoPayload = { ...basePayload, ...(resumoSnapshot ? { resumo: resumoSnapshot } : {}) };

    const res = await prisma.inventarioSessao.updateMany({
      where: { id: sid, storeId: g.sid, status: STATUS_SESSAO.ABERTA },
      data: {
        status: STATUS_SESSAO.FINALIZADA,
        finalizadoEm: new Date(),
        payload: novoPayload as Prisma.InputJsonValue,
      },
    });
    if (res.count === 0) return { ok: false, reason: "Sessão não encontrada ou já encerrada" };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao encerrar inventário" };
  }
}

// ─── F3 · Relatórios e análise (SOMENTE LEITURA) ───────────────────────────────
// Reusa o núcleo PURO `montarRelatorioInventario` (testado na F1). Esta camada apenas
// hidrata os dados (contagens da sessão + catálogo da loja) e enriquece para a UI
// (código bipado por linha, data/hora e sessão na reconciliação). NÃO altera nada:
// nada de ajuste de saldo, cadastro, exclusão ou reconciliação automática.

/** Linha A/B — produto encontrado/divergente (estoque sistema atual × contado). */
export type RelatorioEncontradoDTO = {
  produtoId: string;
  nome: string;
  sku: string | null;
  /** Código efetivamente bipado que resolveu para este produto. */
  codigo: string | null;
  estoqueSistema: number;
  quantidadeContada: number;
  diferenca: number;
  /** F4 — true quando o ajuste de estoque desta divergência já foi aplicado nesta sessão. */
  ajusteAplicado: boolean;
  ajusteMovimentacaoId: string | null;
};

/** Linha C — fila de reconciliação (código sem produto resolvido). */
export type RelatorioReconciliacaoDTO = {
  id: string;
  codigoBipado: string;
  quantidadeContada: number;
  primeiroBipeEm: string;
  ultimoBipeEm: string;
  sessaoId: string;
  sessaoNome: string | null;
  /** F5 — classificação operacional (pendente/localizado/ignorado/cadastrar_depois). */
  classificacao: ClassificacaoReconciliacao;
  /** F6 — apelido informado no modal de captura (quando o operador nomeou o item). */
  nomeRapido: string | null;
  /** F6 — quantas vezes o operador confirmou o modal (distinto de `quantidadeContada`). */
  numeroLeituras: number;
  /** F6 — vínculo de fechamento (cadastrado/associado a um produto). null = ainda pendente. */
  vinculo: VinculoPendencia | null;
};

/** Linha D — produto do sistema que NÃO apareceu na contagem (conferência pendente). */
export type RelatorioNaoBipadoDTO = {
  produtoId: string;
  nome: string;
  sku: string | null;
  codigo: string | null;
  estoqueSistema: number;
  /** F4 — true quando já foi zerado por ausência confirmada nesta sessão. */
  ajusteAplicado: boolean;
};

export type RelatorioInventarioDTO = {
  sessao: InventarioSessaoDTO;
  encontrados: RelatorioEncontradoDTO[];
  divergencias: RelatorioEncontradoDTO[];
  reconciliacao: RelatorioReconciliacaoDTO[];
  naoBipados: RelatorioNaoBipadoDTO[];
  resumo: {
    encontrados: number;
    divergencias: number;
    reconciliacao: number;
    naoBipados: number;
    unidadesContadas: number;
    /** F4 — divergências ainda sem ajuste aplicado. */
    divergenciasPendentes: number;
    /** F4 — divergências cujo ajuste já foi aplicado. */
    ajustesAplicados: number;
    /** F4 — produtos não bipados zerados por ausência confirmada. */
    zeradosPorAusencia: number;
    /** F6 — itens da fila de reconciliação ainda sem vínculo de fechamento. */
    reconciliacaoPendente: number;
    /** F6 — itens já cadastrados/associados (saíram da fila ativa). */
    reconciliacaoConcluida: number;
  };
};

export type RelatorioInventarioResult =
  | { ok: true; relatorio: RelatorioInventarioDTO }
  | ActionFail;

/**
 * Relatório completo de uma sessão (A encontrados, B divergências, C reconciliação, D não bipados
 * + resumo). Funciona para sessão aberta (em andamento) ou finalizada. SOMENTE LEITURA.
 */
export async function getRelatorioInventario(
  storeId: string,
  sessaoId: string
): Promise<RelatorioInventarioResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;
  const sid = (sessaoId ?? "").trim();
  if (!sid) return { ok: false, reason: "Sessão inválida" };

  try {
    const sessao = await prisma.inventarioSessao.findFirst({
      where: { id: sid, storeId: g.sid },
      select: { ...SESSAO_SELECT, payload: true },
    });
    if (!sessao) return { ok: false, reason: "Sessão não encontrada" };
    const relatorio = await construirRelatorioSessao(g.sid, sessao);
    return { ok: true, relatorio };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao gerar relatório" };
  }
}

type SessaoComPayload = {
  id: string;
  storeId: string;
  status: string;
  operador: string | null;
  nome: string | null;
  observacao: string | null;
  iniciadoEm: Date;
  finalizadoEm: Date | null;
  payload: unknown;
};

/**
 * Monta o RelatorioInventarioDTO de UMA sessão já carregada (com payload). Reusado por
 * `getRelatorioInventario` (leitura), `encerrarInventario` (snapshot) e `getInventarioDashboard`.
 * SOMENTE LEITURA — não escreve nada.
 */
async function construirRelatorioSessao(
  sid: string,
  sessao: SessaoComPayload
): Promise<RelatorioInventarioDTO> {
  const [contagensRows, catalogo] = await Promise.all([
    prisma.inventarioContagem.findMany({
      where: { storeId: sid, sessaoId: sessao.id },
        orderBy: { ultimoBipeEm: "desc" },
        select: {
          id: true,
          produtoId: true,
          codigoBipado: true,
          produtoNomeSnapshot: true,
          produtoSkuSnapshot: true,
          estoqueSistemaSnapshot: true,
          quantidadeContada: true,
          status: true,
          primeiroBipeEm: true,
          ultimoBipeEm: true,
          payload: true,
        },
      }),
      // Catálogo da loja (ativo) — base do "não bipados" e do estoque atual da divergência.
      prisma.produto.findMany({
        where: { storeId: sid, active: true },
        select: { id: true, name: true, sku: true, barcode: true, stock: true },
      }),
    ]);

    const produtosLoja: ProdutoEstoque[] = catalogo.map((p) => ({
      id: p.id,
      nome: p.name,
      sku: p.sku,
      barcode: p.barcode,
      stock: p.stock,
    }));
    const contagensCore: ContagemLinha[] = contagensRows.map((c) => ({
      produtoId: c.produtoId,
      codigoBipado: c.codigoBipado,
      quantidadeContada: c.quantidadeContada,
      estoqueSistemaSnapshot: c.estoqueSistemaSnapshot,
      status: c.status as ContagemLinha["status"],
      produtoNomeSnapshot: c.produtoNomeSnapshot,
      produtoSkuSnapshot: c.produtoSkuSnapshot,
    }));

    const rel = montarRelatorioInventario({ contagens: contagensCore, produtosLoja });

    // Mapas de enriquecimento (sem reprocessar regra — apenas anexar campos de exibição).
    const codigoPorProduto = new Map<string, string>();
    // F4: estado de ajuste por produto (lido do payload da contagem — sem schema novo).
    const ajustePorProduto = new Map<string, { aplicado: boolean; movimentacaoId: string | null }>();
    for (const c of contagensRows) {
      if (!c.produtoId) continue;
      if (!codigoPorProduto.has(c.produtoId)) codigoPorProduto.set(c.produtoId, c.codigoBipado);
      if (!ajustePorProduto.has(c.produtoId)) {
        const a = lerAjusteContagem(c.payload);
        ajustePorProduto.set(c.produtoId, { aplicado: a.aplicado, movimentacaoId: a.movimentacaoId });
      }
    }
    const codigoCatalogo = new Map<string, string | null>(
      catalogo.map((p) => [p.id, (p.barcode ?? "").trim() || (p.sku ?? "").trim() || null])
    );
    // F4: marcas de zeragem por ausência (payload da sessão).
    const ajustesNaoBipados = lerAjustesNaoBipados(sessao.payload);

    const encontrados: RelatorioEncontradoDTO[] = rel.encontrados.map((e) => {
      const a = ajustePorProduto.get(e.produtoId);
      return {
        produtoId: e.produtoId,
        nome: e.nome,
        sku: e.sku,
        codigo: codigoPorProduto.get(e.produtoId) ?? null,
        estoqueSistema: e.estoqueSistema,
        quantidadeContada: e.quantidadeContada,
        diferenca: e.diferenca,
        ajusteAplicado: a?.aplicado ?? false,
        ajusteMovimentacaoId: a?.movimentacaoId ?? null,
      };
    });

    // B) divergências = contado ≠ sistema, ordenadas pela MAIOR diferença (abs desc).
    const divergencias = encontrados
      .filter((e) => e.diferenca !== 0)
      .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca));

    // C) reconciliação a partir das linhas cruas (data/hora + sessão + classificação F5 + F6).
    const reconciliacao: RelatorioReconciliacaoDTO[] = contagensRows
      .filter((c) => c.status === STATUS_CONTAGEM.RECONCILIACAO || !c.produtoId)
      .map((c) => {
        const p = lerPendencia(c.payload);
        return {
          id: c.id,
          codigoBipado: c.codigoBipado,
          quantidadeContada: c.quantidadeContada,
          primeiroBipeEm: c.primeiroBipeEm.toISOString(),
          ultimoBipeEm: c.ultimoBipeEm.toISOString(),
          sessaoId: sessao.id,
          sessaoNome: sessao.nome,
          classificacao: lerClassificacaoReconciliacao(c.payload),
          nomeRapido: p.nomeRapido,
          numeroLeituras: p.numeroLeituras,
          vinculo: lerVinculoPendencia(c.payload),
        };
      });

    // D) não bipados = produto do sistema nunca contado (NUNCA zerar automático — ação individual).
    const naoBipados: RelatorioNaoBipadoDTO[] = rel.naoContados.map((n) => ({
      produtoId: n.produtoId,
      nome: n.nome,
      sku: n.sku,
      codigo: codigoCatalogo.get(n.produtoId) ?? null,
      estoqueSistema: n.estoqueSistema,
      ajusteAplicado: Object.prototype.hasOwnProperty.call(ajustesNaoBipados, n.produtoId),
    }));

    const ajustesAplicados = divergencias.filter((d) => d.ajusteAplicado).length;
    const divergenciasPendentes = divergencias.length - ajustesAplicados;
    const zeradosPorAusencia = naoBipados.filter((n) => n.ajusteAplicado).length;
    const reconciliacaoConcluida = reconciliacao.filter((r) => r.vinculo !== null).length;

    return {
      sessao: sessaoToDTO(sessao),
      encontrados,
      divergencias,
      reconciliacao,
      naoBipados,
      resumo: {
        encontrados: encontrados.length,
        divergencias: divergencias.length,
        reconciliacao: reconciliacao.length,
        naoBipados: naoBipados.length,
        unidadesContadas: rel.totais.unidadesContadas,
        divergenciasPendentes,
        ajustesAplicados,
        zeradosPorAusencia,
        reconciliacaoPendente: reconciliacao.length - reconciliacaoConcluida,
        reconciliacaoConcluida,
      },
    };
}

export type ListInventarioSessoesResult =
  | { ok: true; sessoes: InventarioSessaoDTO[] }
  | ActionFail;

/** Sessões da loja (mais recentes primeiro) — para escolher qual analisar nos relatórios. */
export async function listInventarioSessoes(storeId: string): Promise<ListInventarioSessoesResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;
  try {
    const rows = await prisma.inventarioSessao.findMany({
      where: { storeId: g.sid },
      orderBy: { iniciadoEm: "desc" },
      take: 50,
      select: SESSAO_SELECT,
    });
    return { ok: true, sessoes: rows.map(sessaoToDTO) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao listar sessões" };
  }
}

// ─── F5 · Operacionalização (Painel, Histórico, Exportação, Reconciliação) ─────

/** Lê o snapshot de resumo gravado no payload da sessão ao encerrar (null se ausente). */
function lerResumoSnapshot(payload: unknown): RelatorioInventarioDTO["resumo"] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const r = (payload as Record<string, unknown>).resumo;
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    encontrados: num(o.encontrados),
    divergencias: num(o.divergencias),
    reconciliacao: num(o.reconciliacao),
    naoBipados: num(o.naoBipados),
    unidadesContadas: num(o.unidadesContadas),
    divergenciasPendentes: num(o.divergenciasPendentes),
    ajustesAplicados: num(o.ajustesAplicados),
    zeradosPorAusencia: num(o.zeradosPorAusencia),
    reconciliacaoPendente: num(o.reconciliacaoPendente),
    reconciliacaoConcluida: num(o.reconciliacaoConcluida),
  };
}

/** Sessão + agregados para a tela de Histórico. */
export type InventarioSessaoHistoricoDTO = InventarioSessaoDTO & {
  linhasContadas: number;
  unidadesContadas: number;
  reconciliacaoCount: number;
  /** Divergências/ajustes do snapshot de fechamento (null em sessão aberta sem snapshot). */
  divergencias: number | null;
  ajustesAplicados: number | null;
};

export type ListInventarioHistoricoResult =
  | { ok: true; sessoes: InventarioSessaoHistoricoDTO[] }
  | ActionFail;

/** Histórico de sessões da loja com agregados (contadas/unidades/reconciliação/divergências). */
export async function getInventarioHistorico(storeId: string): Promise<ListInventarioHistoricoResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;
  try {
    const sessoes = await prisma.inventarioSessao.findMany({
      where: { storeId: g.sid },
      orderBy: { iniciadoEm: "desc" },
      take: 50,
      select: { ...SESSAO_SELECT, payload: true },
    });
    if (sessoes.length === 0) return { ok: true, sessoes: [] };

    const sessaoIds = sessoes.map((s) => s.id);
    const [agg, aggRec] = await Promise.all([
      prisma.inventarioContagem.groupBy({
        by: ["sessaoId"],
        where: { storeId: g.sid, sessaoId: { in: sessaoIds } },
        _count: { _all: true },
        _sum: { quantidadeContada: true },
      }),
      prisma.inventarioContagem.groupBy({
        by: ["sessaoId"],
        where: { storeId: g.sid, sessaoId: { in: sessaoIds }, status: STATUS_CONTAGEM.RECONCILIACAO },
        _count: { _all: true },
      }),
    ]);
    const linhasPorSessao = new Map(agg.map((a) => [a.sessaoId, { linhas: a._count._all, unidades: a._sum.quantidadeContada ?? 0 }]));
    const recPorSessao = new Map(aggRec.map((a) => [a.sessaoId, a._count._all]));

    const out: InventarioSessaoHistoricoDTO[] = sessoes.map((s) => {
      const ag = linhasPorSessao.get(s.id);
      const snap = lerResumoSnapshot(s.payload);
      return {
        ...sessaoToDTO(s),
        linhasContadas: ag?.linhas ?? 0,
        unidadesContadas: snap?.unidadesContadas ?? ag?.unidades ?? 0,
        reconciliacaoCount: recPorSessao.get(s.id) ?? 0,
        divergencias: snap?.divergencias ?? null,
        ajustesAplicados: snap?.ajustesAplicados ?? null,
      };
    });
    return { ok: true, sessoes: out };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao listar histórico" };
  }
}

export type InventarioDashboardResult =
  | {
      ok: true;
      sessaoAtiva: InventarioSessaoDTO | null;
      ultimaSessao: InventarioSessaoDTO | null;
      kpis: RelatorioInventarioDTO["resumo"] | null;
    }
  | ActionFail;

/**
 * Painel do inventário: sessão ativa (aberta), última sessão finalizada e KPIs da sessão
 * mais relevante (ativa, se houver; senão a última finalizada). SOMENTE LEITURA.
 */
export async function getInventarioDashboard(storeId: string): Promise<InventarioDashboardResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;
  try {
    const [ativaRow, ultimaRow] = await Promise.all([
      prisma.inventarioSessao.findFirst({
        where: { storeId: g.sid, status: STATUS_SESSAO.ABERTA },
        orderBy: { iniciadoEm: "desc" },
        select: { ...SESSAO_SELECT, payload: true },
      }),
      prisma.inventarioSessao.findFirst({
        where: { storeId: g.sid, status: STATUS_SESSAO.FINALIZADA },
        orderBy: { finalizadoEm: "desc" },
        select: { ...SESSAO_SELECT, payload: true },
      }),
    ]);

    const alvo = ativaRow ?? ultimaRow;
    let kpis: RelatorioInventarioDTO["resumo"] | null = null;
    if (alvo) {
      // Ativa → recalcula ao vivo. Finalizada → usa o snapshot (ou recalcula se ausente).
      kpis = ativaRow ? (await construirRelatorioSessao(g.sid, ativaRow)).resumo : lerResumoSnapshot(alvo.payload);
      if (!kpis) kpis = (await construirRelatorioSessao(g.sid, alvo)).resumo;
    }

    return {
      ok: true,
      sessaoAtiva: ativaRow ? sessaoToDTO(ativaRow) : null,
      ultimaSessao: ultimaRow ? sessaoToDTO(ultimaRow) : null,
      kpis,
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao carregar painel" };
  }
}

export type ClassificarReconciliacaoResult = { ok: true } | ActionFail;

/**
 * Classifica uma linha da fila de reconciliação (localizado/ignorado/cadastrar_depois/pendente).
 * APENAS classifica — NÃO cadastra produto, NÃO altera estoque. Marca no payload da contagem.
 */
export async function classificarReconciliacao(
  storeId: string,
  sessaoId: string,
  contagemId: string,
  classificacao: ClassificacaoReconciliacao
): Promise<ClassificarReconciliacaoResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;
  const sid = (sessaoId ?? "").trim();
  const cid = (contagemId ?? "").trim();
  if (!sid || !cid) return { ok: false, reason: "Sessão ou item inválido" };

  try {
    const linha = await prisma.inventarioContagem.findFirst({
      where: { id: cid, storeId: g.sid, sessaoId: sid, status: STATUS_CONTAGEM.RECONCILIACAO },
      select: { id: true, payload: true },
    });
    if (!linha) return { ok: false, reason: "Item de reconciliação não encontrado" };

    const novoPayload = marcarClassificacaoReconciliacao(linha.payload, normalizarClassificacao(classificacao), {
      operador: g.usuario,
    });
    await prisma.inventarioContagem.update({
      where: { id: linha.id },
      data: { payload: novoPayload as Prisma.InputJsonValue },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao classificar" };
  }
}

// ─── F6 · Vínculo de fechamento da pendência (Cadastrar produto / Associar existente) ──────────
// Fecha um item da fila de reconciliação apontando para um `produtoId` E grava o código bipado
// como ALIAS persistente do produto (`Produto.metadata.codigosAlias`), para que a próxima bipagem
// do mesmo código resolva o produto automaticamente (GOAL_INVENTARIO_BARCODE_ALIAS_V01). Não cria
// produto nem altera `Produto.stock`. Idempotente. A unicidade do alias na loja é checada aqui.

export type VincularPendenciaResult =
  | { ok: true; codigoVinculado: string | null }
  | ActionFail;

/**
 * Vincula a pendência `contagemId` ao produto `produtoId` (recém-cadastrado ou já existente) e
 * a remove da fila ativa de reconciliação. Pré-condições: sessão da loja, contagem em
 * "reconciliacao", ainda sem vínculo, produto existente NA LOJA (re-busca no banco).
 *
 * Alias: se o código bipado ainda não resolve o produto (barcode/sku/alias) e não pertence a
 * NENHUM outro produto da loja, é gravado em `metadata.codigosAlias`. Se pertencer a outro
 * produto, o vínculo é BLOQUEADO com erro claro (não marca como resolvido).
 */
export async function vincularPendenciaInventario(
  storeId: string,
  sessaoId: string,
  contagemId: string,
  produtoId: string,
  tipo: TipoVinculoPendencia
): Promise<VincularPendenciaResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;
  const sid = (sessaoId ?? "").trim();
  const cid = (contagemId ?? "").trim();
  const pid = (produtoId ?? "").trim();
  if (!sid || !cid) return { ok: false, reason: "Sessão ou item inválido" };
  if (!pid) return { ok: false, reason: "Produto inválido" };
  if (tipo !== "cadastrado" && tipo !== "associado") return { ok: false, reason: "Tipo de vínculo inválido" };

  try {
    const linha = await prisma.inventarioContagem.findFirst({
      where: { id: cid, storeId: g.sid, sessaoId: sid, status: STATUS_CONTAGEM.RECONCILIACAO },
      select: { id: true, codigoBipado: true, payload: true },
    });
    if (!linha) return { ok: false, reason: "Item de reconciliação não encontrado" };
    if (pendenciaResolvida(linha.payload)) return { ok: false, reason: "Este item já foi resolvido" };

    // Snapshot autoritativo: o produto precisa existir NESTA loja (ignora dados do cliente).
    const produto = await prisma.produto.findFirst({
      where: { id: pid, storeId: g.sid },
      select: { id: true, barcode: true, sku: true, metadata: true },
    });
    if (!produto) return { ok: false, reason: "Produto não encontrado nesta loja" };

    // Alias: grava o código bipado no produto se ainda não o resolve (e não conflita com outro).
    const codigo = normalizarCodigoAlias(linha.codigoBipado);
    let codigoVinculado: string | null = null;
    if (codigo && !produtoResolveCodigo(produto, codigo)) {
      // Unicidade na loja: nenhum OUTRO produto pode já usar este código (barcode/sku/alias).
      const conflito = await prisma.produto.findFirst({
        where: {
          storeId: g.sid,
          id: { not: pid },
          OR: [
            { barcode: codigo },
            { sku: codigo },
            { metadata: { path: ["codigosAlias"], array_contains: codigo } },
          ],
        },
        select: { id: true, name: true },
      });
      if (conflito) {
        return {
          ok: false,
          reason: `O código "${codigo}" já pertence ao produto "${conflito.name}". Desvincule-o antes de usar aqui.`,
        };
      }
      const novoMetadata = adicionarCodigoAliasMetadata(produto.metadata, codigo);
      await prisma.produto.update({
        where: { id: pid },
        data: { metadata: novoMetadata as Prisma.InputJsonValue },
      });
      codigoVinculado = codigo;
    }

    const novoPayload = marcarVinculoPendencia(linha.payload, {
      produtoId: pid,
      tipo,
      vinculadoEm: new Date().toISOString(),
      operador: g.usuario,
    });
    await prisma.inventarioContagem.update({
      where: { id: linha.id },
      data: { payload: novoPayload as Prisma.InputJsonValue },
    });
    return { ok: true, codigoVinculado };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao vincular pendência" };
  }
}

// ─── F4 · Ajuste seguro de estoque (ação humana explícita) ─────────────────────
// REUSA `registrarAjusteEstoque` (motor único de ledger): nunca cria motor novo nem escreve
// em `Produto.stock` direto. Só permite ajuste com a sessão FINALIZADA. Anti-duplo-ajuste via
// `payload` (sem schema/migration). Nada é automático — cada chamada é um clique humano.

export type AplicarAjusteResult =
  | { ok: true; movimentacaoId: string | null; semMudanca: boolean; estoqueDepois: number }
  | ActionFail;

/**
 * Aplica o ajuste de UMA divergência: novo saldo = quantidade contada na sessão.
 * Pré-condições: sessão da loja, FINALIZADA, contagem existente do produto, ainda não ajustada.
 * `motivo` opcional sobrepõe o padrão ("Inventário físico — sessão {nome/id}").
 */
export async function aplicarAjusteInventario(
  storeId: string,
  sessaoId: string,
  produtoId: string,
  opts?: { motivo?: string }
): Promise<AplicarAjusteResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;
  const sid = (sessaoId ?? "").trim();
  const pid = (produtoId ?? "").trim();
  if (!sid || !pid) return { ok: false, reason: "Sessão ou produto inválido" };

  try {
    const sessao = await prisma.inventarioSessao.findFirst({
      where: { id: sid, storeId: g.sid },
      select: { id: true, nome: true, status: true },
    });
    if (!sessao) return { ok: false, reason: "Sessão não encontrada" };
    if (sessao.status !== STATUS_SESSAO.FINALIZADA) {
      return { ok: false, reason: "Encerre a sessão antes de aplicar ajustes" };
    }

    const contagem = await prisma.inventarioContagem.findFirst({
      where: { storeId: g.sid, sessaoId: sid, produtoId: pid, status: STATUS_CONTAGEM.ENCONTRADO },
      select: { id: true, quantidadeContada: true, payload: true },
    });
    if (!contagem) return { ok: false, reason: "Contagem do produto não encontrada nesta sessão" };
    if (lerAjusteContagem(contagem.payload).aplicado) {
      return { ok: false, reason: "Este item já foi ajustado" };
    }

    const novoSaldo = novoSaldoParaContagem(contagem.quantidadeContada);
    const motivo = (opts?.motivo ?? "").trim() || montarMotivoInventario(sessao, "divergencia");

    // Motor único de ledger (transacional + auditoria + Produto.stock na MESMA transação).
    const res = await registrarAjusteEstoque(g.sid, {
      produtoId: pid,
      novoSaldo,
      motivo,
      observacao: `Inventário ${sid}`,
    });

    // "Novo saldo igual ao atual" = estoque já bate com o contado → benigno (marca como ajustado).
    const semMudanca = !res.ok && /nada a ajustar/i.test(res.reason);
    if (!res.ok && !semMudanca) return { ok: false, reason: res.reason };

    const movimentacaoId = res.ok ? res.movimentacaoId : null;
    const novoPayload = marcarAjusteContagemPayload(contagem.payload, {
      aplicadoEm: new Date().toISOString(),
      movimentacaoId,
      operador: g.usuario,
    });
    await prisma.inventarioContagem.update({
      where: { id: contagem.id },
      data: { payload: novoPayload as Prisma.InputJsonValue },
    });

    return { ok: true, movimentacaoId, semMudanca, estoqueDepois: novoSaldo };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao aplicar ajuste" };
  }
}

/**
 * "Confirmar ausência e zerar" um produto NÃO bipado: novo saldo = 0. Ação INDIVIDUAL (nunca lote).
 * Pré-condições: sessão da loja, FINALIZADA, produto da loja, SEM contagem nesta sessão, não zerado ainda.
 */
export async function aplicarZeragemNaoBipado(
  storeId: string,
  sessaoId: string,
  produtoId: string,
  opts?: { motivo?: string }
): Promise<AplicarAjusteResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;
  const sid = (sessaoId ?? "").trim();
  const pid = (produtoId ?? "").trim();
  if (!sid || !pid) return { ok: false, reason: "Sessão ou produto inválido" };

  try {
    const sessao = await prisma.inventarioSessao.findFirst({
      where: { id: sid, storeId: g.sid },
      select: { id: true, nome: true, status: true, payload: true },
    });
    if (!sessao) return { ok: false, reason: "Sessão não encontrada" };
    if (sessao.status !== STATUS_SESSAO.FINALIZADA) {
      return { ok: false, reason: "Encerre a sessão antes de aplicar ajustes" };
    }

    // Defesa: só zera quem NÃO foi contado nesta sessão (senão é caminho de divergência).
    const contado = await prisma.inventarioContagem.findFirst({
      where: { storeId: g.sid, sessaoId: sid, produtoId: pid },
      select: { id: true },
    });
    if (contado) return { ok: false, reason: "Produto foi contado nesta sessão — use o ajuste de divergência" };

    if (naoBipadoAjustado(sessao.payload, pid)) {
      return { ok: false, reason: "Este produto já foi zerado nesta sessão" };
    }

    const motivo = (opts?.motivo ?? "").trim() || montarMotivoInventario(sessao, "ausencia");

    const res = await registrarAjusteEstoque(g.sid, {
      produtoId: pid,
      novoSaldo: NOVO_SALDO_NAO_BIPADO,
      motivo,
      observacao: `Inventário ${sid} — ausência confirmada`,
    });

    const semMudanca = !res.ok && /nada a ajustar/i.test(res.reason);
    if (!res.ok && !semMudanca) return { ok: false, reason: res.reason };

    const movimentacaoId = res.ok ? res.movimentacaoId : null;
    const novoPayload = marcarAjusteNaoBipadoPayload(sessao.payload, pid, {
      aplicadoEm: new Date().toISOString(),
      movimentacaoId,
      operador: g.usuario,
    });
    await prisma.inventarioSessao.update({
      where: { id: sessao.id },
      data: { payload: novoPayload as Prisma.InputJsonValue },
    });

    return { ok: true, movimentacaoId, semMudanca, estoqueDepois: NOVO_SALDO_NAO_BIPADO };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao zerar produto" };
  }
}

// ─── INVENTARIO INTELIGENTE · Conciliação dinâmica ─────────────────────────────
// Resolve o inventário de VÁRIOS DIAS: entre a contagem física de um produto e o fechamento,
// ele continua sendo vendido/usado em OS/devolvido/movimentado. Aqui projetamos a contagem até
// o presente usando o livro-razão `MovimentacaoEstoque` (deltas assinados, já alimentado por
// PDV/OS/devolução/entrada/ajuste) e medimos a divergência REAL contra o estoque atual.
//   saldoEsperadoHoje = contado + Σ(movimentações com createdAt > ultimoBipeEm)
//   divergenciaReal   = saldoEsperadoHoje − estoqueAtual
// SOMENTE LEITURA na montagem/simulação. A aplicação reusa `registrarAjusteEstoque` (motor único
// de ledger) e as MESMAS flags de idempotência da F4 (payload), garantindo que conciliação e
// ajuste individual nunca apliquem em dobro. Não há schema novo.

/** Item ENCONTRADO conciliado + estado de ajuste (flag F4 na contagem). */
export type ConciliacaoItemDTO = ItemConciliado & { ajusteAplicado: boolean };

/** Produto não encontrado (estoque positivo, não bipado) enriquecido para a tela. */
export type ConciliacaoNaoEncontradoDTO = ItemNaoEncontrado & {
  categoria: string | null;
  ultimaVendaEm: string | null;
  ultimaEntradaEm: string | null;
  /** true quando já zerado por ausência nesta sessão (flag F4 no payload da sessão). */
  ajusteAplicado: boolean;
};

export type ConciliacaoInventarioDTO = {
  sessao: InventarioSessaoDTO;
  itens: ConciliacaoItemDTO[];
  naoEncontrados: ConciliacaoNaoEncontradoDTO[];
  totais: TotaisConciliacao;
};

/**
 * Monta a conciliação de UMA sessão já carregada (com payload). Reusado por
 * `getConciliacaoInventario` (leitura), `simularConciliacaoInventario` e
 * `aplicarConciliacaoInventario` (recálculo no servidor antes de aplicar). SOMENTE LEITURA.
 */
async function construirConciliacaoSessao(
  sid: string,
  sessao: SessaoComPayload
): Promise<ConciliacaoInventarioDTO> {
  const [contagensRows, catalogo] = await Promise.all([
    prisma.inventarioContagem.findMany({
      where: { storeId: sid, sessaoId: sessao.id, status: STATUS_CONTAGEM.ENCONTRADO, produtoId: { not: null } },
      select: { produtoId: true, quantidadeContada: true, ultimoBipeEm: true, payload: true },
    }),
    prisma.produto.findMany({
      where: { storeId: sid, active: true },
      select: { id: true, name: true, sku: true, stock: true, precoCusto: true, price: true, category: true },
    }),
  ]);

  // Contagens resolvidas (produtoId garantido pelo filtro) + flag de ajuste por produto.
  const contagens = contagensRows
    .filter((c): c is typeof c & { produtoId: string } => Boolean(c.produtoId))
    .map((c) => ({ produtoId: c.produtoId, quantidadeContada: c.quantidadeContada, contadoEm: c.ultimoBipeEm }));
  const ajustePorProduto = new Map<string, boolean>();
  for (const c of contagensRows) {
    if (c.produtoId && !ajustePorProduto.has(c.produtoId)) {
      ajustePorProduto.set(c.produtoId, lerAjusteContagem(c.payload).aplicado);
    }
  }

  const contadosIds = new Set(contagens.map((c) => c.produtoId));
  const produtos = catalogo.map((p) => ({
    id: p.id,
    nome: p.name,
    sku: p.sku,
    estoqueAtual: p.stock,
    precoCusto: p.precoCusto ?? 0,
    precoVenda: p.price ?? 0,
  }));

  // Ledger relevante: movimentações dos produtos contados a partir do início da contagem
  // (o núcleo PURO aplica o corte estrito por item, usando o `ultimoBipeEm` de cada produto).
  let movimentacoes: MovimentoEstoqueConc[] = [];
  if (contagens.length > 0) {
    const minContadoEm = contagens.reduce(
      (min, c) => (c.contadoEm < min ? c.contadoEm : min),
      contagens[0].contadoEm
    );
    const rows = await prisma.movimentacaoEstoque.findMany({
      where: { storeId: sid, produtoId: { in: [...contadosIds] }, createdAt: { gte: minContadoEm } },
      select: { produtoId: true, quantidade: true, createdAt: true },
    });
    movimentacoes = rows
      .filter((r): r is typeof r & { produtoId: string } => Boolean(r.produtoId))
      .map((r) => ({ produtoId: r.produtoId, quantidade: r.quantidade, em: r.createdAt }));
  }

  // Candidatos a "não encontrado": estoque positivo e não contado. Enriquecemos última
  // venda/entrada/movimentação a partir do ledger (display + classificação de suspeito antigo).
  const candidatos = catalogo.filter((p) => !contadosIds.has(p.id) && p.stock > 0).map((p) => p.id);
  const ultimaMovPorProduto: Record<string, string | null> = {};
  const ultimaVendaPorProduto = new Map<string, string>();
  const ultimaEntradaPorProduto = new Map<string, string>();
  if (candidatos.length > 0) {
    const [aggMov, aggVenda, aggEntrada] = await Promise.all([
      prisma.movimentacaoEstoque.groupBy({
        by: ["produtoId"],
        where: { storeId: sid, produtoId: { in: candidatos } },
        _max: { createdAt: true },
      }),
      prisma.movimentacaoEstoque.groupBy({
        by: ["produtoId"],
        where: { storeId: sid, produtoId: { in: candidatos }, tipo: "saida" },
        _max: { createdAt: true },
      }),
      prisma.movimentacaoEstoque.groupBy({
        by: ["produtoId"],
        where: { storeId: sid, produtoId: { in: candidatos }, tipo: "entrada" },
        _max: { createdAt: true },
      }),
    ]);
    for (const r of aggMov) if (r.produtoId) ultimaMovPorProduto[r.produtoId] = r._max.createdAt?.toISOString() ?? null;
    for (const r of aggVenda) if (r.produtoId && r._max.createdAt) ultimaVendaPorProduto.set(r.produtoId, r._max.createdAt.toISOString());
    for (const r of aggEntrada) if (r.produtoId && r._max.createdAt) ultimaEntradaPorProduto.set(r.produtoId, r._max.createdAt.toISOString());
  }

  const rel = montarConciliacao({ contagens, produtos, movimentacoes, ultimaMovPorProduto });

  const categoriaPorProduto = new Map(catalogo.map((p) => [p.id, p.category ?? null]));
  const ajustesNaoBipados = lerAjustesNaoBipados(sessao.payload);

  const itens: ConciliacaoItemDTO[] = rel.itens.map((i) => ({
    ...i,
    ajusteAplicado: ajustePorProduto.get(i.produtoId) ?? false,
  }));
  const naoEncontrados: ConciliacaoNaoEncontradoDTO[] = rel.naoEncontrados.map((n) => ({
    ...n,
    categoria: categoriaPorProduto.get(n.produtoId) ?? null,
    ultimaVendaEm: ultimaVendaPorProduto.get(n.produtoId) ?? null,
    ultimaEntradaEm: ultimaEntradaPorProduto.get(n.produtoId) ?? null,
    ajusteAplicado: Object.prototype.hasOwnProperty.call(ajustesNaoBipados, n.produtoId),
  }));

  return { sessao: sessaoToDTO(sessao), itens, naoEncontrados, totais: rel.totais };
}

export type ConciliacaoInventarioResult =
  | { ok: true; conciliacao: ConciliacaoInventarioDTO }
  | ActionFail;

/**
 * Conciliação completa de uma sessão (itens conciliados + não encontrados + totais). Funciona
 * para sessão aberta (prévia ao vivo) ou finalizada. SOMENTE LEITURA.
 */
export async function getConciliacaoInventario(
  storeId: string,
  sessaoId: string
): Promise<ConciliacaoInventarioResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;
  const sid = (sessaoId ?? "").trim();
  if (!sid) return { ok: false, reason: "Sessão inválida" };
  try {
    const sessao = await prisma.inventarioSessao.findFirst({
      where: { id: sid, storeId: g.sid },
      select: { ...SESSAO_SELECT, payload: true },
    });
    if (!sessao) return { ok: false, reason: "Sessão não encontrada" };
    const conciliacao = await construirConciliacaoSessao(g.sid, sessao);
    return { ok: true, conciliacao };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao montar conciliação" };
  }
}

export type ConciliacaoSelecao = {
  /** Produtos com divergência real a aplicar (vão para o saldo esperado hoje). */
  divergenciaProdutoIds: string[];
  /** Produtos não encontrados a zerar por ausência. */
  naoEncontradoProdutoIds: string[];
};

/** Filtra a conciliação para apenas o que está selecionado E ainda não aplicado. */
function filtrarSelecao(conc: ConciliacaoInventarioDTO, selecao: ConciliacaoSelecao) {
  const divSel = new Set(selecao.divergenciaProdutoIds ?? []);
  const naoSel = new Set(selecao.naoEncontradoProdutoIds ?? []);
  const divergencias = conc.itens.filter(
    (i) => i.grupo === GRUPO_CONCILIACAO.COM_DIVERGENCIA && !i.ajusteAplicado && divSel.has(i.produtoId)
  );
  const naoEncontrados = conc.naoEncontrados.filter((n) => !n.ajusteAplicado && naoSel.has(n.produtoId));
  return { divergencias, naoEncontrados };
}

export type SimularConciliacaoResult =
  | { ok: true; simulacao: SimulacaoConciliacao; operador: string | null; selecionados: { divergencias: number; naoEncontrados: number } }
  | ActionFail;

/**
 * Simula a aplicação da conciliação a uma SELEÇÃO de divergências + não encontrados, recalculando
 * tudo no servidor. SOMENTE LEITURA — nada é gravado. Exibido ao operador antes de confirmar.
 */
export async function simularConciliacaoInventario(
  storeId: string,
  sessaoId: string,
  selecao: ConciliacaoSelecao
): Promise<SimularConciliacaoResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;
  const sid = (sessaoId ?? "").trim();
  if (!sid) return { ok: false, reason: "Sessão inválida" };
  try {
    const sessao = await prisma.inventarioSessao.findFirst({
      where: { id: sid, storeId: g.sid },
      select: { ...SESSAO_SELECT, payload: true },
    });
    if (!sessao) return { ok: false, reason: "Sessão não encontrada" };
    const conc = await construirConciliacaoSessao(g.sid, sessao);
    const { divergencias, naoEncontrados } = filtrarSelecao(conc, selecao);
    const simulacao = simularAplicacaoConciliacao({ divergencias, naoEncontrados });
    return {
      ok: true,
      simulacao,
      operador: g.usuario,
      selecionados: { divergencias: divergencias.length, naoEncontrados: naoEncontrados.length },
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao simular conciliação" };
  }
}

export type AplicarConciliacaoResult =
  | {
      ok: true;
      resumo: {
        divergenciasAplicadas: number;
        naoEncontradosZerados: number;
        semMudanca: number;
        pulados: number;
        falhas: { produtoId: string; nome: string; reason: string }[];
      };
    }
  | ActionFail;

/**
 * Aplica a conciliação selecionada. Pré-condições: sessão da loja, FINALIZADA (a contagem precisa
 * estar congelada antes de mexer no estoque — mesmo gate da F4). Recalcula tudo no servidor,
 * grava cada divergência com `novoSaldo = saldoEsperadoHoje` (projeção da contagem até hoje) e
 * zera cada não encontrado, SEMPRE via `registrarAjusteEstoque` (ledger + auditoria + idempotência
 * por payload). Itens já aplicados são pulados → reaplicar não duplica.
 */
export async function aplicarConciliacaoInventario(
  storeId: string,
  sessaoId: string,
  selecao: ConciliacaoSelecao
): Promise<AplicarConciliacaoResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;
  const sid = (sessaoId ?? "").trim();
  if (!sid) return { ok: false, reason: "Sessão inválida" };

  try {
    const sessao = await prisma.inventarioSessao.findFirst({
      where: { id: sid, storeId: g.sid },
      select: { ...SESSAO_SELECT, payload: true },
    });
    if (!sessao) return { ok: false, reason: "Sessão não encontrada" };
    if (sessao.status !== STATUS_SESSAO.FINALIZADA) {
      return { ok: false, reason: "Encerre a sessão antes de aplicar a conciliação" };
    }

    // Recálculo no servidor (fonte da verdade no momento da aplicação).
    const conc = await construirConciliacaoSessao(g.sid, sessao);
    const { divergencias, naoEncontrados } = filtrarSelecao(conc, selecao);

    const resumo = {
      divergenciasAplicadas: 0,
      naoEncontradosZerados: 0,
      semMudanca: 0,
      pulados: 0,
      falhas: [] as { produtoId: string; nome: string; reason: string }[],
    };
    const motivoSessao = montarMotivoInventario(sessao, "divergencia");
    const motivoAusencia = montarMotivoInventario(sessao, "ausencia");

    // 1) Divergências reais → grava o saldo esperado hoje.
    for (const d of divergencias) {
      const contagem = await prisma.inventarioContagem.findFirst({
        where: { storeId: g.sid, sessaoId: sid, produtoId: d.produtoId, status: STATUS_CONTAGEM.ENCONTRADO },
        select: { id: true, payload: true },
      });
      if (!contagem) {
        resumo.falhas.push({ produtoId: d.produtoId, nome: d.nome, reason: "Contagem não encontrada" });
        continue;
      }
      if (lerAjusteContagem(contagem.payload).aplicado) {
        resumo.pulados += 1;
        continue;
      }
      const res = await registrarAjusteEstoque(g.sid, {
        produtoId: d.produtoId,
        novoSaldo: saldoAplicavel(d.saldoEsperadoHoje),
        motivo: motivoSessao,
        observacao: `Inventário ${sid} — conciliação`,
      });
      const semMudanca = !res.ok && /nada a ajustar/i.test(res.reason);
      if (!res.ok && !semMudanca) {
        resumo.falhas.push({ produtoId: d.produtoId, nome: d.nome, reason: res.reason });
        continue;
      }
      await prisma.inventarioContagem.update({
        where: { id: contagem.id },
        data: {
          payload: marcarAjusteContagemPayload(contagem.payload, {
            aplicadoEm: new Date().toISOString(),
            movimentacaoId: res.ok ? res.movimentacaoId : null,
            operador: g.usuario,
          }) as Prisma.InputJsonValue,
        },
      });
      if (semMudanca) resumo.semMudanca += 1;
      resumo.divergenciasAplicadas += 1;
    }

    // 2) Não encontrados → zera por ausência. Acumula as marcas no payload da sessão.
    let sessionPayload: unknown = sessao.payload;
    for (const n of naoEncontrados) {
      if (naoBipadoAjustado(sessionPayload, n.produtoId)) {
        resumo.pulados += 1;
        continue;
      }
      const res = await registrarAjusteEstoque(g.sid, {
        produtoId: n.produtoId,
        novoSaldo: NOVO_SALDO_NAO_BIPADO,
        motivo: motivoAusencia,
        observacao: `Inventário ${sid} — ausência confirmada (conciliação)`,
      });
      const semMudanca = !res.ok && /nada a ajustar/i.test(res.reason);
      if (!res.ok && !semMudanca) {
        resumo.falhas.push({ produtoId: n.produtoId, nome: n.nome, reason: res.reason });
        continue;
      }
      sessionPayload = marcarAjusteNaoBipadoPayload(sessionPayload, n.produtoId, {
        aplicadoEm: new Date().toISOString(),
        movimentacaoId: res.ok ? res.movimentacaoId : null,
        operador: g.usuario,
      });
      await prisma.inventarioSessao.update({
        where: { id: sessao.id },
        data: { payload: sessionPayload as Prisma.InputJsonValue },
      });
      if (semMudanca) resumo.semMudanca += 1;
      resumo.naoEncontradosZerados += 1;
    }

    return { ok: true, resumo };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao aplicar conciliação" };
  }
}
