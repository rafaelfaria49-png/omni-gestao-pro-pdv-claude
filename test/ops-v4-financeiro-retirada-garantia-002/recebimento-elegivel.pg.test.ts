// @vitest-environment node
//
// OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 — PostgreSQL REAL, local e descartável.
// Writers REAIS da V3 (receber, misto, a prazo, estorno, aprovar, gerar orçamento, atendimento
// rápido, abertura autorizada) e a ação nova de formalização, contra o banco. Só a SESSÃO
// (`@/auth`) e `next/cache` são simulados; a permissão é a matriz REAL por papel. Concorrência
// por barreira na escrita + espera de trava confirmada no `pg_stat_activity` (nunca sleep).
// Ausência de banco = BLOQUEIO_EXPLICITO_PG (nunca skip). Massa sintética (`qa-frg2-*`).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sessao = vi.hoisted(() => ({
  id: "qa-frg2-admin",
  name: "Admin QA FRG2",
  role: "ADMIN",
  storeAccess: "all" as string,
  allowedStoreIds: [] as string[],
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { ...sessao } })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Barreira na escrita (mesmo padrão de `test/ops-v3-recebimento-misto/hardening-p1-transitivos.pg.ts`):
// a transação real para DEPOIS de gravar, segurando as travas, até o teste liberar.
type Fase = "antes" | "depois";
type Pausa = {
  modelo: string;
  metodos: readonly string[];
  fase: Fase;
  quando: (args: unknown, resultado?: unknown) => boolean;
  chegou: () => void;
  barreira: Promise<void>;
};
const intercept = vi.hoisted(() => ({ pausa: null as null | Pausa }));

vi.mock("@/lib/prisma", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/prisma")>();
  const envolverDelegate = (modelo: string, delegate: object) =>
    new Proxy(delegate, {
      get(t, p) {
        const fn = Reflect.get(t, p);
        if (typeof fn !== "function") return fn;
        return async (args: unknown) => {
          const pausa = intercept.pausa;
          const alvo = pausa && pausa.modelo === modelo && pausa.metodos.includes(String(p));
          if (alvo && pausa.fase === "antes" && pausa.quando(args)) {
            intercept.pausa = null;
            pausa.chegou();
            await pausa.barreira;
          }
          const r = await (fn as (a: unknown) => Promise<unknown>).call(t, args);
          if (alvo && pausa.fase === "depois" && intercept.pausa === pausa && pausa.quando(args, r)) {
            intercept.pausa = null;
            pausa.chegou();
            await pausa.barreira;
          }
          return r;
        };
      },
    });
  const MODELOS = new Set(["ordemServico", "contaReceberTitulo", "caixaOperacao"]);
  const envolverCliente = (client: object): object =>
    new Proxy(client, {
      get(t, p) {
        const v = Reflect.get(t, p);
        if (typeof p === "string" && MODELOS.has(p) && v && typeof v === "object") return envolverDelegate(p, v);
        if (p === "$transaction" && typeof v === "function") {
          return (arg: unknown, opts?: unknown) =>
            typeof arg === "function"
              ? (v as (...a: unknown[]) => unknown).call(t, (tx: object) => (arg as (tx: object) => unknown)(envolverCliente(tx)), opts)
              : (v as (...a: unknown[]) => unknown).call(t, arg, opts);
        }
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
      },
    });
  const prismaEnvolvido = envolverCliente(real.prisma) as typeof real.prisma;
  return {
    ...real,
    prisma: prismaEnvolvido,
    withPrismaSafe: <T,>(op: (db: typeof real.prisma) => Promise<T>, fallback: T) => real.withPrismaSafe(() => op(prismaEnvolvido), fallback),
  };
});

import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import {
  estornarRecebimentoOSV3,
  lancarOSAPrazoV3,
  lerPagamentoOSV3,
  receberOSV3,
  registrarRecebimentoMistoOSV3,
} from "@/lib/operacoes-v3/pdv-servico-actions";
import { aprovarOrcamentoParaReceberV3, aprovarOrcamentoV3, conferirEscopoAprovacaoV3, gerarOrcamentoDaOS } from "@/lib/operacoes-v3/orcamento-actions";
import { MENSAGEM_ESCOPO_APROVACAO_ALTERADO_V3 } from "@/lib/operacoes-v3/formalizacao-aprovacao-model";
import { conferirFormalizacaoAprovacaoV3, formalizarAprovacaoPendenteV3 } from "@/lib/operacoes-v3/formalizacao-aprovacao-actions";
import type { EscopoFormalizacaoV3 } from "@/lib/operacoes-v3/formalizacao-aprovacao-model";
import { finalizarAtendimentoRapidoV3 } from "@/lib/operacoes-v3/atendimento-rapido-actions";
import { criarOSServicoAutorizadoV3 } from "@/lib/operacoes-v3/nova-os-actions";
import { novaOSDraftVazioV3, type NovaOSDraftV3 } from "@/lib/operacoes-v3/nova-os-model";
import { gerarOperacaoIdV3, hojeLojaV3 } from "@/lib/operacoes-v3/recebimento-misto-model";
import { localKeyContaReceberOSV3 } from "@/lib/operacoes-v3/payment-model";
import { lerProjecaoFinanceiraOSV4 } from "@/lib/operacoes-v4/financial-projection-actions";

function exigirBancoLocal(): void {
  const urls = [process.env.OPS_V4_FRG_TEST_DATABASE_URL, process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => (v ?? "").trim());
  if (urls.some((v) => !v)) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: configure OPS_V4_FRG_TEST_DATABASE_URL + DATABASE_URL + DIRECT_URL para o PostgreSQL local descartável.");
  }
  const alvos = urls.map((v) => new URL(v));
  if (alvos.some((u) => !["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname.toLowerCase()))) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: integração só pode usar loopback.");
  }
  const chave = (u: URL) => `${u.hostname}:${u.port}${u.pathname}`;
  if (alvos.some((u) => chave(u) !== chave(alvos[0]!)) || !alvos[0]!.pathname.slice(1).startsWith("ops_v4_frg_qa")) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: as três URLs devem apontar ao MESMO banco descartável ops_v4_frg_qa*.");
  }
}
exigirBancoLocal();

const SUFIXO = Date.now().toString(36);
const ENTRADA = "2026-09-18T12:00:00.000Z";
const VENCIDA = "2026-09-20T02:59:59.000Z";
const VENC = (() => {
  const [a, m, d] = hojeLojaV3().split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + 30)).toISOString().slice(0, 10);
})();
let seq = 0;
type Payload = Record<string, any>;

