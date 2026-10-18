import { describe, expect, it } from "vitest";
import { reaisParaCentavosV4, sugerirPrecoTelaCentavos } from "./precificacao-telas";

describe("precificação opt-in de telas — centavos", () => {
  it.each([
    [60, 260], [80, 280], [100, 300], [130, 330], [200, 400],
    [201, 402], [230, 460], [350, 700], [500, 1000], [700, 1400],
    [701, 1401], [1000, 1700], [1001, 1701.70], [1500, 2550],
  ])("custo R$ %s → preço R$ %s", (custo, preco) => {
    expect(sugerirPrecoTelaCentavos(reaisParaCentavosV4(custo))).toBe(reaisParaCentavosV4(preco));
  });

  it.each([
    [20_001, 40_002], [70_001, 140_001], [100_001, 170_002],
    [100_005, 170_009], [100_015, 170_026],
  ])("limite fracionário e arredondamento comercial: %s → %s centavos", (custo, preco) => {
    expect(sugerirPrecoTelaCentavos(custo)).toBe(preco);
  });

  it.each([undefined, null, 0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER])("recusa custo inválido/ausente ou overflow: %s", (custo) => {
    expect(sugerirPrecoTelaCentavos(custo)).toBeNull();
  });

  it.each([[3.5, 350], [1.5, 150], [1001.01, 100101], [0.29, 29], [0, 0]])("converte R$ %s em %s centavos sem multiplicação decimal", (reais, centavos) => {
    expect(reaisParaCentavosV4(reais)).toBe(centavos);
  });

  it.each([undefined, null, NaN, Infinity, -1, 0.001, 1.005, Number.MAX_SAFE_INTEGER])("não inventa centavos para entrada inválida: %s", (valor) => {
    expect(reaisParaCentavosV4(valor)).toBeNull();
  });
});
