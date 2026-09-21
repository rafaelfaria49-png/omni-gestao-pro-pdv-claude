// OPS-V4-FLUXO-CURTO-001 / R03 — leitores de OS (geração e invalidação).
//
// CAMADA: unidade da semântica de contexto (geração de requisição, descarte de
// resposta tardia, falha fechada sem loja). Montagem real do hook exige
// ambiente DOM + React montado (jsdom/testing-library ausentes neste repo —
// sem dependências novas por gate de configuração); os blocos montados ficam
// como `it.skip` documentado. A lógica pura equivalente
// (resolverOSSelecionada/alvoAindaSelecionado, em lib/operacoes-v4/entrada-form.ts)
// é exercida de forma executável em lib/operacoes-v4/entrada-readback.test.ts (R03).
import { describe, expect, it } from "vitest";
import { alvoAindaSelecionado, resolverOSSelecionada } from "@/lib/operacoes-v4/entrada-form";
import type { OrdemServico } from "@/types/os";

describe("R03 — geração de requisição (contrato executável em leitura)", () => {
  it("documenta a regra: limpar seleção/loja invalida a geração pendente", () => {
    // Regra pinada pelos testes executáveis de resolverOSSelecionada/
    // alvoAindaSelecionado (entrada-readback.test.ts) + pelo diff de
    // use-ordens-v4.ts (bump de reqRef no ramo vazio e cleanup no unmount).
    const detalhe = { id: "os-1", storeId: "loja-a" } as unknown as OrdemServico;
    expect(resolverOSSelecionada({ selectedOsId: "os-1", lojaIdAtiva: "loja-a", ordemDetail: detalhe, ordens: [] })).toBe(detalhe);
    expect(alvoAindaSelecionado({ lojaId: "a", osId: "1" }, { lojaId: "b", osId: "1" })).toBe(false);
  });
});

describe.skip("R03 — montagem do hook (BLOQUEADO: sem DOM/test-renderer no repo)", () => {
  it("resposta tardia de A não repovoa após limpar a seleção", () => {
    // Requer: renderHook(useOrdemV4) com getOrdem mockada (promessa controlada),
    // limpar seleção antes da resolução e assert de ordem nula.
    // Bloqueio: package.json é gate (G-CONFIG-DEPLOY); sem jsdom/testing-library
    // ou react-test-renderer não há montagem React no Vitest `node`.
  });

  it("desmontar invalida a geração (sem setState em componente morto)", () => {
    // Requer: montagem + unmount antes da resolução + assert de geração inválida.
  });
});
