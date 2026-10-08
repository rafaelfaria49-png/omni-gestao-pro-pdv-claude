// @vitest-environment node
//
// OPS-V4-FLUXO-CURTO-006 — PostgreSQL REAL, local e descartável (T43–T52 + S13/S14/
// S17–S19 + concorrência A–D). Actions REAIS da V3 (receberOSV3,
// registrarRecebimentoMistoOSV3, lancarOSAPrazoV3, estornarRecebimentoOSV3,
// registrarEntregaV3, salvarAssinaturaRetiradaV3), reader REAL da projeção e
// derivações puras da V4 sobre o READ-BACK. Identidade só no seam de sessão
// (stub de @/auth + gate ok). Intercalação DETERMINÍSTICA: o cliente Prisma é
// envolvido só para PAUSAR uma gravação escolhida da OS numa barreira; a espera
// da outra operação é observada no banco (pg_stat_activity), nunca por sleep.
// Ausência de ambiente = BLOQUEIO_EXPLICITO_PG (nunca skip). Massa sintética.
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "qa-006", name: "Operador QA 006", role: "ADMIN", storeAccess: "all" } })) }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: vi.fn(async () => ({ ok: true })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const intercept = vi.hoisted(() => ({
  pausa: null as null | { quando: (args: unknown) => boolean; chegou: () => void; barreira: Promise<void> },
}));
vi.mock("@/lib/prisma", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/prisma")>();
  const envolverDelegate = (delegate: object) =>
    new Proxy(delegate, {
      get(t, p) {
        const fn = Reflect.get(t, p);
        if (p === "update" && typeof fn === "function") {
          return async (args: unknown) => {
            const pausa = intercept.pausa;
            if (pausa && pausa.quando(args)) {
              intercept.pausa = null;
              pausa.chegou();
              await pausa.barreira;
            }
            return (fn as (a: unknown) => unknown).call(t, args);
          };
        }
        return typeof fn === "function" ? (fn as (...a: unknown[]) => unknown).bind(t) : fn;
      },
    });
  const envolverCliente = (client: object): object =>
    new Proxy(client, {
      get(t, p) {
        const v = Reflect.get(t, p);
        if (p === "ordemServico" && v && typeof v === "object") return envolverDelegate(v);
        if (p === "$transaction" && typeof v === "function") {
          return (arg: unknown, opts?: unknown) =>
            typeof arg === "function"
              ? (v as (...a: unknown[]) => unknown).call(t, (tx: object) => (arg as (tx: object) => unknown)(envolverCliente(tx)), opts)
              : (v as (...a: unknown[]) => unknown).call(t, arg, opts);
        }
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
      },
    });
  return { ...real, prisma: envolverCliente(real.prisma) as typeof real.prisma };
});

import type { Prisma } from "@/generated/prisma";
import type { OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import {
  estornarRecebimentoOSV3,
  lancarOSAPrazoV3,
  receberOSV3,
  registrarRecebimentoMistoOSV3,
} from "@/lib/operacoes-v3/pdv-servico-actions";
import { registrarEntregaV3, salvarAssinaturaRetiradaV3 } from "@/lib/operacoes-v3/entrega-actions";
import { lerGarantiaV3 } from "@/lib/operacoes-v3/pos-venda-model";
import { computeTotaisV3 } from "@/lib/operacoes-v3/orcamento-model";
import { gerarOperacaoIdV3, hojeLojaV3 } from "@/lib/operacoes-v3/recebimento-misto-model";
import { lerProjecaoFinanceiraOSV4 } from "@/lib/operacoes-v4/financial-projection-actions";
import { derivarRetiradaFinanceiraV4 } from "@/lib/operacoes-v4/retirada-fluxo-v4";
import { lerReciboDaProjecaoV4 } from "@/lib/operacoes-v4/recibo-persistido-v4";
import { registrarPagamentoParcial } from "@/lib/financeiro/services/contas-receber-service";
import type { ComprovanteReciboV3 } from "@/lib/operacoes-v3/payment-model";
import { derivarProximaAcaoV4 } from "@/lib/operacoes-v4/proxima-acao-v4";

function exigirBancoLocal(): void {
  const urls = [process.env.OPS_V4_FLUXO_CURTO_TEST_DATABASE_URL, process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => (v ?? "").trim());
  if (urls.some((v) => !v)) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: configure OPS_V4_FLUXO_CURTO_TEST_DATABASE_URL + DATABASE_URL + DIRECT_URL para o PostgreSQL local descartável.");
  }
  const alvos = urls.map((v) => new URL(v));
  if (alvos.some((u) => !["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname.toLowerCase()))) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: integração só pode usar loopback.");
  }
  const chave = (u: URL) => `${u.hostname}:${u.port}${u.pathname}`;
  if (alvos.some((u) => chave(u) !== chave(alvos[0]!)) || !alvos[0]!.pathname.slice(1).startsWith("ops_v4_fluxo_006_qa")) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: as três URLs devem apontar ao MESMO banco descartável ops_v4_fluxo_006_qa*.");
  }
}
exigirBancoLocal();

