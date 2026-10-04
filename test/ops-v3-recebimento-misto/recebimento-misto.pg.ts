/**
 * OPS-V3-RECEBIMENTO-MISTO-A-PRAZO-001 — integração em PostgreSQL REAL (local, descartável).
 *
 * Só dados sintéticos (lojas `qa-misto-*`). Nenhum mock de persistência: as actions
 * de produção rodam contra o banco; só `@/auth` (sessão) e `next/cache` são simulados.
 * A permissão é a REAL (`requireEnterpriseWith` + matriz por papel).
 */
import { afterAll, describe, expect, it, vi } from "vitest";

const sessao = vi.hoisted(() => ({ id: "qa-misto-admin", name: "Operador QA", role: "ADMIN" }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: sessao.id, name: sessao.name, role: sessao.role, storeAccess: "all" } })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import {
  estornarRecebimentoOSV3,
  lancarOSAPrazoV3,
  lerPagamentoOSV3,
  receberOSV3,
  registrarRecebimentoMistoOSV3,
  type RegistrarRecebimentoMistoInputV3,
} from "@/lib/operacoes-v3/pdv-servico-actions";
import { executarRecebimentoMistoOSV3 } from "@/lib/operacoes-v3/recebimento-misto-service";
import { hojeLojaV3, normalizarRecebimentoMistoV3 } from "@/lib/operacoes-v3/recebimento-misto-model";
import { localKeyContaReceberOSV3 } from "@/lib/operacoes-v3/payment-model";
import { projetarEntregaFinanceiraV3 } from "@/lib/operacoes-v3/delivery-financial-guard";
import { buildContaReceberAuditTrail, estornarContaReceber } from "@/lib/financeiro/services/contas-receber-service";
import { projectFinancialOSV4 } from "@/lib/operacoes-v4/financial-projection";

// ─── ambiente: só PostgreSQL loopback descartável ─────────────────────────────

function exigirBancoDescartavel(): string {
  const urls = [process.env.OPS_V3_MISTO_TEST_DATABASE_URL, process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => v?.trim() || "");
  if (urls.some((v) => !v)) {
    throw new Error(
      "BLOQUEIO_EXPLICITO_PG: configure OPS_V3_MISTO_TEST_DATABASE_URL, DATABASE_URL e DIRECT_URL (iguais) no .env local para o PostgreSQL descartável.",
    );
  }
  const parsed = urls.map((v) => new URL(v));
  if (parsed.some((u) => !["127.0.0.1", "localhost", "[::1]", "::1"].includes(u.hostname))) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: a integração só pode usar PostgreSQL em loopback.");
  }
  const alvo = (u: URL) => `${u.hostname}:${u.port}${u.pathname}`;
  if (parsed.some((u) => alvo(u) !== alvo(parsed[0]!))) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: as três URLs devem apontar para o MESMO banco descartável.");
  }
  if (!parsed[0]!.pathname.replace(/^\//, "").startsWith("ops_v3_misto_qa")) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: o banco precisa ser o descartável ops_v3_misto_qa*.");
  }
  return urls[0]!;
}

exigirBancoDescartavel();

// ─── massa sintética ──────────────────────────────────────────────────────────

const SUFIXO = Date.now().toString(36);
const VENC = (() => {
  const [a, m, d] = hojeLojaV3().split("-").map(Number);
  const dt = new Date(Date.UTC(a!, m! - 1 + 1, d!));
  return dt.toISOString().slice(0, 10);
})();
let seq = 0;
const lojasCriadas: string[] = [];

type Payload = Record<string, any>;

async function novaLoja(): Promise<string> {
  const id = `qa-misto-${SUFIXO}-${++seq}`;
  await prisma.store.create({ data: { id, name: `Loja QA misto ${seq}` } });
  lojasCriadas.push(id);
  return id;
}

/** OS com DOIS serviços (300 + 100 = 400), orçamento aprovado. */
async function novaOS(storeId: string, opts: { status?: string } = {}): Promise<string> {
  const n = ++seq;
  const servicos = [
    { id: `s1-${n}`, descricao: "Troca de tela", valor: 300 },
    { id: `s2-${n}`, descricao: "Limpeza interna", valor: 100 },
  ];
  const status = opts.status ?? "pronta";
  const row = await prisma.ordemServico.create({
    data: {
      storeId,
      numero: `OS-QA-${SUFIXO}-${n}`,
      equipamento: "Samsung A54",
      defeito: "Tela quebrada",
      valorTotal: 400,
      payload: {
        codigo: `OS-QA-${n}`,
        storeId,
        cliente: { nome: `Cliente QA ${n}` },
        equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "A54" },
        status,
        operacaoStatusV3: status,
        orcamento: { id: `orc-${n}`, status: "aprovado", pecas: [], servicos, desconto: 0, total: 400, criadoEm: "2026-10-01T12:00:00.000Z" },
        valorTotal: 400,
        garantia: { ativa: false, prazoDias: 90 },
        aberturaV3: { defeitoRelatado: "Tela quebrada" },
        timeline: [{ id: `ev-abertura-${n}`, tipo: "os_criada", autor: "QA", autorTipo: "usuario", conteudo: "OS aberta", criadoEm: "2026-10-01T12:00:00.000Z" }],
      } as Prisma.InputJsonValue,
    },
  });
  return row.id;
}

async function abrirCaixa(storeId: string): Promise<string> {
  const s = await prisma.sessaoCaixa.create({ data: { storeId, operador: "QA", status: "ABERTA" } });
  return s.id;
}

let opSeq = 0;
function opId(): string {
  return `qa-op-${SUFIXO}-${++opSeq}`;
}

function entrada(over: Partial<RegistrarRecebimentoMistoInputV3> & { sessaoId?: string }): RegistrarRecebimentoMistoInputV3 {
  return {
    operacaoId: opId(),
    pagamentosAgora: [{ forma: "debito", valor: 350 }],
    saldoAPrazo: { valor: 50, vencimento: VENC },
    saldoEsperado: 400,
    ...over,
  };
}

