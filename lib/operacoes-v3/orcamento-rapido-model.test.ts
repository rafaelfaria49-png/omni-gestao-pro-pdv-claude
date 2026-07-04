import { describe, expect, it } from "vitest";
import {
  montarGrupoMetaOrcamentoRapidoV3,
  montarServicosOrcamentoRapidoV3,
  validarOrcamentoRapidoInputV3,
  type OrcamentoRapidoInputV3,
} from "./orcamento-rapido-model";

function inputBase(over: Partial<OrcamentoRapidoInputV3> = {}): OrcamentoRapidoInputV3 {
  return {
    cliente: { modo: "novo", nome: "Cliente Teste", telefone: "11999990000" },
    aparelho: { marca: "Marca X", modelo: "Modelo Y" },
    defeitoRelatado: "Tela quebrada",
    grupo: {
      rotulo: "Escolha a tela",
      variantes: [
        { rotulo: "Genérica", valor: 150 },
        { rotulo: "Original", valor: 300, garantiaDias: 90, badge: "Recomendado" },
      ],
    },
    ...over,
  };
}

describe("validarOrcamentoRapidoInputV3", () => {
  it("aceita input mínimo válido", () => {
    expect(validarOrcamentoRapidoInputV3(inputBase())).toBeNull();
  });

  it("exige clienteId no modo existente", () => {
    expect(validarOrcamentoRapidoInputV3(inputBase({ cliente: { modo: "existente" } }))).toBe("Selecione o cliente existente.");
  });

  it("exige nome no modo novo", () => {
    expect(validarOrcamentoRapidoInputV3(inputBase({ cliente: { modo: "novo" } }))).toBe("Informe o nome do cliente.");
  });

  it("exige marca e modelo do aparelho", () => {
    expect(validarOrcamentoRapidoInputV3(inputBase({ aparelho: { marca: "", modelo: "Y" } }))).toBe("Informe marca e modelo do aparelho.");
  });

  it("exige defeito relatado", () => {
    expect(validarOrcamentoRapidoInputV3(inputBase({ defeitoRelatado: "  " }))).toBe("Descreva o defeito relatado pelo cliente.");
  });

  it("exige rótulo do grupo", () => {
    expect(validarOrcamentoRapidoInputV3(inputBase({ grupo: { rotulo: "", variantes: inputBase().grupo.variantes } }))).toBe(
      "Informe o rótulo do grupo de escolha.",
    );
  });

  it("exige pelo menos 2 variantes", () => {
    expect(validarOrcamentoRapidoInputV3(inputBase({ grupo: { rotulo: "G", variantes: [{ rotulo: "A", valor: 10 }] } }))).toBe(
      "O grupo de escolha precisa de pelo menos 2 opções.",
    );
  });

  it("rejeita mais de 4 variantes", () => {
    const variantes = [1, 2, 3, 4, 5].map((i) => ({ rotulo: `Opção ${i}`, valor: 10 }));
    expect(validarOrcamentoRapidoInputV3(inputBase({ grupo: { rotulo: "G", variantes } }))).toBe(
      "O grupo de escolha aceita no máximo 4 opções.",
    );
  });

  it("aceita exatamente 4 variantes", () => {
    const variantes = [1, 2, 3, 4].map((i) => ({ rotulo: `Opção ${i}`, valor: 10 }));
    expect(validarOrcamentoRapidoInputV3(inputBase({ grupo: { rotulo: "G", variantes } }))).toBeNull();
  });

  it("exige rótulo em toda variante", () => {
    expect(
      validarOrcamentoRapidoInputV3(inputBase({ grupo: { rotulo: "G", variantes: [{ rotulo: "A", valor: 10 }, { rotulo: "", valor: 20 }] } })),
    ).toBe("Toda opção do grupo precisa de um rótulo.");
  });

  it("exige preço válido (não negativo) em toda variante", () => {
    expect(
      validarOrcamentoRapidoInputV3(inputBase({ grupo: { rotulo: "G", variantes: [{ rotulo: "A", valor: -5 }, { rotulo: "B", valor: 20 }] } })),
    ).toBe('Informe um preço válido para "A".');
  });

  it("rejeita mais de 1 badge por grupo", () => {
    expect(
      validarOrcamentoRapidoInputV3(
        inputBase({ grupo: { rotulo: "G", variantes: [{ rotulo: "A", valor: 10, badge: "Top" }, { rotulo: "B", valor: 20, badge: "Popular" }] } }),
      ),
    ).toBe("Use no máximo 1 selo (badge) por grupo.");
  });

  it("aceita 1 badge no grupo", () => {
    expect(
      validarOrcamentoRapidoInputV3(
        inputBase({ grupo: { rotulo: "G", variantes: [{ rotulo: "A", valor: 10, badge: "Top" }, { rotulo: "B", valor: 20 }] } }),
      ),
    ).toBeNull();
  });

  it("rejeita item fixo sem descrição", () => {
    expect(validarOrcamentoRapidoInputV3(inputBase({ itensFixos: [{ descricao: "  ", valor: 10 }] }))).toBe(
      "Há um item fixo sem descrição.",
    );
  });
});

describe("montarServicosOrcamentoRapidoV3 / montarGrupoMetaOrcamentoRapidoV3", () => {
  it("itens fixos entram sem grupoId; variantes entram com o grupoId dado", () => {
    const input = inputBase({ itensFixos: [{ descricao: "Mão de obra", valor: 50 }] });
    const servicos = montarServicosOrcamentoRapidoV3(input, "g1");
    const fixo = servicos.find((s) => s.descricao === "Mão de obra")!;
    expect(fixo.grupoId).toBeUndefined();
    expect(fixo.valor).toBe(50);
    const variantes = servicos.filter((s) => s.grupoId === "g1");
    expect(variantes).toHaveLength(2);
    expect(variantes.map((v) => v.varianteV3?.rotulo).sort()).toEqual(["Genérica", "Original"].sort());
  });

  it("item fixo 'brinde' zera o valor ao cliente", () => {
    const input = inputBase({ itensFixos: [{ descricao: "Película", valor: 30, kindV3: "brinde" }] });
    const servicos = montarServicosOrcamentoRapidoV3(input, "g1");
    const brinde = servicos.find((s) => s.descricao === "Película")!;
    expect(brinde.valor).toBe(0);
    expect(brinde.kindV3).toBe("brinde");
  });

  it("variante carrega garantiaDias/badge/descricaoCurta/prazoTexto quando informados", () => {
    const input = inputBase({
      grupo: {
        rotulo: "G",
        variantes: [
          { rotulo: "A", valor: 100, garantiaDias: 90, badge: "Top", descricaoCurta: "curta", prazoTexto: "2 dias" },
          { rotulo: "B", valor: 200 },
        ],
      },
    });
    const servicos = montarServicosOrcamentoRapidoV3(input, "g1");
    const a = servicos.find((s) => s.varianteV3?.rotulo === "A")!;
    expect(a.varianteV3).toEqual({ rotulo: "A", garantiaDias: 90, badge: "Top", descricaoCurta: "curta", prazoTexto: "2 dias" });
  });

  it("montarGrupoMetaOrcamentoRapidoV3 sempre grava id+rotulo+regra", () => {
    const grupo = montarGrupoMetaOrcamentoRapidoV3(inputBase(), "g1");
    expect(grupo).toEqual({ id: "g1", rotulo: "Escolha a tela", regra: "escolha_1" });
  });
});
