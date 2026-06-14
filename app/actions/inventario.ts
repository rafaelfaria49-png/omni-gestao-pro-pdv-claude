"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canAccessStore } from "@/lib/auth/enterprise-permissions";
import {
  aplicarBipe,
  diferencaContagem,
  montarRelatorioInventario,
  normalizarCodigo,
  STATUS_CONTAGEM,
  STATUS_SESSAO,
  type ContagemLinha,
  type ProdutoEstoque,
} from "@/lib/estoque/inventario-core";

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

export type RegistrarBipeResult =
  | { ok: true; contagem: InventarioContagemDTO; contagens: InventarioContagemDTO[] }
  | ActionFail;

/**
 * Registra um bipe na sessão.
 *  - `produtoId` (id Prisma resolvido pelo `/api/ops/inventory/lookup` no cliente) é RE-VALIDADO
 *    aqui contra a loja — o snapshot autoritativo vem do banco, nunca do cliente.
 *  - 1º bipe de um código → cria a linha (encontrado/reconciliação). 2º bipe → incrementa (a
 *    unicidade `@@unique([sessaoId, codigoBipado])` garante uma linha por código).
 */
export async function registrarBipe(
  storeId: string,
  input: { sessaoId: string; codigo: string; produtoId?: string | null }
): Promise<RegistrarBipeResult> {
  const g = await guard(storeId);
  if (!g.ok) return g;

  const sessaoId = (input.sessaoId ?? "").trim();
  if (!sessaoId) return { ok: false, reason: "Sessão inválida" };
  const codigo = normalizarCodigo(input.codigo);
  if (!codigo) return { ok: false, reason: "Código bipado vazio" };

  try {
    // Sessão precisa existir, ser desta loja e estar aberta.
    const sessao = await prisma.inventarioSessao.findFirst({
      where: { id: sessaoId, storeId: g.sid, status: STATUS_SESSAO.ABERTA },
      select: { id: true },
    });
    if (!sessao) return { ok: false, reason: "Sessão não encontrada ou já encerrada" };

    // Snapshot autoritativo: re-busca o produto por id NA LOJA (ignora dados do cliente).
    let produto: ProdutoEstoque | null = null;
    const pid = (input.produtoId ?? "").trim();
    if (pid) {
      const row = await prisma.produto.findFirst({
        where: { id: pid, storeId: g.sid },
        select: { id: true, name: true, sku: true, barcode: true, stock: true },
      });
      if (row) {
        produto = { id: row.id, nome: row.name, sku: row.sku, barcode: row.barcode, stock: row.stock };
      }
    }

    // Classificação pela função PURA testada (encontrado × reconciliação + snapshot).
    const { linha } = aplicarBipe(null, { codigoBipado: codigo, produto });

    const saved = await prisma.inventarioContagem.upsert({
      where: { sessaoId_codigoBipado: { sessaoId, codigoBipado: codigo } },
      create: {
        storeId: g.sid,
        sessaoId,
        produtoId: linha.produtoId,
        codigoBipado: codigo,
        produtoNomeSnapshot: linha.produtoNomeSnapshot ?? null,
        produtoSkuSnapshot: linha.produtoSkuSnapshot ?? null,
        estoqueSistemaSnapshot: linha.estoqueSistemaSnapshot,
        quantidadeContada: linha.quantidadeContada,
        status: linha.status,
      },
      // 2º+ bipe: só incrementa a quantidade (preserva produto/status/snapshot da 1ª leitura).
      update: { quantidadeContada: { increment: 1 }, ultimoBipeEm: new Date() },
      select: CONTAGEM_SELECT,
    });

    const contagens = await loadContagens(g.sid, sessaoId);
    return { ok: true, contagem: contagemToDTO(saved), contagens };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao registrar bipe" };
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
 * NÃO reconcilia — apenas congela a contagem. Relatório/ajuste são F3/F4.
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
    const res = await prisma.inventarioSessao.updateMany({
      where: { id: sid, storeId: g.sid, status: STATUS_SESSAO.ABERTA },
      data: { status: STATUS_SESSAO.FINALIZADA, finalizadoEm: new Date() },
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
};

/** Linha C — fila de reconciliação (código sem produto resolvido). */
export type RelatorioReconciliacaoDTO = {
  id: string;
  codigoBipado: string;
  quantidadeContada: number;
  ultimoBipeEm: string;
  sessaoId: string;
  sessaoNome: string | null;
};

/** Linha D — produto do sistema que NÃO apareceu na contagem (conferência pendente). */
export type RelatorioNaoBipadoDTO = {
  produtoId: string;
  nome: string;
  sku: string | null;
  codigo: string | null;
  estoqueSistema: number;
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
      select: SESSAO_SELECT,
    });
    if (!sessao) return { ok: false, reason: "Sessão não encontrada" };

    const [contagensRows, catalogo] = await Promise.all([
      prisma.inventarioContagem.findMany({
        where: { storeId: g.sid, sessaoId: sid },
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
          ultimoBipeEm: true,
        },
      }),
      // Catálogo da loja (ativo) — base do "não bipados" e do estoque atual da divergência.
      prisma.produto.findMany({
        where: { storeId: g.sid, active: true },
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
    for (const c of contagensRows) {
      if (c.produtoId && !codigoPorProduto.has(c.produtoId)) codigoPorProduto.set(c.produtoId, c.codigoBipado);
    }
    const codigoCatalogo = new Map<string, string | null>(
      catalogo.map((p) => [p.id, (p.barcode ?? "").trim() || (p.sku ?? "").trim() || null])
    );

    const encontrados: RelatorioEncontradoDTO[] = rel.encontrados.map((e) => ({
      produtoId: e.produtoId,
      nome: e.nome,
      sku: e.sku,
      codigo: codigoPorProduto.get(e.produtoId) ?? null,
      estoqueSistema: e.estoqueSistema,
      quantidadeContada: e.quantidadeContada,
      diferenca: e.diferenca,
    }));

    // B) divergências = contado ≠ sistema, ordenadas pela MAIOR diferença (abs desc).
    const divergencias = encontrados
      .filter((e) => e.diferenca !== 0)
      .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca));

    // C) reconciliação a partir das linhas cruas (data/hora + sessão para auditoria).
    const reconciliacao: RelatorioReconciliacaoDTO[] = contagensRows
      .filter((c) => c.status === STATUS_CONTAGEM.RECONCILIACAO || !c.produtoId)
      .map((c) => ({
        id: c.id,
        codigoBipado: c.codigoBipado,
        quantidadeContada: c.quantidadeContada,
        ultimoBipeEm: c.ultimoBipeEm.toISOString(),
        sessaoId: sid,
        sessaoNome: sessao.nome,
      }));

    // D) não bipados = produto do sistema nunca contado (NUNCA zerar — só conferência pendente).
    const naoBipados: RelatorioNaoBipadoDTO[] = rel.naoContados.map((n) => ({
      produtoId: n.produtoId,
      nome: n.nome,
      sku: n.sku,
      codigo: codigoCatalogo.get(n.produtoId) ?? null,
      estoqueSistema: n.estoqueSistema,
    }));

    return {
      ok: true,
      relatorio: {
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
        },
      },
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Falha ao gerar relatório" };
  }
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
