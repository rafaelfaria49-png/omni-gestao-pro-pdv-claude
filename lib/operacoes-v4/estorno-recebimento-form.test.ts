import { describe, it, expect } from "vitest";
import {
  MOTIVO_ESTORNO_MIN_LEN,
  buildEstornarRecebimentoInputV4,
  validarMotivoEstornoV4,
} from "./estorno-recebimento-form";

describe("validarMotivoEstornoV4", () => {
  it("rejeita motivo vazio", () => {
    expect(validarMotivoEstornoV4("")).toEqual({ ok: false, erro: "Informe o motivo do estorno." });
  });

  it("rejeita motivo só com espaços (trim)", () => {
    const v = validarMotivoEstornoV4("     ");
    expect(v.ok).toBe(false);
    expect(v.erro).toBe("Informe o motivo do estorno.");
  });

  it(`rejeita motivo abaixo do mínimo (${MOTIVO_ESTORNO_MIN_LEN} caracteres)`, () => {
    const curto = "a".repeat(MOTIVO_ESTORNO_MIN_LEN - 1);
    const v = validarMotivoEstornoV4(curto);
    expect(v.ok).toBe(false);
    expect(v.erro).toMatch(/mín\./i);
  });

  it("aceita motivo exatamente no mínimo de caracteres", () => {
    const exato = "a".repeat(MOTIVO_ESTORNO_MIN_LEN);
    expect(validarMotivoEstornoV4(exato)).toEqual({ ok: true });
  });

  it("aceita motivo com conteúdo real", () => {
    expect(validarMotivoEstornoV4("Cliente pagou valor errado")).toEqual({ ok: true });
  });

  it("aplica trim antes de medir o tamanho (espaços nas pontas não contam)", () => {
    const comEspacos = "  " + "a".repeat(MOTIVO_ESTORNO_MIN_LEN) + "   ";
    expect(validarMotivoEstornoV4(comEspacos)).toEqual({ ok: true });
  });
});

describe("buildEstornarRecebimentoInputV4", () => {
  it("monta o input canônico com sessaoId e motivo trimados", () => {
    expect(buildEstornarRecebimentoInputV4("  sessao-1  ", "  motivo real do estorno  ")).toEqual({
      sessaoId: "sessao-1",
      motivo: "motivo real do estorno",
    });
  });

  it("não inventa valores — devolve exatamente o que recebeu (sem defaults escondidos)", () => {
    const input = buildEstornarRecebimentoInputV4("sessao-x", "duplicidade de pagamento");
    expect(Object.keys(input).sort()).toEqual(["motivo", "sessaoId"]);
  });
});
