import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import {
  buildGarantiasPortfolioV4,
  buildPosVendaV4,
  filtrarGarantiasPortfolioV4,
} from "./posvenda-v4";

const NOW = new Date("2026-08-15T12:00:00.000Z");

function os(extra: Record<string, unknown> = {}): OrdemServico {
  return {
    id: "os-1",
    codigo: "OS-1042",
    clienteId: "cli-1",
    cliente: { id: "cli-1", nome: "Maria" },
    equipamento: { tipo: "Celular", marca: "Samsung", modelo: "S22" },
    timeline: [],
    ...extra,
  } as unknown as OrdemServico;
}

function garantia(prazoDias: number, entregueEm?: string, extra: Record<string, unknown> = {}): OrdemServico {
  return os({
    aberturaV3: { garantiaPrevista: { modelo: "tela", label: "Troca de tela", prazoDias } },
    ...(entregueEm ? { entregaV3: { entregueEm } } : {}),
    ...extra,
  });
}

describe("buildPosVendaV4", () => {
  it("não inventa garantia ausente", () => {
    const view = buildPosVendaV4(os(), NOW);
    expect(view.garantia.temGarantia).toBe(false);
    expect(view.garantia.situacaoLabel).toBe("Sem garantia registrada");
    expect(view.headerLabel).toBe("Sem garantia");
  });

  it("projeta garantia vigente e vencimento pela fonte V3", () => {
    const view = buildPosVendaV4(garantia(90, "2026-08-01T12:00:00.000Z"), NOW);
    expect(view.garantia.situacao).toBe("ativa");
    expect(view.garantia.prazoDias).toBe(90);
    expect(view.garantia.vencimento).toBe("2026-10-30T12:00:00.000Z");
    expect(view.elegibilidade.id).toBe("dentro_garantia");
  });

  it("não trata garantia vencida como vigente e permite registro sem prometer cobertura", () => {
    const view = buildPosVendaV4(garantia(30, "2026-06-01T12:00:00.000Z"), NOW);
    expect(view.garantia.situacao).toBe("vencida");
    expect(view.elegibilidade.id).toBe("fora_garantia");
    expect(view.podeAbrirRetorno).toBe(true);
  });

  it("expõe OS não entregue sem iniciar a garantia — ocorrência, nunca retorno (GOAL 007)", () => {
    const view = buildPosVendaV4(garantia(90), NOW);
    expect(view.garantia.situacao).toBe("prevista");
    expect(view.elegibilidade.id).toBe("os_nao_entregue");
    expect(view.podeAbrirRetorno).toBe(false);
    expect(view.podeRegistrarOcorrencia).toBe(true);
    expect(view.enquadramento).toMatchObject({ id: "nao_entregue", acao: "registrar_ocorrencia" });
  });

  it("GOAL 007: OS cancelada e dados incompletos não abrem retorno", () => {
    const cancelada = buildPosVendaV4(garantia(90, "2026-08-01T12:00:00.000Z", { status: "cancelada", operacaoStatusV3: "cancelada" }), NOW);
    expect(cancelada.elegibilidade.id).toBe("os_cancelada");
    expect(cancelada.podeAbrirRetorno).toBe(false);
    const semCliente = buildPosVendaV4(garantia(90, "2026-08-01T12:00:00.000Z", { clienteId: "", cliente: { nome: "Avulso" } }), NOW);
    expect(semCliente.elegibilidade.id).toBe("dados_incompletos");
    expect(semCliente.podeAbrirRetorno).toBe(false);
  });

  it("GOAL 007: garantia não informada é registrável sem cobertura presumida", () => {
    const view = buildPosVendaV4(os({ entregaV3: { entregueEm: "2026-08-01T12:00:00.000Z" } }), NOW);
    expect(view.elegibilidade.id).toBe("garantia_nao_informada");
    expect(view.podeAbrirRetorno).toBe(true);
    expect(view.enquadramento.acao).toBe("abrir_retorno");
  });

  it("GOAL 007: reserva viva = abertura em processamento; sem CTA de criar nem finalizar", () => {
    const view = buildPosVendaV4(garantia(90, "2026-08-01T12:00:00.000Z", {
      retornosV3: [{ id: "r", osOriginalId: "os-1", motivo: "Touch", criadoEm: "2026-08-15T11:59:00.000Z", status: "aberto", operacaoId: "op-00000001", reserva: { token: "t", expiraEm: "2026-08-15T12:10:00.000Z" } }],
    }), NOW);
    expect(view.retornoEmAbertura).toBe(true);
    expect(view.elegibilidade.id).toBe("abertura_em_processamento");
    expect(view.podeAbrirRetorno).toBe(false);
    expect(view.podeFinalizarRetorno).toBe(false);
  });

  it("GOAL 007: retorno legado em aberto sem atendimento oferece abrir o atendimento DELE (não um novo)", () => {
    const view = buildPosVendaV4(garantia(90, "2026-08-01T12:00:00.000Z", {
      retornosV3: [{ id: "r", osOriginalId: "os-1", motivo: "Touch", criadoEm: "2026-08-14T10:00:00.000Z", status: "aberto" }],
    }), NOW);
    expect(view.atendimentoPendente).toBe(true);
    expect(view.podeAbrirRetorno).toBe(false);
    expect(view.podeFinalizarRetorno).toBe(true);
  });

  it("usa retornosV3, mantém vínculo, ordena e bloqueia outro retorno aberto", () => {
    const view = buildPosVendaV4(garantia(90, "2026-08-01T12:00:00.000Z", {
      retornosV3: [
        { id: "antigo", osOriginalId: "os-1", motivo: "Bateria", criadoEm: "2026-08-05T10:00:00.000Z", status: "finalizado", observacaoFinal: "Substituída" },
        { id: "aberto", osOriginalId: "os-1", osOriginalCodigo: "OS-1042", motivo: "Touch falhou", criadoEm: "2026-08-14T10:00:00.000Z", status: "aberto", garantiaAtivaNaAbertura: true },
      ],
    }), NOW);
    expect(view.historico.map((item) => item.id)).toEqual(["aberto", "antigo"]);
    expect(view.retornoAberto?.osOriginalCodigo).toBe("OS-1042");
    expect(view.podeAbrirRetorno).toBe(false);
    expect(view.podeFinalizarRetorno).toBe(true);
    expect(view.headerLabel).toBe("Retorno aberto");
  });

  it("projeta o atendimento vinculado e o vínculo da OS nova", () => {
    const original = buildPosVendaV4(garantia(90, "2026-08-01T12:00:00.000Z", {
      retornosV3: [{
        id: "aberto",
        osOriginalId: "os-1",
        osOriginalCodigo: "OS-1042",
        motivo: "Touch falhou",
        criadoEm: "2026-08-14T10:00:00.000Z",
        status: "aberto",
        osRetornoId: "os-2001",
        osRetornoCodigo: "OS-2001",
      }],
    }), NOW);
    expect(original.headerLabel).toBe("Retorno · OS-2001");
    expect(original.retornoAberto?.osRetornoId).toBe("os-2001");

    const nova = buildPosVendaV4(os({
      vinculoRetornoV3: { osOrigemId: "os-1", osOrigemCodigo: "OS-1042", retornoId: "aberto" },
    }), NOW);
    expect(nova.vinculoOrigem?.osOrigemCodigo).toBe("OS-1042");
    expect(nova.headerLabel).toBe("Retorno da OS-1042");

    const descartada = buildPosVendaV4(os({
      vinculoRetornoV3: { osOrigemId: "os-1", osOrigemCodigo: "OS-1042", retornoId: "aberto", descartadoEm: "2026-08-15T12:00:00.000Z", vinculoValidoId: "os-2001", vinculoValidoCodigo: "OS-2001" },
    }), NOW);
    expect(descartada.headerLabel).toBe("Atendimento descartado");
    expect(descartada.vinculoOrigem).toMatchObject({ vinculoValidoId: "os-2001", vinculoValidoCodigo: "OS-2001" });
  });

  it("não duplica eventos de retorno na timeline auxiliar", () => {
    const view = buildPosVendaV4(os({
      timeline: [
        { id: "entrega", tipo: "entrega_cliente", autor: "Ana", conteudo: "Serviço entregue", criadoEm: "2026-08-10T12:00:00.000Z" },
        { id: "retorno", tipo: "garantia_acionada", autor: "Ana", conteudo: "Retorno aberto", criadoEm: "2026-08-11T12:00:00.000Z" },
      ],
    }), NOW);
    expect(view.timeline.map((item) => item.id)).toEqual(["entrega"]);
  });
});

