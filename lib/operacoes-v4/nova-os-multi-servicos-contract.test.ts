// GOAL OPS-V4-MULTI-SERVICOS-CONTRACT-002 — contrato multi-serviço.
// Testes PUROS (sem I/O, sem Prisma, sem recebimento real) dos cenários 1–8.
import { describe, expect, it } from "vitest";
import {
  buildNovaOSDraftFromFormV4,
  type NovaOSFormV4,
} from "./nova-os-draft-from-form";
import {
  computeTotaisNovaOSV3,
  mapItensParaServicosCatalogoV3,
  validarNovaOSDraftV3,
} from "@/lib/operacoes-v3/nova-os-model";
import { computeTotaisV3 } from "@/lib/operacoes-v3/orcamento-model";
import { totalCobravelV3 } from "@/lib/operacoes-v3/payment-model";
import { buildOrcamentoRascunhoFromOS } from "@/lib/operacoes/services/orcamento-builder";
import { adaptOrcamento } from "@/components/operacoes-v4-preview/os-adapter";
import type { OrdemServico } from "@/types/os";

const FIXED = new Date("2026-09-09T12:00:00.000Z");

function makeDeps() {
  let n = 0;
  return {
    uid: (prefix: string) => `${prefix}_${++n}`,
    nowIso: () => FIXED.toISOString(),
  };
}

function formBase(over: Partial<NovaOSFormV4> = {}): NovaOSFormV4 {
  return {
    clienteExistente: null,
    clienteNovo: { nome: "Vanessa" },
    equipamentoTipo: "celular",
    marca: "Apple",
    modelo: "iPhone 17 Pro Max",
    defeitoRelatado: "Tela e tampa danificadas",
    origem: "balcao",
    tipoEntrada: "servico_autorizado",
    ...over,
  };
}

function osComOrcamento(orcamento: unknown): OrdemServico {
  return { orcamento, orcamentoHistorico: [] } as unknown as OrdemServico;
}

describe("CENÁRIO 1 — compatibilidade singular (legado)", () => {
  it("1 serviço antigo gera draft equivalente ao comportamento anterior", () => {
    const draft = buildNovaOSDraftFromFormV4(
      formBase({
        servicoAutorizado: { descricao: "Troca de tela", valor: 2000, custo: 766.7, garantiaDias: 90 },
      }),
      FIXED,
    );
    expect(draft.itens).toEqual([
      {
        id: "autorizado",
        categoria: "servico",
        descricao: "Troca de tela",
        quantidade: 1,
        custoUnitario: 766.7,
        valorUnitario: 2000,
        kind: "cobrado",
        baixaEstoque: false,
        garantiaDias: 90,
      },
    ]);
    expect(draft.garantia.prazoDias).toBe(90);
    expect(validarNovaOSDraftV3(draft)).toBeNull();
  });

  it("payload legado não ganha chaves novas", () => {
    const draft = buildNovaOSDraftFromFormV4(
      formBase({
        servicoAutorizado: { descricao: "Troca de tela", valor: 2000, custo: 766.7, garantiaDias: 90 },
      }),
      FIXED,
    );
    const linhas = mapItensParaServicosCatalogoV3(draft.itens, draft.garantia.prazoDias);
    expect(linhas).toEqual([
      {
        servicoId: "nova-autorizado",
        descricao: "Troca de tela",
        custoInterno: 766.7,
        valorVenda: 2000,
        prazoGarantiaDias: 90,
        termoGarantia: "",
        kindV3: "cobrado",
      },
    ]);
    expect("prazoTexto" in linhas[0]!).toBe(false);
    expect("catalogoServicoId" in linhas[0]!).toBe(false);
  });
});