async function estado(storeId: string, osId: string) {
  const localKey = localKeyContaReceberOSV3(storeId, osId);
  const titulos = await prisma.contaReceberTitulo.findMany({ where: { storeId } });
  const titulo = titulos.find((t) => t.localKey === localKey) ?? null;
  const caixa = await prisma.caixaOperacao.findMany({ where: { storeId }, orderBy: { at: "asc" } });
  const movs = await prisma.movimentacaoFinanceira.findMany({ where: { storeId } });
  const os = await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId } });
  const historico: Payload[] = ((titulo?.payload as Payload | null)?.historico as Payload[] | undefined) ?? [];
  const recebido = historico.reduce((acc, e) => {
    if (e.tipo === "pagamento" || e.tipo === "liquidacao") return acc + Number(e.valor);
    if (e.tipo === "estorno_pagamento") return acc - Number(e.valor);
    return acc;
  }, 0);
  const saldo = titulo ? buildContaReceberAuditTrail([titulo])[0]!.saldoAberto : null;
  return { titulos, titulo, caixa, movs, os, payload: os.payload as Payload, historico, recebido, saldo };
}

function guard(storeId: string, osId: string, s: Awaited<ReturnType<typeof estado>>) {
  return projetarEntregaFinanceiraV3({
    storeId,
    osId,
    payload: s.payload as never,
    prismaValorTotal: s.os.valorTotal,
    titulo: s.titulo
      ? { id: s.titulo.id, storeId: s.titulo.storeId, localKey: s.titulo.localKey, valor: s.titulo.valor, status: s.titulo.status, payload: s.titulo.payload }
      : null,
  });
}

function v4(storeId: string, osId: string, s: Awaited<ReturnType<typeof estado>>) {
  return projectFinancialOSV4({
    storeId,
    osId,
    payload: s.payload as never,
    prismaValorTotal: s.os.valorTotal,
    titulo: s.titulo
      ? { id: s.titulo.id, storeId, localKey: s.titulo.localKey, valor: s.titulo.valor, status: s.titulo.status, payload: s.titulo.payload }
      : null,
    loadedAt: new Date().toISOString(),
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ─── 1. caso principal ────────────────────────────────────────────────────────

describe("PG · caso 400 = débito 350 + a prazo 50", () => {
  it("recebido 350, saldo 50, status parcial, a prazo 50 com vencimento, caixa só 350, título único", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);

    const res = await registrarRecebimentoMistoOSV3(storeId, osId, entrada({ sessaoId, saldoAPrazo: { valor: 50, vencimento: VENC, observacao: "Paga no dia 10" } }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res).toMatchObject({ jaRegistrado: false, valorRecebidoAgora: 350, valorAPrazo: 50 });
    expect(res.pagamento).toMatchObject({ total: 400, recebido: 350, saldo: 50, status: "parcial" });
    expect(res.aPrazo).toMatchObject({ modo: "a_prazo", status: "pendente", valor: 50, vencimento: VENC, autorizadoEntrega: true, autorizadoPor: "Operador QA" });
    expect(res.recibo).toMatchObject({ valorPago: 350, totalOS: 400, saldoRestante: 50, situacaoLabel: "Pagamento parcial — saldo a prazo", aPrazo: { valor: 50, vencimento: VENC } });
    expect(JSON.stringify(res.recibo)).not.toMatch(/Quita/);

    const s = await estado(storeId, osId);
    // Título ÚNICO, valor original 400 preservado.
    expect(s.titulos).toHaveLength(1);
    expect(s.titulo).toMatchObject({ valor: 400, status: "parcial", vencimento: VENC });
    expect(s.recebido).toBe(350);
    expect(s.saldo).toBe(50);
    const pagamentos = s.historico.filter((e) => e.tipo === "pagamento" || e.tipo === "liquidacao");
    expect(pagamentos).toHaveLength(1);
    expect(pagamentos[0]!.valor).toBe(350);
    const marcadores = s.historico.filter((e) => e.tipo === "a_prazo_autorizado");
    expect(marcadores).toHaveLength(1);
    expect(marcadores[0]).toMatchObject({ valor: 50, vencimento: VENC, userLabel: "Operador QA", autorizadoPorId: "qa-misto-admin", recebidoAgora: 350 });
    expect(typeof marcadores[0]!.at).toBe("string");
    // Os 50 a prazo NÃO entram no caixa nem na movimentação.
    expect(s.caixa.map((c) => ({ tipo: c.tipo, valor: c.valor, forma: (c.payload as Payload).formaPagamento, origem: (c.payload as Payload).origem }))).toEqual([
      { tipo: "recebimento_cr", valor: 350, forma: "debito", origem: "operacoes-v3-os" },
    ]);
    expect(s.movs.map((m) => ({ tipo: m.tipo, valor: m.valor, origem: m.origem }))).toEqual([{ tipo: "entrada", valor: 350, origem: "receber_parcial" }]);
    // Espelhos e histórico da OS; serviços/orçamento/abertura preservados.
    expect(s.payload.pagamentoV3).toMatchObject({ total: 400, recebido: 350, saldo: 50, status: "parcial" });
    expect(s.payload.aPrazoV3).toMatchObject({ valor: 50, vencimento: VENC, status: "pendente", operacaoId: res.operacaoId, observacao: "Paga no dia 10" });
    expect(s.payload.orcamento.servicos).toHaveLength(2);
    expect(s.payload.aberturaV3).toEqual({ defeitoRelatado: "Tela quebrada" });
    expect(s.payload.timeline.map((e: Payload) => e.tipo)).toEqual(["os_criada", "operacao_cobranca_gerada", "financeiro_conta_receber_criada"]);

    // Reabrir a OS: saldo e vencimento vêm do servidor.
    const lido = await lerPagamentoOSV3(storeId, osId);
    expect(lido).toMatchObject({ total: 400, recebido: 350, saldo: 50, status: "parcial" });
    expect(lido.aPrazo).toMatchObject({ valor: 50, vencimento: VENC });

    // Entrega: autorização a prazo cobre o saldo (sem relaxar o guard).
    expect(guard(storeId, osId, s).decisao).toBe("ALLOW_AUTHORIZED_CREDIT");

    // Compatibilidade V4: a projeção financeira lê a mesma OS sem alteração na V4.
    const v4 = projectFinancialOSV4({
      storeId,
      osId,
      payload: s.payload as never,
      prismaValorTotal: s.os.valorTotal,
      titulo: { id: s.titulo!.id, storeId, localKey: s.titulo!.localKey, valor: s.titulo!.valor, status: s.titulo!.status, payload: s.titulo!.payload },
      loadedAt: new Date().toISOString(),
    });
    expect(v4).toMatchObject({ receivedTotal: 350, balance: 50, financialStatus: "AUTHORIZED_CREDIT", authorizedCredit: true, canDeliver: true, collectionMode: "a_prazo" });
    expect(v4.paymentMethods).toEqual([{ code: "debito", label: "Débito", amount: 350, source: "PDV_SPLIT" }]);
    expect(v4.installments).toEqual([{ number: "1", dueAt: VENC, amount: 50, status: "pendente" }]);
  });
});

// ─── 2. caixa por forma ───────────────────────────────────────────────────────

describe("PG · dinheiro 100 + débito 250 + a prazo 50", () => {
  it("caixa só 350 (uma operação por forma) e saldo 50", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    const res = await registrarRecebimentoMistoOSV3(
      storeId,
      osId,
      entrada({ sessaoId, pagamentosAgora: [{ forma: "dinheiro", valor: 100 }, { forma: "debito", valor: 250 }] }),
    );
    expect(res.ok).toBe(true);
    const s = await estado(storeId, osId);
    const porForma = s.caixa.map((c) => [(c.payload as Payload).formaPagamento, c.valor]);
    expect(porForma).toEqual([["dinheiro", 100], ["debito", 250]]);
    expect(s.caixa.reduce((a, c) => a + c.valor, 0)).toBe(350);
    expect(s.movs.reduce((a, m) => a + m.valor, 0)).toBe(350);
    expect(s.recebido).toBe(350);
    expect(s.saldo).toBe(50);
  });
});

// ─── 3. 100% a prazo ──────────────────────────────────────────────────────────

describe("PG · 400 integralmente a prazo", () => {
  it("recebido 0, saldo 400, título pendente, sem caixa (nem sessão aberta)", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const res = await registrarRecebimentoMistoOSV3(
      storeId,
      osId,
      entrada({ pagamentosAgora: [], saldoAPrazo: { valor: 400, vencimento: VENC }, saldoEsperado: 400 }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.recibo).toMatchObject({ tipoComprovante: "formalizacao_a_prazo", valorPago: 0, formas: [] });
    const s = await estado(storeId, osId);
    expect(s.titulos).toHaveLength(1);
    expect(s.titulo).toMatchObject({ valor: 400, status: "pendente", vencimento: VENC });
    expect(s.recebido).toBe(0);
    expect(s.saldo).toBe(400);
    expect(s.caixa).toHaveLength(0);
    expect(s.movs).toHaveLength(0);
    expect(s.payload.aPrazoV3).toMatchObject({ valor: 400, vencimento: VENC });
    expect(guard(storeId, osId, s).decisao).toBe("ALLOW_AUTHORIZED_CREDIT");
  });
});

// ─── 4. 350 já recebidos antes ────────────────────────────────────────────────

describe("PG · 350 já recebidos + formalizar 50 a prazo", () => {
  it("não registra os 350 de novo", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    await receberOSV3(storeId, osId, { valor: 350, forma: "debito", sessaoId });

    const res = await registrarRecebimentoMistoOSV3(storeId, osId, entrada({ pagamentosAgora: [], saldoAPrazo: { valor: 50, vencimento: VENC }, saldoEsperado: 50 }));
    expect(res.ok).toBe(true);
    const s = await estado(storeId, osId);
    expect(s.titulos).toHaveLength(1);
    expect(s.historico.filter((e) => e.tipo === "pagamento" || e.tipo === "liquidacao").map((e) => e.valor)).toEqual([350]);
    expect(s.caixa.map((c) => c.valor)).toEqual([350]);
    expect(s.recebido).toBe(350);
    expect(s.saldo).toBe(50);
    expect(s.titulo!.status).toBe("parcial");
    expect(guard(storeId, osId, s).decisao).toBe("ALLOW_AUTHORIZED_CREDIT");
  });
});

