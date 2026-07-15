import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { unknownFinancialProjectionOSV4 } from "@/lib/operacoes-v4/financial-projection";

vi.mock("@/lib/operacoes-v4/financial-projection-actions", () => ({
  lerProjecaoFinanceiraOSV4: vi.fn(),
  lerProjecoesFinanceirasOSV4: vi.fn(),
}));

import { projectCurrentFinancialProjectionV4 } from "./use-financial-projection-v4";

const keyA = "store-a:os-a";
const keyB = "store-a:os-b";
const projectionA = unknownFinancialProjectionOSV4({
  storeId: "store-a", osId: "os-a", loadedAt: "2026-07-15T12:00:00.000Z", errorCode: "TEST",
});

describe("useFinancialProjectionV4 — identidade e fail-closed", () => {
  it("caso J: troca rápida A paga → B nunca expõe a projeção de A", () => {
    const state = projectCurrentFinancialProjectionV4({
      targetKey: keyB,
      loadedKey: keyA,
      projection: { ...projectionA, financialStatus: "PAID", expectedTotal: 100, receivedTotal: 100, balance: 0 },
      loading: false,
      errorKey: null,
      error: null,
    });
    expect(state).toEqual({ projection: null, loading: true, error: null });
  });

  it("erro de B mantém A mascarada e não cria projeção zerada", () => {
    const state = projectCurrentFinancialProjectionV4({
      targetKey: keyB,
      loadedKey: keyA,
      projection: projectionA,
      loading: false,
      errorKey: keyB,
      error: "Falha ao carregar B",
    });
    expect(state).toEqual({ projection: null, loading: false, error: "Falha ao carregar B" });
  });

  it("só expõe o DTO cuja identidade carregada coincide com a OS alvo", () => {
    const projectionB = { ...projectionA, osId: "os-b" };
    expect(projectCurrentFinancialProjectionV4({
      targetKey: keyB,
      loadedKey: keyB,
      projection: projectionB,
      loading: false,
      errorKey: null,
      error: null,
    })).toEqual({ projection: projectionB, loading: false, error: null });
  });

  it("o effect invalida request anterior e limpa projeção/mapa antes de nova leitura", () => {
    const source = readFileSync(fileURLToPath(new URL("./use-financial-projection-v4.ts", import.meta.url)), "utf8");
    expect(source).toContain("const currentRequest = ++requestId.current");
    expect(source).toMatch(/setState\(\{ loadedKey: null, projection: null, loading: !!targetKey/);
    expect(source).toMatch(/setState\(\{ loadedKey: null, projections: \[\], loading: !!targetKey/);
    expect(source).toContain("requestId.current !== currentRequest");
  });
});
