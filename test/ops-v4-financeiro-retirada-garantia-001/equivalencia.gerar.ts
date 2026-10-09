// OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — GERADOR do baseline de equivalência.
//
// Rodado UMA vez sobre a main vigente ANTES de qualquer mudança na projeção
// (base 721924c, que não altera a projeção em relação a 85aafb4):
//   npx --no-install vitest run --config test/ops-v4-financeiro-retirada-garantia-001/vitest.baseline.config.ts
// Grava `equivalencia-baseline.json` com a saída COMPLETA da projeção por caso.
// O teste de equivalência só LÊ esse arquivo; nunca o regenera depois da mudança.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { it } from "vitest";
import { projectFinancialOSV4 } from "@/lib/operacoes-v4/financial-projection";
import { CASOS } from "./equivalencia-casos";

it("gera o baseline de equivalência a partir da projeção ATUAL", () => {
  const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const sujo = execSync("git status --porcelain -- lib components", { encoding: "utf8" }).trim();
  if (sujo) throw new Error(`Baseline exige lib/ e components/ limpos (sem mudança de produto):\n${sujo}`);
  const saidas = CASOS.map(({ nome, input }) => ({ nome, saida: projectFinancialOSV4(input) }));
  const destino = resolve(dirname(fileURLToPath(import.meta.url)), "equivalencia-baseline.json");
  writeFileSync(destino, `${JSON.stringify({ geradoSobre: head, casos: saidas }, null, 2)}\n`);
});
