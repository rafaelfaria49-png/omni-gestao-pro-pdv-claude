// @vitest-environment node
// OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — A7: EQUIVALÊNCIA de decisões.
// Compara a projeção atual com o baseline CONGELADO sobre 721924c ANTES da
// mudança (`equivalencia-baseline.json`, gerado por `equivalencia.gerar.ts`). Todo
// campo legado tem de sair idêntico; só podem surgir as quatro dimensões aditivas.
// O baseline nunca é regenerado por este teste.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { projectFinancialOSV4 } from "@/lib/operacoes-v4/financial-projection";
import { CASOS } from "./equivalencia-casos";

type Baseline = { geradoSobre: string; casos: Array<{ nome: string; saida: Record<string, unknown> }> };
const baseline = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "equivalencia-baseline.json"), "utf8"),
) as Baseline;

const ADITIVOS = ["acoes", "comercial", "fatos", "historico"];
const DECISAO = [
  "deliveryDecision",
  "canReceive",
  "canDeliver",
  "financialStatus",
  "consistencyStatus",
  "consistencyIssues",
  "receivedTotal",
  "balance",
];

describe("A7 — equivalência com o baseline congelado (decisões e campos legados)", () => {
  it("o baseline foi gerado sobre a main do planejamento integrado, com a mesma matriz", () => {
    expect(baseline.geradoSobre).toBe("721924c1a661136a1c002b7925feaf5baabde474");
    expect(baseline.casos.map((c) => c.nome)).toEqual(CASOS.map((c) => c.nome));
    expect(baseline.casos.length).toBeGreaterThanOrEqual(30);
  });

  for (const [i, { nome, input }] of CASOS.entries()) {
    it(`${nome}: campos legados idênticos; só dimensões aditivas novas`, () => {
      const antes = baseline.casos[i]!.saida;
      const agora = projectFinancialOSV4(input) as unknown as Record<string, unknown>;
      for (const campo of DECISAO) expect(agora[campo], campo).toEqual(antes[campo]);
      for (const campo of Object.keys(antes)) expect(agora[campo], campo).toEqual(antes[campo]);
      expect(Object.keys(agora).filter((k) => !(k in antes)).sort()).toEqual(ADITIVOS);
      // `acoes` só espelha a decisão legada.
      const acoes = agora.acoes as { podeReceber: boolean; podeEntregar: boolean; impedimento: unknown };
      expect(acoes.podeReceber).toBe(antes.canReceive);
      expect(acoes.podeEntregar).toBe(antes.canDeliver);
      expect(acoes.impedimento === null).toBe(antes.canDeliver === true);
    });
  }
});
