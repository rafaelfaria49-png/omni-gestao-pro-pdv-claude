import { describe, expect, it } from "vitest";
import { validarNovaOSDraftV3, computeTotaisNovaOSV3 } from "./nova-os-model";
import {
  SERVICOS_RAPIDOS_V3,
  formaPrevistaDeRecebimentoV3,
  montarDraftAtendimentoRapidoV3,
  validarAtendimentoRapidoV3,
  type AtendimentoRapidoInputV3,
} from "./atendimento-rapido-model";

const baseInput = (over: Partial<AtendimentoRapidoInputV3> = {}): AtendimentoRapidoInputV3 => ({
  cliente: { modo: "balcao" },
  servico: { nome: "Transferência de dados", valor: 30 },
  formaPagamento: "pix",
  ...over,
});

describe("validarAtendimentoRapidoV3", () => {
  it("aceita um atendimento de balcão válido", () => {
    expect(validarAtendimentoRapidoV3(baseInput())).toBeNull();
  });
  it("exige nome do serviço", () => {
    expect(validarAtendimentoRapidoV3(baseInput({ servico: { nome: "  ", valor: 30 } }))).toMatch(/serviço/i);
  });
  it("exige valor > 0", () => {
    expect(validarAtendimentoRapidoV3(baseInput({ servico: { nome: "Película", valor: 0 } }))).toMatch(/valor/i);
  });
  it("exige id quando cliente existente", () => {
    expect(validarAtendimentoRapidoV3(baseInput({ cliente: { modo: "existente" } }))).toMatch(/cliente/i);
  });
  it("exige nome quando cliente novo", () => {
    expect(validarAtendimentoRapidoV3(baseInput({ cliente: { modo: "novo" } }))).toMatch(/nome/i);
  });
});

describe("formaPrevistaDeRecebimentoV3", () => {
  it("mapeia formas suportadas", () => {
    expect(formaPrevistaDeRecebimentoV3("dinheiro")).toBe("dinheiro");
    expect(formaPrevistaDeRecebimentoV3("pix")).toBe("pix");
    expect(formaPrevistaDeRecebimentoV3("debito")).toBe("debito");
    expect(formaPrevistaDeRecebimentoV3("credito")).toBe("credito");
  });
});

describe("SERVICOS_RAPIDOS_V3", () => {
  it("tem serviços curados com valor padrão", () => {
    expect(SERVICOS_RAPIDOS_V3.length).toBeGreaterThan(3);
    for (const s of SERVICOS_RAPIDOS_V3) {
      expect(s.nome.trim().length).toBeGreaterThan(0);
      expect(s.valorPadrao).toBeGreaterThan(0);
    }
  });
});

describe("montarDraftAtendimentoRapidoV3", () => {
  const cliente = { id: "cli-1", nome: "Cliente Balcão" };

  it("gera um rascunho VÁLIDO para a Nova OS (reuso da espinha)", () => {
    const draft = montarDraftAtendimentoRapidoV3(baseInput({ servico: { nome: "Instalação de película", valor: 25 } }), cliente);
    expect(validarNovaOSDraftV3(draft)).toBeNull();
    expect(draft.cliente.id).toBe("cli-1");
    expect(draft.recepcao.origem).toBe("balcao");
    // serviço entra como item cobrado com o valor informado
    expect(draft.itens).toHaveLength(1);
    expect(draft.itens[0].kind).toBe("cobrado");
    expect(draft.itens[0].categoria).toBe("servico");
    expect(computeTotaisNovaOSV3(draft.itens, draft.desconto).total).toBe(25);
  });

  it("usa placeholder de equipamento quando não informado", () => {
    const draft = montarDraftAtendimentoRapidoV3(baseInput(), cliente);
    expect(draft.equipamento.marca.trim().length).toBeGreaterThan(0);
    expect(draft.equipamento.modelo.trim().length).toBeGreaterThan(0);
  });

  it("preserva equipamento informado", () => {
    const draft = montarDraftAtendimentoRapidoV3(baseInput({ equipamento: { marca: "Apple", modelo: "iPhone 13" } }), cliente);
    expect(draft.equipamento.marca).toBe("Apple");
    expect(draft.equipamento.modelo).toBe("iPhone 13");
  });

  it("anexa descrição opcional ao item", () => {
    const draft = montarDraftAtendimentoRapidoV3(baseInput({ servico: { nome: "Limpeza", valor: 30, descricao: "alto-falante" } }), cliente);
    expect(draft.itens[0].descricao).toContain("alto-falante");
  });
});
