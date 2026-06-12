import { describe, expect, it } from "vitest";
import {
  GARANTIA_TEMPLATES_V3,
  garantiaTemplateV3,
  preencherGarantiaPorTemplateV3,
} from "./garantia-templates";

describe("GARANTIA_TEMPLATES_V3 — catálogo oficial", () => {
  it("tem exatamente os 14 modelos oficiais, com ids únicos", () => {
    expect(GARANTIA_TEMPLATES_V3).toHaveLength(14);
    const ids = GARANTIA_TEMPLATES_V3.map((t) => t.id);
    expect(new Set(ids).size).toBe(14);
  });

  it("todo template tem nome, texto e dias >= 0", () => {
    for (const t of GARANTIA_TEMPLATES_V3) {
      expect(t.nome.trim().length).toBeGreaterThan(0);
      expect(t.texto.trim().length).toBeGreaterThan(0);
      expect(t.dias).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("garantiaTemplateV3 — carregar template correto", () => {
  it("carrega o template de Troca de Tela com texto completo", () => {
    const t = garantiaTemplateV3("tela");
    expect(t).not.toBeNull();
    expect(t!.nome).toBe("Troca de Tela");
    expect(t!.dias).toBe(90);
    expect(t!.texto).toContain("GARANTIA LEGAL DE 90 DIAS");
    expect(t!.texto).toContain("Pressão sobre a tela");
  });

  it("retorna null para id desconhecido (sem fallback enganoso)", () => {
    expect(garantiaTemplateV3("inexistente")).toBeNull();
    expect(garantiaTemplateV3("")).toBeNull();
    expect(garantiaTemplateV3(undefined)).toBeNull();
    expect(garantiaTemplateV3(null)).toBeNull();
  });
});

describe("preencher dias corretos por template", () => {
  const esperado: Record<string, number> = {
    tela: 90,
    bateria: 90,
    conector: 90,
    camera: 90,
    alto_falante: 90,
    microfone: 90,
    placa: 90,
    software: 30,
    transferencia_dados: 0,
    recuperacao_conta: 0,
    instalacao_app: 0,
    limpeza_tecnica: 0,
    atualizacao_config: 30,
    oxidacao: 0,
  };

  it("cada template tem o prazo (dias) da especificação", () => {
    for (const [id, dias] of Object.entries(esperado)) {
      expect(garantiaTemplateV3(id)?.dias, `dias de ${id}`).toBe(dias);
    }
  });

  it("preencher devolve prazo e texto do modelo selecionado", () => {
    const p = preencherGarantiaPorTemplateV3("software");
    expect(p).not.toBeNull();
    expect(p!.modelo).toBe("software");
    expect(p!.label).toBe("Software");
    expect(p!.prazoDias).toBe(30);
    expect(p!.termo).toContain("GARANTIA DE 30 DIAS");
  });

  it("templates sem cobertura preenchem prazo 0 e texto 'SERVIÇO SEM GARANTIA'", () => {
    const p = preencherGarantiaPorTemplateV3("oxidacao");
    expect(p!.prazoDias).toBe(0);
    expect(p!.termo).toContain("SERVIÇO SEM GARANTIA");
  });

  it("retorna null ao preencher com id fora do catálogo", () => {
    expect(preencherGarantiaPorTemplateV3("inexistente")).toBeNull();
  });
});

describe("preservar edição manual (PARTE 4)", () => {
  it("preenche o texto do modelo quando NÃO houve edição manual", () => {
    const p = preencherGarantiaPorTemplateV3("bateria", {
      termoAtual: "texto antigo qualquer",
      termoEditadoManual: false,
    });
    expect(p!.termo).toContain("A garantia cobre defeitos da bateria instalada");
    expect(p!.termo).not.toBe("texto antigo qualquer");
  });

  it("PRESERVA o texto digitado quando o operador já editou manualmente", () => {
    const digitado = "Condições específicas combinadas com o cliente no balcão.";
    const p = preencherGarantiaPorTemplateV3("tela", {
      termoAtual: digitado,
      termoEditadoManual: true,
    });
    // prazo/rótulo ainda acompanham o modelo novo...
    expect(p!.modelo).toBe("tela");
    expect(p!.prazoDias).toBe(90);
    // ...mas o texto digitado NÃO é sobrescrito.
    expect(p!.termo).toBe(digitado);
  });

  it("ao restaurar (termoEditadoManual=false) reaplica o texto oficial do modelo", () => {
    const p = preencherGarantiaPorTemplateV3("placa", {
      termoAtual: "rascunho do operador",
      termoEditadoManual: false,
    });
    expect(p!.termo).toContain("reparo em placa eletrônica");
  });
});