// ─── 5. pagamento posterior ───────────────────────────────────────────────────

describe("PG · pagamento posterior dos 50", () => {
  it("o MESMO título chega a recebido 400, saldo 0, quitado", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    expect((await registrarRecebimentoMistoOSV3(storeId, osId, entrada({ sessaoId }))).ok).toBe(true);
    const antes = await estado(storeId, osId);

    const quitacao = await receberOSV3(storeId, osId, { valor: 50, forma: "dinheiro", sessaoId });
    expect(quitacao.pagamento).toMatchObject({ total: 400, recebido: 400, saldo: 0, status: "quitado" });

    const s = await estado(storeId, osId);
    expect(s.titulos).toHaveLength(1);
    expect(s.titulo!.id).toBe(antes.titulo!.id);
    expect(s.titulo!.status).toBe("pago");
    expect(s.recebido).toBe(400);
    expect(s.saldo).toBe(0);
    expect(s.caixa.map((c) => c.valor)).toEqual([350, 50]);
    expect(guard(storeId, osId, s).decisao).toBe("ALLOW_PAID");
    // R/P2: depois da quitação o espelho a prazo é histórico — nenhuma cobrança/parcela pendente.
    expect(s.payload.aPrazoV3).toMatchObject({ status: "quitado" });
    expect((await lerPagamentoOSV3(storeId, osId)).aPrazo).toBeNull();
    const proj = v4(storeId, osId, s);
    expect(proj).toMatchObject({ financialStatus: "PAID", balance: 0, collectionMode: null, authorizedCredit: false });
    expect(proj.installments).toEqual([]);
  });

  it("pagamento PARCIAL posterior (R$20): movimentação lançada e a prazo acompanha o saldo real (R$30)", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    expect((await registrarRecebimentoMistoOSV3(storeId, osId, entrada({ sessaoId }))).ok).toBe(true);
    await receberOSV3(storeId, osId, { valor: 20, forma: "dinheiro", sessaoId });

    const s = await estado(storeId, osId);
    expect(s.recebido).toBe(370);
    expect(s.saldo).toBe(30);
    // Uma movimentação por baixa: os R$20 não são suprimidos por já haver R$350 lançados.
    expect(s.movs.map((m) => m.valor).sort((a, b) => a - b)).toEqual([20, 350]);
    expect(s.caixa.map((c) => c.valor)).toEqual([350, 20]);
    expect(s.payload.aPrazoV3).toMatchObject({ status: "pendente", valor: 30 });
    expect((await lerPagamentoOSV3(storeId, osId)).aPrazo).toMatchObject({ valor: 30 });
    expect(guard(storeId, osId, s).decisao).toBe("ALLOW_AUTHORIZED_CREDIT");
    expect(v4(storeId, osId, s).installments).toEqual([expect.objectContaining({ amount: 30, dueAt: VENC, status: "pendente" })]);
  });
});