// ─── massa sintética ─────────────────────────────────────────────────────────
const SUFIXO = Date.now().toString(36);
const INICIO = new Date();
const ENTRADA = "2026-09-01T12:00:00.000Z";
const VENC = (() => {
  const [a, m, d] = hojeLojaV3().split("-").map(Number);
  return new Date(Date.UTC(a!, m!, d!)).toISOString().slice(0, 10);
})();
let seq = 0;
type Payload = Record<string, any>;

afterAll(async () => {
  intercept.pausa = null;
  await prisma.$disconnect();
});

async function novaLoja(): Promise<string> {
  const id = `qa-006-${SUFIXO}-${++seq}`;
  await prisma.store.create({ data: { id, name: `Loja QA 006 ${seq}` } });
  return id;
}

async function novaOS(storeId: string, opts: { status?: string; total?: number; pecas?: unknown[]; extra?: Record<string, unknown> } = {}): Promise<string> {
  const n = ++seq;
  const total = opts.total ?? 300;
  const status = opts.status ?? "pronta";
  const id = `os-qa-006-${SUFIXO}-${n}`;
  const codigo = `OS-QA-006-${n}`;
  await prisma.ordemServico.create({
    data: {
      id,
      storeId,
      numero: codigo,
      equipamento: "Samsung Galaxy QA",
      defeito: "Tela quebrada",
      status: status === "pronta" ? "Pronto" : status === "entregue" ? "Entregue" : "EmAnalise",
      valorTotal: total,
      payload: {
        id, codigo, storeId, criadoEm: ENTRADA,
        cliente: { nome: `Cliente QA 006 ${n}` },
        equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "Galaxy QA", acessorios: ["Capa"] },
        status: status === "recebida" ? "pronta" : status, operacaoStatus: status, operacaoStatusV3: status,
        valorTotal: total,
        orcamento: {
          id: `orc-${n}`, status: "aprovado", sintetizado: false, respondidoEm: ENTRADA, criadoEm: ENTRADA,
          servicos: [{ id: `srv-${n}`, descricao: "Troca de tela", valor: total }], pecas: opts.pecas ?? [], desconto: 0, total,
        },
        aberturaV3: {
          versao: 1,
          recepcao: { recebidoPor: "Balcão QA", dataEntrada: ENTRADA },
          garantiaPrevista: { modelo: "tela", prazoDias: 90 },
          assinaturaCliente: { dataUrl: "data:image/png;base64,ENTRADA", criadoEm: ENTRADA },
        },
        timeline: [{ id: `ev-${n}`, tipo: "criacao", autor: "QA", autorTipo: "usuario", conteudo: "OS criada.", criadoEm: ENTRADA }],
        ...(opts.extra ?? {}),
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return id;
}

async function abrirCaixa(storeId: string): Promise<string> {
  return (await prisma.sessaoCaixa.create({ data: { storeId, operador: "QA", status: "ABERTA" } })).id;
}

async function lerOS(id: string): Promise<Payload> {
  return (await prisma.ordemServico.findUniqueOrThrow({ where: { id } })).payload as Payload;
}

async function efeitos(storeId: string) {
  const [titulos, recebimentosCaixa, estornosCaixa, movimentos, vendas, estoque] = await Promise.all([
    prisma.contaReceberTitulo.findMany({ where: { storeId }, select: { id: true, status: true, valor: true, payload: true } }),
    prisma.caixaOperacao.findMany({ where: { storeId, tipo: "recebimento_cr" }, select: { valor: true, sessaoId: true, at: true, payload: true } }),
    prisma.caixaOperacao.count({ where: { storeId, tipo: "estorno_recebimento_cr" } }),
    prisma.movimentacaoFinanceira.count({ where: { storeId } }),
    prisma.venda.count({ where: { storeId } }),
    prisma.movimentacaoEstoque.count({ where: { storeId } }),
  ]);
  return { titulos, recebimentosCaixa, estornosCaixa, movimentos, vendas, estoque };
}

const entregas = (p: Payload) => (p.timeline as Payload[]).filter((e) => e.tipo === "entrega_cliente");
const receber = (sid: string, id: string, sessaoId: string, linhas: Array<{ forma: "pix" | "dinheiro" | "debito" | "credito"; valor: number }>, extra: Record<string, unknown> = {}) =>
  receberOSV3(sid, id, { linhas, sessaoId, operacaoId: gerarOperacaoIdV3(), ...extra });

/** Comprovante que a V4 ofereceria: regra de produção sobre o READ-BACK (OS + projeção real). */
async function reciboOferecido(sid: string, id: string, sessao: ComprovanteReciboV3 | null = null) {
  const projection = await lerProjecaoFinanceiraOSV4(sid, id);
  return lerReciboDaProjecaoV4({ sessao, os: await lerOS(id), projection });
}

async function retirada(sid: string, id: string) {
  const projection = await lerProjecaoFinanceiraOSV4(sid, id);
  return { projection, retirada: derivarRetiradaFinanceiraV4({ osId: id, projection, loading: false, error: null }) };
}

async function esperarBloqueioNoBanco(timeoutMs = 15_000): Promise<void> {
  const fim = Date.now() + timeoutMs;
  while (Date.now() < fim) {
    const rows = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()
    `;
    if ((rows[0]?.n ?? 0) >= 1) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("a operação concorrente não chegou a esperar a trava");
}

/** Arma a pausa da próxima gravação da OS `osId` cujo payload satisfizer `quando`. */
function armarPausa(osId: string, quando: (payload: Payload) => boolean) {
  let liberar!: () => void;
  const barreira = new Promise<void>((r) => (liberar = r));
  let chegou!: () => void;
  const naBarreira = new Promise<void>((r) => (chegou = r));
  intercept.pausa = {
    quando: (args) => {
      const a = args as { where?: { id?: unknown }; data?: { payload?: unknown } } | null;
      const payload = a?.data?.payload;
      return a?.where?.id === osId && !!payload && typeof payload === "object" && quando(payload as Payload);
    },
    chegou,
    barreira,
  };
  return { naBarreira, liberar };
}

// ─── T43–T52 ─────────────────────────────────────────────────────────────────

describe("OPS-V4-FLUXO-CURTO-006 — PostgreSQL descartável", () => {
  it("T43 título sob demanda: ler não cria título nem venda; o primeiro recebimento cria UMA Conta a Receber", async () => {
    const sid = await novaLoja();
    const id = await novaOS(sid);
    const caixa = await abrirCaixa(sid);
    for (let i = 0; i < 2; i++) {
      const { projection, retirada: r } = await retirada(sid, id);
      expect(projection.financialStatus).toBe("CHARGE_NOT_CREATED");
      expect(r).toMatchObject({ situacao: "nao_formalizada", podeReceber: true, liberaEntrega: false, total: 300 });
    }
    expect((await efeitos(sid)).titulos).toHaveLength(0);
    await expect(registrarEntregaV3(sid, id)).rejects.toThrow();
    await receber(sid, id, caixa, [{ forma: "pix", valor: 100 }]);
    const depois = await efeitos(sid);
    expect(depois.titulos).toHaveLength(1);
    expect(depois.vendas).toBe(0);
    expect((await retirada(sid, id)).projection.financialStatus).toBe("PARTIAL");
  });

  it("T44 parcial 100 + 200: 300/100/200 → 300/300/0; uma Conta a Receber; entrega só disponível, nunca automática", async () => {
    const sid = await novaLoja();
    const id = await novaOS(sid);
    const caixa = await abrirCaixa(sid);
    await receber(sid, id, caixa, [{ forma: "pix", valor: 100 }]);
    let r = await retirada(sid, id);
    expect(r.projection).toMatchObject({ expectedTotal: 300, receivedTotal: 100, balance: 200, financialStatus: "PARTIAL", canDeliver: false });
    await expect(registrarEntregaV3(sid, id)).rejects.toThrow(/saldo pendente/i);
    expect((await lerOS(id)).operacaoStatusV3).toBe("pronta");
    await receber(sid, id, caixa, [{ forma: "dinheiro", valor: 200 }]);
    r = await retirada(sid, id);
    expect(r.projection).toMatchObject({ expectedTotal: 300, receivedTotal: 300, balance: 0, financialStatus: "PAID", canDeliver: true });
    expect(r.retirada.descricao).toBe("Pagamento quitado — confirmar entrega.");
    const e = await efeitos(sid);
    expect(e.titulos).toHaveLength(1);
    expect(e.titulos[0]!.status).toBe("pago");
    expect(e.recebimentosCaixa.map((c) => Number(c.valor)).sort()).toEqual([100, 200]);
    expect(e.recebimentosCaixa.every((c) => c.sessaoId === caixa)).toBe(true);
    expect(e.movimentos).toBe(2);
    expect(e.vendas).toBe(0);
    expect(e.estoque).toBe(0);
    const os = await lerOS(id);
    expect(os.operacaoStatusV3).toBe("pronta");
    expect(entregas(os)).toHaveLength(0);
    // Próxima ação (005) deriva do read-back: quitado → Confirmar entrega (navega, não grava).
    const proxima = derivarProximaAcaoV4({ os: { id, ...os } as unknown as OrdemServico, carga: "estabelecida", orcamento: { materializado: true, status: "aprovado" }, financeiro: { projection: r.projection, loading: false, error: null } });
    expect(proxima).toMatchObject({ titulo: "Confirmar entrega", efeito: "navigate", stage: "entrega" });
  });

  it("T45 split suportado + replay + meio não suportado", async () => {
    const sid = await novaLoja();
    const id = await novaOS(sid);
    const caixa = await abrirCaixa(sid);
    const operacaoId = gerarOperacaoIdV3();
    const input = { linhas: [{ forma: "pix" as const, valor: 120 }, { forma: "debito" as const, valor: 180 }], sessaoId: caixa, operacaoId };
    const primeira = await receberOSV3(sid, id, input);
    expect(primeira.jaRegistrado).toBe(false);
    const replay = await receberOSV3(sid, id, input);
    expect(replay.jaRegistrado).toBe(true);
    const e = await efeitos(sid);
    expect(e.recebimentosCaixa).toHaveLength(2);
    expect(e.recebimentosCaixa.map((c) => (c.payload as Payload).formaPagamento).sort()).toEqual(["debito", "pix"]);
    expect(e.recebimentosCaixa.reduce((s, c) => s + Number(c.valor), 0)).toBe(300);
    expect((await retirada(sid, id)).projection).toMatchObject({ financialStatus: "PAID", receivedTotal: 300 });
    // Um recebimento dividido é UMA baixa no título e UM comprovante: reimprimível.
    expect(await reciboOferecido(sid, id)).toMatchObject({ estado: "disponivel", recibo: { valorPago: 300, recebidoAcumulado: 300 } });
    const outra = await novaOS(sid);
    await expect(receberOSV3(sid, outra, { linhas: [{ forma: "carteira", valor: 300 }], sessaoId: caixa })).rejects.toThrow(/não suportada/);
    expect((await efeitos(sid)).recebimentosCaixa).toHaveLength(2);
  });

  it("T46 recebimento negado (caixa fechado, sessão de outra loja, loja errada, valor/saldo adulterados) — zero efeito, entrega bloqueada", async () => {
    const sid = await novaLoja();
    const outraLoja = await novaLoja();
    const id = await novaOS(sid);
    const fechada = (await prisma.sessaoCaixa.create({ data: { storeId: sid, operador: "QA", status: "FECHADA" } })).id;
    const caixaOutraLoja = await abrirCaixa(outraLoja);
    await expect(receber(sid, id, fechada, [{ forma: "pix", valor: 300 }])).rejects.toThrow(/Caixa fechado/);
    await expect(receber(sid, id, caixaOutraLoja, [{ forma: "pix", valor: 300 }])).rejects.toThrow(/Caixa fechado/);
    const caixa = await abrirCaixa(sid);
    await expect(receber(outraLoja, id, caixaOutraLoja, [{ forma: "pix", valor: 300 }])).rejects.toThrow(/não encontrada/i);
    await expect(receber(sid, id, caixa, [{ forma: "pix", valor: 350 }])).rejects.toThrow();
    await expect(receber(sid, id, caixa, [{ forma: "pix", valor: 100 }], { saldoEsperado: 250 })).rejects.toThrow(/saldo desta OS mudou/);
    for (const loja of [sid, outraLoja]) {
      const e = await efeitos(loja);
      expect(e.recebimentosCaixa).toHaveLength(0);
      expect(e.movimentos).toBe(0);
    }
    const os = await lerOS(id);
    expect((os.timeline as Payload[]).some((ev) => ev.metadata?.comprovante)).toBe(false);
    expect((await reciboOferecido(sid, id)).estado).toBe("sem_recebimento");
    await expect(registrarEntregaV3(sid, id)).rejects.toThrow();
  });

  it("T47 sinal antes de pronta: pagamento verdadeiro, status técnico e custódia preservados, zero entrega", async () => {
    const sid = await novaLoja();
    const id = await novaOS(sid, { status: "em_execucao" });
    const caixa = await abrirCaixa(sid);
    await receber(sid, id, caixa, [{ forma: "pix", valor: 100 }], { intencao: "sinal" });
    const os = await lerOS(id);
    expect(os.operacaoStatusV3).toBe("em_execucao");
    expect(os.entregaV3).toBeUndefined();
    expect(os.retirada).toBeUndefined();
    expect((await retirada(sid, id)).projection).toMatchObject({ financialStatus: "PARTIAL", receivedTotal: 100, balance: 200 });
    await expect(registrarEntregaV3(sid, id)).rejects.toThrow(/Pronta ou Recebida/);
    expect((await efeitos(sid)).estoque).toBe(0);
  });

  it("T48 pagou e a entrega falhou: dinheiro/título/caixa/recibo preservados; retry só da entrega; uma entrega final", async () => {
    const sid = await novaLoja();
    const id = await novaOS(sid);
    const caixa = await abrirCaixa(sid);
    await receber(sid, id, caixa, [{ forma: "pix", valor: 300 }]);
    const antes = await efeitos(sid);
    const futuro = new Date(Date.now() + 3 * 86_400_000).toISOString();
    await expect(registrarEntregaV3(sid, id, { dataEntrega: { iso: futuro } })).rejects.toThrow();
    let os = await lerOS(id);
    expect(os.operacaoStatusV3).toBe("pronta");
    expect(entregas(os)).toHaveLength(0);
    const r = await retirada(sid, id);
    expect(r.projection).toMatchObject({ financialStatus: "PAID", receivedTotal: 300, balance: 0 });
    expect(r.retirada.descricao).toBe("Pagamento quitado — confirmar entrega.");
    expect(await reciboOferecido(sid, id)).toMatchObject({ estado: "disponivel", recibo: { valorPago: 300, recebidoAcumulado: 300 } });
    await registrarEntregaV3(sid, id);
    await registrarEntregaV3(sid, id);
    os = await lerOS(id);
    expect(os.operacaoStatusV3).toBe("entregue");
    expect(entregas(os)).toHaveLength(1);
    const depois = await efeitos(sid);
    expect(depois.recebimentosCaixa).toHaveLength(antes.recebimentosCaixa.length);
    expect(depois.movimentos).toBe(antes.movimentos);
    expect(depois.titulos).toEqual(antes.titulos);
  });

  it("T49 a prazo: 100% a prazo sem caixa → entrega permitida; 350+50 na mesma Conta a Receber; saldo sem autorização bloqueia", async () => {
    const sid = await novaLoja();
    // (B) saldo sem autorização
    const bloqueada = await novaOS(sid);
    await expect(registrarEntregaV3(sid, bloqueada)).rejects.toThrow();
    // (A) 100% a prazo, sem caixa aberto
    const prazo = await novaOS(sid);
    await lancarOSAPrazoV3(sid, prazo, { vencimento: VENC });
    let e = await efeitos(sid);
    expect(e.recebimentosCaixa).toHaveLength(0);
    expect(e.titulos).toHaveLength(1);
    const r = await retirada(sid, prazo);
    expect(r.projection).toMatchObject({ financialStatus: "AUTHORIZED_CREDIT", receivedTotal: 0, balance: 300, canDeliver: true });
    expect(r.retirada.rotulo).toBe("Entrega autorizada a prazo");
    expect(r.retirada.descricao).toMatch(/^Não quitada/);
    await registrarEntregaV3(sid, prazo);
    expect((await lerOS(prazo)).operacaoStatusV3).toBe("entregue");
    expect((await efeitos(sid)).recebimentosCaixa).toHaveLength(0);
    // 350 imediato + 50 a prazo em OS de 400
    const misto = await novaOS(sid, { total: 400 });
    const caixa = await abrirCaixa(sid);
    const res = await registrarRecebimentoMistoOSV3(sid, misto, {
      operacaoId: gerarOperacaoIdV3(), sessaoId: caixa, saldoEsperado: 400,
      pagamentosAgora: [{ forma: "debito", valor: 350 }], saldoAPrazo: { valor: 50, vencimento: VENC },
    });
    expect(res.ok).toBe(true);
    e = await efeitos(sid);
    const doMisto = e.recebimentosCaixa.filter((c) => (c.payload as Payload).ordemServicoId === misto);
    expect(doMisto.map((c) => Number(c.valor))).toEqual([350]);
    expect(e.titulos.filter((t) => (t.payload as Payload).ordemServicoId === misto)).toHaveLength(1);
    const rm = await retirada(sid, misto);
    expect(rm.projection).toMatchObject({ financialStatus: "AUTHORIZED_CREDIT", receivedTotal: 350, balance: 50, canDeliver: true });
    expect(rm.retirada.situacao).toBe("a_prazo");
    // O comprovante do misto (parte imediata) segue reimprimível pelo read-back.
    expect(await reciboOferecido(sid, misto)).toMatchObject({ estado: "disponivel", recibo: { valorPago: 350, recebidoAcumulado: 350 } });
  });

  it("S17 a prazo parcial depois de um sinal: recebido preservado, título parcial, entrega autorizada", async () => {
    const sid = await novaLoja();
    const id = await novaOS(sid);
    const caixa = await abrirCaixa(sid);
    await receber(sid, id, caixa, [{ forma: "pix", valor: 100 }], { intencao: "sinal" });
    await lancarOSAPrazoV3(sid, id, { vencimento: VENC });
    const e = await efeitos(sid);
    expect(e.titulos).toHaveLength(1);
    expect(e.titulos[0]!.status).toBe("parcial");
    expect((await retirada(sid, id)).projection).toMatchObject({ financialStatus: "AUTHORIZED_CREDIT", receivedTotal: 100, balance: 200, canDeliver: true });
  });

  it("T50 peça incluída (custo 92) em serviço de 300: total não dobra, custo não duplica, estoque baixa 1 uma vez", async () => {
    const sid = await novaLoja();
    const produto = await prisma.produto.create({ data: { storeId: sid, name: `Tela QA 006 ${SUFIXO}`, price: 150, stock: 5 } });
    const peca = { id: `peca-${SUFIXO}`, nome: "Tela QA 006", quantidade: 1, valorUnitario: 0, custoUnitario: 92, kindV3: "interno", produtoId: produto.id };
    const id = await novaOS(sid, { pecas: [peca] });
    const os0 = await lerOS(id);
    expect(computeTotaisV3(os0.orcamento)).toMatchObject({ total: 300, custo: 92 });
    expect((await retirada(sid, id)).projection.expectedTotal).toBe(300);
    const caixa = await abrirCaixa(sid);
    await receber(sid, id, caixa, [{ forma: "pix", valor: 300 }]);
    // Pagamento nunca baixa estoque.
    expect((await prisma.produto.findUniqueOrThrow({ where: { id: produto.id } })).stock).toBe(5);
    expect((await efeitos(sid)).estoque).toBe(0);
    await registrarEntregaV3(sid, id);
    await registrarEntregaV3(sid, id); // replay
    await Promise.all([registrarEntregaV3(sid, id), registrarEntregaV3(sid, id)]); // duplo clique tardio
    expect((await prisma.produto.findUniqueOrThrow({ where: { id: produto.id } })).stock).toBe(4);
    const movs = await prisma.movimentacaoEstoque.findMany({ where: { storeId: sid } });
    expect(movs).toHaveLength(1);
    // Ledger append-only grava a saída com sinal negativo: exatamente 1 unidade, uma vez.
    expect(movs[0]).toMatchObject({ produtoId: produto.id, quantidade: -1 });
    const os = await lerOS(id);
    expect(os.estoqueConsumido).toBe(true);
    expect(entregas(os)).toHaveLength(1);
    expect((await retirada(sid, id)).projection).toMatchObject({ expectedTotal: 300, receivedTotal: 300 });
  });

  it("T51 estorno + recibo recarregado: recibo da MESMA OS, só o devido revertido, entrega volta a bloquear", async () => {
    const sid = await novaLoja();
    const id = await novaOS(sid);
    const vizinha = await novaOS(sid);
    const caixa = await abrirCaixa(sid);
    await receber(sid, vizinha, caixa, [{ forma: "pix", valor: 300 }]);
    await receber(sid, id, caixa, [{ forma: "pix", valor: 100 }]);
    await receber(sid, id, caixa, [{ forma: "dinheiro", valor: 200 }]);
    let os = await lerOS(id);
    let leitura = await reciboOferecido(sid, id);
    expect(leitura.estado === "disponivel" && leitura.recibo).toMatchObject({ numeroOS: os.codigo, valorPago: 200, recebidoAcumulado: 300 });
    await estornarRecebimentoOSV3(sid, id, { sessaoId: caixa, motivo: "Valor lançado errado (QA)" });
    const r = await retirada(sid, id);
    expect(r.projection).toMatchObject({ financialStatus: "PARTIAL", receivedTotal: 100, balance: 200, canDeliver: false });
    os = await lerOS(id);
    leitura = await reciboOferecido(sid, id);
    expect(leitura.estado === "disponivel" && leitura.recibo).toMatchObject({ valorPago: 100, recebidoAcumulado: 100 });
    expect((os.timeline as Payload[]).some((ev) => ev.tipo === "financeiro_conta_receber_atualizada" && ev.metadata?.estornado === 200)).toBe(true);
    expect((await efeitos(sid)).estornosCaixa).toBe(1);
    await expect(registrarEntregaV3(sid, id)).rejects.toThrow(/saldo pendente/i);
    expect((await retirada(sid, vizinha)).projection).toMatchObject({ financialStatus: "PAID", receivedTotal: 300 });
  });

  it("R2 recibo: estorno do PIX 200 e reposição de 200 em dinheiro (mesmo acumulado) — a OS oferece o novo; baixa fora da OS invalida", async () => {
    const sid = await novaLoja();
    const id = await novaOS(sid);
    const caixa = await abrirCaixa(sid);
    await receber(sid, id, caixa, [{ forma: "pix", valor: 100 }]);
    const pixDaSessao = (await receber(sid, id, caixa, [{ forma: "pix", valor: 200 }])).recibo;
    expect(await reciboOferecido(sid, id, pixDaSessao)).toMatchObject({ estado: "disponivel", origem: "sessao" });
    // Outro operador: estorna o PIX 200 e repõe 200 em dinheiro (acumulado volta a 300).
    await estornarRecebimentoOSV3(sid, id, { sessaoId: caixa, motivo: "Troca de forma (QA)" });
    await receber(sid, id, caixa, [{ forma: "dinheiro", valor: 200 }]);
    const leitura = await reciboOferecido(sid, id, pixDaSessao);
    expect(leitura).toMatchObject({ estado: "disponivel", origem: "persistido", recibo: { valorPago: 200, recebidoAcumulado: 300 } });
    expect(leitura.estado === "disponivel" && leitura.recibo.formas.map((f) => f.forma)).toEqual(["dinheiro"]);
    // Baixa feita FORA da OS (serviço do Financeiro direto no título): nenhum comprovante da OS vale.
    const outra = await novaOS(sid);
    await receber(sid, outra, caixa, [{ forma: "pix", valor: 100 }]);
    const baixa = await registrarPagamentoParcial({ storeId: sid, localKey: `os-faturamento:${sid}:${outra}`, valorPago: 50, observacao: "Baixa externa QA", userLabel: "Financeiro QA" });
    expect(baixa.ok).toBe(true);
    expect(await reciboOferecido(sid, outra)).toEqual({ estado: "indisponivel" });
  });

  it("T52 entrega canônica: retirante + data retroativa (S13); replay/reimpressão não duplicam; garantia inicia uma vez (S19); assinatura distinta da entrada", async () => {
    const sid = await novaLoja();
    const id = await novaOS(sid);
    const caixa = await abrirCaixa(sid);
    await receber(sid, id, caixa, [{ forma: "pix", valor: 300 }]);
    const ontem = new Date(Date.now() - 86_400_000);
    const dia = ontem.toISOString().slice(0, 10);
    // S14: data antes da entrada → recusa sem efeito.
    await expect(registrarEntregaV3(sid, id, { dataEntrega: { iso: "2026-08-01T15:00:00.000Z", meta: { precisao: "dia", dia: "2026-08-01" } } })).rejects.toThrow(/anterior à entrada/);
    expect(entregas(await lerOS(id))).toHaveLength(0);
    const dataEntrega = { iso: `${dia}T15:00:00.000Z`, meta: { precisao: "dia" as const, dia } };
    await registrarEntregaV3(sid, id, { recebidoPor: "Portador QA", dataEntrega });
    const os1 = await lerOS(id);
    expect(os1.operacaoStatusV3).toBe("entregue");
    expect(os1.entregaV3).toMatchObject({ recebidoPor: "Portador QA", entregueEm: dataEntrega.iso });
    expect(os1.retirada).toMatchObject({ confirmado: true, retiradoPor: "Portador QA", retiradoEm: dataEntrega.iso });
    expect(Date.parse(os1.entregaV3.registradoEm)).toBeGreaterThanOrEqual(INICIO.getTime());
    const garantia1 = lerGarantiaV3(os1 as unknown as OrdemServico);
    expect(garantia1.inicio).toBe(dataEntrega.iso);
    // Replay idêntico + "reimpressão" (leitura) não criam outra entrega; data diferente é recusada.
    await registrarEntregaV3(sid, id, { recebidoPor: "Portador QA", dataEntrega });
    await expect(registrarEntregaV3(sid, id, { dataEntrega: { iso: new Date().toISOString() } })).rejects.toThrow(/já foi entregue/);
    // Assinatura de retirada depois da entrega: grava no fato da retirada, nunca reaproveita a de entrada.
    await salvarAssinaturaRetiradaV3(sid, id, "data:image/png;base64,iVBORw0KGgoRETIRADAQA");
    const os2 = await lerOS(id);
    expect(entregas(os2)).toHaveLength(1);
    expect(os2.entregaV3.assinaturaRetirada.dataUrl).toBe("data:image/png;base64,iVBORw0KGgoRETIRADAQA");
    expect(os2.aberturaV3.assinaturaCliente.dataUrl).toBe("data:image/png;base64,ENTRADA");
    expect(lerGarantiaV3(os2 as unknown as OrdemServico).inicio).toBe(garantia1.inicio);
    // Dinheiro recebido continua no horário real (nunca retrodatado pela data de entrega).
    const e = await efeitos(sid);
    expect(e.recebimentosCaixa).toHaveLength(1);
    expect(e.recebimentosCaixa[0]!.at.getTime()).toBeGreaterThanOrEqual(INICIO.getTime() - 1000);
    expect(e.titulos[0]!.status).toBe("pago");
  });
});

// ─── concorrência determinística ─────────────────────────────────────────────

describe("OPS-V4-FLUXO-CURTO-006 — concorrência (PostgreSQL real)", () => {
  it("A1) mesma operação reenviada com a primeira em voo: a segunda ESPERA a trava e vira replay — um lançamento", async () => {
    const sid = await novaLoja();
    const id = await novaOS(sid);
    const caixa = await abrirCaixa(sid);
    const input = { linhas: [{ forma: "pix" as const, valor: 300 }], sessaoId: caixa, operacaoId: gerarOperacaoIdV3() };
    const pausa = armarPausa(id, (p) => !!p.pagamentoV3);
    const primeira = receberOSV3(sid, id, input);
    await pausa.naBarreira;
    const segunda = receberOSV3(sid, id, input);
    await esperarBloqueioNoBanco();
    pausa.liberar();
    const [a, b] = await Promise.all([primeira, segunda]);
    expect(a.jaRegistrado).toBe(false);
    expect(b.jaRegistrado).toBe(true);
    const e = await efeitos(sid);
    expect(e.recebimentosCaixa).toHaveLength(1);
    expect(e.movimentos).toBe(1);
    expect((await retirada(sid, id)).projection).toMatchObject({ receivedTotal: 300, balance: 0 });
  });

  it("A2) chaves diferentes sobre o mesmo saldo com a primeira em voo: a segunda espera e é recusada pelo saldo — nada em dobro", async () => {
    const sid = await novaLoja();
    const id = await novaOS(sid);
    const caixa = await abrirCaixa(sid);
    const pausa = armarPausa(id, (p) => !!p.pagamentoV3);
    const primeira = receber(sid, id, caixa, [{ forma: "pix", valor: 300 }], { saldoEsperado: 300 });
    await pausa.naBarreira;
    const segunda = receber(sid, id, caixa, [{ forma: "dinheiro", valor: 300 }], { saldoEsperado: 300 }).then(() => "gravou", (e: Error) => e.message);
    await esperarBloqueioNoBanco();
    pausa.liberar();
    await primeira;
    expect(await segunda).toMatch(/saldo desta OS mudou/);
    const e = await efeitos(sid);
    expect(e.recebimentosCaixa).toHaveLength(1);
    expect(e.recebimentosCaixa[0]!.payload).toMatchObject({ formaPagamento: "pix" });
    expect(e.movimentos).toBe(1);
    expect((await retirada(sid, id)).projection).toMatchObject({ receivedTotal: 300, balance: 0 });
  });

  it("B) recebimento em voo × entrega: a entrega espera a trava e decide com o estado commitado (quitado → entrega)", async () => {
    const sid = await novaLoja();
    const id = await novaOS(sid);
    const caixa = await abrirCaixa(sid);
    const pausa = armarPausa(id, (p) => !!p.pagamentoV3 && p.operacaoStatusV3 !== "entregue");
    const recebimento = receber(sid, id, caixa, [{ forma: "pix", valor: 300 }]);
    await pausa.naBarreira;
    const entrega = registrarEntregaV3(sid, id);
    await esperarBloqueioNoBanco();
    pausa.liberar();
    await recebimento;
    await entrega;
    const os = await lerOS(id);
    expect(os.operacaoStatusV3).toBe("entregue");
    expect(entregas(os)).toHaveLength(1);
    expect((await efeitos(sid)).recebimentosCaixa).toHaveLength(1);
  });

  it("C) duas entregas concorrentes: a segunda espera e vira idempotente — um único fato de entrega", async () => {
    const sid = await novaLoja();
    const id = await novaOS(sid);
    const caixa = await abrirCaixa(sid);
    await receber(sid, id, caixa, [{ forma: "pix", valor: 300 }]);
    const pausa = armarPausa(id, (p) => p.operacaoStatusV3 === "entregue");
    const primeira = registrarEntregaV3(sid, id, { recebidoPor: "Primeira" });
    await pausa.naBarreira;
    const segunda = registrarEntregaV3(sid, id, { recebidoPor: "Segunda" });
    await esperarBloqueioNoBanco();
    pausa.liberar();
    await Promise.all([primeira, segunda]);
    const os = await lerOS(id);
    expect(entregas(os)).toHaveLength(1);
    expect(os.entregaV3.recebidoPor).toBe("Primeira");
  });

  it("D) estorno em voo × entrega: o guard decide com o estorno commitado (saldo volta → entrega recusada)", async () => {
    const sid = await novaLoja();
    const id = await novaOS(sid);
    const caixa = await abrirCaixa(sid);
    await receber(sid, id, caixa, [{ forma: "pix", valor: 300 }]);
    const pausa = armarPausa(id, (p) => (p.timeline as Payload[]).some((ev) => ev.tipo === "financeiro_conta_receber_atualizada" && ev.metadata?.modo === "ultimo_pagamento"));
    const estorno = estornarRecebimentoOSV3(sid, id, { sessaoId: caixa, motivo: "QA concorrência" });
    await pausa.naBarreira;
    const entrega = registrarEntregaV3(sid, id).then(() => "entregou", (e: Error) => e.message);
    await esperarBloqueioNoBanco();
    pausa.liberar();
    await estorno;
    expect(await entrega).toMatch(/saldo pendente/i);
    const os = await lerOS(id);
    expect(os.operacaoStatusV3).toBe("pronta");
    expect(entregas(os)).toHaveLength(0);
    expect((await retirada(sid, id)).projection).toMatchObject({ financialStatus: "OPEN", balance: 300 });
  });
});