describe("CENÁRIO 2 — dois serviços (tela + tampa)", () => {
  const dois = () =>
    buildNovaOSDraftFromFormV4(
      formBase({
        servicosAutorizados: [
          { id: "linha-tela", descricao: "Troca de tela", valor: 2000, custo: 766.7, garantiaDias: 90, prazoTexto: "2 horas", catalogoServicoId: "svc-tela" },
          { id: "linha-tampa", descricao: "Troca de tampa traseira", valor: 450, custo: 180, garantiaDias: 30, prazoTexto: "1 hora", catalogoServicoId: "svc-tampa" },
        ],
      }),
      FIXED,
    );

  it("gera N itens com descrições/valores/custos/garantias preservados", () => {
    const draft = dois();
    expect(draft.itens).toHaveLength(2);
    expect(draft.itens[0]).toMatchObject({ id: "linha-tela", descricao: "Troca de tela", valorUnitario: 2000, custoUnitario: 766.7, garantiaDias: 90 });
    expect(draft.itens[1]).toMatchObject({ id: "linha-tampa", descricao: "Troca de tampa traseira", valorUnitario: 450, custoUnitario: 180, garantiaDias: 30 });
    expect(validarNovaOSDraftV3(draft)).toBeNull();
  });

  it("venda = 2450, custo = 946,70, lucro = 1503,30 (matemática existente)", () => {
    const draft = dois();
    const totais = computeTotaisNovaOSV3(draft.itens, draft.desconto);
    expect(totais.subtotal).toBe(2450);
    expect(totais.total).toBe(2450);
    expect(totais.custo).toBeCloseTo(946.7, 2);
    expect(totais.lucro).toBeCloseTo(1503.3, 2);
  });

  it("orçamento materializado soma os N serviços com custo", () => {
    const draft = dois();
    const linhas = mapItensParaServicosCatalogoV3(draft.itens, draft.garantia.prazoDias);
    const orc = buildOrcamentoRascunhoFromOS({ servicosCatalogo: linhas, pecas: [] }, makeDeps());
    expect(orc.servicos).toHaveLength(2);
    const totais = computeTotaisV3({ servicos: orc.servicos, pecas: orc.pecas, desconto: orc.desconto });
    expect(totais.total).toBe(2450);
    expect(totais.custo).toBeCloseTo(946.7, 2);
    expect(totais.lucro).toBeCloseTo(1503.3, 2);
  });
});

describe("CENÁRIO 3 — IDs de linha distintos mesmo com mesmo catálogo", () => {
  it("duas linhas do MESMO catalogoServicoId têm IDs de linha diferentes", () => {
    const draft = buildNovaOSDraftFromFormV4(
      formBase({
        servicosAutorizados: [
          { descricao: "Troca de tela", valor: 2000, custo: 766.7, garantiaDias: 90, catalogoServicoId: "svc-tela" },
          { descricao: "Troca de tela (2ª via)", valor: 2000, custo: 766.7, garantiaDias: 90, catalogoServicoId: "svc-tela" },
        ],
      }),
      FIXED,
    );
    expect(draft.itens).toHaveLength(2);
    expect(draft.itens[0]!.id).not.toBe(draft.itens[1]!.id);
    expect(draft.itens[0]!.catalogoServicoId).toBe("svc-tela");
    expect(draft.itens[1]!.catalogoServicoId).toBe("svc-tela");
    const linhas = mapItensParaServicosCatalogoV3(draft.itens, draft.garantia.prazoDias);
    expect(linhas[0]!.servicoId).not.toBe(linhas[1]!.servicoId);
  });
});

describe("CENÁRIO 4 — prazoTexto sobrevive e não vira SLA", () => {
  it("prazoTexto atravessa form → draft → payload → orçamento", () => {
    const draft = buildNovaOSDraftFromFormV4(
      formBase({
        servicosAutorizados: [
          { id: "linha-tela", descricao: "Troca de tela", valor: 2000, custo: 766.7, garantiaDias: 90, prazoTexto: "2 horas" },
          { id: "linha-tampa", descricao: "Troca de tampa traseira", valor: 450, custo: 180, garantiaDias: 30, prazoTexto: "1 hora" },
        ],
      }),
      FIXED,
    );
    expect(draft.itens[0]!.prazoTexto).toBe("2 horas");
    expect(draft.itens[1]!.prazoTexto).toBe("1 hora");
    const linhas = mapItensParaServicosCatalogoV3(draft.itens, draft.garantia.prazoDias);
    expect(linhas[0]!.prazoTexto).toBe("2 horas");
    expect(linhas[1]!.prazoTexto).toBe("1 hora");
    const orc = buildOrcamentoRascunhoFromOS({ servicosCatalogo: linhas, pecas: [] }, makeDeps());
    expect(orc.servicos[0]!.prazoTexto).toBe("2 horas");
    expect(orc.servicos[1]!.prazoTexto).toBe("1 hora");
  });

  it("prazoTexto não alimenta SLA/previsão", () => {
    const draft = buildNovaOSDraftFromFormV4(
      formBase({
        servicosAutorizados: [
          { id: "linha-tela", descricao: "Troca de tela", valor: 2000, custo: 766.7, garantiaDias: 90, prazoTexto: "2 horas" },
        ],
      }),
      FIXED,
    );
    expect(draft.recepcao.previsaoEntrega).toBeUndefined();
    expect((draft as unknown as Record<string, unknown>).sla).toBeUndefined();
  });
});

