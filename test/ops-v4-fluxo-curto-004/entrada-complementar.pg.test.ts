// @vitest-environment node
//
// OPS-V4-FLUXO-CURTO-004 — integração PostgreSQL real (P1 autorizado / P2
// diagnóstico). Actions V3 REAIS da Entrada sobre massa sintética em banco
// local descartável; identidade limitada ao seam de sessão (stub de @/auth +
// gate ok). Ausência de ambiente = BLOQUEIO_EXPLICITO_PG (nunca skip).
// Prova: complementos persistem, status/orçamento/valor intactos, nenhum
// efeito financeiro/caixa/estoque/entrega/execução, "nenhum acessório" e
// confirmação de estado físico registrados, e estado físico NÃO registrado
// quando só credenciais viajaram (fatias).
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "qa-004", name: "Operador QA 004" } })) }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: vi.fn(async () => ({ ok: true })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { Prisma, PrismaClient } from "@/generated/prisma";
import {
  salvarAcessoriosEntradaV3,
  salvarIdentificacaoV3,
  salvarProvaEntradaV3,
} from "@/lib/operacoes-v3/prova-entrada-actions";
import { derivarPendenciasEntradaV4 } from "@/lib/operacoes-v4/entrada-pendencias";
import { classificarGruposEntradaV4, primeiraAreaEntradaV4 } from "@/lib/operacoes-v4/entrada-workspace";
import { patchTocadoCredenciais, seedEntradaEditor, toProvaEntradaInput } from "@/lib/operacoes-v4/entrada-form";
import type { OrdemServico } from "@/types/os";

function exigirBancoLocal(): string {
  const urls = [
    process.env.OPS_V4_FLUXO_CURTO_TEST_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.DIRECT_URL,
  ].map((v) => (v ?? "").trim());
  if (urls.some((v) => !v)) {
    throw new Error(
      "BLOQUEIO_EXPLICITO_PG: configure OPS_V4_FLUXO_CURTO_TEST_DATABASE_URL + DATABASE_URL + DIRECT_URL " +
        "para o PostgreSQL local descartável. Ausência de ambiente é impedimento, não aprovação.",
    );
  }
  const alvos = urls.map((v) => new URL(v));
  if (alvos.some((u) => !["127.0.0.1", "localhost", "::1"].includes(u.hostname.toLowerCase()))) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: integração só pode usar loopback.");
  }
  const chave = (u: URL) => `${u.hostname}:${u.port}${u.pathname}`;
  if (alvos.some((u) => chave(u) !== chave(alvos[0]!))) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: as três URLs devem apontar ao mesmo banco descartável.");
  }
  return urls[0]!;
}

const prisma = new PrismaClient({ datasourceUrl: exigirBancoLocal() });
const sufixo = Date.now().toString(36);
const storeId = `loja-pg-004-${sufixo}`;
const criadoEm = "2026-10-03T12:00:00.000Z";

afterAll(async () => {
  await prisma.$disconnect();
});

type EventoPayload = { tipo: string; metadata?: Record<string, unknown> };
type PayloadLido = OrdemServico & {
  operacaoStatusV3?: string;
  orcamento?: { status?: string; total?: number; sintetizado?: boolean };
  autorizacaoComercialV3?: unknown;
  valorTotal?: number;
  entregueEm?: string;
  tecnico?: unknown;
  timeline: EventoPayload[];
  provaEntradaV3?: { credenciais?: Record<string, unknown>; acessorios?: { presente: boolean }[]; identificacao?: Record<string, unknown> };
};

async function contagensEfeitos() {
  const [titulos, vendas, movimentosFinanceiros, transacoesFinanceiras, caixa, estoque] = await Promise.all([
    prisma.contaReceberTitulo.count(),
    prisma.venda.count(),
    prisma.movimentacaoFinanceira.count(),
    prisma.financialTransaction.count(),
    prisma.caixaOperacao.count(),
    prisma.movimentacaoEstoque.count(),
  ]);
  return { titulos, vendas, movimentosFinanceiros, transacoesFinanceiras, caixa, estoque };
}

async function lerOS(id: string) {
  const row = await prisma.ordemServico.findUniqueOrThrow({
    where: { id },
    select: { id: true, storeId: true, status: true, valorTotal: true, payload: true },
  });
  return { row, os: row.payload as unknown as PayloadLido };
}

function eventos(os: PayloadLido, nome: string) {
  return (os.timeline ?? []).filter((e) => e.metadata?.evento === nome);
}

