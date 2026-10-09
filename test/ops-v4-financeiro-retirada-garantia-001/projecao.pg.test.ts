// @vitest-environment node
//
// OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — PostgreSQL REAL, local e descartável.
// Writers REAIS da V3 (receberOSV3, registrarEntregaV3) produzem o estado; o LEITOR
// REAL da projeção (lerProjecaoFinanceiraOSV4) lê do banco. Prova: (1) o caso da
// OS-2026-00025 nasce do writer atual e a leitura mostra os FATOS do título + a
// pendência comercial; (2) a leitura não escreve nada; (3) a decisão REAL de entrega
// do servidor continua a mesma. Identidade só no seam de sessão (stub de @/auth +
// gate ok). Ausência de ambiente = BLOQUEIO_EXPLICITO_PG (nunca skip). Massa sintética.
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "qa-frg", name: "Operador QA FRG", role: "ADMIN", storeAccess: "all" } })) }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: vi.fn(async () => ({ ok: true })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { receberOSV3 } from "@/lib/operacoes-v3/pdv-servico-actions";
import { registrarEntregaV3 } from "@/lib/operacoes-v3/entrega-actions";
import { gerarOperacaoIdV3 } from "@/lib/operacoes-v3/recebimento-misto-model";
import { localKeyContaReceberOSV3 } from "@/lib/operacoes-v3/payment-model";
import { lerProjecaoFinanceiraOSV4 } from "@/lib/operacoes-v4/financial-projection-actions";
import { afirmacaoValoresTituloV4, derivarSituacaoAtendimentoV4 } from "@/lib/operacoes-v4/situacao-atendimento-v4";
import { derivarRetiradaFinanceiraV4 } from "@/lib/operacoes-v4/retirada-fluxo-v4";
import { buildPdvView } from "@/components/operacoes-v4-preview/rails-adapter";
import type { OrdemServico } from "@/types/os";

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
let seq = 0;
type Payload = Record<string, any>;

afterAll(async () => {
  await prisma.$disconnect();
});

async function novaLoja(): Promise<string> {
  const id = `qa-frg-${SUFIXO}-${++seq}`;
  await prisma.store.create({ data: { id, name: `Loja QA FRG ${seq}` } });
  return id;
}

async function novaOS(storeId: string, orcStatus: "rascunho" | "aprovado"): Promise<string> {
  const n = ++seq;
  const id = `os-qa-frg-${SUFIXO}-${n}`;
  const codigo = `OS-QA-FRG-${n}`;
  await prisma.ordemServico.create({
    data: {
      id, storeId, numero: codigo, equipamento: "Samsung S20 FE", defeito: "Tela quebrada", status: "Pronto", valorTotal: 420,
      payload: {
        id, codigo, storeId, criadoEm: ENTRADA,
        cliente: { nome: `Cliente QA FRG ${n}` },
        equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "S20 FE", acessorios: ["Capa"] },
        status: "pronta", operacaoStatus: "pronta", operacaoStatusV3: "pronta", valorTotal: 420,
        orcamento: {
          id: `orc-${n}`, status: orcStatus, sintetizado: false, criadoEm: ENTRADA, ...(orcStatus === "aprovado" ? { respondidoEm: ENTRADA } : {}),
          servicos: [{ id: `srv-${n}`, descricao: "Troca de Tela", valor: 420 }], pecas: [], desconto: 0, total: 420,
        },
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

async function estadoBruto(storeId: string, osId: string) {
  const [os, titulos, caixa, movimentos, estoque] = await Promise.all([
    prisma.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { payload: true, status: true, valorTotal: true } }),
    prisma.contaReceberTitulo.findMany({ where: { storeId }, select: { id: true, status: true, valor: true, payload: true, localKey: true }, orderBy: { id: "asc" } }),
    prisma.caixaOperacao.count({ where: { storeId } }),
    prisma.movimentacaoFinanceira.count({ where: { storeId } }),
    prisma.movimentacaoEstoque.count({ where: { storeId } }),
  ]);
  return JSON.stringify({ os, titulos, caixa, movimentos, estoque });
}

describe("OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — PostgreSQL descartável", () => {
  it("A1: writer atual recebe sobre rascunho; a leitura mostra fatos + pendência comercial; a entrega segue bloqueada no servidor; ler não escreve", async () => {
    const sid = await novaLoja();
    const osId = await novaOS(sid, "rascunho");
    const sessaoId = await abrirCaixa(sid);
    const operacaoId = gerarOperacaoIdV3();
    await receberOSV3(sid, osId, { linhas: [{ forma: "dinheiro", valor: 420 }], sessaoId, operacaoId });

    const antes = await estadoBruto(sid, osId);
    const p = await lerProjecaoFinanceiraOSV4(sid, osId);
    expect(await estadoBruto(sid, osId)).toBe(antes);

    expect(p).toMatchObject({ financialStatus: "UNKNOWN", deliveryDecision: "BLOCK_UNKNOWN", receivedTotal: null, balance: null, canDeliver: false, canReceive: false });
    expect(p.fatos).toMatchObject({ tituloEncontrado: true, verificavel: true, valorTitulo: 420, recebidoLiquido: 420, saldoTitulo: 0, liquidado: true, semMeioIdentificado: 0 });
    expect(p.fatos?.meios).toEqual([{ label: "Dinheiro", valor: 420, operacaoId, fonte: "OS_TIMELINE" }]);
    expect(p.comercial).toMatchObject({ orcamento: "rascunho", confereComTitulo: true });
    expect(p.acoes?.impedimento).toEqual({ codigo: "APROVACAO_COMERCIAL_PENDENTE", destino: "comercial" });
    expect(p.financialEvents).toHaveLength(2);
    expect(p.historico).toHaveLength(1);
    expect(p.historico?.[0]).toMatchObject({ operacaoId, fontes: ["OS_TIMELINE", "RECEIVABLE"], valor: 420 });

    const s = derivarSituacaoAtendimentoV4({ osId, projection: p, loading: false, error: null });
    expect(s.pagamento.rotulo).toBe("Pagamento registrado — R$ 420,00");
    expect(s.comercial.pendente).toBe(true);

    // A decisão real do servidor não mudou: rascunho continua bloqueando a entrega.
    const antesEntrega = await estadoBruto(sid, osId);
    await expect(registrarEntregaV3(sid, osId, { recebidoPor: "Cliente QA" })).rejects.toThrow();
    expect(await estadoBruto(sid, osId)).toBe(antesEntrega);
  });

  it("A2: aprovado + pago pelo writer real → PAID e a entrega real continua permitida", async () => {
    const sid = await novaLoja();
    const osId = await novaOS(sid, "aprovado");
    const sessaoId = await abrirCaixa(sid);
    await receberOSV3(sid, osId, { linhas: [{ forma: "pix", valor: 420 }], sessaoId, operacaoId: gerarOperacaoIdV3() });
    const p = await lerProjecaoFinanceiraOSV4(sid, osId);
    expect(p).toMatchObject({ financialStatus: "PAID", receivedTotal: 420, balance: 0, canDeliver: true });
    expect(p.acoes?.impedimento).toBeNull();
    expect(p.fatos?.meios.map((m) => m.label)).toEqual(["Pix"]);
    await registrarEntregaV3(sid, osId, { recebidoPor: "Cliente QA" });
    const os = (await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId } })).payload as Payload;
    expect(os.operacaoStatusV3).toBe("entregue");
  });

  it("A3: título da chave canônica com OS divergente → vínculo inválido, nada de fatos, entrega bloqueada", async () => {
    const sid = await novaLoja();
    const osId = await novaOS(sid, "rascunho");
    await prisma.contaReceberTitulo.create({
      data: {
        storeId: sid, localKey: localKeyContaReceberOSV3(sid, osId), descricao: "OS QA", cliente: "Cliente QA", valor: 420,
        vencimento: "2026-10-05", status: "pago",
        payload: { ordemServicoId: "outra-os", historico: [{ tipo: "liquidacao", valor: 420 }] } as unknown as Prisma.InputJsonValue,
      },
    });
    const p = await lerProjecaoFinanceiraOSV4(sid, osId);
    expect(p).toMatchObject({ financialStatus: "INCONSISTENT", canDeliver: false });
    expect(p.fatos).toMatchObject({ verificavel: false, motivo: "TITULO_NAO_VINCULADO", recebidoLiquido: null });
    expect(p.acoes?.impedimento).toEqual({ codigo: "TITULO_NAO_VINCULADO", destino: "financeiro" });
    await expect(registrarEntregaV3(sid, osId, { recebidoPor: "Cliente QA" })).rejects.toThrow();
  });

  it("R3-P1: título de 420 com duas baixas de 300 lido do banco — fatos rejeitados, nenhuma superfície afirma recebido; decisão e escrita intactas", async () => {
    const sid = await novaLoja();
    const osId = await novaOS(sid, "aprovado");
    await prisma.contaReceberTitulo.create({
      data: {
        storeId: sid, localKey: localKeyContaReceberOSV3(sid, osId), descricao: "OS QA", cliente: "Cliente QA", valor: 420,
        vencimento: "2026-10-05", status: "pago",
        payload: { ordemServicoId: osId, historico: [{ tipo: "pagamento", valor: 300, loteId: "op-a" }, { tipo: "pagamento", valor: 300, loteId: "op-b" }] } as unknown as Prisma.InputJsonValue,
      },
    });
    const antes = await estadoBruto(sid, osId);
    const p = await lerProjecaoFinanceiraOSV4(sid, osId);
    expect(await estadoBruto(sid, osId)).toBe(antes);
    expect(p).toMatchObject({ financialStatus: "INCONSISTENT", receivedTotal: 600, canDeliver: false });
    expect(p.fatos).toMatchObject({ verificavel: false, motivo: "RECEBIDO_ACIMA_DO_TITULO", recebidoLiquido: null, saldoTitulo: null });
    const s = derivarSituacaoAtendimentoV4({ osId, projection: p, loading: false, error: null });
    expect(afirmacaoValoresTituloV4(s)).toBe("conferencia");
    expect(derivarRetiradaFinanceiraV4({ osId, projection: p, loading: false, error: null })).toMatchObject({ recebido: null, saldo: null, total: null, liberaEntrega: false });
    const os = (await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId } })).payload as unknown as OrdemServico;
    expect(buildPdvView([os], new Map([[osId, p]]), sid).itens[0]).toMatchObject({ statusFaturamento: "Em conferência", saldoLinha: "" });
    await expect(registrarEntregaV3(sid, osId, { recebidoPor: "Cliente QA" })).rejects.toThrow();
    expect(await estadoBruto(sid, osId)).toBe(antes);
  });

  it("R3-P2: split real Pix R$ 100 + Dinheiro R$ 320 pelo writer — cada meio com o próprio valor, nada atribuído a mais", async () => {
    const sid = await novaLoja();
    const osId = await novaOS(sid, "aprovado");
    const sessaoId = await abrirCaixa(sid);
    await receberOSV3(sid, osId, { linhas: [{ forma: "pix", valor: 100 }, { forma: "dinheiro", valor: 320 }], sessaoId, operacaoId: gerarOperacaoIdV3() });
    const p = await lerProjecaoFinanceiraOSV4(sid, osId);
    expect(p).toMatchObject({ financialStatus: "PAID", receivedTotal: 420 });
    expect(p.fatos).toMatchObject({ verificavel: true, semMeioIdentificado: 0 });
    const porMeio = Object.fromEntries((p.fatos?.meios ?? []).map((m) => [m.label, m.valor]));
    expect(porMeio).toEqual({ Pix: 100, Dinheiro: 320 });
    expect(derivarSituacaoAtendimentoV4({ osId, projection: p, loading: false, error: null }).pagamento.meio).toBe("Pix R$ 100,00 + Dinheiro R$ 320,00");
  });

  it("loja errada: a leitura é escopada pela loja — nunca devolve OS/título de outra loja", async () => {
    const a = await novaLoja();
    const b = await novaLoja();
    const osB = await novaOS(b, "aprovado");
    await expect(lerProjecaoFinanceiraOSV4(a, osB)).rejects.toThrow(/não encontrada/i);
  });
});