// ─── 6/7. validação: nenhuma escrita ──────────────────────────────────────────

async function semEscrita(storeId: string, osId: string, payloadAntes: unknown) {
  const s = await estado(storeId, osId);
  expect(s.titulos).toHaveLength(0);
  expect(s.caixa).toHaveLength(0);
  expect(s.movs).toHaveLength(0);
  expect(s.payload).toEqual(payloadAntes);
}

describe("PG · validações bloqueiam sem escrever", () => {
  it("vencimento ausente, inexistente e passado → entrada_invalida", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    const payloadAntes = (await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId } })).payload;
    for (const vencimento of ["", "2026-02-30", "2020-01-01", "10/11/2026"]) {
      const r = await registrarRecebimentoMistoOSV3(storeId, osId, entrada({ sessaoId, saldoAPrazo: { valor: 50, vencimento } }));
      expect(r).toMatchObject({ ok: false, code: "entrada_invalida" });
    }
    await semEscrita(storeId, osId, payloadAntes);
  });

  it("valor acima do saldo, distribuição que não fecha e linha zerada → bloqueia", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    const payloadAntes = (await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId } })).payload;
    expect(await registrarRecebimentoMistoOSV3(storeId, osId, entrada({ sessaoId, pagamentosAgora: [{ forma: "debito", valor: 450 }] }))).toMatchObject({
      ok: false,
      code: "valor_acima_do_saldo",
    });
    expect(await registrarRecebimentoMistoOSV3(storeId, osId, entrada({ sessaoId, pagamentosAgora: [{ forma: "debito", valor: 300 }] }))).toMatchObject({
      ok: false,
      code: "distribuicao_inconsistente",
    });
    expect(
      await registrarRecebimentoMistoOSV3(storeId, osId, entrada({ sessaoId, pagamentosAgora: [{ forma: "debito", valor: 350 }, { forma: "pix", valor: 0 }] })),
    ).toMatchObject({ ok: false, code: "entrada_invalida" });
    expect(
      await registrarRecebimentoMistoOSV3(storeId, osId, entrada({ sessaoId, pagamentosAgora: [{ forma: "crediario", valor: 350 }] })),
    ).toMatchObject({ ok: false, code: "entrada_invalida" });
    await semEscrita(storeId, osId, payloadAntes);
  });
});

// ─── 8. duplicidade ───────────────────────────────────────────────────────────