async function criarOS(numero: string, payload: Record<string, unknown>, status: "Aberto" | "EmAnalise", valorTotal: number) {
  const row = await prisma.ordemServico.create({
    data: {
      storeId,
      numero,
      equipamento: "Samsung Galaxy QA",
      defeito: "Tela quebrada",
      status,
      valorTotal,
      payload: { storeId, codigo: numero, ...payload } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return row.id;
}

const aberturaComum = {
  cliente: { nome: `Cliente PG 004 ${sufixo}` },
  equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "Galaxy QA", defeitoRelatado: "Tela quebrada", acessorios: [] },
  aberturaV3: {
    versao: 1,
    criadoEm,
    criadoPor: "Operador QA 004",
    recepcao: { recebidoPor: "Operador QA 004", origem: "balcao", prioridade: "normal", localFisico: "balcao" },
  },
  criadoEm,
  timeline: [{ id: `ev-criacao-${sufixo}`, tipo: "criacao", autor: "Operador QA 004", autorTipo: "usuario", conteudo: "OS criada.", criadoEm }],
};

describe("OPS-V4-FLUXO-CURTO-004 — PostgreSQL descartável", () => {
  it("prepara loja sintética", async () => {
    await prisma.store.create({ data: { id: storeId, name: `Loja PG 004 ${sufixo}` } });
  });

  it("P1 — OS autorizada: complementa Entrada sem mudar status, orçamento, valor ou efeitos (A10/A11, F, H)", async () => {
    const osId = await criarOS(
      `OS-PG-004-A-${sufixo}`,
      {
        ...aberturaComum,
        status: "aprovado",
        operacaoStatusV3: "aprovado",
        orcamento: {
          status: "aprovado",
          total: 300,
          sintetizado: false,
          respondidoEm: criadoEm,
          servicos: [{ id: "srv-1", descricao: "Troca de tela", valor: 300, custoV3: 92, prazoGarantiaDias: 90 }],
        },
        autorizacaoComercialV3: {
          autorizada: true,
          registradaEm: criadoEm,
          registradaPor: "Operador QA 004",
          origem: "balcao",
          escopo: "servicos_da_abertura",
          total: 300,
        },
        valorTotal: 300,
        garantia: { ativa: false, prazoDias: 90 },
      },
      "EmAnalise",
      300,
    );
    const efeitosAntes = await contagensEfeitos();

    // A01/A02 — a abertura já registrou Recepção; a primeira pendência é Segurança.
    let { os } = await lerOS(osId);
    let grupos = classificarGruposEntradaV4(derivarPendenciasEntradaV4(os))!;
    expect(grupos.recepcao).toBe("registrado");
    expect(primeiraAreaEntradaV4(grupos)).toBe("seguranca-custodia");

    // Complemento 1 — identificação faltante (cor), pelo mesmo contrato do wrapper.
    await salvarIdentificacaoV3(storeId, osId, { cor: "Preto" }, undefined, { cor: "" });

    // Complemento 2 — "nenhum acessório" explícito (todos ausentes, com baseline).
    const semente = seedEntradaEditor(os);
    await salvarAcessoriosEntradaV3(storeId, osId, semente.acessorios.map((a) => ({ ...a, presente: false })), semente.acessorios);

    ({ os } = await lerOS(osId));
    // A06 — evento com presentes = 0 resolve a pendência de acessórios.
    expect(eventos(os, "acessorio_registrado")).toHaveLength(1);
    expect(eventos(os, "acessorio_registrado")[0]!.metadata).toMatchObject({ presentes: 0 });
    let pendencias = derivarPendenciasEntradaV4(os);
    expect(pendencias.find((p) => p.chave === "acessorios")).toMatchObject({ estado: "registrado", detalhe: "Nenhum acessório recebido" });
    // A08 — a prova foi materializada pelo save de acessórios, mas o estado padrão NÃO é registro.
    expect((os as unknown as { provaEntradaV3?: { versao?: number } }).provaEntradaV3?.versao).toBe(1);
    expect(pendencias.find((p) => p.chave === "estado-fisico")?.estado).toBe("falta_complementar");

    // Complemento 3 — confirmação explícita do estado exibido (o que o wrapper envia com confirmarEstadoFisico).
    const atual = seedEntradaEditor(os);
    await salvarProvaEntradaV3(
      storeId,
      osId,
      { estadoFisico: atual.estadoFisico, avarias: atual.avarias, credenciais: {} },
      undefined,
      { estadoFisico: atual.estadoFisico, avarias: atual.avarias },
      ["estadoFisico", "avarias"],
    );

    const lido = await lerOS(osId);
    os = lido.os;
    const prova = eventos(os, "prova_entrada_atualizada");
    expect(prova).toHaveLength(1);
    expect(prova[0]!.metadata).toMatchObject({ fatias: ["estadoFisico", "avarias"], avariados: 0, avarias: 0 });
    pendencias = derivarPendenciasEntradaV4(os);
    expect(pendencias.find((p) => p.chave === "estado-fisico")?.estado).toBe("registrado");
    grupos = classificarGruposEntradaV4(pendencias)!;
    expect(grupos["seguranca-custodia"]).toBe("registrado");
    expect(grupos.inspecao).toBe("falta_complementar"); // checklist não foi feito: honesto
    expect(grupos.evidencias).toBe("opcional");

    // Complementos persistidos.
    expect(os.provaEntradaV3?.identificacao).toMatchObject({ cor: "Preto" });
    expect((os.equipamento as unknown as { cor?: string }).cor).toBe("Preto");
    expect(os.provaEntradaV3?.acessorios?.every((a) => a.presente === false)).toBe(true);

    // A10/A11 — status, orçamento, autorização e valor intactos; nada iniciou/entregou.
    expect(lido.row.storeId).toBe(storeId);
    expect(lido.row.status).toBe("EmAnalise");
    expect(lido.row.valorTotal).toBe(300);
    expect(os.status).toBe("aprovado");
    expect(os.operacaoStatusV3).toBe("aprovado");
    expect(os.orcamento).toMatchObject({ status: "aprovado", total: 300, sintetizado: false });
    expect(os.autorizacaoComercialV3).toMatchObject({ autorizada: true, total: 300 });
    expect(os.valorTotal).toBe(300);
    expect(os.timeline.some((e) => e.tipo === "servico_iniciado")).toBe(false);
    expect(os.timeline.some((e) => e.tipo === "mudanca_status")).toBe(false);
    expect(os.entregueEm).toBeUndefined();
    expect(os.tecnico).toBeUndefined();
    expect(await contagensEfeitos()).toEqual(efeitosAntes);
    console.log(`[OPS-V4-FLUXO-CURTO-004][PG] P1 os=${osId} store=${storeId} status=${os.status}/${os.operacaoStatusV3} total=${os.valorTotal}`);
  });

  it("P2 — diagnóstico: complementa só acesso; continua aberta e estado físico NÃO vira registro (A12, H)", async () => {
    const osId = await criarOS(
      `OS-PG-004-D-${sufixo}`,
      { ...aberturaComum, status: "aberta", operacaoStatusV3: "aberta" },
      "Aberto",
      0,
    );
    const efeitosAntes = await contagensEfeitos();
    let { os } = await lerOS(osId);

    // Só a senha (o wrapper envia só a fatia de credenciais com baseline).
    const semente = seedEntradaEditor(os);
    const editado = { ...semente, credenciais: { ...semente.credenciais, senha: "2580" } };
    const t = patchTocadoCredenciais(toProvaEntradaInput(editado).credenciais, semente.credenciais);
    expect(t.valores).toEqual({ senha: "2580" });
    await salvarProvaEntradaV3(
      storeId,
      osId,
      { estadoFisico: [], avarias: [], credenciais: { ...t.valores } },
      t.limpar.length > 0 ? t.limpar : undefined,
      { credenciais: t.esperados },
      ["credenciais"],
    );

    const lido = await lerOS(osId);
    os = lido.os;
    const prova = eventos(os, "prova_entrada_criada");
    expect(prova).toHaveLength(1);
    expect(prova[0]!.metadata).toMatchObject({ fatias: ["credenciais"] });
    const pendencias = derivarPendenciasEntradaV4(os);
    expect(pendencias.find((p) => p.chave === "acesso")?.estado).toBe("registrado");
    expect(pendencias.find((p) => p.chave === "estado-fisico")?.estado).toBe("falta_complementar");
    // A09 — biometria não informada continua não informada (nada fabricado).
    expect(os.provaEntradaV3?.credenciais?.faceId).toBeUndefined();
    expect(os.provaEntradaV3?.credenciais?.biometria).toBeUndefined();

    // A12 — continua aberta; sem autorização/orçamento aprovado; diagnóstico não iniciou.
    expect(lido.row.status).toBe("Aberto");
    expect(os.status).toBe("aberta");
    expect(os.operacaoStatusV3).toBe("aberta");
    expect(os.autorizacaoComercialV3).toBeUndefined();
    expect(os.orcamento?.status).not.toBe("aprovado");
    expect(os.timeline.some((e) => e.tipo === "mudanca_status")).toBe(false);
    expect(os.timeline.some((e) => e.tipo === "servico_iniciado")).toBe(false);
    expect(await contagensEfeitos()).toEqual(efeitosAntes);
    console.log(`[OPS-V4-FLUXO-CURTO-004][PG] P2 os=${osId} status=${os.status}/${os.operacaoStatusV3} fatias=credenciais`);
  });
});