describe("portfólio de garantias V4", () => {
  const ordens = [
    garantia(30, "2026-07-20T12:00:00.000Z", { id: "vencendo", codigo: "OS-1" }),
    garantia(90, "2026-08-01T12:00:00.000Z", { id: "vigente", codigo: "OS-2", cliente: { nome: "João" } }),
    garantia(30, "2026-06-01T12:00:00.000Z", { id: "vencida", codigo: "OS-3" }),
    os({ id: "sem", codigo: "OS-4" }),
  ];

  it("conta somente dados reais e classifica vencendo em até sete dias", () => {
    const portfolio = buildGarantiasPortfolioV4(ordens, { now: NOW, vencendoDias: 7 });
    expect(portfolio.itens).toHaveLength(3);
    expect(portfolio.vigentes).toBe(2);
    expect(portfolio.vencendo).toBe(1);
    expect(portfolio.vencidas).toBe(1);
  });

  it("GOAL 007: diferencia retorno em andamento × concluído e só oferece retorno a quem pode abrir", () => {
    const comRetornos = [
      garantia(90, "2026-08-01T12:00:00.000Z", { id: "andamento", codigo: "OS-5", retornosV3: [{ id: "a", osOriginalId: "andamento", motivo: "x", criadoEm: "2026-08-10T10:00:00.000Z", status: "aberto", osRetornoId: "f1" }] }),
      garantia(90, "2026-08-01T12:00:00.000Z", { id: "concluido", codigo: "OS-6", retornosV3: [{ id: "b", osOriginalId: "concluido", motivo: "y", criadoEm: "2026-08-10T10:00:00.000Z", status: "finalizado" }] }),
      garantia(90, "2026-08-01T12:00:00.000Z", { id: "livre", codigo: "OS-7" }),
    ];
    const portfolio = buildGarantiasPortfolioV4(comRetornos, { now: NOW, vencendoDias: 7 });
    const porId = Object.fromEntries(portfolio.itens.map((item) => [item.osId, item]));
    expect(porId.andamento).toMatchObject({ retornoStatus: "andamento", retornoAberto: true, podeAbrirRetorno: false });
    expect(porId.concluido).toMatchObject({ retornoStatus: "concluido", retornoAberto: false, podeAbrirRetorno: true });
    expect(porId.livre).toMatchObject({ retornoStatus: null, podeAbrirRetorno: true });
    expect(portfolio.retornosAbertos).toBe(1);
    expect(portfolio.retornosConcluidos).toBe(1);
  });

  it("filtra situação e busca por OS/cliente/aparelho", () => {
    const portfolio = buildGarantiasPortfolioV4(ordens, { now: NOW, vencendoDias: 7 });
    expect(filtrarGarantiasPortfolioV4(portfolio, "vencendo").map((item) => item.osId)).toEqual(["vencendo"]);
    expect(filtrarGarantiasPortfolioV4(portfolio, "todas", "joão").map((item) => item.osId)).toEqual(["vigente"]);
    expect(filtrarGarantiasPortfolioV4(portfolio, "todas", "samsung s22")).toHaveLength(3);
  });
});