describe("PG · mesma confirmação enviada duas vezes", () => {
  it("simultâneas e repetida após resposta perdida → UMA operação efetiva; conteúdo diferente → conflito", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    const input = entrada({ sessaoId });

    const [a, b] = await Promise.all([
      registrarRecebimentoMistoOSV3(storeId, osId, input),
      registrarRecebimentoMistoOSV3(storeId, osId, input),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect([a.jaRegistrado, b.jaRegistrado].sort()).toEqual([false, true]);

    // Resposta "perdida": o operador repete com a MESMA chave.
    const c = await registrarRecebimentoMistoOSV3(storeId, osId, input);
    expect(c).toMatchObject({ ok: true, jaRegistrado: true, valorRecebidoAgora: 350, valorAPrazo: 50 });

    const s = await estado(storeId, osId);
    expect(s.historico.filter((e) => e.tipo === "pagamento").length).toBe(1);
    expect(s.historico.filter((e) => e.tipo === "a_prazo_autorizado").length).toBe(1);
    expect(s.caixa).toHaveLength(1);
    expect(s.movs).toHaveLength(1);
    expect(s.recebido).toBe(350);
    expect(s.saldo).toBe(50);

    // Mesma chave com outro conteúdo → conflito, sem efeito.
    const conflito = await registrarRecebimentoMistoOSV3(storeId, osId, { ...input, pagamentosAgora: [{ forma: "pix", valor: 350 }] });
    expect(conflito).toMatchObject({ ok: false, code: "idempotencia_conflito" });
    expect((await estado(storeId, osId)).caixa).toHaveLength(1);
  });
});

// ─── 9. falha no meio: rollback total ─────────────────────────────────────────

type Tx = Prisma.TransactionClient;

/** Envolve o `tx` real: falha (ou pausa) exatamente na chamada `modelo.metodo`. */
function txInstrumentado(tx: Tx, alvo: { modelo: string; metodo: string; falhar?: boolean; antes?: () => Promise<void> }): Tx {
  return new Proxy(tx, {
    get(target, prop) {
      const valor = Reflect.get(target, prop);
      if (prop === alvo.modelo && valor && typeof valor === "object") {
        return new Proxy(valor as object, {
          get(t2, p2) {
            const fn = Reflect.get(t2, p2);
            if (p2 === alvo.metodo && typeof fn === "function") {
              return async (...args: unknown[]) => {
                if (alvo.antes) await alvo.antes();
                if (alvo.falhar) throw new Error(`FALHA_INJETADA:${alvo.modelo}.${alvo.metodo}`);
                return (fn as (...a: unknown[]) => unknown).apply(t2, args);
              };
            }
            return typeof fn === "function" ? (fn as (...a: unknown[]) => unknown).bind(t2) : fn;
          },
        });
      }
      return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(target) : valor;
    },
  }) as Tx;
}

async function osComTituloCanonico() {
  const storeId = await novaLoja();
  const osId = await novaOS(storeId);
  const sessaoId = await abrirCaixa(storeId);
  // Título canônico pré-existente (como o do faturamento V2), para provar "inalterado".
  await prisma.contaReceberTitulo.create({
    data: {
      storeId,
      localKey: localKeyContaReceberOSV3(storeId, osId),
      descricao: "OS QA",
      cliente: "Cliente QA",
      valor: 400,
      vencimento: VENC,
      status: "pendente",
      payload: { origem: "operacoes-v3", ordemServicoId: osId } as Prisma.InputJsonValue,
    },
  });
  return { storeId, osId, sessaoId, antes: await estado(storeId, osId) };
}

function normal(input: RegistrarRecebimentoMistoInputV3) {
  const r = normalizarRecebimentoMistoV3(input, hojeLojaV3());
  if (!r.ok) throw new Error(r.mensagem);
  return r.valor;
}

describe("PG · falha injetada no meio da operação", () => {
  for (const ponto of [
    { modelo: "caixaOperacao", metodo: "create", rotulo: "depois da baixa e da movimentação, ANTES do caixa" },
    { modelo: "contaReceberTitulo", metodo: "upsert", rotulo: "DEPOIS do caixa, antes da formalização a prazo" },
    { modelo: "ordemServico", metodo: "update", rotulo: "na gravação final da OS" },
  ]) {
    it(`falha ${ponto.rotulo} → rollback total, nenhuma meia baixa`, async () => {
      const { storeId, osId, sessaoId, antes } = await osComTituloCanonico();
      const ctx = { storeId, osId, operador: "Operador QA", operadorId: "qa-misto-admin", agora: new Date().toISOString() };
      await expect(
        prisma.$transaction((tx) => executarRecebimentoMistoOSV3(txInstrumentado(tx, { ...ponto, falhar: true }), ctx, normal(entrada({ sessaoId })))),
      ).rejects.toThrow(/FALHA_INJETADA/);

      const s = await estado(storeId, osId);
      expect(s.titulos).toHaveLength(1);
      expect(s.titulo!.updatedAt.getTime()).toBe(antes.titulo!.updatedAt.getTime());
      expect(s.titulo!.payload).toEqual(antes.titulo!.payload);
      expect(s.titulo!.status).toBe("pendente");
      expect(s.caixa).toHaveLength(0);
      expect(s.movs).toHaveLength(0);
      expect(s.payload).toEqual(antes.payload);
    });
  }
});

// ─── concorrência, conflitos e permissões ─────────────────────────────────────

async function esperarBloqueioNoBanco(timeoutMs = 15_000, minimo = 1): Promise<void> {
  const fim = Date.now() + timeoutMs;
  while (Date.now() < fim) {
    const rows = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()
    `;
    if ((rows[0]?.n ?? 0) >= minimo) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("a operação concorrente não chegou a esperar a trava");
}

/** Misto parado DENTRO da transação (trava da OS + título travado, baixa e marcador já gravados), antes de gravar a OS. */
async function mistoPausadoNaGravacaoDaOS(storeId: string, osId: string, input: RegistrarRecebimentoMistoInputV3) {
  let liberar!: () => void;
  const barreira = new Promise<void>((r) => (liberar = r));
  let chegou!: () => void;
  const naBarreira = new Promise<void>((r) => (chegou = r));
  const ctx = { storeId, osId, operador: "Operador QA", operadorId: "qa-misto-admin", agora: new Date().toISOString() };
  const misto = prisma.$transaction(
    (tx) =>
      executarRecebimentoMistoOSV3(
        txInstrumentado(tx, { modelo: "ordemServico", metodo: "update", antes: async () => { chegou(); await barreira; } }),
        ctx,
        normal(input),
      ),
    { maxWait: 10_000, timeout: 60_000 },
  );
  await naBarreira;
  return { misto, liberar };
}

describe("PG · concorrência com recebimento canônico (receberOSV3 / V4)", () => {
  it("título existente: o concorrente espera a trava da OS e relê o saldo já commitado — sem lost update nem duplicidade", async () => {
    const { storeId, osId, sessaoId } = await osComTituloCanonico();
    let liberar!: () => void;
    const barreira = new Promise<void>((r) => (liberar = r));
    let chegou!: () => void;
    const naBarreira = new Promise<void>((r) => (chegou = r));
    const ctx = { storeId, osId, operador: "Operador QA", operadorId: "qa-misto-admin", agora: new Date().toISOString() };

    const misto = prisma.$transaction(
      (tx) =>
        executarRecebimentoMistoOSV3(
          txInstrumentado(tx, { modelo: "ordemServico", metodo: "update", antes: async () => { chegou(); await barreira; } }),
          ctx,
          normal(entrada({ sessaoId })),
        ),
      { maxWait: 10_000, timeout: 60_000 },
    );
    await naBarreira;
    const concorrente = receberOSV3(storeId, osId, { valor: 100, forma: "pix", sessaoId }).then(
      () => "aceito",
      (e: Error) => e.message,
    );
    await esperarBloqueioNoBanco();
    liberar();
    await expect(misto).resolves.toMatchObject({ jaRegistrado: false, valorRecebidoAgora: 350 });
    // Serializado pela trava da OS: só lê o título depois do commit (saldo 50) e recusa os 100
    // antes de qualquer escrita.
    expect(await concorrente).toMatch(/Valor acima do saldo a receber \(50\.00\)/);

    const s = await estado(storeId, osId);
    expect(s.historico.filter((e) => e.tipo === "pagamento").map((e) => e.valor)).toEqual([350]);
    expect(s.caixa.map((c) => c.valor)).toEqual([350]);
    expect(s.recebido).toBe(350);
    expect(s.saldo).toBe(50);
  });

  it("título ainda inexistente: o concorrente não sobrescreve o título criado na transação", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    let liberar!: () => void;
    const barreira = new Promise<void>((r) => (liberar = r));
    let chegou!: () => void;
    const naBarreira = new Promise<void>((r) => (chegou = r));
    const ctx = { storeId, osId, operador: "Operador QA", operadorId: "qa-misto-admin", agora: new Date().toISOString() };

    const misto = prisma.$transaction(
      (tx) =>
        executarRecebimentoMistoOSV3(
          txInstrumentado(tx, { modelo: "ordemServico", metodo: "update", antes: async () => { chegou(); await barreira; } }),
          ctx,
          normal(entrada({ sessaoId })),
        ),
      { maxWait: 10_000, timeout: 60_000 },
    );
    await naBarreira;
    const concorrente = receberOSV3(storeId, osId, { valor: 100, forma: "pix", sessaoId }).then(
      () => "aceito",
      (e: Error) => e.message,
    );
    await esperarBloqueioNoBanco();
    liberar();
    await expect(misto).resolves.toMatchObject({ jaRegistrado: false });
    // O concorrente esperou a trava da OS e leu o título JÁ commitado (criado pelo misto):
    // saldo 50 (a prazo) → 100 passa do saldo e é recusado antes de qualquer escrita.
    expect(await concorrente).toMatch(/Valor acima do saldo a receber \(50\.00\)/);

    const s = await estado(storeId, osId);
    expect(s.titulos).toHaveLength(1);
    expect(s.historico.filter((e) => e.tipo === "a_prazo_autorizado")).toHaveLength(1);
    expect(s.recebido).toBe(350);
    expect(s.saldo).toBe(50);
    expect(s.caixa.map((c) => c.valor)).toEqual([350]);
  });

  it("R/P1: recebimento canônico parado DENTRO da trava da OS — o misto espera, e nada se perde em nenhuma das duas", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);

    // Trava a sessão de caixa: o receberOSV3 pega a trava da OS e para na sessão (FOR SHARE),
    // SEGURANDO a trava — antes de ler ou gravar qualquer coisa.
    let liberarSessao!: () => void;
    const segurar = new Promise<void>((r) => (liberarSessao = r));
    let sessaoTravada!: () => void;
    const travou = new Promise<void>((r) => (sessaoTravada = r));
    const trava = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "sessoes_caixa" WHERE "id" = ${sessaoId} FOR UPDATE`;
        sessaoTravada();
        await segurar;
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
    await travou;
    const canonico = receberOSV3(storeId, osId, { valor: 100, forma: "pix", sessaoId });
    await esperarBloqueioNoBanco();

    // O restante (R$300) 100% a prazo NÃO passa na frente: espera a trava da OS.
    const misto = registrarRecebimentoMistoOSV3(
      storeId,
      osId,
      entrada({ pagamentosAgora: [], saldoAPrazo: { valor: 300, vencimento: VENC }, saldoEsperado: 300 }),
    );
    await esperarBloqueioNoBanco(15_000, 2);
    expect((await estado(storeId, osId)).titulos).toHaveLength(0);

    liberarSessao();
    await trava;
    const res = await canonico;
    expect(res.pagamento).toMatchObject({ total: 400, recebido: 100, saldo: 300, status: "parcial" });
    expect((await misto).ok).toBe(true);

    const s = await estado(storeId, osId);
    // Os dois gravaram, em ordem: espelho, autorização a prazo e os dois eventos.
    expect(s.payload.aPrazoV3).toMatchObject({ status: "pendente", valor: 300, vencimento: VENC });
    expect(s.payload.timeline.map((e: Payload) => e.tipo)).toEqual(["os_criada", "operacao_cobranca_gerada", "financeiro_conta_receber_criada"]);
    expect(s.payload.pagamentoV3).toMatchObject({ recebido: 100, saldo: 300, status: "parcial" });
    expect(s.recebido).toBe(100);
    expect(s.saldo).toBe(300);
    expect(guard(storeId, osId, s).decisao).toBe("ALLOW_AUTHORIZED_CREDIT");
  });

  it("R2/P0: lançar a prazo (V4) concorrente espera a trava da OS e relê o título — a baixa do misto sobrevive", async () => {
    const { storeId, osId, sessaoId } = await osComTituloCanonico();
    const { misto, liberar } = await mistoPausadoNaGravacaoDaOS(storeId, osId, entrada({ sessaoId }));
    const lancamento = lancarOSAPrazoV3(storeId, osId, { vencimento: VENC, observacao: "V4" });
    await esperarBloqueioNoBanco();
    liberar();
    await expect(misto).resolves.toMatchObject({ jaRegistrado: false, valorRecebidoAgora: 350 });
    // Leu o título DEPOIS do commit do misto: formaliza o saldo real (50), nunca os 400.
    await expect(lancamento).resolves.toMatchObject({ valorFormalizado: 50 });

    const s = await estado(storeId, osId);
    expect(s.historico.filter((e) => e.tipo === "pagamento").map((e) => e.valor)).toEqual([350]);
    expect(s.historico.filter((e) => e.tipo === "a_prazo_autorizado").map((e) => e.valor)).toEqual([50, 50]);
    expect(s.titulo!.status).toBe("parcial");
    expect(s.recebido).toBe(350);
    expect(s.saldo).toBe(50);
    expect(s.caixa.map((c) => c.valor)).toEqual([350]);
    expect(s.movs.map((m) => m.valor)).toEqual([350]);
    expect(s.payload.aPrazoV3).toMatchObject({ status: "pendente", valor: 50 });
    expect(guard(storeId, osId, s).decisao).toBe("ALLOW_AUTHORIZED_CREDIT");
  });

  it("R2/P0: estorno concorrente espera a trava da OS e estorna o recebimento REALMENTE último — nada sobrescrito", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    await receberOSV3(storeId, osId, { valor: 100, forma: "dinheiro", sessaoId });
    const { misto, liberar } = await mistoPausadoNaGravacaoDaOS(
      storeId,
      osId,
      entrada({ sessaoId, pagamentosAgora: [{ forma: "debito", valor: 250 }], saldoAPrazo: { valor: 50, vencimento: VENC }, saldoEsperado: 300 }),
    );
    const estorno = estornarRecebimentoOSV3(storeId, osId, { sessaoId, motivo: "QA concorrente" });
    await esperarBloqueioNoBanco();
    liberar();
    await expect(misto).resolves.toMatchObject({ valorRecebidoAgora: 250 });
    await expect(estorno).resolves.toMatchObject({ estornado: 250 });

    const s = await estado(storeId, osId);
    expect(s.historico.map((e) => e.tipo)).toEqual(["pagamento", "pagamento", "a_prazo_autorizado", "estorno_pagamento"]);
    expect(s.recebido).toBe(100);
    expect(s.saldo).toBe(300);
    expect(s.caixa.map((c) => [c.tipo, c.valor])).toEqual([
      ["recebimento_cr", 100],
      ["recebimento_cr", 250],
      ["estorno_recebimento_cr", 250],
    ]);
    expect(s.payload.pagamentoV3).toMatchObject({ recebido: 100, saldo: 300 });
    // A autorização de 50 não cobre mais o saldo de 300: entrega bloqueada, nada ampliado.
    expect(s.payload.aPrazoV3).toMatchObject({ status: "pendente", valor: 50 });
    expect(guard(storeId, osId, s).decisao).toBe("BLOCK_PENDING_BALANCE");
  });

  it("R2/P0: estorno pelo Financeiro (fora da trava da OS) não sobrescreve a baixa do misto — o CAS recusa", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    await receberOSV3(storeId, osId, { valor: 100, forma: "dinheiro", sessaoId });
    const { misto, liberar } = await mistoPausadoNaGravacaoDaOS(
      storeId,
      osId,
      entrada({ sessaoId, pagamentosAgora: [{ forma: "debito", valor: 250 }], saldoAPrazo: { valor: 50, vencimento: VENC }, saldoEsperado: 300 }),
    );
    // Mesmo caminho das rotas do Financeiro: leu o título ANTES do commit do misto.
    const financeiro = estornarContaReceber({ storeId, localKey: localKeyContaReceberOSV3(storeId, osId), modo: "ultimo_pagamento", motivo: "Financeiro QA" });
    await esperarBloqueioNoBanco();
    liberar();
    await expect(misto).resolves.toMatchObject({ valorRecebidoAgora: 250 });
    expect(await financeiro).toEqual({ ok: false, reason: "titulo_alterado" });

    const s = await estado(storeId, osId);
    expect(s.historico.map((e) => e.tipo)).toEqual(["pagamento", "pagamento", "a_prazo_autorizado"]);
    expect(s.recebido).toBe(350);
    expect(s.saldo).toBe(50);
  });

  it("saldo mudou desde a tela → conflito recuperável com o saldo atual, sem efeitos", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    await receberOSV3(storeId, osId, { valor: 100, forma: "dinheiro", sessaoId });
    const antes = await estado(storeId, osId);
    const r = await registrarRecebimentoMistoOSV3(storeId, osId, entrada({ sessaoId }));
    expect(r).toMatchObject({ ok: false, code: "saldo_divergente", saldoAtual: 300 });
    const s = await estado(storeId, osId);
    expect(s.historico).toEqual(antes.historico);
    expect(s.caixa).toHaveLength(antes.caixa.length);
  });
});