describe("CENÁRIO 5 — catálogo é metadata, snapshot é autoritativo", () => {
  it("catalogoServicoId sobrevive sem substituir descrição/preço/custo", () => {
    const draft = buildNovaOSDraftFromFormV4(
      formBase({
        servicosAutorizados: [
          { id: "linha-tela", descricao: "Troca de tela", valor: 2000, custo: 766.7, garantiaDias: 90, catalogoServicoId: "svc-tela-123" },
        ],
      }),
      FIXED,
    );
    const linhas = mapItensParaServicosCatalogoV3(draft.itens, draft.garantia.prazoDias);
    expect(linhas[0]!.catalogoServicoId).toBe("svc-tela-123");
    expect(linhas[0]!.descricao).toBe("Troca de tela");
    expect(linhas[0]!.valorVenda).toBe(2000);
    expect(linhas[0]!.custoInterno).toBe(766.7);
    const orc = buildOrcamentoRascunhoFromOS({ servicosCatalogo: linhas, pecas: [] }, makeDeps());
    expect(orc.servicos[0]!.catalogoServicoId).toBe("svc-tela-123");
    expect(orc.servicos[0]!.descricao).toBe("Troca de tela");
  });
});

describe("CENÁRIO 6 — payload legado continua legível", () => {
  it("serviço antigo sem catalogoServicoId/prazoTexto/custo adapta sem erro", () => {
    const os = osComOrcamento({
      id: "orc_1",
      status: "aprovado",
      pecas: [],
      servicos: [{ id: "s1", descricao: "Troca de tela", valor: 2000, desconto: 0 }],
      desconto: 0,
      total: 2000,
      criadoEm: FIXED.toISOString(),
      atualizadoEm: FIXED.toISOString(),
      sintetizado: false,
    });
    const view = adaptOrcamento(os);
    expect(view.estado).toBe("persistido");
    expect(view.total).toBe("R$ 2.000,00");
    expect(view.servicos).toHaveLength(1);
  });
});

describe("CENÁRIO 7 — custo desconhecido não fabrica margem", () => {
  it("serviços sem custo → custoTotal/lucro null", () => {
    const os = osComOrcamento({
      id: "orc_1",
      status: "aprovado",
      pecas: [],
      servicos: [
        { id: "s1", descricao: "Troca de tela", valor: 2000, desconto: 0 },
        { id: "s2", descricao: "Troca de tampa traseira", valor: 450, desconto: 0 },
      ],
      desconto: 0,
      total: 2450,
      criadoEm: FIXED.toISOString(),
      atualizadoEm: FIXED.toISOString(),
      sintetizado: false,
    });
    const view = adaptOrcamento(os);
    expect(view.total).toBe("R$ 2.450,00");
    expect(view.custoTotal).toBeNull();
    expect(view.lucroTotal).toBeNull();
  });

  it("custo parcial (1 de 2 linhas) → agregado suprimido", () => {
    const os = osComOrcamento({
      id: "orc_1",
      status: "aprovado",
      pecas: [],
      servicos: [
        { id: "s1", descricao: "Troca de tela", valor: 2000, desconto: 0, custoV3: 766.7 },
        { id: "s2", descricao: "Troca de tampa traseira", valor: 450, desconto: 0 },
      ],
      desconto: 0,
      total: 2450,
      criadoEm: FIXED.toISOString(),
      atualizadoEm: FIXED.toISOString(),
      sintetizado: false,
    });
    const view = adaptOrcamento(os);
    expect(view.custoTotal).toBeNull();
    expect(view.lucroTotal).toBeNull();
    expect(view.servicos[0]!.custo).toBe("R$ 766,70");
    expect(view.servicos[1]!.custo).toBeNull();
  });

  it("custos conhecidos nos 2 serviços → custo/lucro agregados", () => {
    const os = osComOrcamento({
      id: "orc_1",
      status: "aprovado",
      pecas: [],
      servicos: [
        { id: "s1", descricao: "Troca de tela", valor: 2000, desconto: 0, custoV3: 766.7 },
        { id: "s2", descricao: "Troca de tampa traseira", valor: 450, desconto: 0, custoV3: 180 },
      ],
      desconto: 0,
      total: 2450,
      criadoEm: FIXED.toISOString(),
      atualizadoEm: FIXED.toISOString(),
      sintetizado: false,
    });
    const view = adaptOrcamento(os);
    expect(view.custoTotal).toBe("R$ 946,70");
    expect(view.lucroTotal).toBe("R$ 1.503,30");
  });
});

describe("CENÁRIO 8 — dois serviços, total único da OS", () => {
  it("totalCobravelV3 = 2450 (cobrança única, sem recebimento real)", () => {
    const os = osComOrcamento({
      id: "orc_1",
      status: "aprovado",
      pecas: [],
      servicos: [
        { id: "s1", descricao: "Troca de tela", valor: 2000, desconto: 0, custoV3: 766.7, prazoGarantiaDias: 90 },
        { id: "s2", descricao: "Troca de tampa traseira", valor: 450, desconto: 0, custoV3: 180, prazoGarantiaDias: 30 },
      ],
      desconto: 0,
      total: 2450,
      criadoEm: FIXED.toISOString(),
      atualizadoEm: FIXED.toISOString(),
      sintetizado: false,
    });
    expect(totalCobravelV3(os)).toBe(2450);
  });
});
