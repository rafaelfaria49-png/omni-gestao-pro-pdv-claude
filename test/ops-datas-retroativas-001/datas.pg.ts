/**
 * OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001 — integração em PostgreSQL REAL (local, descartável).
 *
 * Só dados sintéticos (lojas `qa-datas-*`). Nenhum mock de persistência: as actions de
 * produção rodam contra o banco; só `@/auth` (sessão) e `next/cache` são simulados.
 * A permissão é a REAL (`requireEnterpriseWith` + matriz por papel).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sessao = vi.hoisted(() => ({
  id: "qa-datas-admin",
  name: "Operador QA Datas",
  role: "ADMIN",
  storeAccess: "all" as string,
  allowedStoreIds: [] as string[],
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { ...sessao } })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import type { Prisma } from "@/generated/prisma";
import type { OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { criarOSEnterpriseV3, criarOSPreOrcamentoV3 } from "@/lib/operacoes-v3/nova-os-actions";
import { novaOSDraftVazioV3, type NovaOSDraftV3 } from "@/lib/operacoes-v3/nova-os-model";
import { criarOrcamentoRapidoV3 } from "@/lib/operacoes-v3/orcamento-rapido-actions";
import { atualizarStatusComercialV3, converterOrcamentoEmOSV3, marcarOrcamentoPreOsV3 } from "@/lib/operacoes-v3/comercial-pre-os-actions";
import { aprovarOrcamentoV3, enviarOrcamentoV3, gerarOrcamentoDaOS, registrarEnvioOrcamento, salvarOrcamentoV3 } from "@/lib/operacoes-v3/orcamento-actions";
import { finalizarAtendimentoRapidoV3 } from "@/lib/operacoes-v3/atendimento-rapido-actions";
import { registrarEntregaV3 } from "@/lib/operacoes-v3/entrega-actions";
import { receberOSV3 } from "@/lib/operacoes-v3/pdv-servico-actions";
import { corrigirDatasOSV3 } from "@/lib/operacoes-v3/datas-correcao-actions";
import { esperadoCampoDataV3, type CorrecaoDatasInputV3 } from "@/lib/operacoes-v3/datas-correcao-model";
import { chaveLockRecebimentoMistoV3 } from "@/lib/operacoes-v3/recebimento-misto-service";
import { lerGarantiaV3 } from "@/lib/operacoes-v3/pos-venda-model";
import { lerRecepcaoV3 } from "@/lib/operacoes-v3/workspace-model";
import { montarDocumentoOSV3, montarTermoEntregaV3 } from "@/lib/operacoes-v3/print-model";
import { adaptEntrega, adaptOsHeader } from "@/components/operacoes-v4-preview/os-adapter";
import {
  fimDoDiaLojaIsoV3,
  formatarDataOperacionalV3,
  hojeNaLojaV3,
  lerDatasOSV3,
  montarDataOperacionalV3,
  somarDiasCivisV3,
  type DataOperacionalV3,
} from "@/lib/operacoes-v3/datas-operacionais-model";

// ─── ambiente: só PostgreSQL loopback descartável ─────────────────────────────

function exigirBancoDescartavel(): string {
  const urls = [process.env.OPS_DATAS_TEST_DATABASE_URL, process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => v?.trim() || "");
  if (urls.some((v) => !v)) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: configure OPS_DATAS_TEST_DATABASE_URL, DATABASE_URL e DIRECT_URL (iguais) no .env local.");
  }
  const parsed = urls.map((v) => new URL(v));
  if (parsed.some((u) => !["127.0.0.1", "localhost", "[::1]", "::1"].includes(u.hostname))) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: a integração só pode usar PostgreSQL em loopback.");
  }
  const alvo = (u: URL) => `${u.hostname}:${u.port}${u.pathname}`;
  if (parsed.some((u) => alvo(u) !== alvo(parsed[0]!))) throw new Error("BLOQUEIO_EXPLICITO_PG: as três URLs devem apontar para o MESMO banco.");
  if (!parsed[0]!.pathname.replace(/^\//, "").startsWith("ops_datas_qa")) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: o banco precisa ser o descartável ops_datas_qa*.");
  }
  return urls[0]!;
}
exigirBancoDescartavel();

// ─── massa sintética ──────────────────────────────────────────────────────────

const SUFIXO = Date.now().toString(36);
let seq = 0;
type Payload = Record<string, any>;

const HOJE = hojeNaLojaV3();
const dia = (n: number) => somarDiasCivisV3(HOJE, n);
function data(d: string, hora = ""): DataOperacionalV3 {
  const r = montarDataOperacionalV3({ dia: d, hora });
  if (!r.ok) throw new Error(r.mensagem);
  return r.valor;
}
const pertoDeAgora = (iso: string) => Math.abs(Date.parse(iso) - Date.now()) < 5 * 60_000;

async function novaLoja(): Promise<string> {
  const id = `qa-datas-${SUFIXO}-${++seq}`;
  await prisma.store.create({ data: { id, name: `Loja QA datas ${seq}` } });
  return id;
}

async function lerOS(osId: string): Promise<{ row: Awaited<ReturnType<typeof prisma.ordemServico.findUniqueOrThrow>>; p: Payload }> {
  const row = await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId } });
  return { row, p: row.payload as Payload };
}

async function contar(storeId: string) {
  const [clientes, ordens, caixa, titulos, movs, garantias] = await Promise.all([
    prisma.cliente.count({ where: { storeId } }),
    prisma.ordemServico.count({ where: { storeId } }),
    prisma.caixaOperacao.count({ where: { storeId } }),
    prisma.contaReceberTitulo.count({ where: { storeId } }),
    prisma.movimentacaoFinanceira.count({ where: { storeId } }),
    prisma.garantiaOrdemServico.count({ where: { storeId } }),
  ]);
  return { clientes, ordens, caixa, titulos, movs, garantias };
}

function draftBase(over: Partial<NovaOSDraftV3["recepcao"]> = {}): NovaOSDraftV3 {
  const base = novaOSDraftVazioV3();
  return {
    ...base,
    cliente: { nome: `Cliente QA ${++seq}`, tipo: "PF" },
    equipamento: { ...base.equipamento, marca: "Motorola", modelo: "G54" },
    problema: { defeitoRelatado: "Não liga" },
    recepcao: { ...base.recepcao, ...over },
  };
}

/** OS pronta com orçamento aprovado (100) e garantia prevista de 90 dias. */
async function novaOSPronta(storeId: string, entrada: DataOperacionalV3): Promise<string> {
  const n = ++seq;
  const row = await prisma.ordemServico.create({
    data: {
      storeId,
      numero: `OS-QA-${SUFIXO}-${n}`,
      equipamento: "Moto G",
      defeito: "Tela",
      valorTotal: 100,
      payload: {
        codigo: `OS-QA-${n}`,
        storeId,
        criadoEm: new Date().toISOString(),
        cliente: { nome: `Cliente QA ${n}` },
        equipamento: { tipo: "Smartphone", marca: "Moto", modelo: "G" },
        status: "pronta",
        operacaoStatusV3: "pronta",
        orcamento: { id: `orc-${n}`, status: "aprovado", pecas: [], servicos: [{ id: `s-${n}`, descricao: "Troca de tela", valor: 100 }], desconto: 0, total: 100, criadoEm: new Date().toISOString() },
        valorTotal: 100,
        garantia: { ativa: false, prazoDias: 90 },
        aberturaV3: {
          versao: 1,
          recepcao: { dataEntrada: entrada.iso, dataEntradaMeta: entrada.meta, origem: "balcao" },
          garantiaPrevista: { modelo: "tela", label: "Troca de Tela", prazoDias: 90 },
        },
        timeline: [{ id: `ev-${n}`, tipo: "criacao", autor: "QA", autorTipo: "usuario", conteudo: "OS criada.", criadoEm: new Date().toISOString() }],
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return row.id;
}

async function abrirCaixa(storeId: string): Promise<string> {
  const s = await prisma.sessaoCaixa.create({ data: { storeId, operador: "QA", status: "ABERTA" } });
  return s.id;
}

/** OS entregue retroativamente pelo caminho canônico (pagamento real em caixa QA). */
async function osEntregueRetroativa(storeId: string, entrada: DataOperacionalV3, entrega: DataOperacionalV3): Promise<string> {
  const osId = await novaOSPronta(storeId, entrada);
  const sessaoId = await abrirCaixa(storeId);
  await receberOSV3(storeId, osId, { valor: 100, forma: "dinheiro", sessaoId });
  await registrarEntregaV3(storeId, osId, { dataEntrega: entrega });
  return osId;
}

afterAll(async () => {
  await prisma.$disconnect();
});

// Usuário SINTÉTICO da sessão simulada (a política de Cadastros relê o usuário no banco).
// Senha não utilizável (não é hash): ninguém autentica com ele; só existe no banco QA.
beforeAll(async () => {
  await prisma.adminUser.upsert({
    where: { id: sessao.id },
    update: { active: true, role: "ADMIN" },
    create: { id: sessao.id, email: `${sessao.id}@qa.test`, name: sessao.name, password: `nao-utilizavel-${SUFIXO}`, role: "ADMIN" },
  });
});

// ─── D01–D07 · Nova OS ────────────────────────────────────────────────────────

describe("PG · Nova OS com entrada retroativa (D01–D04, D06)", () => {
  it("D01/D03: entrada de ontem só pelo dia — persistida com precisão; cadastro, timeline e numeração continuam de hoje", async () => {
    const storeId = await novaLoja();
    const entrada = data(dia(-1));
    const { os } = await criarOSEnterpriseV3(storeId, draftBase({ dataEntrada: entrada.iso, dataEntradaMeta: entrada.meta }));
    const { row, p } = await lerOS(os.id);
    expect(p.aberturaV3.recepcao.dataEntrada).toBe(entrada.iso);
    expect(p.aberturaV3.recepcao.dataEntradaMeta).toEqual({ precisao: "dia", dia: dia(-1) });
    expect(pertoDeAgora(row.createdAt.toISOString())).toBe(true);
    expect(pertoDeAgora(p.criadoEm)).toBe(true);
    expect(pertoDeAgora(p.aberturaV3.criadoEm)).toBe(true);
    expect(p.timeline.every((e: Payload) => pertoDeAgora(e.criadoEm))).toBe(true);
    expect(p.codigo).toMatch(new RegExp(`^OS-${HOJE.slice(0, 4)}-`));
    // Read-back: só o dia, sem horário inventado (V3 e V4 iguais).
    const datas = lerDatasOSV3(p);
    expect(datas.entrada).toMatchObject({ precisao: "dia", dia: dia(-1), origem: "informada" });
    expect(formatarDataOperacionalV3(datas.entrada)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(adaptOsHeader(p as OrdemServico).entrada).toBe(formatarDataOperacionalV3(datas.entrada));
    // D06: sem previsão informada → prazo interno automático, nunca promessa.
    expect(p.aberturaV3.recepcao.previsaoEntrega).toBeUndefined();
    expect(p.sla.origemV3).toBe("automatico");
    expect(adaptOsHeader(p as OrdemServico).previsao).toBe("Não informada");
    expect(adaptOsHeader(p as OrdemServico).prazoInterno).toMatch(/\(automático\)$/);
  });

  it("D02/D04: dez dias atrás com horário e outra virada de ano — round-trip exato; numeração não muda de ano", async () => {
    const storeId = await novaLoja();
    for (const [d, hora] of [[dia(-10), "09:45"], ["2025-12-31", "23:50"]] as const) {
      const entrada = data(d, hora);
      const { os } = await criarOSEnterpriseV3(storeId, draftBase({ dataEntrada: entrada.iso, dataEntradaMeta: entrada.meta }));
      const { p } = await lerOS(os.id);
      const lida = lerDatasOSV3(p).entrada!;
      expect(lida).toMatchObject({ iso: entrada.iso, precisao: "data_hora", dia: d });
      expect(formatarDataOperacionalV3(lida)).toContain(hora);
      expect(p.codigo).toMatch(new RegExp(`^OS-${HOJE.slice(0, 4)}-`));
    }
  });

  it("D07: previsão vencida de registro retroativo é aceita como informada e não muda sozinha", async () => {
    const storeId = await novaLoja();
    const entrada = data(dia(-10));
    const previsao = data(dia(-7), "18:00");
    const { os } = await criarOSEnterpriseV3(
      storeId,
      draftBase({ dataEntrada: entrada.iso, dataEntradaMeta: entrada.meta, previsaoEntrega: previsao.iso, previsaoEntregaMeta: previsao.meta }),
    );
    const { p } = await lerOS(os.id);
    expect(p.aberturaV3.recepcao).toMatchObject({ previsaoEntrega: previsao.iso, previsaoEntregaMeta: previsao.meta });
    expect(p.sla).toMatchObject({ prazo: previsao.iso, origemV3: "informada" });
    expect(adaptOsHeader(p as OrdemServico).previsaoVencida).toBe(true);
  });
});

describe("PG · D05 rejeição no servidor ANTES de qualquer efeito", () => {
  it("entrada futura, data impossível e previsão antes da entrada não criam cliente nem OS", async () => {
    const storeId = await novaLoja();
    const antes = await contar(storeId);
    const futura = data(dia(2));
    await expect(criarOSEnterpriseV3(storeId, draftBase({ dataEntrada: futura.iso, dataEntradaMeta: futura.meta }))).rejects.toThrow(/não pode ficar no futuro/);
    await expect(criarOSEnterpriseV3(storeId, draftBase({ dataEntrada: "2026-02-30T15:00:00.000Z" }))).rejects.toThrow(/data inválida/);
    const e = data(dia(-3));
    const p = data(dia(-4));
    await expect(
      criarOSEnterpriseV3(storeId, draftBase({ dataEntrada: e.iso, dataEntradaMeta: e.meta, previsaoEntrega: p.iso, previsaoEntregaMeta: p.meta })),
    ).rejects.toThrow(/não pode ser anterior/);
    expect(await contar(storeId)).toEqual(antes);
  });
});

// ─── D08–D10 · Orçamento ──────────────────────────────────────────────────────

const ORC_INPUT = {
  cliente: { modo: "novo" as const, nome: "Cliente Orçamento", telefone: "11999990000" },
  aparelho: { marca: "Samsung", modelo: "A54" },
  defeitoRelatado: "Tela quebrada",
  grupo: { rotulo: "ESCOLHA A TELA", variantes: [{ rotulo: "Original", valor: 400 }, { rotulo: "Paralela", valor: 250 }] },
};

describe("PG · Orçamento (D08–D10)", () => {
  it("D08/D10: proposta retroativa sem aparelho — sem entrada física; validade gravada; carimbo e envio não reiniciam nada", async () => {
    const storeId = await novaLoja();
    const proposta = data(dia(-24));
    const validoAteDia = dia(-17);
    const r = await criarOrcamentoRapidoV3(storeId, { ...ORC_INPUT, datas: { dataProposta: proposta, validoAteDia, entradaAparelho: null } });
    let { row, p } = await lerOS(r.osId);
    expect(p.aberturaV3.recepcao.dataEntrada).toBeUndefined();
    expect(lerDatasOSV3(p).semEntradaFisica).toBe(true);
    expect(adaptOsHeader(p as OrdemServico).entrada).toBe("Aparelho não está na loja");
    expect(p.comercialV4).toMatchObject({ tipo: "orcamento_pre_os", dataProposta: proposta.iso, dataPropostaMeta: proposta.meta, validadeDias: 7 });
    expect(p.orcamento.validoAte).toBe(fimDoDiaLojaIsoV3(validoAteDia));
    expect(p.orcamento.enviadoEm).toBeUndefined();
    expect(pertoDeAgora(row.createdAt.toISOString())).toBe(true);
    // O carimbo comercial (mesma chamada do modal) preserva a data da proposta.
    await marcarOrcamentoPreOsV3(storeId, r.osId, { origemAtendimento: "whatsapp", validadeDias: 7, statusComercial: "rascunho" });
    ({ p } = await lerOS(r.osId));
    expect(p.comercialV4.dataProposta).toBe(proposta.iso);
    // Envio REAL: enviadoEm é agora; a validade (já vencida) NÃO é prorrogada.
    await enviarOrcamentoV3(storeId, r.osId);
    ({ p } = await lerOS(r.osId));
    expect(pertoDeAgora(p.orcamento.enviadoEm)).toBe(true);
    expect(p.orcamento.validoAte).toBe(fimDoDiaLojaIsoV3(validoAteDia));
  });

  it("orçamento comum: o primeiro envio grava a validade no FIM do dia civil (hoje + 7), nunca agora + 7×24h", async () => {
    const storeId = await novaLoja();
    const { os } = await criarOSEnterpriseV3(storeId, draftBase());
    await gerarOrcamentoDaOS(storeId, os.id);
    await salvarOrcamentoV3(storeId, os.id, { servicos: [{ id: `s-${++seq}`, descricao: "Troca de tela", valor: 200 }], pecas: [], desconto: 0 });
    await enviarOrcamentoV3(storeId, os.id);
    const { p } = await lerOS(os.id);
    expect(p.orcamento.validoAte).toBe(fimDoDiaLojaIsoV3(somarDiasCivisV3(hojeNaLojaV3(), 7)));
    expect(pertoDeAgora(p.orcamento.enviadoEm)).toBe(true);
  });

  it("validade informada anterior à data do orçamento é recusada no servidor; válida é gravada no fim do dia civil", async () => {
    const storeId = await novaLoja();
    const proposta = data(dia(-5));
    const { os } = await criarOSPreOrcamentoV3(storeId, draftBase({ dataEntrada: "", dataEntradaMeta: undefined }), {
      comercialV4: { tipo: "orcamento_pre_os", statusComercial: "rascunho", dataProposta: proposta.iso, dataPropostaMeta: proposta.meta, validadeDias: 7 },
    });
    await gerarOrcamentoDaOS(storeId, os.id);
    const itens = { servicos: [{ id: `s-${++seq}`, descricao: "Troca de tela", valor: 200 }], pecas: [], desconto: 0 };
    await expect(salvarOrcamentoV3(storeId, os.id, { ...itens, validoAte: fimDoDiaLojaIsoV3(dia(-6)) })).rejects.toThrow(/não pode ser anterior à data do orçamento/);
    expect((await lerOS(os.id)).p.orcamento.validoAte).toBeUndefined();
    // Instante qualquer do dia vira o fim do dia civil (o "Válido até" é um dia).
    await salvarOrcamentoV3(storeId, os.id, { ...itens, validoAte: data(dia(2)).iso });
    expect((await lerOS(os.id)).p.orcamento.validoAte).toBe(fimDoDiaLojaIsoV3(dia(2)));
  });

  it("D09: com o aparelho na loja a entrada é gravada e a conversão em OS a preserva", async () => {
    const storeId = await novaLoja();
    const proposta = data(dia(-3));
    const entrada = data(dia(-2), "10:30");
    const r = await criarOrcamentoRapidoV3(storeId, { ...ORC_INPUT, datas: { dataProposta: proposta, validoAteDia: dia(4), entradaAparelho: entrada } });
    const { p } = await lerOS(r.osId);
    expect(p.aberturaV3.recepcao).toMatchObject({ dataEntrada: entrada.iso, dataEntradaMeta: entrada.meta });
    // Aprovação comercial (setup sintético) → conversão: a entrada informada no orçamento prevalece.
    await prisma.ordemServico.update({
      where: { id: r.osId },
      data: { payload: { ...p, comercialV4: { ...p.comercialV4, statusComercial: "aprovado" }, orcamento: { ...p.orcamento, status: "aprovado" } } as Prisma.InputJsonValue },
    });
    const outra = data(dia(-1));
    const previsao = data(dia(5));
    await converterOrcamentoEmOSV3(storeId, r.osId, { dataEntrada: outra, previsaoEntrega: previsao.iso, previsaoEntregaMeta: previsao.meta });
    const depois = (await lerOS(r.osId)).p;
    expect(depois.aberturaV3.recepcao).toMatchObject({ dataEntrada: entrada.iso, previsaoEntrega: previsao.iso, previsaoEntregaMeta: previsao.meta });
    expect(depois.comercialV4).toMatchObject({ statusComercial: "convertido", dataProposta: proposta.iso });
    // Previsão só-dia: o SLA vale até o fim do dia prometido (nunca a âncora 12:00).
    expect(depois.sla).toMatchObject({ prazo: fimDoDiaLojaIsoV3(dia(5)), origemV3: "informada" });
  });

  it("conversão × status/carimbo comercial simultâneos: em qualquer ordem a conversão nunca é revertida", async () => {
    const storeId = await novaLoja();
    const entrada = data(dia(-2), "10:30");
    const r = await criarOrcamentoRapidoV3(storeId, { ...ORC_INPUT, datas: { dataProposta: data(dia(-3)), validoAteDia: dia(4), entradaAparelho: entrada } });
    const { p } = await lerOS(r.osId);
    await prisma.ordemServico.update({
      where: { id: r.osId },
      data: { payload: { ...p, comercialV4: { ...p.comercialV4, statusComercial: "aprovado" }, orcamento: { ...p.orcamento, status: "aprovado" } } as Prisma.InputJsonValue },
    });
    const resultados = await Promise.allSettled([
      atualizarStatusComercialV3(storeId, r.osId, "aprovado"),
      converterOrcamentoEmOSV3(storeId, r.osId),
      marcarOrcamentoPreOsV3(storeId, r.osId, { origemAtendimento: "whatsapp", statusComercial: "aprovado" }),
    ]);
    expect(resultados.map((x) => x.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
    const depois = (await lerOS(r.osId)).p;
    expect(depois.comercialV4.statusComercial).toBe("convertido");
    expect(depois.aberturaV3.recepcao).toMatchObject({ dataEntrada: entrada.iso, dataEntradaMeta: entrada.meta });
    expect(depois.timeline.filter((e: Payload) => e.metadata?.evento === "orcamento_convertido_os")).toHaveLength(1);
  });

  it("writer de orçamento × conversão simultâneos: a conversão nunca é desfeita (o atrasado recebe conflito)", async () => {
    const storeId = await novaLoja();
    const entrada = data(dia(-2), "10:30");
    const r = await criarOrcamentoRapidoV3(storeId, { ...ORC_INPUT, datas: { dataProposta: data(dia(-3)), validoAteDia: dia(4), entradaAparelho: entrada } });
    const { p } = await lerOS(r.osId);
    await prisma.ordemServico.update({
      where: { id: r.osId },
      data: { payload: { ...p, comercialV4: { ...p.comercialV4, statusComercial: "aprovado" }, orcamento: { ...p.orcamento, status: "aprovado" } } as Prisma.InputJsonValue },
    });
    const [envio, conversao] = await Promise.allSettled([registrarEnvioOrcamento(storeId, r.osId, "whatsapp"), converterOrcamentoEmOSV3(storeId, r.osId)]);
    expect(conversao.status).toBe("fulfilled");
    if (envio.status === "rejected") expect(String((envio.reason as Error).message)).toMatch(/alterada por outra operação/);
    const depois = (await lerOS(r.osId)).p;
    expect(depois.comercialV4.statusComercial).toBe("convertido");
    expect(depois.timeline.filter((e: Payload) => e.metadata?.evento === "orcamento_convertido_os")).toHaveLength(1);
  });

  it("duas validades definidas em paralelo: só uma vence; a outra é recusada (sem 'última grava por cima')", async () => {
    const storeId = await novaLoja();
    const proposta = data(dia(-1));
    const { os } = await criarOSPreOrcamentoV3(storeId, draftBase({ dataEntrada: "", dataEntradaMeta: undefined }), {
      comercialV4: { tipo: "orcamento_pre_os", statusComercial: "rascunho", dataProposta: proposta.iso, dataPropostaMeta: proposta.meta, validadeDias: 7 },
    });
    await gerarOrcamentoDaOS(storeId, os.id);
    const itens = { servicos: [{ id: `s-${++seq}`, descricao: "Troca de tela", valor: 200 }], pecas: [], desconto: 0 };
    const resultados = await Promise.allSettled([
      salvarOrcamentoV3(storeId, os.id, { ...itens, validoAte: fimDoDiaLojaIsoV3(dia(5)) }),
      salvarOrcamentoV3(storeId, os.id, { ...itens, validoAte: fimDoDiaLojaIsoV3(dia(9)) }),
    ]);
    expect(resultados.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const recusa = resultados.find((x): x is PromiseRejectedResult => x.status === "rejected")!;
    expect(String((recusa.reason as Error).message)).toMatch(/alterada por outra operação|já foi definida/);
    const venc = (await lerOS(os.id)).p.orcamento.validoAte;
    expect([fimDoDiaLojaIsoV3(dia(5)), fimDoDiaLojaIsoV3(dia(9))]).toContain(venc);
  });

  it("orçamento da OS vencido: aprovação recusada; renovar o 'Válido até' pela correção auditada libera a aprovação", async () => {
    const storeId = await novaLoja();
    const { os } = await criarOSEnterpriseV3(storeId, draftBase());
    await gerarOrcamentoDaOS(storeId, os.id);
    await salvarOrcamentoV3(storeId, os.id, { servicos: [{ id: `s-${++seq}`, descricao: "Troca de tela", valor: 200 }], pecas: [], desconto: 0 });
    await enviarOrcamentoV3(storeId, os.id);
    // Setup sintético: a validade já passou.
    const { p } = await lerOS(os.id);
    const vencida = fimDoDiaLojaIsoV3(dia(-3));
    await prisma.ordemServico.update({ where: { id: os.id }, data: { payload: { ...p, orcamento: { ...p.orcamento, validoAte: vencida } } as Prisma.InputJsonValue } });
    await expect(aprovarOrcamentoV3(storeId, os.id)).rejects.toThrow(/venceu em .*Corrigir datas/);
    const renovada = { iso: fimDoDiaLojaIsoV3(dia(5)), meta: { precisao: "dia" as const, dia: dia(5) } };
    const r = await corrigirDatasOSV3(storeId, os.id, { alteracoes: { validoAte: renovada }, esperados: { validoAte: vencida }, motivo: "Cliente pediu mais prazo." });
    expect(r.ok).toBe(true);
    await aprovarOrcamentoV3(storeId, os.id);
    const final = (await lerOS(os.id)).p;
    expect(final.orcamento).toMatchObject({ status: "aprovado", validoAte: renovada.iso });
    // Orçamento da própria OS: a correção não cria registro comercial vazio.
    expect(final.comercialV4).toBeUndefined();
    expect(final.timeline.filter((e: Payload) => e.metadata?.evento === "datas_corrigidas")).toHaveLength(1);
  });

  it("status comercial não aceita data da proposta nem validade no 'extra' (só campos não temporais)", async () => {
    const storeId = await novaLoja();
    const proposta = data(dia(-3));
    const r = await criarOrcamentoRapidoV3(storeId, { ...ORC_INPUT, datas: { dataProposta: proposta, validoAteDia: dia(4), entradaAparelho: null } });
    await atualizarStatusComercialV3(storeId, r.osId, "enviado", {
      dataProposta: data(dia(5)).iso,
      validadeDias: 99,
      opcaoAprovadaRotulo: "Tela QA A",
    } as unknown as Parameters<typeof atualizarStatusComercialV3>[3]);
    const { p } = await lerOS(r.osId);
    expect(p.comercialV4).toMatchObject({ statusComercial: "enviado", dataProposta: proposta.iso, validadeDias: 7, opcaoAprovadaRotulo: "Tela QA A" });
  });

  it("R5: carimbo/status não convertem nem aprovam proposta vencida — 'convertido' só pela conversão (com entrada e evento)", async () => {
    const storeId = await novaLoja();
    // Registro retroativo de proposta já vencida (permitido, com aviso honesto).
    const r = await criarOrcamentoRapidoV3(storeId, { ...ORC_INPUT, datas: { dataProposta: data(dia(-10)), validoAteDia: dia(-3), entradaAparelho: null } });
    const antes = (await lerOS(r.osId)).p;
    expect(antes.comercialV4.statusComercial).not.toBe("aprovado");
    await expect(marcarOrcamentoPreOsV3(storeId, r.osId, { statusComercial: "aprovado" })).rejects.toThrow(/venceu em .*Corrigir datas/);
    await expect(atualizarStatusComercialV3(storeId, r.osId, "aprovado")).rejects.toThrow(/venceu em .*Corrigir datas/);
    await expect(atualizarStatusComercialV3(storeId, r.osId, "convertido")).rejects.toThrow(/Converter em OS/);
    await expect(marcarOrcamentoPreOsV3(storeId, r.osId, { statusComercial: "convertido" })).rejects.toThrow(/Converter em OS/);
    await expect(
      atualizarStatusComercialV3(storeId, r.osId, "qualquer" as unknown as Parameters<typeof atualizarStatusComercialV3>[2]),
    ).rejects.toThrow(/Status comercial inválido/);
    const depois = (await lerOS(r.osId)).p;
    expect(depois.comercialV4.statusComercial).toBe(antes.comercialV4.statusComercial);
    expect(depois.comercialV4.convertidoEm).toBeUndefined();
    expect(depois.timeline).toHaveLength(antes.timeline.length);
    // Carimbos legítimos continuam funcionando.
    await atualizarStatusComercialV3(storeId, r.osId, "enviado");
    expect((await lerOS(r.osId)).p.comercialV4.statusComercial).toBe("enviado");
  });

  it("D08: conversão sem entrada registrada exige a entrada real (nunca presume a data da proposta)", async () => {
    const storeId = await novaLoja();
    const r = await criarOrcamentoRapidoV3(storeId, { ...ORC_INPUT, datas: { dataProposta: data(dia(-5)), validoAteDia: dia(2), entradaAparelho: null } });
    const { p } = await lerOS(r.osId);
    await prisma.ordemServico.update({
      where: { id: r.osId },
      data: { payload: { ...p, comercialV4: { ...p.comercialV4, statusComercial: "aprovado" }, orcamento: { ...p.orcamento, status: "aprovado" } } as Prisma.InputJsonValue },
    });
    await expect(converterOrcamentoEmOSV3(storeId, r.osId, {})).rejects.toThrow(/Informe a data de entrada do aparelho/);
    expect((await lerOS(r.osId)).p.comercialV4.statusComercial).toBe("aprovado");
    const real = data(dia(-1), "16:00");
    await converterOrcamentoEmOSV3(storeId, r.osId, { dataEntrada: real });
    const depois = (await lerOS(r.osId)).p;
    expect(depois.aberturaV3.recepcao).toMatchObject({ dataEntrada: real.iso, dataEntradaMeta: real.meta });
    expect(depois.comercialV4.statusComercial).toBe("convertido");
  });

  it("R4: previsão já gravada antes da entrada informada na conversão é recusada — pede a nova previsão; com ela, converte", async () => {
    const storeId = await novaLoja();
    const r = await criarOrcamentoRapidoV3(storeId, { ...ORC_INPUT, datas: { dataProposta: data(dia(-10)), validoAteDia: dia(2), entradaAparelho: null } });
    const { p } = await lerOS(r.osId);
    const antiga = data(dia(-8));
    // Setup sintético: pré-OS aprovada com uma previsão persistida (só-dia) e sem entrada registrada.
    await prisma.ordemServico.update({
      where: { id: r.osId },
      data: {
        payload: {
          ...p,
          aberturaV3: { ...p.aberturaV3, recepcao: { ...p.aberturaV3?.recepcao, previsaoEntrega: antiga.iso, previsaoEntregaMeta: antiga.meta } },
          comercialV4: { ...p.comercialV4, statusComercial: "aprovado" },
          orcamento: { ...p.orcamento, status: "aprovado" },
        } as Prisma.InputJsonValue,
      },
    });
    const entrada = data(dia(-5));
    await expect(converterOrcamentoEmOSV3(storeId, r.osId, { dataEntrada: entrada })).rejects.toThrow(/Informe a nova previsão de entrega/);
    const intacta = (await lerOS(r.osId)).p;
    expect(intacta.comercialV4.statusComercial).toBe("aprovado");
    expect(intacta.aberturaV3.recepcao).toMatchObject({ previsaoEntrega: antiga.iso });
    expect(intacta.aberturaV3.recepcao.dataEntrada).toBeUndefined();
    const nova = data(dia(3));
    await converterOrcamentoEmOSV3(storeId, r.osId, { dataEntrada: entrada, previsaoEntrega: nova.iso, previsaoEntregaMeta: nova.meta });
    const depois = (await lerOS(r.osId)).p;
    expect(depois.aberturaV3.recepcao).toMatchObject({ dataEntrada: entrada.iso, previsaoEntrega: nova.iso, previsaoEntregaMeta: nova.meta });
    expect(depois.comercialV4.statusComercial).toBe("convertido");
  });
});

/** Fluxo real da janela: o 1º envio devolve o impacto na garantia; a confirmação leva a assinatura dele. */
async function corrigirConfirmandoGarantia(storeId: string, osId: string, input: CorrecaoDatasInputV3) {
  const previa = await corrigirDatasOSV3(storeId, osId, { ...input, confirmarImpactoGarantia: false });
  if (previa.ok || previa.tipo !== "confirmacao") return previa;
  return corrigirDatasOSV3(storeId, osId, { ...input, confirmarImpactoGarantia: true, assinaturaImpactoGarantia: previa.garantia?.assinatura });
}

// ─── D11–D12 · Atendimento rápido ─────────────────────────────────────────────

describe("PG · Atendimento rápido retroativo (D11/D12)", () => {
  it("D11: serviço de 5 dias atrás — recebimento agora no caixa atual; auditoria de agora; datas efetivas preservadas", async () => {
    const storeId = await novaLoja();
    const sessaoId = await abrirCaixa(storeId);
    const servico = data(dia(-5));
    const r = await finalizarAtendimentoRapidoV3(storeId, {
      cliente: { modo: "balcao" },
      servico: { nome: "Instalação de película", valor: 20 },
      formaPagamento: "pix",
      dataEntrada: servico.iso,
      dataEntradaMeta: servico.meta,
      dataConclusao: servico.iso,
      dataConclusaoMeta: servico.meta,
    });
    const { p } = await lerOS(r.osId);
    expect(p.atendimentoRapidoV3).toMatchObject({ concluidoEm: servico.iso, concluidoEmMeta: servico.meta });
    expect(pertoDeAgora(p.atendimentoRapidoV3.registradoEm)).toBe(true);
    expect(p.entregueEm).toBe(servico.iso);
    expect(p.aberturaV3.recepcao).toMatchObject({ dataEntrada: servico.iso, dataEntradaMeta: servico.meta });
    // Auditoria: nenhum evento retrodatado; a data efetiva vai em campo próprio.
    expect(p.timeline.every((e: Payload) => pertoDeAgora(e.criadoEm))).toBe(true);
    const conclusao = p.timeline.find((e: Payload) => e.metadata?.atendimentoRapido === true && e.metadata?.para === "entregue");
    expect(conclusao.metadata.concluidoEm).toBe(servico.iso);
    // Dinheiro: na sessão ABERTA atual, com o horário real.
    const caixa = await prisma.caixaOperacao.findMany({ where: { storeId } });
    expect(caixa).toHaveLength(1);
    expect(caixa[0]!.sessaoId).toBe(sessaoId);
    expect(caixa[0]!.valor).toBe(20);
    expect(pertoDeAgora(caixa[0]!.at.toISOString())).toBe(true);
  });

  it("D11: data futura no atendimento é recusada antes de caixa, cliente ou OS", async () => {
    const storeId = await novaLoja();
    await abrirCaixa(storeId);
    const antes = await contar(storeId);
    const futura = data(dia(3));
    await expect(
      finalizarAtendimentoRapidoV3(storeId, {
        cliente: { modo: "balcao" },
        servico: { nome: "Película", valor: 20 },
        formaPagamento: "pix",
        dataEntrada: futura.iso,
        dataEntradaMeta: futura.meta,
        dataConclusao: futura.iso,
        dataConclusaoMeta: futura.meta,
      }),
    ).rejects.toThrow(/não pode ficar no futuro/);
    expect(await contar(storeId)).toEqual(antes);
  });

  it("D12: corrigir datas do atendimento NÃO recebe, NÃO cria título, NÃO move estoque, NÃO entrega de novo", async () => {
    const storeId = await novaLoja();
    await abrirCaixa(storeId);
    const servico = data(dia(-5));
    const r = await finalizarAtendimentoRapidoV3(storeId, {
      cliente: { modo: "balcao" },
      servico: { nome: "Película", valor: 20 },
      formaPagamento: "dinheiro",
      dataEntrada: servico.iso,
      dataEntradaMeta: servico.meta,
      dataConclusao: servico.iso,
      dataConclusaoMeta: servico.meta,
    });
    const antes = await contar(storeId);
    const tituloAntes = await prisma.contaReceberTitulo.findFirstOrThrow({ where: { storeId } });
    const nova = data(dia(-6), "11:00");
    const res = await corrigirConfirmandoGarantia(storeId, r.osId, {
      alteracoes: { dataEntrega: nova, dataEntrada: nova },
      esperados: { dataEntrega: esperadoCampoDataV3(servico.iso, servico.meta.precisao), dataEntrada: esperadoCampoDataV3(servico.iso, servico.meta.precisao) },
      motivo: "Atendimento foi na véspera.",
    });
    expect(res.ok).toBe(true);
    expect(await contar(storeId)).toEqual(antes);
    const tituloDepois = await prisma.contaReceberTitulo.findFirstOrThrow({ where: { storeId } });
    expect(tituloDepois.payload).toEqual(tituloAntes.payload);
    expect(tituloDepois.updatedAt.toISOString()).toBe(tituloAntes.updatedAt.toISOString());
    const { p } = await lerOS(r.osId);
    expect(p.atendimentoRapidoV3).toMatchObject({ concluidoEm: nova.iso, concluidoEmMeta: nova.meta });
    expect(p.status).toBe("entregue");
    expect(p.timeline.filter((e: Payload) => e.metadata?.evento === "datas_corrigidas")).toHaveLength(1);
  });
});

// ─── D13–D15 · Entrega, correção e garantia ───────────────────────────────────

describe("PG · Entrega retroativa e correção (D13–D15)", () => {
  it("D13: entrega com data efetiva — espelhos coerentes, registro e evento de agora, garantia no marco correto", async () => {
    const storeId = await novaLoja();
    const entrega = data(dia(-2));
    const osId = await osEntregueRetroativa(storeId, data(dia(-9)), entrega);
    const { p } = await lerOS(osId);
    expect(p.status).toBe("entregue");
    expect(p.entregueEm).toBe(entrega.iso);
    expect(p.retirada.retiradoEm).toBe(entrega.iso);
    expect(p.entregaV3).toMatchObject({ entregueEm: entrega.iso, entregueEmMeta: entrega.meta });
    expect(pertoDeAgora(p.entregaV3.registradoEm)).toBe(true);
    const ev = p.timeline.find((e: Payload) => e.tipo === "entrega_cliente");
    expect(pertoDeAgora(ev.criadoEm)).toBe(true);
    expect(ev.metadata).toMatchObject({ entregueEm: entrega.iso, entregaRetroativa: true, precisao: "dia" });
    const g = lerGarantiaV3(p as OrdemServico);
    expect(g).toMatchObject({ situacao: "ativa", inicio: entrega.iso, prazoDias: 90 });
    // Documentos e telas leem a data efetiva; emissão continua sendo agora.
    expect(montarTermoEntregaV3(p as OrdemServico).dataEntregaTexto).toBe(formatarDataOperacionalV3(lerDatasOSV3(p).entrega));
    expect(adaptEntrega(p as OrdemServico).retiradoEm).toBe(formatarDataOperacionalV3(lerDatasOSV3(p).entrega));
  });

  it("D05/D13: entrega antes da entrada é recusada pelo servidor — OS continua pronta, sem efeitos", async () => {
    const storeId = await novaLoja();
    const osId = await novaOSPronta(storeId, data(dia(-3)));
    const sessaoId = await abrirCaixa(storeId);
    await receberOSV3(storeId, osId, { valor: 100, forma: "dinheiro", sessaoId });
    const antes = await lerOS(osId);
    await expect(registrarEntregaV3(storeId, osId, { dataEntrega: data(dia(-5)) })).rejects.toThrow(/não pode ser anterior à entrada/);
    const depois = await lerOS(osId);
    expect(depois.p).toEqual(antes.p);
  });

  it("D14/D15: corrigir a entrega — auditoria completa, nenhuma 2ª entrega; garantia ATIVA deslocada; encerrada intacta; sem garantia nova", async () => {
    const storeId = await novaLoja();
    const entrega = data(dia(-2), "16:00");
    const osId = await osEntregueRetroativa(storeId, data(dia(-9)), entrega);
    // Garantia V2 ancorada na entrega (como o motor V2 gravaria) + uma linha cancelada.
    const fim = new Date(Date.parse(entrega.iso) + 90 * 86_400_000);
    const ativa = await prisma.garantiaOrdemServico.create({
      data: { storeId, ordemServicoId: osId, prazoDias: 90, cobertura: "Tela", dataInicio: new Date(entrega.iso), dataFim: fim, status: "ativa" },
    });
    const cancelada = await prisma.garantiaOrdemServico.create({
      data: { storeId, ordemServicoId: osId, prazoDias: 90, cobertura: "Antiga", dataInicio: new Date(entrega.iso), dataFim: fim, status: "cancelada" },
    });
    const antes = await contar(storeId);
    const { p: pAntes } = await lerOS(osId);
    const nova = data(dia(-3), "16:00");

    // Sem confirmação explícita do impacto na garantia: nada é gravado.
    const sem = await corrigirDatasOSV3(storeId, osId, { alteracoes: { dataEntrega: nova }, esperados: { dataEntrega: esperadoCampoDataV3(entrega.iso, entrega.meta.precisao) }, motivo: "Entregue um dia antes." });
    expect(sem).toMatchObject({ ok: false, tipo: "confirmacao" });
    expect((await lerOS(osId)).p).toEqual(pAntes);

    // Confirmação "solta" (sem a assinatura do impacto exibido) não vale no servidor.
    const pedido = {
      alteracoes: { dataEntrega: nova },
      esperados: { dataEntrega: esperadoCampoDataV3(entrega.iso, entrega.meta.precisao) },
      motivo: "Entregue um dia antes.",
      confirmarImpactoGarantia: true,
    };
    const solta = await corrigirDatasOSV3(storeId, osId, { ...pedido, assinaturaImpactoGarantia: "impacto-que-o-operador-nao-viu" });
    expect(solta).toMatchObject({ ok: false, tipo: "confirmacao" });
    expect((await lerOS(osId)).p).toEqual(pAntes);
    const assinatura = sem.ok ? undefined : sem.garantia?.assinatura;
    expect(assinatura).toBeTruthy();
    const ok = await corrigirDatasOSV3(storeId, osId, { ...pedido, assinaturaImpactoGarantia: assinatura });
    expect(ok.ok).toBe(true);
    const { p } = await lerOS(osId);
    expect(p.entregaV3).toMatchObject({ entregueEm: nova.iso, entregueEmMeta: nova.meta });
    expect(p.entregaV3.registradoEm).toBe(pAntes.entregaV3.registradoEm);
    expect(p.retirada.retiradoEm).toBe(nova.iso);
    expect(p.timeline.filter((e: Payload) => e.tipo === "entrega_cliente")).toHaveLength(1);
    const audit = p.timeline.filter((e: Payload) => e.metadata?.evento === "datas_corrigidas");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ autor: "Operador QA Datas" });
    expect(pertoDeAgora(audit[0].criadoEm)).toBe(true);
    expect(audit[0].metadata).toMatchObject({
      motivo: "Entregue um dia antes.",
      operadorId: "qa-datas-admin",
      campos: [{ campo: "dataEntrega", antes: entrega.iso, depois: nova.iso }],
    });
    expect(pAntes.pagamentoV3).toBeTruthy();
    expect(p.pagamentoV3).toEqual(pAntes.pagamentoV3);
    // Nada financeiro/estoque/garantia novo.
    expect(await contar(storeId)).toEqual(antes);
    const ativaDepois = await prisma.garantiaOrdemServico.findUniqueOrThrow({ where: { id: ativa.id } });
    expect(ativaDepois.dataInicio.toISOString()).toBe(nova.iso);
    expect(ativaDepois.dataFim.getTime()).toBe(fim.getTime() - 86_400_000);
    expect(ativaDepois.status).toBe("ativa");
    const canceladaDepois = await prisma.garantiaOrdemServico.findUniqueOrThrow({ where: { id: cancelada.id } });
    expect(canceladaDepois.dataInicio.toISOString()).toBe(entrega.iso);
    expect(canceladaDepois.status).toBe("cancelada");
    // Garantia V3 derivada acompanha a entrega corrigida (sem reiniciar em hoje).
    expect(lerGarantiaV3(p as OrdemServico).inicio).toBe(nova.iso);
  });

  it("D15: retorno 'em garantia' que ficaria fora do novo período impede a correção — nada é gravado", async () => {
    const storeId = await novaLoja();
    const entrega = data(dia(-2));
    const osId = await osEntregueRetroativa(storeId, data(dia(-200)), entrega);
    const { p: base } = await lerOS(osId);
    const retorno = { id: "ret-1", osOriginalId: osId, motivo: "Tela piscando", criadoEm: new Date().toISOString(), status: "aberto", garantiaAtivaNaAbertura: true };
    await prisma.ordemServico.update({ where: { id: osId }, data: { payload: { ...base, retornosV3: [retorno] } as Prisma.InputJsonValue } });
    const { p: pAntes } = await lerOS(osId);
    const r = await corrigirDatasOSV3(storeId, osId, {
      alteracoes: { dataEntrega: data(dia(-150)) },
      esperados: { dataEntrega: esperadoCampoDataV3(entrega.iso, entrega.meta.precisao) },
      motivo: "Data errada",
      confirmarImpactoGarantia: true,
    });
    expect(r).toMatchObject({ ok: false, tipo: "impedimento" });
    expect((await lerOS(osId)).p).toEqual(pAntes);
  });
});

// ─── D16–D18 · Concorrência e permissão ───────────────────────────────────────

async function esperarEsperasAdvisory(n: number): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = 'advisory'`;
    if (Number(rows[0]?.n ?? 0) >= n) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timeout esperando ${n} sessão(ões) na trava advisory`);
}

/** Espera `n` sessões bloqueadas em trava de LINHA (outra transação segurando a linha). */
async function esperarEsperasDeLinha(n: number): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event IN ('transactionid', 'tuple')`;
    if (Number(rows[0]?.n ?? 0) >= n) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timeout esperando ${n} sessão(ões) em trava de linha`);
}

describe("PG · Concorrência (D16/D17)", () => {
  it("D16: correção de datas × recebimento na MESMA OS — ambos gravados, nenhum lost update", async () => {
    const storeId = await novaLoja();
    const entrada = data(dia(-6));
    const osId = await novaOSPronta(storeId, entrada);
    const sessaoId = await abrirCaixa(storeId);
    // Segura a MESMA trava por OS para forçar os dois writers a disputarem.
    let liberar!: () => void;
    const segurando = new Promise<void>((r) => (liberar = r));
    let travou!: () => void;
    const travado = new Promise<void>((r) => (travou = r));
    const t0 = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${chaveLockRecebimentoMistoV3(storeId, osId)}))::text AS lock`;
        travou();
        await segurando;
      },
      { maxWait: 5_000, timeout: 30_000 },
    );
    await travado;
    const nova = data(dia(-8));
    const pagar = receberOSV3(storeId, osId, { valor: 40, forma: "dinheiro", sessaoId });
    const corrigir = corrigirDatasOSV3(storeId, osId, {
      alteracoes: { dataEntrada: nova },
      esperados: { dataEntrada: esperadoCampoDataV3(entrada.iso, entrada.meta.precisao) },
      motivo: "Entrada real foi antes.",
    });
    await esperarEsperasAdvisory(2);
    liberar();
    await t0;
    const [rPagar, rCorrigir] = await Promise.all([pagar, corrigir]);
    expect(rPagar.valorRecebido).toBe(40);
    expect(rCorrigir.ok).toBe(true);
    const { p } = await lerOS(osId);
    expect(p.pagamentoV3).toMatchObject({ recebido: 40, saldo: 60 });
    expect(p.aberturaV3.recepcao).toMatchObject({ dataEntrada: nova.iso, dataEntradaMeta: nova.meta });
    const eventos = p.timeline.map((e: Payload) => e.metadata?.evento ?? e.tipo);
    expect(eventos).toContain("datas_corrigidas");
    expect(p.timeline.length).toBeGreaterThanOrEqual(3);
  });

  it("D17: dois operadores corrigem a mesma data com o mesmo snapshot — o segundo recebe conflito", async () => {
    const storeId = await novaLoja();
    const entrada = data(dia(-6));
    const osId = await novaOSPronta(storeId, entrada);
    const [a, b] = await Promise.all([
      corrigirDatasOSV3(storeId, osId, { alteracoes: { dataEntrada: data(dia(-7)) }, esperados: { dataEntrada: esperadoCampoDataV3(entrada.iso, entrada.meta.precisao) }, motivo: "Operador A" }),
      corrigirDatasOSV3(storeId, osId, { alteracoes: { dataEntrada: data(dia(-8)) }, esperados: { dataEntrada: esperadoCampoDataV3(entrada.iso, entrada.meta.precisao) }, motivo: "Operador B" }),
    ]);
    const resultados = [a, b];
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    const conflito = resultados.find((r) => !r.ok)!;
    expect(conflito).toMatchObject({ ok: false, tipo: "conflito", campo: "dataEntrada" });
    const { p } = await lerOS(osId);
    expect(p.timeline.filter((e: Payload) => e.metadata?.evento === "datas_corrigidas")).toHaveLength(1);
  });

  it("entregas simultâneas com datas diferentes: uma entrega, a outra recebe conflito; efeitos e eventos uma única vez", async () => {
    const storeId = await novaLoja();
    const osId = await novaOSPronta(storeId, data(dia(-9)));
    const sessaoId = await abrirCaixa(storeId);
    await receberOSV3(storeId, osId, { valor: 100, forma: "dinheiro", sessaoId });
    const caixaAntes = await prisma.caixaOperacao.count({ where: { storeId } });
    const resultados = await Promise.allSettled([
      registrarEntregaV3(storeId, osId, { dataEntrega: data(dia(-3)) }),
      registrarEntregaV3(storeId, osId, { dataEntrega: data(dia(-2)) }),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const recusada = resultados.find((r): r is PromiseRejectedResult => r.status === "rejected")!;
    expect(String((recusada.reason as Error).message)).toMatch(/já foi entregue em .*Corrigir datas/);
    const { p } = await lerOS(osId);
    expect(p.status).toBe("entregue");
    expect(p.timeline.filter((e: Payload) => e.tipo === "entrega_cliente")).toHaveLength(1);
    expect([dia(-3), dia(-2)]).toContain(p.entregaV3.entregueEmMeta.dia);
    expect(p.entregueEm).toBe(p.entregaV3.entregueEm);
    expect(p.retirada.retiradoEm).toBe(p.entregaV3.entregueEm);
    expect(await prisma.caixaOperacao.count({ where: { storeId } })).toBe(caixaAntes);
  });

  it("duplo clique com a MESMA data: no-op idempotente — uma única entrega e um único evento", async () => {
    const storeId = await novaLoja();
    const osId = await novaOSPronta(storeId, data(dia(-9)));
    const sessaoId = await abrirCaixa(storeId);
    await receberOSV3(storeId, osId, { valor: 100, forma: "dinheiro", sessaoId });
    const resultados = await Promise.allSettled([
      registrarEntregaV3(storeId, osId, { dataEntrega: data(dia(-3)) }),
      registrarEntregaV3(storeId, osId, { dataEntrega: data(dia(-3)) }),
    ]);
    expect(resultados.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    const { p } = await lerOS(osId);
    expect(p.timeline.filter((e: Payload) => e.tipo === "entrega_cliente")).toHaveLength(1);
    expect(p.entregaV3.entregueEmMeta).toEqual({ precisao: "dia", dia: dia(-3) });
  });

  it("R5: writer de garantia fora da trava da OS — a correção espera a linha (FOR UPDATE), relê e nunca grava cobertura antiga", async () => {
    const storeId = await novaLoja();
    const entrega = data(dia(-2), "16:00");
    const osId = await osEntregueRetroativa(storeId, data(dia(-9)), entrega);
    const fim = new Date(Date.parse(entrega.iso) + 90 * 86_400_000);
    const ativa = await prisma.garantiaOrdemServico.create({
      data: { storeId, ordemServicoId: osId, prazoDias: 90, cobertura: "Tela", dataInicio: new Date(entrega.iso), dataFim: fim, status: "ativa" },
    });
    const nova = data(dia(-3), "16:00");
    const pedido = {
      alteracoes: { dataEntrega: nova },
      esperados: { dataEntrega: esperadoCampoDataV3(entrega.iso, entrega.meta.precisao) },
      motivo: "Entregue um dia antes.",
    };
    // O operador vê o impacto com a cobertura atual.
    const previa = await corrigirDatasOSV3(storeId, osId, pedido);
    expect(previa).toMatchObject({ ok: false, tipo: "confirmacao" });
    const assinaturaVista = previa.ok ? "" : previa.garantia!.assinatura;
    // Writer legado (sem a trava por OS) estende a cobertura e segura a linha.
    const fimLegado = new Date(fim.getTime() + 30 * 86_400_000);
    let liberar!: () => void;
    const segurando = new Promise<void>((r) => (liberar = r));
    let travou!: () => void;
    const travado = new Promise<void>((r) => (travou = r));
    const legado = prisma.$transaction(
      async (tx) => {
        await tx.garantiaOrdemServico.update({ where: { id: ativa.id }, data: { dataFim: fimLegado } });
        travou();
        await segurando;
      },
      { maxWait: 5_000, timeout: 30_000 },
    );
    await travado;
    const corrigir = corrigirDatasOSV3(storeId, osId, { ...pedido, confirmarImpactoGarantia: true, assinaturaImpactoGarantia: assinaturaVista });
    await esperarEsperasDeLinha(1);
    liberar();
    await legado;
    // Releu a linha depois do commit do legado: o impacto confirmado já não é o atual.
    const r = await corrigir;
    expect(r).toMatchObject({ ok: false, tipo: "confirmacao" });
    if (r.ok) return;
    expect(r.garantia?.linhas[0]?.dataFimAntes).toBe(fimLegado.toISOString());
    const intacta = await prisma.garantiaOrdemServico.findUniqueOrThrow({ where: { id: ativa.id } });
    expect(intacta.dataFim.getTime()).toBe(fimLegado.getTime());
    expect(intacta.dataInicio.toISOString()).toBe(entrega.iso);
    // Confirmando o impacto atualizado: desloca a partir da cobertura NOVA (sem lost update).
    const ok = await corrigirDatasOSV3(storeId, osId, { ...pedido, confirmarImpactoGarantia: true, assinaturaImpactoGarantia: r.garantia!.assinatura });
    expect(ok.ok).toBe(true);
    const depois = await prisma.garantiaOrdemServico.findUniqueOrThrow({ where: { id: ativa.id } });
    expect(depois.dataInicio.toISOString()).toBe(nova.iso);
    expect(depois.dataFim.getTime()).toBe(fimLegado.getTime() - 86_400_000);
  });
});

describe("PG · Permissão e isolamento por loja (D18)", () => {
  it("papel sem editarOs/entregarOs não corrige datas nem entrega; OS de outra loja não é encontrada", async () => {
    const lojaA = await novaLoja();
    const lojaB = await novaLoja();
    const entrada = data(dia(-4));
    const osA = await novaOSPronta(lojaA, entrada);
    const { p: pAntes } = await lerOS(osA);
    try {
      sessao.role = "CAIXA";
      await expect(
        corrigirDatasOSV3(lojaA, osA, { alteracoes: { dataEntrada: data(dia(-5)) }, esperados: { dataEntrada: esperadoCampoDataV3(entrada.iso, entrada.meta.precisao) }, motivo: "Sem permissão" }),
      ).rejects.toThrow(/Sem permissão/);
      await expect(registrarEntregaV3(lojaA, osA, { dataEntrega: data(dia(-1)) })).rejects.toThrow(/Sem permissão/);
      sessao.role = "ADMIN";
      sessao.storeAccess = "restricted";
      sessao.allowedStoreIds = [lojaB];
      await expect(
        corrigirDatasOSV3(lojaA, osA, { alteracoes: { dataEntrada: data(dia(-5)) }, esperados: { dataEntrada: esperadoCampoDataV3(entrada.iso, entrada.meta.precisao) }, motivo: "Outra loja" }),
      ).rejects.toThrow(/Sem permissão para esta unidade/);
      sessao.storeAccess = "all";
      sessao.allowedStoreIds = [];
      const cruzada = await corrigirDatasOSV3(lojaB, osA, { alteracoes: { dataEntrada: data(dia(-5)) }, esperados: { dataEntrada: esperadoCampoDataV3(entrada.iso, entrada.meta.precisao) }, motivo: "Loja errada" });
      expect(cruzada).toMatchObject({ ok: false, mensagem: "OS não encontrada." });
    } finally {
      sessao.role = "ADMIN";
      sessao.storeAccess = "all";
      sessao.allowedStoreIds = [];
    }
    expect((await lerOS(osA)).p).toEqual(pAntes);
  });
});

// ─── D20–D21 · Paridade e documentos a partir do banco ────────────────────────

describe("PG · Paridade V3×V4 e documentos (D20/D21)", () => {
  it("V3 grava (wizard) → V4 lê; correção (ação compartilhada) → V3 e V4 leem igual; documentos não retrodatam emissão", async () => {
    const storeId = await novaLoja();
    const entrada = data(dia(-12), "08:15");
    const previsao = data(dia(-1));
    const { os } = await criarOSEnterpriseV3(
      storeId,
      draftBase({ dataEntrada: entrada.iso, dataEntradaMeta: entrada.meta, previsaoEntrega: previsao.iso, previsaoEntregaMeta: previsao.meta }),
    );
    let { p } = await lerOS(os.id);
    const v3 = lerRecepcaoV3(p as OrdemServico);
    const v4 = adaptOsHeader(p as OrdemServico);
    expect(v3.entradaTexto).toBe(v4.entrada);
    expect(v3.previsaoTexto).toBe(v4.previsao);
    const nova = data(dia(-13));
    const r = await corrigirDatasOSV3(storeId, os.id, { alteracoes: { dataEntrada: nova }, esperados: { dataEntrada: esperadoCampoDataV3(entrada.iso, entrada.meta.precisao) }, motivo: "Ajuste" });
    expect(r.ok).toBe(true);
    ({ p } = await lerOS(os.id));
    expect(lerRecepcaoV3(p as OrdemServico).entradaTexto).toBe(adaptOsHeader(p as OrdemServico).entrada);
    expect(adaptOsHeader(p as OrdemServico).entrada).toBe(formatarDataOperacionalV3({ iso: nova.iso, precisao: "dia", dia: nova.meta.dia }));
    const agora = new Date();
    const doc = montarDocumentoOSV3(p as OrdemServico, undefined, { now: agora });
    expect(doc.recepcao.entradaTexto).toBe(adaptOsHeader(p as OrdemServico).entrada);
    expect(doc.criadoEm).toBe(p.criadoEm);
    expect(pertoDeAgora(doc.criadoEm!)).toBe(true);
    expect(doc.impressoEm).toBe(agora.toISOString());
  });
});