describe("PG · escopo de loja, permissões e estado da OS", () => {
  it("OS de outra loja e caixa de outra loja → rejeição sem efeitos", async () => {
    const lojaA = await novaLoja();
    const lojaB = await novaLoja();
    const osB = await novaOS(lojaB);
    const caixaB = await abrirCaixa(lojaB);
    await abrirCaixa(lojaA);
    expect(await registrarRecebimentoMistoOSV3(lojaA, osB, entrada({ sessaoId: caixaB }))).toMatchObject({ ok: false });
    const osA = await novaOS(lojaA);
    expect(await registrarRecebimentoMistoOSV3(lojaA, osA, entrada({ sessaoId: caixaB }))).toMatchObject({ ok: false, code: "caixa_fechado" });
    expect((await estado(lojaB, osB)).titulos).toHaveLength(0);
    expect((await estado(lojaA, osA)).titulos).toHaveLength(0);
  });

  it("técnico (edita OS mas não gera cobrança) e vendedor → sem_permissao, sem efeitos", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    try {
      for (const role of ["TECNICO", "VENDEDOR"]) {
        sessao.role = role;
        expect(await registrarRecebimentoMistoOSV3(storeId, osId, entrada({ sessaoId }))).toMatchObject({ ok: false, code: "sem_permissao" });
      }
    } finally {
      sessao.role = "ADMIN";
    }
    const s = await estado(storeId, osId);
    expect(s.titulos).toHaveLength(0);
    expect(s.caixa).toHaveLength(0);
  });

  it("OS cancelada → os_cancelada", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId, { status: "cancelada" });
    const r = await registrarRecebimentoMistoOSV3(storeId, osId, entrada({ pagamentosAgora: [], saldoAPrazo: { valor: 400, vencimento: VENC } }));
    expect(r).toMatchObject({ ok: false, code: "os_cancelada" });
  });
});

