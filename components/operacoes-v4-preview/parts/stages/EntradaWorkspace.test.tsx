// OPS-V4-FLUXO-CURTO-001 / R04 — rascunho do workspace (mesclagem e saídas).
//
// CAMADA: unidade da mesclagem por fatia + contrato do stash por loja+OS.
// Montagem real (chegada assíncrona da semente, edição durante refresh,
// desmontagem com rascunho sujo) exige DOM montado — ausente neste repo
// (ver use-ordens-v4.test.tsx). A mesclagem é exercida de forma executável em
// lib/operacoes-v4/entrada-readback.test.ts (R04); os blocos montados ficam
// como `it.skip` documentado.
import { describe, expect, it } from "vitest";
import { mesclarNaoTocadas } from "@/lib/operacoes-v4/entrada-form";

describe("R04 — mesclarNaoTocadas (fatia não tocada adota o servidor)", () => {
  it("adota fatias iguais à linha de base e preserva as tocadas", () => {
    const atual = { a: "typed", b: "old" };
    const salvo = { a: "old", b: "old" };
    const novo = { a: "server-new", b: "server-new" };
    const r = mesclarNaoTocadas(atual, salvo, novo);
    expect(r.mudou).toBe(true);
    expect(r.valor).toEqual({ a: "typed", b: "server-new" });
  });

  it("sem mudança no servidor, nada muda", () => {
    const atual = { a: "x" };
    const r = mesclarNaoTocadas(atual, { a: "x" }, { a: "x" });
    expect(r.mudou).toBe(false);
    expect(r.valor).toEqual({ a: "x" });
  });

  it("ignora chaves fora do rascunho atual (sem inventar campo)", () => {
    const r = mesclarNaoTocadas({ a: "x" }, { a: "x" }, { a: "x", z: "nova" } as Record<string, unknown>);
    expect(r.valor).toEqual({ a: "x" });
  });
});

describe.skip("R04 — montagem do workspace (BLOQUEADO: sem DOM/test-renderer no repo)", () => {
  it("semente assíncrona alimenta campos não tocados e preserva digitados", () => {
    // Requer: montar EntradaWorkspace com v fake (semente vazia), simular
    // chegada do detalhe (nova semente), digitar, disparar refresh e comparar.
  });

  it("troca de OS/loja preserva o rascunho no stash e restaura ao voltar", () => {
    // Requer: montar EntradaStage, digitar, trocar seleção, voltar e comparar.
  });

  it("descartar limpa o rascunho da chave atual sem storage genérico", () => {
    // Requer: montar, digitar, clicar Descartar e comparar com a semente.
  });
});
