import { describe, expect, it } from "vitest";
import {
  NOVO_ATENDIMENTO_COPY_V4,
  NOVO_ATENDIMENTO_OPCOES_V4,
  opcaoNovoAtendimentoV4,
  patchAbrirLauncherNovoAtendimentoV4,
  patchEscolherNovoAtendimentoV4,
  type NovoAtendimentoModalidadeV4,
} from "./novo-atendimento";

describe("NOVO_ATENDIMENTO_OPCOES_V4", () => {
  it("tem as três criações aprovadas + a entrada do Retorno / Garantia (GOAL 007) — sem quarto motor", () => {
    expect(NOVO_ATENDIMENTO_OPCOES_V4.map((o) => o.id)).toEqual(["os", "orcamento", "rapido", "retorno"]);
  });

  it("cada opção aponta para um motor V3 já existente", () => {
    expect(opcaoNovoAtendimentoV4("os").motor).toBe("criarOSEnterpriseV3");
    expect(opcaoNovoAtendimentoV4("orcamento").motor).toBe("criarOrcamentoRapidoV3");
    expect(opcaoNovoAtendimentoV4("rapido").motor).toBe("finalizarAtendimentoRapidoV3");
    expect(opcaoNovoAtendimentoV4("retorno").motor).toBe("abrirRetornoV3");
  });

  it("Retorno / Garantia tem copy própria e parte da OS original", () => {
    expect(opcaoNovoAtendimentoV4("retorno")).toMatchObject({ titulo: "Retorno / Garantia", chip: "Volta da OS original", destino: "entrada" });
  });

  it("o destino no workspace continua o dos handlers atuais", () => {
    expect(opcaoNovoAtendimentoV4("os").destino).toBe("entrada");
    expect(opcaoNovoAtendimentoV4("orcamento").destino).toBe("orcamento");
    expect(opcaoNovoAtendimentoV4("rapido").destino).toBe("entrega");
  });

  it("copy do launcher é a aprovada no GOAL", () => {
    expect(NOVO_ATENDIMENTO_COPY_V4.titulo).toBe("Novo atendimento");
    expect(NOVO_ATENDIMENTO_COPY_V4.subtitulo).toBe("Escolha como este atendimento começa.");
    expect(NOVO_ATENDIMENTO_COPY_V4.cta).toBe("+ Novo");
  });
});

describe("patchAbrirLauncherNovoAtendimentoV4", () => {
  it("abre só o launcher e fecha os três formulários", () => {
    expect(patchAbrirLauncherNovoAtendimentoV4()).toEqual({
      novoAtendimento: true,
      novaOS: false,
      orcamentoRapido: false,
      atendimentoRapido: false,
    });
  });
});

describe("patchEscolherNovoAtendimentoV4", () => {
  const casos: Array<[NovoAtendimentoModalidadeV4, keyof ReturnType<typeof patchEscolherNovoAtendimentoV4>]> = [
    ["os", "novaOS"],
    ["orcamento", "orcamentoRapido"],
    ["rapido", "atendimentoRapido"],
  ];

  it("escolher retorno fecha o launcher e NÃO abre nenhum formulário de criação", () => {
    expect(patchEscolherNovoAtendimentoV4("retorno")).toEqual({ novoAtendimento: false, novaOS: false, orcamentoRapido: false, atendimentoRapido: false });
  });

  it.each(casos)("escolhe %s e abre só %s", (id, flag) => {
    const patch = patchEscolherNovoAtendimentoV4(id);
    expect(patch.novoAtendimento).toBe(false);
    expect(patch.novaOS).toBe(flag === "novaOS");
    expect(patch.orcamentoRapido).toBe(flag === "orcamentoRapido");
    expect(patch.atendimentoRapido).toBe(flag === "atendimentoRapido");
  });
});