// ─── estorno ──────────────────────────────────────────────────────────────────

describe("PG · estorno do recebimento de 350", () => {
  it("reverte só o dinheiro; autorização de 50 não libera entrega com saldo 400", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    expect((await registrarRecebimentoMistoOSV3(storeId, osId, entrada({ sessaoId }))).ok).toBe(true);

    const est = await estornarRecebimentoOSV3(storeId, osId, { sessaoId, motivo: "QA" });
    expect(est.estornado).toBe(350);

    const s = await estado(storeId, osId);
    expect(s.historico.filter((e) => e.tipo === "estorno_pagamento").map((e) => e.valor)).toEqual([350]);
    expect(s.recebido).toBe(0);
    expect(s.saldo).toBe(400);
    expect(s.payload.aPrazoV3).toMatchObject({ valor: 50 });
    const decisao = guard(storeId, osId, s);
    expect(decisao.decisao).toBe("BLOCK_PENDING_BALANCE");
    const lido = await lerPagamentoOSV3(storeId, osId);
    expect(lido.saldo).toBe(400);
    expect(lido.aPrazo?.valor).toBe(50);
  });
});

// ─── recebimento canônico: identidade e atomicidade (R2/P1) ──────────────────

describe("PG · recebimento canônico com identidade da operação", () => {
  it("mesma operação simultânea e repetida → UMA baixa, UM caixa, UMA movimentação; outro conteúdo → conflito", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    const input = { valor: 100, forma: "pix" as const, sessaoId, operacaoId: opId() };

    const [a, b] = await Promise.all([receberOSV3(storeId, osId, input), receberOSV3(storeId, osId, input)]);
    expect([a.jaRegistrado, b.jaRegistrado].sort()).toEqual([false, true]);
    const original = a.jaRegistrado ? b : a;

    // Resposta "perdida": a tela reenvia a MESMA operação.
    const c = await receberOSV3(storeId, osId, input);
    expect(c).toMatchObject({ jaRegistrado: true, operacaoId: input.operacaoId, valorRecebido: 100, op: "parcial" });
    expect(c.recibo).toEqual(original.recibo);

    // Mesma chave com outro valor → conflito, sem efeito.
    await expect(receberOSV3(storeId, osId, { ...input, valor: 90 })).rejects.toThrow(/outros valores/);

    const s = await estado(storeId, osId);
    expect(s.historico.filter((e) => e.tipo === "pagamento").map((e) => e.valor)).toEqual([100]);
    expect(s.historico.find((e) => e.tipo === "pagamento")).toMatchObject({ loteId: input.operacaoId });
    expect(s.caixa.map((c) => c.valor)).toEqual([100]);
    expect(s.movs.map((m) => m.valor)).toEqual([100]);
    expect(s.recebido).toBe(100);
    expect(s.payload.timeline.filter((e: Payload) => e.tipo === "operacao_cobranca_gerada")).toHaveLength(1);
  });

  it("falha ao lançar o caixa → rollback total: nem título, nem baixa, nem movimentação, nem espelho", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    const payloadAntes = (await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId } })).payload;
    // Falha injetada no banco descartável, só para ESTA loja sintética.
    await prisma.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION qa_misto_falha_caixa() RETURNS trigger AS $$ BEGIN IF NEW."storeId" = '${storeId}' THEN RAISE EXCEPTION 'FALHA_INJETADA_CAIXA'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`,
    );
    await prisma.$executeRawUnsafe(`CREATE TRIGGER qa_misto_falha_caixa_trg BEFORE INSERT ON caixa_operacoes FOR EACH ROW EXECUTE FUNCTION qa_misto_falha_caixa()`);
    try {
      await expect(receberOSV3(storeId, osId, { valor: 100, forma: "pix", sessaoId })).rejects.toThrow(/FALHA_INJETADA_CAIXA/);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS qa_misto_falha_caixa_trg ON caixa_operacoes`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS qa_misto_falha_caixa()`);
    }
    await semEscrita(storeId, osId, payloadAntes);
  });
});

// ─── reenvio quando uma operação NOVA seria recusada antes da transação (R3/P1) ─

describe("PG · reenvio do misto com período fechado ou vencimento que virou passado", () => {
  it("período fechado depois do commit: a MESMA confirmação devolve o gravado; uma nova é recusada e conferida", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const input = entrada({ pagamentosAgora: [], saldoAPrazo: { valor: 400, vencimento: VENC }, saldoEsperado: 400 });
    expect((await registrarRecebimentoMistoOSV3(storeId, osId, input)).ok).toBe(true);

    const [ano, mes] = new Date().toISOString().slice(0, 7).split("-").map(Number);
    await prisma.fechamentoFinanceiro.create({
      data: { storeId, tipo: "mensal", dataReferencia: `${ano}-${String(mes).padStart(2, "0")}-01`, mes: mes!, ano: ano!, status: "fechado" },
    });

    // Resposta perdida + período fechado: o reenvio NÃO vira recusa (a tela não troca de chave).
    expect(await registrarRecebimentoMistoOSV3(storeId, osId, input)).toMatchObject({ ok: true, jaRegistrado: true, valorAPrazo: 400 });
    // Uma confirmação NOVA continua barrada — e a recusa diz que nada foi gravado com a chave.
    expect(await registrarRecebimentoMistoOSV3(storeId, osId, { ...input, operacaoId: opId() })).toMatchObject({
      ok: false,
      code: "periodo_fechado",
      naoRegistrada: true,
    });

    const s = await estado(storeId, osId);
    expect(s.historico.filter((e) => e.tipo === "a_prazo_autorizado")).toHaveLength(1);
    expect(s.payload.timeline.filter((e: Payload) => e.tipo === "financeiro_conta_receber_criada")).toHaveLength(1);
  });

  it("vencimento que virou passado: a MESMA confirmação ainda devolve o gravado; uma nova é recusada e conferida", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const input = entrada({ pagamentosAgora: [], saldoAPrazo: { valor: 400, vencimento: VENC }, saldoEsperado: 400 });
    expect((await registrarRecebimentoMistoOSV3(storeId, osId, input)).ok).toBe(true);

    // Só o relógio do processo avança para depois do vencimento (timers continuam reais).
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(Date.parse(`${VENC}T12:00:00.000Z`) + 2 * 86_400_000));
      expect(await registrarRecebimentoMistoOSV3(storeId, osId, input)).toMatchObject({ ok: true, jaRegistrado: true, valorAPrazo: 400 });
      expect(await registrarRecebimentoMistoOSV3(storeId, osId, { ...input, operacaoId: opId() })).toMatchObject({
        ok: false,
        code: "entrada_invalida",
        naoRegistrada: true,
      });
    } finally {
      vi.useRealTimers();
    }
    expect((await estado(storeId, osId)).historico.filter((e) => e.tipo === "a_prazo_autorizado")).toHaveLength(1);
  });
});
