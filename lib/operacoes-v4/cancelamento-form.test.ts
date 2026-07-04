import { describe, it, expect } from "vitest";
import {
  MOTIVO_CANCELAMENTO_MIN_LEN,
  buildCancelarOSInputV4,
  validarMotivoCancelamentoV4,
} from "./cancelamento-form";

describe("validarMotivoCancelamentoV4", () => {
  it("rejeita motivo vazio", () => {
    expect(validarMotivoCancelamentoV4("")).toEqual({ ok: false, erro: "Informe o motivo do cancelamento." });
  });

  it("rejeita motivo só com espaços (trim)", () => {
    const v = validarMotivoCancelamentoV4("     ");
    expect(v.ok).toBe(false);
    expect(v.erro).toBe("Informe o motivo do cancelamento.");
  });

  it(`rejeita motivo abaixo do mínimo (${MOTIVO_CANCELAMENTO_MIN_LEN} caracteres)`, () => {
    const curto = "a".repeat(MOTIVO_CANCELAMENTO_MIN_LEN - 1);
    const v = validarMotivoCancelamentoV4(curto);
    expect(v.ok).toBe(false);
    expect(v.erro).toMatch(/mín\./i);
  });

  it("aceita motivo exatamente no mínimo de caracteres", () => {
    const exato = "a".repeat(MOTIVO_CANCELAMENTO_MIN_LEN);
    expect(validarMotivoCancelamentoV4(exato)).toEqual({ ok: true });
  });

  it("aceita motivo com conteúdo real", () => {
    expect(validarMotivoCancelamentoV4("Cliente desistiu do serviço")).toEqual({ ok: true });
  });

  it("aplica trim antes de medir o tamanho (espaços nas pontas não contam)", () => {
    const comEspacos = "  " + "a".repeat(MOTIVO_CANCELAMENTO_MIN_LEN) + "   ";
    expect(validarMotivoCancelamentoV4(comEspacos)).toEqual({ ok: true });
  });
});

describe("buildCancelarOSInputV4", () => {
  it("monta o input canônico com motivo trimado", () => {
    expect(buildCancelarOSInputV4("  cliente desistiu  ")).toEqual({ motivo: "cliente desistiu" });
  });

  it("não inventa valores — devolve exatamente o campo motivo (sem defaults escondidos)", () => {
    const input = buildCancelarOSInputV4("engano no cadastro");
    expect(Object.keys(input)).toEqual(["motivo"]);
  });
});
