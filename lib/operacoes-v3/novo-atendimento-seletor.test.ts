import { describe, expect, it } from "vitest";
import { NOVO_ATENDIMENTO_COPY_V3, NOVO_ATENDIMENTO_OPCOES_V3, motorNovoAtendimentoV3 } from "./novo-atendimento-seletor";

describe("seletor Novo atendimento da V3 (GOAL OPERACOES-V3-NOVA-OS-SELETOR-003)", () => {
  it("tem só as três opções, na ordem: Nova OS, Orçamento, Retorno / Garantia", () => {
    expect(NOVO_ATENDIMENTO_OPCOES_V3.map((o) => o.id)).toEqual(["os", "orcamento", "retorno"]);
    expect(NOVO_ATENDIMENTO_OPCOES_V3.map((o) => o.titulo)).toEqual(["Nova OS", "Orçamento", "Retorno / Garantia"]);
  });

  it("não oferece Atendimento rápido", () => {
    expect(NOVO_ATENDIMENTO_OPCOES_V3.some((o) => /atendimento r[aá]pido/i.test(o.titulo))).toBe(false);
    expect(NOVO_ATENDIMENTO_OPCOES_V3.some((o) => (o.id as string) === "rapido")).toBe(false);
  });

  it("cada opção leva a uma Server Action V3 existente — nenhuma recebe pagamento", () => {
    expect(motorNovoAtendimentoV3("os")).toBe("criarOSEnterpriseV3");
    expect(motorNovoAtendimentoV3("orcamento")).toBe("criarOSPreOrcamentoV3");
    expect(motorNovoAtendimentoV3("retorno")).toBe("abrirRetornoV3");
    expect(NOVO_ATENDIMENTO_OPCOES_V3.every((o) => !/receb|finalizar/i.test(o.motor))).toBe(true);
  });

  it("usa a mesma copy de título da V4", () => {
    expect(NOVO_ATENDIMENTO_COPY_V3.titulo).toBe("Novo atendimento");
  });
});
