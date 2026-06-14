"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { auth } from "@/auth";
import { canAccessStore } from "@/lib/auth/enterprise-permissions";
import { registrarAjusteEstoque } from "@/app/actions/estoque";
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
  ultimoBipeEm: string;
  sessaoId: string;
  sessaoNome: string | null;
  /** F5 — classificação operacional (pendente/localizado/ignorado/cadastrar_depois). */
  classificacao: ClassificacaoReconciliacao;
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

    // C) reconciliação a partir das linhas cruas (data/hora + sessão + classificação F5).
    const reconciliacao: RelatorioReconciliacaoDTO[] = contagensRows
      .filter((c) => c.status === STATUS_CONTAGEM.RECONCILIACAO || !c.produtoId)
      .map((c) => ({
        id: c.id,
        codigoBipado: c.codigoBipado,
        quantidadeContada: c.quantidadeContada,
        ultimoBipeEm: c.ultimoBipeEm.toISOString(),
        sessaoId: sessao.id,
        sessaoNome: sessao.nome,
        classificacao: lerClassificacaoReconciliacao(c.payload),
      }));

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