// Usuário QA no banco descartável (o "entitlement" da sessão o exige para cadastrar cliente).
// Senha não utilizável (não é hash): ninguém autentica com ele; só existe no banco QA.
beforeAll(async () => {
  await prisma.adminUser.upsert({
    where: { id: sessao.id },
    update: { active: true, role: "ADMIN" },
    create: { id: sessao.id, email: `${sessao.id}@qa.test`, name: sessao.name, password: `nao-utilizavel-${SUFIXO}`, role: "ADMIN" },
  });
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(() => {
  sessao.role = "ADMIN";
  intercept.pausa = null;
});

async function novaLoja(): Promise<string> {
  const id = `qa-frg2-${SUFIXO}-${++seq}`;
  await prisma.store.create({ data: { id, name: `Loja QA FRG2 ${seq}` } });
  return id;
}

interface OpcoesOS {
  /** `null` = sem orçamento real (itens só no catálogo da OS, preço na coluna). */
  orcamento?: "rascunho" | "enviado" | "aprovado" | "recusado" | null;
  total?: number;
  coluna?: number;
  validoAte?: string;
  status?: string;
}

async function novaOS(storeId: string, o: OpcoesOS = {}): Promise<string> {
  const n = ++seq;
  const id = `os-qa-frg2-${SUFIXO}-${n}`;
  const codigo = `OS-QA-FRG2-${n}`;
  const total = o.total ?? 420;
  const coluna = o.coluna ?? total;
  const status = o.status ?? "pronta";
  const orcStatus = o.orcamento === undefined ? "aprovado" : o.orcamento;
  const orcamento = orcStatus === null
    ? undefined
    : {
        id: `orc-${n}`, status: orcStatus, sintetizado: false, criadoEm: ENTRADA,
        ...(orcStatus === "aprovado" ? { respondidoEm: ENTRADA } : {}),
        ...(o.validoAte ? { validoAte: o.validoAte } : {}),
        servicos: [{ id: `srv-${n}`, descricao: "Troca de Tela", valor: total }], pecas: [], desconto: 0, total,
      };
  await prisma.ordemServico.create({
    data: {
      id, storeId, numero: codigo, equipamento: "Samsung S20 FE", defeito: "Tela quebrada", status: "Pronto", valorTotal: coluna,
      payload: {
        id, codigo, storeId, criadoEm: ENTRADA,
        cliente: { nome: `Cliente QA FRG2 ${n}` },
        equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "S20 FE" },
        status, operacaoStatus: status, operacaoStatusV3: status, valorTotal: coluna,
        ...(orcamento ? { orcamento } : { servicosCatalogo: [{ descricao: "Troca de Tela", valorVenda: total }], pecas: [] }),
        aberturaV3: { versao: 1, recepcao: { recebidoPor: "Balcão QA", dataEntrada: ENTRADA }, garantiaPrevista: { modelo: "tela", prazoDias: 90 } },
        timeline: [{ id: `ev-${n}`, tipo: "criacao", autor: "QA", autorTipo: "usuario", conteudo: "OS criada.", criadoEm: ENTRADA }],
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return id;
}

async function abrirCaixa(storeId: string): Promise<string> {
  return (await prisma.sessaoCaixa.create({ data: { storeId, operador: "QA", status: "ABERTA" } })).id;
}

async function lerPayload(osId: string): Promise<Payload> {
  return (await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { payload: true } })).payload as Payload;
}

/** Tudo o que é dinheiro ou estado da OS: título(s), caixa, movimentações e a linha da OS. */
async function efeitos(storeId: string, osId: string) {
  const [os, titulos, caixa, movs] = await Promise.all([
    prisma.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { payload: true, status: true, valorTotal: true } }),
    prisma.contaReceberTitulo.findMany({ where: { storeId }, select: { id: true, status: true, valor: true, payload: true, localKey: true }, orderBy: { id: "asc" } }),
    prisma.caixaOperacao.findMany({ where: { storeId }, select: { valor: true, tipo: true, payload: true }, orderBy: { at: "asc" } }),
    prisma.movimentacaoFinanceira.count({ where: { storeId } }),
  ]);
  return { os, titulos, caixa, movs };
}
const foto = async (storeId: string, osId: string) => JSON.stringify(await efeitos(storeId, osId));
/** Só o financeiro (o misto grava a recusa terminal no payload da OS — não é dinheiro). */
const fotoFinanceira = async (storeId: string, osId: string) => {
  const { titulos, caixa, movs } = await efeitos(storeId, osId);
  return JSON.stringify({ titulos, caixa, movs });
};

async function titulo(storeId: string, osId: string) {
  return prisma.contaReceberTitulo.findUnique({ where: { storeId_localKey: { storeId, localKey: localKeyContaReceberOSV3(storeId, osId) } } });
}
const pagamentosDo = (t: { payload: unknown } | null) =>
  ((t?.payload as Payload | undefined)?.historico ?? []).filter((e: Payload) => ["pagamento", "liquidacao"].includes(e.tipo)).map((e: Payload) => e.valor);

/**
 * Caso legado (como a OS-2026-00025): pagamento pelo writer REAL sobre preço aprovado e, depois,
 * um rascunho materializado por cima. O writer atual não aceita mais criá-lo diretamente.
 */
async function legadoPagoEmRascunho(storeId: string, sessaoId: string, valores: number[], o: OpcoesOS = {}): Promise<string> {
  const osId = await novaOS(storeId, { ...o, orcamento: "aprovado" });
  for (const valor of valores) await receberOSV3(storeId, osId, { linhas: [{ forma: "dinheiro", valor }], sessaoId, operacaoId: gerarOperacaoIdV3() });
  const payload = await lerPayload(osId);
  const { respondidoEm: _r, ...orcamento } = payload.orcamento as Payload;
  await prisma.ordemServico.update({
    where: { id: osId },
    data: { payload: { ...payload, orcamento: { ...orcamento, status: o.orcamento ?? "rascunho", ...(o.validoAte ? { validoAte: o.validoAte } : {}) } } as Prisma.InputJsonValue },
  });
  return osId;
}

async function conferir(storeId: string, osId: string): Promise<EscopoFormalizacaoV3> {
  const r = await conferirFormalizacaoAprovacaoV3(storeId, osId);
  if (!r.ok) throw new Error(`conferência recusada: ${r.code} ${r.mensagem}`);
  return r.escopo;
}
const entradaFormalizacao = (escopo: EscopoFormalizacaoV3, extra: Record<string, unknown> = {}) => ({
  operacaoId: gerarOperacaoIdV3(),
  motivo: "Cliente aprovou o orçamento no balcão; registro formal pendente.",
  declaracaoAceita: true,
  evidencia: "Mensagem do cliente arquivada",
  escopo,
  ...extra,
});

async function esperarBloqueioNoBanco(timeoutMs = 15_000, minimo = 1): Promise<void> {
  const fim = Date.now() + timeoutMs;
  while (Date.now() < fim) {
    const rows = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()
    `;
    if ((rows[0]?.n ?? 0) >= minimo) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("a operação concorrente não chegou a esperar a trava");
}

/** Resolve quando a promessa termina OU quando outra transação está esperando trava no banco. */
async function concluiuOuEsperaTrava(p: Promise<unknown>): Promise<"concluiu" | "esperando_trava"> {
  return Promise.race([p.then(() => "concluiu" as const, () => "concluiu" as const), esperarBloqueioNoBanco().then(() => "esperando_trava" as const)]);
}

function armarPausa(p: { modelo: string; metodos: readonly string[]; fase?: Fase; quando: (args: Payload, resultado?: unknown) => boolean }) {
  let liberar!: () => void;
  const barreira = new Promise<void>((r) => (liberar = r));
  let chegou!: () => void;
  const naBarreira = new Promise<void>((r) => (chegou = r));
  intercept.pausa = {
    modelo: p.modelo,
    metodos: p.metodos,
    fase: p.fase ?? "depois",
    quando: (args, r) => !!args && typeof args === "object" && p.quando(args as Payload, r),
    chegou,
    barreira,
  };
  return { naBarreira, liberar };
}

const naoEhDeadlock = (r: PromiseSettledResult<unknown>) => {
  const msg = r.status === "rejected" ? String((r.reason as Error)?.message ?? r.reason) : JSON.stringify(r.value ?? null);
  expect(msg, "sem deadlock/timeout").not.toMatch(/deadlock|40P01|P2034|P2028|timed out|expired/i);
};

// ─── B1 · recebimento NOVO só sobre preço comercialmente elegível ──────────────────────────
describe("B1 · recusa server-side com motivo e destino; caminhos legítimos preservados", () => {
  const recusas: Array<[string, OpcoesOS, string, string]> = [
    ["rascunho", { orcamento: "rascunho" }, "APROVACAO_COMERCIAL_PENDENTE", "comercial"],
    ["enviado", { orcamento: "enviado" }, "APROVACAO_COMERCIAL_PENDENTE", "comercial"],
    ["enviado vencido", { orcamento: "enviado", validoAte: VENCIDA }, "ORCAMENTO_EXPIRADO", "comercial"],
    ["recusado", { orcamento: "recusado" }, "ORCAMENTO_RECUSADO", "comercial"],
    ["preço divergente (orçamento 420 × coluna 400)", { orcamento: "aprovado", coluna: 400 }, "VALORES_DIVERGENTES", "financeiro"],
  ];
  for (const [nome, opcoes, codigo, destino] of recusas) {
    it(`${nome}: simples, misto e a prazo recusados; nenhum título, caixa ou movimentação`, async () => {
      const sid = await novaLoja();
      const caixa = await abrirCaixa(sid);
      const osId = await novaOS(sid, opcoes);
      const antes = await foto(sid, osId);
      await expect(receberOSV3(sid, osId, { linhas: [{ forma: "pix", valor: 100 }], sessaoId: caixa, operacaoId: gerarOperacaoIdV3() }))
        .rejects.toMatchObject({ codigo, destino, message: expect.stringMatching(/^Recebimento recusado: /) });
      await expect(lancarOSAPrazoV3(sid, osId, { vencimento: VENC })).rejects.toMatchObject({ codigo, destino });
      expect(await foto(sid, osId)).toBe(antes);
      const misto = await registrarRecebimentoMistoOSV3(sid, osId, {
        operacaoId: gerarOperacaoIdV3(), sessaoId: caixa, pagamentosAgora: [{ forma: "debito", valor: 100 }],
        saldoAPrazo: { valor: 320, vencimento: VENC }, saldoEsperado: 420,
      });
      expect(misto).toMatchObject({ ok: false, code: "comercial_nao_elegivel", naoRegistrada: true, mensagem: expect.stringMatching(/^Recebimento recusado: /), comercial: { codigo, destino } });
      const depois = await efeitos(sid, osId);
      expect(depois.titulos).toEqual([]);
      expect(depois.caixa).toEqual([]);
      expect(depois.movs).toBe(0);
    });
  }

  it("aprovado: recebe; sinal ANTES de a OS ficar pronta continua possível com preço aprovado", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const pronta = await novaOS(sid);
    expect(await receberOSV3(sid, pronta, { linhas: [{ forma: "pix", valor: 420 }], sessaoId: caixa, operacaoId: gerarOperacaoIdV3() })).toMatchObject({ jaRegistrado: false, op: "liquidar" });
    const emExecucao = await novaOS(sid, { status: "em_execucao" });
    const sinal = await receberOSV3(sid, emExecucao, { linhas: [{ forma: "dinheiro", valor: 100 }], sessaoId: caixa, intencao: "sinal", operacaoId: gerarOperacaoIdV3() });
    expect(sinal).toMatchObject({ jaRegistrado: false, op: "parcial", valorRecebido: 100 });
    expect((await lerPayload(emExecucao)).operacaoStatusV3).toBe("em_execucao");
  });

  it("OS legada sem orçamento real, preço só na coluna: segue recebendo (mesma regra da entrega)", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const osId = await novaOS(sid, { orcamento: null, total: 300 });
    expect(await receberOSV3(sid, osId, { linhas: [{ forma: "pix", valor: 300 }], sessaoId: caixa, operacaoId: gerarOperacaoIdV3() })).toMatchObject({ op: "liquidar" });
  });

  it("atendimento rápido (cria, orça, aprova e recebe) continua passando pelo writer real", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const r = await finalizarAtendimentoRapidoV3(sid, { cliente: { modo: "balcao" }, servico: { nome: "Película QA", valor: 35 }, formaPagamento: "pix" });
    expect(r).toMatchObject({ valorRecebido: 35 });
    const t = await titulo(sid, r.osId);
    expect(pagamentosDo(t)).toEqual([35]);
    const ops = await prisma.caixaOperacao.findMany({ where: { storeId: sid } });
    expect(ops.map((o) => [o.sessaoId, o.valor, (o.payload as Payload).formaPagamento])).toEqual([[caixa, 35, "pix"]]);
  });

  it("abertura com serviço já autorizado (OPS-V4-FLUXO-CURTO-003) nasce aprovada e recebe", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const base = novaOSDraftVazioV3();
    const draft: NovaOSDraftV3 = {
      ...base,
      cliente: { nome: `Cliente QA FRG2 ${++seq}`, tipo: "PF" },
      equipamento: { ...base.equipamento, marca: "Samsung", modelo: "A54" },
      problema: { defeitoRelatado: "Tela quebrada" },
      recepcao: { ...base.recepcao, origem: "balcao" },
      itens: [{ id: "tela", categoria: "servico", descricao: "Troca de tela", quantidade: 1, custoUnitario: 92, valorUnitario: 300, kind: "cobrado", baixaEstoque: false, garantiaDias: 90 }],
      desconto: 0,
    };
    const { os } = await criarOSServicoAutorizadoV3(sid, draft);
    expect(os.orcamento).toMatchObject({ status: "aprovado", total: 300 });
    expect(await receberOSV3(sid, os.id, { linhas: [{ forma: "credito", valor: 300 }], sessaoId: caixa, operacaoId: gerarOperacaoIdV3() })).toMatchObject({ op: "liquidar", jaRegistrado: false });
  });
});

// ─── B2 · aprovar + receber, replay e operação antiga ──────────────────────────────────────
describe("B2 · aprovação e recebimento independentes; replay sem segunda cobrança", () => {
  it("aprovação ok + recebimento falho (caixa fechado): aprovada fica, nada cobrado; retry com a MESMA chave grava uma vez", async () => {
    const sid = await novaLoja();
    const osId = await novaOS(sid, { orcamento: "enviado" });
    sessao.role = "TECNICO"; // aprova e recebe (editarOs), mas não formaliza crédito (gerarCobranca)
    await aprovarOrcamentoV3(sid, osId);
    expect((await lerPayload(osId)).orcamento).toMatchObject({ status: "aprovado" });
    const fechado = (await prisma.sessaoCaixa.create({ data: { storeId: sid, operador: "QA", status: "FECHADA" } })).id;
    const chave = gerarOperacaoIdV3();
    await expect(receberOSV3(sid, osId, { linhas: [{ forma: "pix", valor: 420 }], sessaoId: fechado, operacaoId: chave, saldoEsperado: 420 })).rejects.toThrow(/Caixa fechado/);
    expect(await titulo(sid, osId)).toBeNull();
    // Permissões verificadas separadamente: sem gerarCobranca, o misto (crédito) é negado.
    const misto = await registrarRecebimentoMistoOSV3(sid, osId, { operacaoId: gerarOperacaoIdV3(), pagamentosAgora: [], saldoAPrazo: { valor: 420, vencimento: VENC }, saldoEsperado: 420 });
    expect(misto).toMatchObject({ ok: false, code: "sem_permissao" });
    const aberto = await abrirCaixa(sid);
    const r1 = await receberOSV3(sid, osId, { linhas: [{ forma: "pix", valor: 420 }], sessaoId: aberto, operacaoId: chave, saldoEsperado: 420 });
    const r2 = await receberOSV3(sid, osId, { linhas: [{ forma: "pix", valor: 420 }], sessaoId: aberto, operacaoId: chave, saldoEsperado: 420 });
    expect(r1).toMatchObject({ jaRegistrado: false });
    expect(r2).toMatchObject({ jaRegistrado: true, valorRecebido: 420 });
    expect(pagamentosDo(await titulo(sid, osId))).toEqual([420]);
    expect(await prisma.caixaOperacao.count({ where: { storeId: sid } })).toBe(1);
  });

  it("sem permissão de aprovar (vendedor): negado no servidor, orçamento intacto; o 'Aprovar e receber' DEVOLVE quem pode", async () => {
    const sid = await novaLoja();
    const osId = await novaOS(sid, { orcamento: "enviado" });
    const antes = await foto(sid, osId);
    sessao.role = "VENDEDOR";
    await expect(aprovarOrcamentoV3(sid, osId)).rejects.toThrow(/Sem permissão/);
    // Recusa devolvida (não lançada): em produção é o único texto que chega ao navegador.
    expect(await conferirEscopoAprovacaoV3(sid, osId)).toEqual({ ok: false, mensagem: expect.stringMatching(/^Seu perfil não pode aprovar orçamentos/) });
    expect(await aprovarOrcamentoParaReceberV3(sid, osId, { conteudo: "qualquer" })).toEqual({
      ok: false,
      mensagem: expect.stringMatching(/^Seu perfil não pode aprovar orçamentos nesta loja\. Peça a aprovação a quem pode editar OS/),
    });
    expect(await foto(sid, osId)).toBe(antes);
    sessao.role = "TECNICO";
    const c = await conferirEscopoAprovacaoV3(sid, osId);
    if (!c.ok) throw new Error(c.mensagem);
    expect(await aprovarOrcamentoParaReceberV3(sid, osId, { conteudo: c.escopo.conteudo })).toEqual({ ok: true });
    expect((await lerPayload(osId)).orcamento).toMatchObject({ status: "aprovado" });
    expect(await aprovarOrcamentoParaReceberV3(sid, osId, { conteudo: c.escopo.conteudo })).toEqual({ ok: false, mensagem: 'Não é possível aprovar um orçamento com status "aprovado".' });
    expect(await titulo(sid, osId)).toBeNull();
  });

  it("R1-P1: escopo trocado depois da conferência (MESMO total) não é aprovado; nova conferência aprova o escopo atual", async () => {
    const sid = await novaLoja();
    const osId = await novaOS(sid, { orcamento: "enviado" });
    const c1 = await conferirEscopoAprovacaoV3(sid, osId);
    if (!c1.ok) throw new Error(c1.mensagem);
    expect(c1.escopo).toMatchObject({ totalCentavos: 42000, linhas: [{ descricao: "Troca de Tela", situacao: "cobrada", valorCentavos: 42000 }] });
    // Outra sessão troca o serviço mantendo o total.
    const p = await lerPayload(osId);
    const orc = p.orcamento as Payload;
    await prisma.ordemServico.update({
      where: { id: osId },
      data: { payload: { ...p, orcamento: { ...orc, servicos: [{ id: "srv-troca", descricao: "Troca de Bateria", valor: 420 }] } } as unknown as Prisma.InputJsonValue },
    });
    const antes = await foto(sid, osId);
    expect(await aprovarOrcamentoParaReceberV3(sid, osId, { conteudo: c1.escopo.conteudo })).toEqual({ ok: false, mensagem: MENSAGEM_ESCOPO_APROVACAO_ALTERADO_V3 });
    expect(await foto(sid, osId)).toBe(antes);
    const c2 = await conferirEscopoAprovacaoV3(sid, osId);
    if (!c2.ok) throw new Error(c2.mensagem);
    expect(c2.escopo.conteudo).not.toBe(c1.escopo.conteudo);
    expect(await aprovarOrcamentoParaReceberV3(sid, osId, { conteudo: c2.escopo.conteudo })).toEqual({ ok: true });
    expect((await lerPayload(osId)).orcamento).toMatchObject({ status: "aprovado", servicos: [{ descricao: "Troca de Bateria" }] });
  });

  it("R1-P2: a prazo com identidade — reenvio devolve o original sem nova escrita, mesmo após mudança comercial; conteúdo diferente é conflito", async () => {
    const sid = await novaLoja();
    const osId = await novaOS(sid);
    const chave = gerarOperacaoIdV3();
    const r1 = await lancarOSAPrazoV3(sid, osId, { vencimento: VENC, operacaoId: chave });
    expect(r1).toMatchObject({ valorFormalizado: 420, aPrazo: { operacaoId: chave, valor: 420, vencimento: VENC } });
    expect(r1.jaRegistrado).toBeUndefined();
    const depois1 = await foto(sid, osId);
    const r2 = await lancarOSAPrazoV3(sid, osId, { vencimento: VENC, operacaoId: chave });
    expect(r2).toMatchObject({ jaRegistrado: true, valorFormalizado: 420, aPrazo: { operacaoId: chave } });
    expect(await foto(sid, osId)).toBe(depois1);
    // O comercial muda depois: a MESMA operação continua devolvendo o original; uma NOVA é recusada.
    const p = await lerPayload(osId);
    await prisma.ordemServico.update({
      where: { id: osId },
      data: { payload: { ...p, orcamento: { ...(p.orcamento as Payload), status: "rascunho" } } as unknown as Prisma.InputJsonValue },
    });
    const depoisMudanca = await foto(sid, osId);
    expect(await lancarOSAPrazoV3(sid, osId, { vencimento: VENC, operacaoId: chave })).toMatchObject({ jaRegistrado: true, valorFormalizado: 420 });
    await expect(lancarOSAPrazoV3(sid, osId, { vencimento: VENC, operacaoId: gerarOperacaoIdV3() })).rejects.toMatchObject({ codigo: "APROVACAO_COMERCIAL_PENDENTE", destino: "comercial" });
    await expect(lancarOSAPrazoV3(sid, osId, { vencimento: "2099-11-30", operacaoId: chave })).rejects.toThrow(/já foi registrada com outros dados/);
    expect(await foto(sid, osId)).toBe(depoisMudanca);
    const eventos = ((await lerPayload(osId)).timeline as Array<{ tipo: string; metadata?: Payload }>).filter((e) => e.tipo === "financeiro_conta_receber_criada" && e.metadata?.modo === "a_prazo");
    expect(eventos).toHaveLength(1);

    // R2-P2: o período financeiro fecha depois — o reenvio da MESMA operação ainda devolve o original;
    // só um lançamento NOVO é barrado pelo fechamento.
    const hoje = new Date().toISOString().slice(0, 10);
    const [ano, mes] = hoje.split("-").map(Number);
    await prisma.fechamentoFinanceiro.create({ data: { storeId: sid, tipo: "mensal", dataReferencia: `${hoje.slice(0, 7)}-01`, mes: mes!, ano: ano!, status: "fechado" } });
    expect(await lancarOSAPrazoV3(sid, osId, { vencimento: VENC, operacaoId: chave })).toMatchObject({ jaRegistrado: true, valorFormalizado: 420 });
    await expect(lancarOSAPrazoV3(sid, osId, { vencimento: VENC, operacaoId: gerarOperacaoIdV3() })).rejects.toThrow(/Período financeiro fechado/);
    expect(await foto(sid, osId)).toBe(depoisMudanca);
  });

  it("R1-P2: recusa comercial do misto guarda código e destino; o reenvio da MESMA chave devolve a mesma recusa estruturada", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const osId = await novaOS(sid, { orcamento: "aprovado", coluna: 400 });
    const entrada = { operacaoId: gerarOperacaoIdV3(), sessaoId: caixa, pagamentosAgora: [{ forma: "debito" as const, valor: 100 }], saldoAPrazo: { valor: 320, vencimento: VENC }, saldoEsperado: 420 };
    const r1 = await registrarRecebimentoMistoOSV3(sid, osId, entrada);
    expect(r1).toMatchObject({ ok: false, code: "comercial_nao_elegivel", comercial: { codigo: "VALORES_DIVERGENTES", destino: "financeiro" } });
    const r2 = await registrarRecebimentoMistoOSV3(sid, osId, entrada);
    expect(r2).toEqual(r1);
  });

  it("resposta perdida depois do pagamento: a mesma chave devolve o original, sem 2ª baixa, título ou caixa", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const osId = await novaOS(sid);
    const chave = gerarOperacaoIdV3();
    const original = await receberOSV3(sid, osId, { linhas: [{ forma: "debito", valor: 150 }], sessaoId: caixa, operacaoId: chave, saldoEsperado: 420 });
    const antes = await foto(sid, osId);
    const replay = await receberOSV3(sid, osId, { linhas: [{ forma: "debito", valor: 150 }], sessaoId: caixa, operacaoId: chave });
    expect(replay).toMatchObject({ jaRegistrado: true, valorRecebido: 150, op: original.op });
    expect(await foto(sid, osId)).toBe(antes);
    await expect(receberOSV3(sid, osId, { linhas: [{ forma: "debito", valor: 160 }], sessaoId: caixa, operacaoId: chave })).rejects.toThrow(/outros valores/);
    expect(await foto(sid, osId)).toBe(antes);
  });

  it("operação antiga reenviada DEPOIS de o comercial mudar: replay devolve o gravado; operação nova é recusada", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const osId = await novaOS(sid);
    const simples = gerarOperacaoIdV3();
    await receberOSV3(sid, osId, { linhas: [{ forma: "pix", valor: 100 }], sessaoId: caixa, operacaoId: simples });
    const misto = { operacaoId: gerarOperacaoIdV3(), sessaoId: caixa, pagamentosAgora: [{ forma: "debito" as const, valor: 120 }], saldoAPrazo: { valor: 200, vencimento: VENC }, saldoEsperado: 320 };
    expect(await registrarRecebimentoMistoOSV3(sid, osId, misto)).toMatchObject({ ok: true, jaRegistrado: false });
    // O comercial muda depois (rascunho sobre a OS — o legado que o item B passa a impedir).
    const payload = await lerPayload(osId);
    await prisma.ordemServico.update({ where: { id: osId }, data: { payload: { ...payload, orcamento: { ...payload.orcamento, status: "rascunho" } } as Prisma.InputJsonValue } });
    const antes = await fotoFinanceira(sid, osId);
    expect(await receberOSV3(sid, osId, { linhas: [{ forma: "pix", valor: 100 }], sessaoId: caixa, operacaoId: simples })).toMatchObject({ jaRegistrado: true, valorRecebido: 100 });
    expect(await registrarRecebimentoMistoOSV3(sid, osId, misto)).toMatchObject({ ok: true, jaRegistrado: true });
    expect(await fotoFinanceira(sid, osId)).toBe(antes);
    await expect(receberOSV3(sid, osId, { linhas: [{ forma: "pix", valor: 50 }], sessaoId: caixa, operacaoId: gerarOperacaoIdV3() })).rejects.toMatchObject({ codigo: "APROVACAO_COMERCIAL_PENDENTE" });
    expect(await fotoFinanceira(sid, osId)).toBe(antes);
  });
});

// ─── B3 · formalização administrativa ───────────────────────────────────────────────────────
describe("B3 · formalizar aprovação pendente", () => {
  it("formaliza como ATO ATUAL: aprovado agora, sem tocar preço, título, caixa, coluna, status técnico ou garantia", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const osId = await legadoPagoEmRascunho(sid, caixa, [420]);
    const antes = await efeitos(sid, osId);
    const escopo = await conferir(sid, osId);
    const entrada = entradaFormalizacao(escopo);
    const r = await formalizarAprovacaoPendenteV3(sid, osId, entrada);
    expect(r).toMatchObject({ ok: true, jaRegistrado: false, operacaoId: entrada.operacaoId, formalizadoPor: "Admin QA FRG2" });
    const depois = await efeitos(sid, osId);
    expect(depois.titulos).toEqual(antes.titulos);
    expect(depois.caixa).toEqual(antes.caixa);
    expect(depois.movs).toBe(antes.movs);
    expect(depois.os.valorTotal).toBe(antes.os.valorTotal);
    expect(depois.os.status).toBe(antes.os.status);
    const p = depois.os.payload as Payload;
    const a = antes.os.payload as Payload;
    expect(p.orcamento).toEqual({ ...a.orcamento, status: "aprovado", respondidoEm: expect.any(String), atualizadoEm: expect.any(String) });
    expect(Date.parse(p.orcamento.respondidoEm)).toBeGreaterThan(Date.parse((p.timeline as Payload[]).find((e) => e.metadata?.operacaoId)!.criadoEm) - 1);
    expect(p.operacaoStatusV3).toBe(a.operacaoStatusV3);
    expect(p.aberturaV3).toEqual(a.aberturaV3);
    expect(p.pagamentoV3).toEqual(a.pagamentoV3);
    expect(p.formalizacaoAprovacaoV3).toMatchObject({ natureza: "formalizacao_aprovacao_pendente", atoAtual: true, motivo: entrada.motivo, evidencia: entrada.evidencia, formalizadoPorId: "qa-frg2-admin", orcamentoStatusAnterior: "rascunho" });
    expect(p.orcamentoVersoesV3).toEqual([expect.objectContaining({ status: "aprovado", natureza: "formalizacao_aprovacao_pendente", operacaoId: entrada.operacaoId })]);
    expect((p.timeline as Payload[]).length).toBe((a.timeline as Payload[]).length + 1);
    // A projeção deixa de apontar pendência comercial: título e aprovação conferem.
    const proj = await lerProjecaoFinanceiraOSV4(sid, osId);
    expect(proj).toMatchObject({ financialStatus: "PAID", canDeliver: true });
  });

  it("permissão: técnico (editarOs, não admin) e vendedor (sem editarOs) negados no servidor, nada lido ou gravado", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const osId = await legadoPagoEmRascunho(sid, caixa, [420]);
    const escopo = await conferir(sid, osId);
    const antes = await foto(sid, osId);
    for (const papel of ["TECNICO", "VENDEDOR", "CAIXA"]) {
      sessao.role = papel;
      expect(await conferirFormalizacaoAprovacaoV3(sid, osId)).toMatchObject({ ok: false, code: "sem_permissao" });
      expect(await formalizarAprovacaoPendenteV3(sid, osId, entradaFormalizacao(escopo))).toMatchObject({ ok: false, code: "sem_permissao" });
    }
    expect(await foto(sid, osId)).toBe(antes);
  });

  it("valores divergentes (coluna da OS ≠ orçamento ≠ título): recusa e orienta; nada corrigido", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const osId = await legadoPagoEmRascunho(sid, caixa, [420]);
    await prisma.ordemServico.update({ where: { id: osId }, data: { valorTotal: 400 } });
    const antes = await foto(sid, osId);
    expect(await conferirFormalizacaoAprovacaoV3(sid, osId)).toMatchObject({ ok: false, code: "valores_divergentes" });
    expect(await foto(sid, osId)).toBe(antes);
  });

  it("revisão ou linha mudada depois da conferência: conflito de escopo, nada gravado", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const osId = await legadoPagoEmRascunho(sid, caixa, [420]);
    const escopo = await conferir(sid, osId);
    const payload = await lerPayload(osId);
    await prisma.ordemServico.update({ where: { id: osId }, data: { payload: { ...payload, orcamentoVersoesV3: [{ versao: 1, status: "rascunho", total: 420 }] } as Prisma.InputJsonValue } });
    const antes = await foto(sid, osId);
    expect(await formalizarAprovacaoPendenteV3(sid, osId, entradaFormalizacao(escopo))).toMatchObject({ ok: false, code: "escopo_divergente", naoRegistrada: true });
    expect(await foto(sid, osId)).toBe(antes);
  });

  it("vencido: sem ratificação recusa; com ratificação formaliza sem renovar a validade", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const osId = await legadoPagoEmRascunho(sid, caixa, [420], { orcamento: "enviado", validoAte: VENCIDA });
    const conf = await conferirFormalizacaoAprovacaoV3(sid, osId);
    expect(conf).toMatchObject({ ok: true, vencido: true });
    const escopo = (conf as { escopo: EscopoFormalizacaoV3 }).escopo;
    const antes = await foto(sid, osId);
    expect(await formalizarAprovacaoPendenteV3(sid, osId, entradaFormalizacao(escopo))).toMatchObject({ ok: false, code: "vencido_sem_ratificacao" });
    expect(await foto(sid, osId)).toBe(antes);
    expect(await formalizarAprovacaoPendenteV3(sid, osId, entradaFormalizacao(escopo, { ratificarVencido: true }))).toMatchObject({ ok: true });
    const p = await lerPayload(osId);
    expect(p.orcamento.validoAte).toBe(VENCIDA);
    expect(p.formalizacaoAprovacaoV3).toMatchObject({ vencido: true, vencimentoRatificado: true, orcamentoStatusAnterior: "enviado" });
  });

  it("título de outra OS na chave desta, ou OS de outra loja: recusa verificável, nada gravado", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const osId = await legadoPagoEmRascunho(sid, caixa, [420]);
    const t = (await titulo(sid, osId))!;
    await prisma.contaReceberTitulo.update({ where: { id: t.id }, data: { payload: { ...(t.payload as Payload), ordemServicoId: "outra-os" } as Prisma.InputJsonValue } });
    expect(await conferirFormalizacaoAprovacaoV3(sid, osId)).toMatchObject({ ok: false, code: "titulo_nao_verificavel" });
    const outraLoja = await novaLoja();
    expect(await conferirFormalizacaoAprovacaoV3(outraLoja, osId)).toMatchObject({ ok: false, code: "os_nao_encontrada" });
  });

  it("dupla requisição simultânea da MESMA formalização: um registro, uma versão, um evento; a outra devolve o original", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const osId = await legadoPagoEmRascunho(sid, caixa, [420]);
    const timelineAntes = ((await lerPayload(osId)).timeline as Payload[]).length;
    const entrada = entradaFormalizacao(await conferir(sid, osId));
    const [a, b] = await Promise.all([formalizarAprovacaoPendenteV3(sid, osId, entrada), formalizarAprovacaoPendenteV3(sid, osId, entrada)]);
    expect([a, b].map((r) => r.ok && r.jaRegistrado).sort()).toEqual([false, true]);
    const p = await lerPayload(osId);
    expect(p.orcamentoVersoesV3).toHaveLength(1);
    expect((p.timeline as Payload[]).length).toBe(timelineAntes + 1);
    // Mesma chave, outro conteúdo: conflito explícito.
    expect(await formalizarAprovacaoPendenteV3(sid, osId, { ...entrada, motivo: "Outro motivo, outro conteúdo registrado." })).toMatchObject({ ok: false, code: "idempotencia_conflito" });
  });

  it("concorrência: estorno trava antes; a formalização ESPERA a trava e, revalidando, recusa (escopo mudou)", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const osId = await legadoPagoEmRascunho(sid, caixa, [100, 100]);
    const escopo = await conferir(sid, osId);
    const pausa = armarPausa({ modelo: "contaReceberTitulo", metodos: ["update", "updateMany", "upsert"], quando: (args) => JSON.stringify(args).includes("estorno_pagamento") });
    const pE = estornarRecebimentoOSV3(sid, osId, { sessaoId: caixa, motivo: "QA concorrência" });
    await pausa.naBarreira;
    const pF = formalizarAprovacaoPendenteV3(sid, osId, entradaFormalizacao(escopo));
    expect(await concluiuOuEsperaTrava(pF)).toBe("esperando_trava");
    pausa.liberar();
    const [rE, rF] = await Promise.allSettled([pE, pF]);
    naoEhDeadlock(rE);
    naoEhDeadlock(rF);
    expect(rE).toMatchObject({ status: "fulfilled", value: { estornado: 100 } });
    expect(rF).toMatchObject({ status: "fulfilled", value: { ok: false, code: "escopo_divergente" } });
    const p = await lerPayload(osId);
    expect(p.orcamento.status).toBe("rascunho");
    expect(p.formalizacaoAprovacaoV3).toBeUndefined();
  });

  it("concorrência: formalização trava antes; o recebimento novo ESPERA e decide sobre o orçamento já formalizado", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const osId = await legadoPagoEmRascunho(sid, caixa, [100]);
    const entrada = entradaFormalizacao(await conferir(sid, osId));
    const pausa = armarPausa({ modelo: "ordemServico", metodos: ["update"], quando: (args) => !!args.data?.payload?.formalizacaoAprovacaoV3 });
    const pF = formalizarAprovacaoPendenteV3(sid, osId, entrada);
    await pausa.naBarreira;
    const pR = receberOSV3(sid, osId, { linhas: [{ forma: "pix", valor: 320 }], sessaoId: caixa, operacaoId: gerarOperacaoIdV3(), saldoEsperado: 320 });
    expect(await concluiuOuEsperaTrava(pR)).toBe("esperando_trava");
    pausa.liberar();
    const [rF, rR] = await Promise.allSettled([pF, pR]);
    naoEhDeadlock(rF);
    naoEhDeadlock(rR);
    expect(rF).toMatchObject({ status: "fulfilled", value: { ok: true, jaRegistrado: false } });
    expect(rR).toMatchObject({ status: "fulfilled", value: { jaRegistrado: false, op: "liquidar" } });
    expect(pagamentosDo(await titulo(sid, osId))).toEqual([100, 320]);
    expect((await lerPayload(osId)).orcamentoVersoesV3).toHaveLength(1);
  });
});

// ─── B4 · forma explícita no servidor ───────────────────────────────────────────────────────
describe("B4 · sem forma, nenhuma baixa; lançamento existente intocado", () => {
  it("forma vazia ou ausente é recusada nos dois writers; o pagamento anterior em dinheiro segue igual", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const osId = await novaOS(sid);
    await receberOSV3(sid, osId, { linhas: [{ forma: "dinheiro", valor: 100 }], sessaoId: caixa, operacaoId: gerarOperacaoIdV3() });
    const antes = await fotoFinanceira(sid, osId);
    await expect(receberOSV3(sid, osId, { linhas: [{ forma: "" as never, valor: 100 }], sessaoId: caixa, operacaoId: gerarOperacaoIdV3() })).rejects.toThrow("Escolha a forma de pagamento antes de confirmar.");
    await expect(receberOSV3(sid, osId, { valor: 100, sessaoId: caixa, operacaoId: gerarOperacaoIdV3() })).rejects.toThrow(/forma de pagamento/);
    const misto = await registrarRecebimentoMistoOSV3(sid, osId, {
      operacaoId: gerarOperacaoIdV3(), sessaoId: caixa, pagamentosAgora: [{ forma: "" as never, valor: 100 }],
      saldoAPrazo: { valor: 220, vencimento: VENC }, saldoEsperado: 320,
    });
    expect(misto).toMatchObject({ ok: false, code: "entrada_invalida", mensagem: "Escolha a forma de pagamento de cada valor recebido agora." });
    expect(await fotoFinanceira(sid, osId)).toBe(antes);
    const ops = await prisma.caixaOperacao.findMany({ where: { storeId: sid } });
    expect(ops.map((o) => (o.payload as Payload).formaPagamento)).toEqual(["dinheiro"]);
  });
});

// ─── B5 · rascunho novo sobre OS com pagamento vigente ─────────────────────────────────────
describe("B5 · gerarOrcamentoDaOS não materializa rascunho sobre OS paga", () => {
  it("OS sem orçamento real, paga pelo preço da coluna: recusa e orienta; nada alterado", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const osId = await novaOS(sid, { orcamento: null, total: 300 });
    await receberOSV3(sid, osId, { linhas: [{ forma: "pix", valor: 100 }], sessaoId: caixa, operacaoId: gerarOperacaoIdV3() });
    const antes = await foto(sid, osId);
    await expect(gerarOrcamentoDaOS(sid, osId)).rejects.toThrow(/já tem pagamento registrado[\s\S]*Formalizar aprovação pendente/);
    expect(await foto(sid, osId)).toBe(antes);
  });

  it("sem pagamento (ou estornado por inteiro) materializa normalmente", async () => {
    const sid = await novaLoja();
    const osId = await novaOS(sid, { orcamento: null, total: 300 });
    const os = await gerarOrcamentoDaOS(sid, osId);
    expect(os.orcamento).toMatchObject({ status: "rascunho" });
  });

  it("concorrência: recebimento trava antes; a materialização ESPERA e recusa (pagamento já vigente)", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const osId = await novaOS(sid, { orcamento: null, total: 300 });
    const pausa = armarPausa({ modelo: "caixaOperacao", metodos: ["create"], quando: (args) => args.data?.payload?.ordemServicoId === osId });
    const pR = receberOSV3(sid, osId, { linhas: [{ forma: "pix", valor: 300 }], sessaoId: caixa, operacaoId: gerarOperacaoIdV3() });
    await pausa.naBarreira;
    const pG = gerarOrcamentoDaOS(sid, osId);
    expect(await concluiuOuEsperaTrava(pG)).toBe("esperando_trava");
    pausa.liberar();
    const [rR, rG] = await Promise.allSettled([pR, pG]);
    naoEhDeadlock(rR);
    naoEhDeadlock(rG);
    expect(rR).toMatchObject({ status: "fulfilled" });
    expect(rG.status).toBe("rejected");
    expect(String((rG as PromiseRejectedResult).reason?.message)).toMatch(/já tem pagamento registrado/);
    expect((await lerPayload(osId)).orcamento).toBeUndefined();
  });

  it("concorrência: materialização trava antes; o recebimento ESPERA e é recusado (orçamento agora em rascunho)", async () => {
    const sid = await novaLoja();
    const caixa = await abrirCaixa(sid);
    const osId = await novaOS(sid, { orcamento: null, total: 300 });
    const pausa = armarPausa({ modelo: "ordemServico", metodos: ["update"], quando: (args) => args.data?.payload?.orcamento?.status === "rascunho" });
    const pG = gerarOrcamentoDaOS(sid, osId);
    await pausa.naBarreira;
    const pR = receberOSV3(sid, osId, { linhas: [{ forma: "pix", valor: 300 }], sessaoId: caixa, operacaoId: gerarOperacaoIdV3() });
    expect(await concluiuOuEsperaTrava(pR)).toBe("esperando_trava");
    pausa.liberar();
    const [rG, rR] = await Promise.allSettled([pG, pR]);
    naoEhDeadlock(rG);
    naoEhDeadlock(rR);
    expect(rG).toMatchObject({ status: "fulfilled" });
    expect(rR).toMatchObject({ status: "rejected", reason: expect.objectContaining({ codigo: "APROVACAO_COMERCIAL_PENDENTE" }) });
    expect(await titulo(sid, osId)).toBeNull();
    expect(await prisma.caixaOperacao.count({ where: { storeId: sid } })).toBe(0);
  });
});

describe("R7 · P1: resposta perdida não permite nova confirmação entre operadores", () => {
  it("imediato incerto seguido de misto: uma baixa, um título, uma movimentação e nenhuma parcela duplicada", async () => {
    const sid = await novaLoja();
    const id = await novaOS(sid);
    const caixa = await abrirCaixa(sid);
    // A resposta deste commit se perde: outro operador não recebeu prova nem reconheceu o resultado.
    const original = { operacaoId: gerarOperacaoIdV3(), sessaoId: caixa, linhas: [{ forma: "pix" as const, valor: 100 }], saldoEsperado: 420, confirmacaoClienteV3: true as const };
    await receberOSV3(sid, id, original);
    const antes = await fotoFinanceira(sid, id);
    await registrarRecebimentoMistoOSV3(sid, id, {
      operacaoId: gerarOperacaoIdV3(), sessaoId: caixa, pagamentosAgora: [{ forma: "dinheiro", valor: 100 }],
      saldoAPrazo: { valor: 220, vencimento: VENC }, saldoEsperado: 320,
    });
    expect(await fotoFinanceira(sid, id)).toBe(antes);
    const e = await efeitos(sid, id);
    expect(e.titulos).toHaveLength(1);
    expect(e.caixa).toHaveLength(1);
    expect(e.movs).toBe(1);
    expect((await lerPayload(id)).aPrazoV3).toBeUndefined();
  });
});


describe("R7 · prova autoritativa, replay e serialização real", () => {
  async function cenario() {
    const sid = await novaLoja(), id = await novaOS(sid), caixa = await abrirCaixa(sid);
    return { sid, id, caixa, input: { operacaoId: gerarOperacaoIdV3(), sessaoId: caixa, linhas: [{ forma: "pix" as const, valor: 100 }], saldoEsperado: 420, intencao: "parcial" as const, observacao: "Original QA", confirmacaoClienteV3: true as const } };
  }
  it("replay devolve recibo e operação originais sem segunda baixa; reconhecimento libera recebimento NOVO", async () => {
    const { sid, id, input } = await cenario();
    const a = await receberOSV3(sid, id, input); expect(a.estado).toBe("CONFIRMADO");
    const antes = await fotoFinanceira(sid, id), b = await receberOSV3(sid, id, input);
    expect(b).toMatchObject({ estado: "CONFIRMADO", resultado: { jaRegistrado: true, operacaoId: input.operacaoId } });
    if (a.estado !== "CONFIRMADO" || b.estado !== "CONFIRMADO") throw Error("Sem resultado positivo");
    expect(b.resultado.recibo).toEqual(a.resultado.recibo); expect(await fotoFinanceira(sid, id)).toBe(antes);
    expect((await lerPagamentoOSV3(sid, id)).pendenciaConfirmacao?.operacaoId).toBe(input.operacaoId);
    expect((await lerPagamentoOSV3(sid, id, b.prova)).pendenciaConfirmacao).toBeNull();
    const nova = await receberOSV3(sid, id, { ...input, operacaoId: gerarOperacaoIdV3(), saldoEsperado: 320, linhas: [{ forma: "pix", valor: 50 }] });
    expect(nova.estado).toBe("CONFIRMADO"); expect(pagamentosDo(await titulo(sid, id))).toEqual([100, 50]);
    const e = await efeitos(sid, id); expect(e.titulos).toHaveLength(1); expect(e.caixa).toHaveLength(2); expect(e.movs).toBe(2);
    expect(await prisma.ordemServico.count({ where: { storeId: sid } })).toBe(1);
  });
  it.each(["forma", "valor", "sessão", "saldo", "observação"])("mesma operacaoId com %s diferente: conflito, nenhuma mutação financeira", async (campo) => {
    const { sid, id, caixa, input } = await cenario(); await receberOSV3(sid, id, input);
    const antes = await fotoFinanceira(sid, id);
    const alteracao = campo === "forma" ? { linhas: [{ forma: "dinheiro" as const, valor: 100 }] } : campo === "valor" ? { linhas: [{ forma: "pix" as const, valor: 50 }] } : campo === "sessão" ? { sessaoId: caixa + "-outra" } : campo === "saldo" ? { saldoEsperado: 320 } : { observacao: "Outro conteúdo" };
    expect(await receberOSV3(sid, id, { ...input, ...alteracao })).toMatchObject({ estado: "INCERTO" });
    expect(await fotoFinanceira(sid, id)).toBe(antes);
  });
  it("permissão negada antes do replay mantém fence; permissão restaurada recupera a MESMA operação", async () => {
    const { sid, id, input } = await cenario(); await receberOSV3(sid, id, input);
    const antes = await fotoFinanceira(sid, id);
    sessao.role = "VENDEDOR";
    expect(await receberOSV3(sid, id, input)).toMatchObject({ estado: "INCERTO" });
    const leitura = await lerPagamentoOSV3(sid, id);
    expect(leitura).toMatchObject({ pendenciaConfirmacao: null, confirmacaoBloqueada: true });
    expect(await fotoFinanceira(sid, id)).toBe(antes);
    sessao.role = "ADMIN";
    expect(await receberOSV3(sid, id, input)).toMatchObject({ estado: "CONFIRMADO", resultado: { jaRegistrado: true } });
    expect(await fotoFinanceira(sid, id)).toBe(antes);
  });
  it("prova de outra chave, outro fingerprint ou outra loja nunca reconhece a pendência original", async () => {
    const { sid, id, input } = await cenario(); const r = await receberOSV3(sid, id, input);
    if (r.estado !== "CONFIRMADO") throw Error("Sem confirmação");
    const antes = await foto(sid, id);
    await expect(lerPagamentoOSV3(sid, id, { ...r.prova, operacaoId: gerarOperacaoIdV3() })).rejects.toThrow(/prova/);
    await expect(lerPagamentoOSV3(sid, id, { ...r.prova, requestFingerprint: "outro-hash" })).rejects.toThrow(/prova/);
    const outra = await novaLoja();
    await expect(lerPagamentoOSV3(outra, id, r.prova)).rejects.toThrow();
    expect(await foto(sid, id)).toBe(antes);
  });
  it("caixa fechado depois do commit não bloqueia replay nem reconhecimento legítimo", async () => {
    const { sid, id, caixa, input } = await cenario(); await receberOSV3(sid, id, input);
    await prisma.sessaoCaixa.update({ where: { id: caixa }, data: { status: "FECHADA" } });
    const antes = await fotoFinanceira(sid, id), r = await receberOSV3(sid, id, input);
    expect(r).toMatchObject({ estado: "CONFIRMADO", resultado: { jaRegistrado: true } });
    if (r.estado !== "CONFIRMADO") throw Error("Sem confirmação");
    expect((await lerPagamentoOSV3(sid, id, r.prova)).pendenciaConfirmacao).toBeNull();
    expect(await fotoFinanceira(sid, id)).toBe(antes);
  });
  it("terminal negativo é durável: caixa reaberto não permite à requisição atrasada gravar depois", async () => {
    const { sid, id, caixa, input } = await cenario();
    await prisma.sessaoCaixa.update({ where: { id: caixa }, data: { status: "FECHADA" } });
    const a = await receberOSV3(sid, id, input);
    expect(a).toMatchObject({ estado: "RECUSADO_DEFINITIVAMENTE", operacaoId: input.operacaoId });
    await prisma.sessaoCaixa.update({ where: { id: caixa }, data: { status: "ABERTA" } });
    const antes = await fotoFinanceira(sid, id);
    expect(await receberOSV3(sid, id, input)).toEqual(a);
    expect(await fotoFinanceira(sid, id)).toBe(antes); expect(await titulo(sid, id)).toBeNull();
    const nova = await receberOSV3(sid, id, { ...input, operacaoId: gerarOperacaoIdV3() });
    expect(nova.estado).toBe("CONFIRMADO"); expect(pagamentosDo(await titulo(sid, id))).toEqual([100]);
  });
  it("segunda chave durante transação ainda em processamento ESPERA o lock e recusa após commit", async () => {
    const { sid, id, caixa, input } = await cenario();
    const pausa = armarPausa({ modelo: "caixaOperacao", metodos: ["create"], quando: (args) => args.data?.payload?.ordemServicoId === id });
    const a = receberOSV3(sid, id, input); await pausa.naBarreira;
    const b = registrarRecebimentoMistoOSV3(sid, id, { operacaoId: gerarOperacaoIdV3(), sessaoId: caixa, pagamentosAgora: [{ forma: "dinheiro", valor: 100 }], saldoAPrazo: { valor: 220, vencimento: VENC }, saldoEsperado: 320, confirmacaoClienteV3: true });
    try { expect(await concluiuOuEsperaTrava(b)).toBe("esperando_trava"); } finally { pausa.liberar(); }
    const [ra, rb] = await Promise.all([a, b]); expect(ra.estado).toBe("CONFIRMADO");
    expect(rb).toMatchObject({ ok: false, code: "confirmacao_pendente", pendencia: { tipo: "imediato", operacaoId: input.operacaoId } });
    const e = await efeitos(sid, id); expect(e.titulos).toHaveLength(1); expect(e.caixa).toHaveLength(1); expect(e.movs).toBe(1);
    expect(pagamentosDo(await titulo(sid, id))).toEqual([100]); expect((await lerPayload(id)).aPrazoV3).toBeUndefined();
  });
  it("dois operadores reenviam a MESMA operação em voo: só uma baixa e recibos idênticos", async () => {
    const { sid, id, input } = await cenario();
    const pausa = armarPausa({ modelo: "caixaOperacao", metodos: ["create"], quando: (args) => args.data?.payload?.ordemServicoId === id });
    const a = receberOSV3(sid, id, input); await pausa.naBarreira; const b = receberOSV3(sid, id, input);
    try { expect(await concluiuOuEsperaTrava(b)).toBe("esperando_trava"); } finally { pausa.liberar(); }
    const [ra, rb] = await Promise.all([a, b]);
    if (ra.estado !== "CONFIRMADO" || rb.estado !== "CONFIRMADO") throw Error("Sem confirmação");
    expect([ra.resultado.jaRegistrado, rb.resultado.jaRegistrado]).toEqual([false, true]); expect(ra.resultado.recibo).toEqual(rb.resultado.recibo);
    const e = await efeitos(sid, id); expect(e.titulos).toHaveLength(1); expect(e.caixa).toHaveLength(1); expect(e.movs).toBe(1);
  });
  it("misto Pix + Dinheiro + a prazo bloqueia imediato e outro misto até reconhecer; split e prazo permanecem originais", async () => {
    const { sid, id, caixa } = await cenario();
    const input = { operacaoId: gerarOperacaoIdV3(), sessaoId: caixa, pagamentosAgora: [{ forma: "pix" as const, valor: 100 }, { forma: "dinheiro" as const, valor: 70 }], saldoAPrazo: { valor: 250, vencimento: VENC, observacao: "Prazo QA" }, saldoEsperado: 420, confirmacaoClienteV3: true as const };
    const a = await registrarRecebimentoMistoOSV3(sid, id, input); expect(a.ok).toBe(true);
    const antes = await fotoFinanceira(sid, id);
    expect(await receberOSV3(sid, id, { operacaoId: gerarOperacaoIdV3(), sessaoId: caixa, linhas: [{ forma: "pix", valor: 50 }], saldoEsperado: 250, confirmacaoClienteV3: true })).toMatchObject({ estado: "INCERTO", pendencia: { tipo: "misto", operacaoId: input.operacaoId } });
    expect(await registrarRecebimentoMistoOSV3(sid, id, { ...input, operacaoId: gerarOperacaoIdV3(), pagamentosAgora: [{ forma: "pix", valor: 50 }], saldoAPrazo: { valor: 200, vencimento: VENC }, saldoEsperado: 250 })).toMatchObject({ ok: false, code: "confirmacao_pendente" });
    await expect(lancarOSAPrazoV3(sid, id, { vencimento: VENC })).rejects.toThrow(/Confirmação pendente/);
    await expect(estornarRecebimentoOSV3(sid, id, { sessaoId: caixa })).rejects.toThrow(/Confirmação pendente/);
    expect(await fotoFinanceira(sid, id)).toBe(antes);
    const replay = await registrarRecebimentoMistoOSV3(sid, id, input); expect(replay).toMatchObject({ ok: true, jaRegistrado: true });
    if (!a.ok || !replay.ok || !replay.prova) throw Error("Sem prova mista"); expect(replay.recibo).toEqual(a.recibo);
    expect((await lerPagamentoOSV3(sid, id, replay.prova)).pendenciaConfirmacao).toBeNull();
    const e = await efeitos(sid, id); expect(e.titulos).toHaveLength(1); expect(e.caixa).toHaveLength(2); expect(e.movs).toBe(1);
    expect(e.caixa.map((c) => [c.valor, (c.payload as Payload).formaPagamento]).sort()).toEqual([[100, "pix"], [70, "dinheiro"]].sort());
    expect(pagamentosDo(await titulo(sid, id))).toEqual([170]);
    expect((await lerPayload(id)).aPrazoV3).toMatchObject({ valor: 250, vencimento: VENC });
  });
  it("estorno posterior não transforma replay antigo em nova cobrança; nova identidade continua distinguível", async () => {
    const { sid, id, caixa, input } = await cenario(), a = await receberOSV3(sid, id, input);
    if (a.estado !== "CONFIRMADO") throw Error("Sem confirmação");
    await lerPagamentoOSV3(sid, id, a.prova); await estornarRecebimentoOSV3(sid, id, { sessaoId: caixa, motivo: "QA estorno" });
    const antes = await fotoFinanceira(sid, id), replay = await receberOSV3(sid, id, input);
    expect(replay).toMatchObject({ estado: "CONFIRMADO", resultado: { jaRegistrado: true } }); expect(await fotoFinanceira(sid, id)).toBe(antes);
    expect(await receberOSV3(sid, id, { ...input, operacaoId: gerarOperacaoIdV3() })).toMatchObject({ estado: "CONFIRMADO", resultado: { jaRegistrado: false } });
    expect(pagamentosDo(await titulo(sid, id))).toEqual([100, 100]);
    expect((await lerPagamentoOSV3(sid, id)).recebido).toBe(100);
  });
  it("metadado autoritativo malformado bloqueia em vez de assumir ausência", async () => {
    const { sid, id, input } = await cenario(), p = await lerPayload(id);
    await prisma.ordemServico.update({ where: { id }, data: { payload: { ...p, confirmacaoRecebimentoPendenteV3: { versao: 99 } } as Prisma.InputJsonValue } });
    const antes = await fotoFinanceira(sid, id);
    expect(await receberOSV3(sid, id, input)).toMatchObject({ estado: "INCERTO" });
    expect((await lerPagamentoOSV3(sid, id)).confirmacaoBloqueada).toBe(true); expect(await fotoFinanceira(sid, id)).toBe(antes);
  });
});


it("R7 · opt-in malformado não libera chave já gravada; modernidade não inventa operacaoId", async () => {
 const sid = await novaLoja(), id = await novaOS(sid), caixa = await abrirCaixa(sid);
 expect(await receberOSV3(sid, id, { sessaoId: caixa, linhas: [{ forma: "pix", valor: 100 }], confirmacaoClienteV3: true })).toMatchObject({ estado: "INCERTO" });
 expect(await titulo(sid, id)).toBeNull();
 const input = { operacaoId: gerarOperacaoIdV3(), sessaoId: caixa, pagamentosAgora: [{ forma: "pix" as const, valor: 100 }], saldoAPrazo: { valor: 320, vencimento: VENC }, saldoEsperado: 420, confirmacaoClienteV3: true as const };
 expect(await registrarRecebimentoMistoOSV3(sid, id, input)).toMatchObject({ ok: true });
 const antes = await fotoFinanceira(sid, id);
 const falha = await registrarRecebimentoMistoOSV3(sid, id, { ...input, saldoAPrazo: { valor: 320, vencimento: "" } });
 expect(falha).toMatchObject({ ok: false, code: "entrada_invalida" }); expect(falha).not.toHaveProperty("naoRegistrada");
 expect((await lerPagamentoOSV3(sid, id)).pendenciaConfirmacao?.operacaoId).toBe(input.operacaoId);
 expect(await fotoFinanceira(sid, id)).toBe(antes);
});


it.each(["imediato", "misto"] as const)("R7 · recusa terminal %s não permite reutilizar a chave em OUTRA modalidade", async (tipo) => {
 const sid = await novaLoja(), id = await novaOS(sid), caixa = await abrirCaixa(sid), operacaoId = gerarOperacaoIdV3();
 await prisma.sessaoCaixa.update({ where: { id: caixa }, data: { status: "FECHADA" } });
 const imediato = { operacaoId, sessaoId: caixa, linhas: [{ forma: "pix" as const, valor: 100 }], saldoEsperado: 420, confirmacaoClienteV3: true as const };
 const misto = { operacaoId, sessaoId: caixa, pagamentosAgora: [{ forma: "pix" as const, valor: 100 }], saldoAPrazo: { valor: 320, vencimento: VENC }, saldoEsperado: 420, confirmacaoClienteV3: true as const };
 if (tipo === "imediato") expect(await receberOSV3(sid, id, imediato)).toMatchObject({ estado: "RECUSADO_DEFINITIVAMENTE" });
 else expect(await registrarRecebimentoMistoOSV3(sid, id, misto)).toMatchObject({ ok: false, naoRegistrada: true });
 await prisma.sessaoCaixa.update({ where: { id: caixa }, data: { status: "ABERTA" } });
 const antes = await fotoFinanceira(sid, id);
 if (tipo === "imediato") await expect(registrarRecebimentoMistoOSV3(sid, id, misto)).rejects.toThrow(/outro conteúdo/);
 else expect(await receberOSV3(sid, id, imediato)).toMatchObject({ estado: "INCERTO" });
 expect(await fotoFinanceira(sid, id)).toBe(antes); expect(await titulo(sid, id)).toBeNull();
});

it("R7 · nova pendência não impede recuperar a recusa terminal anterior", async () => {
 const sid = await novaLoja(), id = await novaOS(sid), caixa = await abrirCaixa(sid);
 const input = { operacaoId: gerarOperacaoIdV3(), sessaoId: caixa, linhas: [{ forma: "pix" as const, valor: 100 }], saldoEsperado: 420, confirmacaoClienteV3: true as const };
 await prisma.sessaoCaixa.update({ where: { id: caixa }, data: { status: "FECHADA" } });
 const recusa = await receberOSV3(sid, id, input);
 await prisma.sessaoCaixa.update({ where: { id: caixa }, data: { status: "ABERTA" } });
 expect(await receberOSV3(sid, id, { ...input, operacaoId: gerarOperacaoIdV3() })).toMatchObject({ estado: "CONFIRMADO" });
 const antes = await fotoFinanceira(sid, id); expect(await receberOSV3(sid, id, input)).toEqual(recusa); expect(await fotoFinanceira(sid, id)).toBe(antes);
});
