import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

vi.mock("@/lib/operacoes-v3/pdv-servico-actions", () => ({
  lerPagamentoOSV3: vi.fn(),
  receberOSV3: vi.fn(),
  estornarRecebimentoOSV3: vi.fn(),
}));

import { projetarLeituraAtualPdvServicoV3 } from "./use-pdv-servico-v3";

const keyA = JSON.stringify(["store-a", "os-a"]);
const keyB = JSON.stringify(["store-a", "os-b"]);
const pagamentoA = { total: 100, recebido: 100, saldo: 0, status: "quitado" as const };
const sessaoA = { aberta: true, sessaoId: "caixa-a" };

describe("usePdvServicoV3 — identidade da OS carregada", () => {
  it("troca rápida A → B nunca expõe pagamento/sessão de A em B", () => {
    expect(projetarLeituraAtualPdvServicoV3({
      targetKey: keyB,
      loadedKey: keyA,
      errorKey: null,
      pagamento: pagamentoA,
      sessao: sessaoA,
      loading: false,
      error: null,
    })).toEqual({ pagamento: null, sessao: null, loading: true, error: null });
  });

  it("erro ao carregar B mantém pagamento/sessão anteriores mascarados e expõe o erro de B", () => {
    expect(projetarLeituraAtualPdvServicoV3({
      targetKey: keyB,
      loadedKey: keyA,
      errorKey: keyB,
      pagamento: pagamentoA,
      sessao: sessaoA,
      loading: false,
      error: "Falha ao carregar B",
    })).toEqual({ pagamento: null, sessao: null, loading: false, error: "Falha ao carregar B" });
  });

  it("só expõe o snapshot quando a identidade carregada coincide com a OS alvo", () => {
    expect(projetarLeituraAtualPdvServicoV3({
      targetKey: keyB,
      loadedKey: keyB,
      errorKey: null,
      pagamento: pagamentoA,
      sessao: sessaoA,
      loading: false,
      error: null,
    })).toEqual({ pagamento: pagamentoA, sessao: sessaoA, loading: false, error: null });
  });

  it("o effect invalida request anterior e limpa pagamento/sessão antes da nova leitura e também no catch", () => {
    const source = readFileSync(fileURLToPath(new URL("./use-pdv-servico-v3.ts", import.meta.url)), "utf8");
    expect(source).toMatch(/const reqId = \+\+reqRef\.current;\s*setPagamento\(null\);\s*setSessao\(null\)/);
    expect(source).toMatch(/\.catch\(\(e\) => \{[\s\S]*setPagamento\(null\);\s*setSessao\(null\);/);
    expect(source).toContain("activeKeyRef.current !== targetKey");
  });
});
