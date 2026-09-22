import { describe, expect, it } from "vitest";
import {
  aplicarPatchIntencionalProvaEntrada,
  ehConflitoConcorrenciaV3,
  erroConflitoConcorrenciaV3,
  mesclarEspelhoEquipamento,
  CONFLITO_CONCORRENCIA_V3,
  type PatchProvaEntradaV3,
} from "@/lib/operacoes-v4/entrada-form";
import type { ProvaEntradaV3 } from "./prova-entrada-model";

// OPS-V4-FLUXO-CURTO-001 / R01+R02 — patch intencional e erro de conflito.
//
// CAMADA: unidade pura (sem I/O, sem banco). A atomicidade condicionada
// (updateMany por updatedAt) é provada na integração PG
// (lib/operacoes-v4/entrada-readback.integration.test.ts); aqui valem as
// regras de decisão: definido aplica, ausente preserva, só `limpar` remove,
// desconhecidos sobrevivem, conflito é explícito.

function provaBase(sobre?: Partial<ProvaEntradaV3>): ProvaEntradaV3 {
  return {
    versao: 1,
    criadoEm: "2026-01-01T00:00:00.000Z",
    criadoPor: "qa",
    identificacao: { imei: "111", serial: "S1", operadora: "Vivo", modelo: "M1", cor: "Violeta" },
    estadoFisico: [{ componente: "tela", status: "ok" }],
    avarias: [],
    fotos: [],
    credenciais: { pin: "1234" },
    acessorios: [],
    assinaturaCliente: undefined,
    ...(sobre ?? {}),
  } as ProvaEntradaV3;
}

describe("R01 — patch de identificação preserva condição e campos alheios", () => {
  it("editar só a cor (Violeta → Preto) mantém IMEI, modelo e estado físico", () => {
    const base = provaBase();
    const next = aplicarPatchIntencionalProvaEntrada(base, {
      identificacao: { valores: { cor: "Preto" } },
    });
    expect(next.identificacao.cor).toBe("Preto");
    expect(next.identificacao.imei).toBe("111");
    expect(next.identificacao.modelo).toBe("M1");
    expect(next.identificacao.serial).toBe("S1");
    expect(next.estadoFisico).toEqual(base.estadoFisico);
    expect(next.versao).toBe(1);
  });

  it("chave ausente do intent preserva; `undefined` em valores nunca apaga", () => {
    const base = provaBase();
    const intent: PatchProvaEntradaV3 = {
      identificacao: { valores: { cor: undefined, modelo: undefined } },
    };
    const next = aplicarPatchIntencionalProvaEntrada(base, intent);
    expect(next.identificacao.cor).toBe("Violeta");
    expect(next.identificacao.modelo).toBe("M1");
  });

  it("chaves desconhecidas da prova sobrevivem ao patch", () => {
    const base = { ...provaBase(), campoFuturo: { x: 1 } } as unknown as ProvaEntradaV3;
    const next = aplicarPatchIntencionalProvaEntrada(base, {
      identificacao: { valores: { cor: "Preto" } },
    }) as unknown as Record<string, unknown>;
    expect(next["campoFuturo"]).toEqual({ x: 1 });
  });
});

describe("R02 — limpeza explícita campo a campo", () => {
  it("somente a lista `limpar` remove; vazio sem lista preserva", () => {
    const base = provaBase();
    const semLista = aplicarPatchIntencionalProvaEntrada(base, {
      identificacao: { valores: {} },
    });
    expect(semLista.identificacao.serial).toBe("S1");
    const comLista = aplicarPatchIntencionalProvaEntrada(base, {
      identificacao: { valores: {}, limpar: ["serial"] },
    });
    expect(comLista.identificacao.serial).toBeUndefined();
    expect(comLista.identificacao.imei).toBe("111");
  });

  it("credenciais: limpar PIN preserva senha e demais chaves", () => {
    const base = provaBase({ credenciais: { pin: "1234", senha: "abcd" } });
    const next = aplicarPatchIntencionalProvaEntrada(base, {
      credenciais: { valores: {}, limpar: ["pin"] },
    });
    expect(next.credenciais.pin).toBeUndefined();
    expect(next.credenciais.senha).toBe("abcd");
  });

  it("assinatura: chave ausente preserva; `null` limpa explicitamente", () => {
    const base = provaBase({
      assinaturaCliente: { dataUrl: "data:image/png;base64,x", criadoEm: "2026-01-01T00:00:00.000Z" },
    });
    const preservada = aplicarPatchIntencionalProvaEntrada(base, {});
    expect(preservada.assinaturaCliente?.dataUrl).toBe("data:image/png;base64,x");
    const limpa = aplicarPatchIntencionalProvaEntrada(base, { assinaturaCliente: null });
    expect(limpa.assinaturaCliente).toBeUndefined();
  });

  it("fatias de lista substituem a fatia sem tocar as demais", () => {
    const base = provaBase();
    const next = aplicarPatchIntencionalProvaEntrada(base, {
      acessorios: [{ id: "carregador", presente: true }],
    });
    expect(next.acessorios).toEqual([{ id: "carregador", presente: true }]);
    expect(next.identificacao.cor).toBe("Violeta");
    expect(next.estadoFisico).toEqual(base.estadoFisico);
  });
});

describe("R02 — espelho legado de equipamento mescla sem apagar alheios", () => {
  it("modelo/numeroSerie novos vencem; demais chaves do espelho sobrevivem", () => {
    const atual = { modelo: "Antigo", numeroSerie: "000", garantia: "g1" };
    const next = mesclarEspelhoEquipamento(atual, { modelo: "Novo" });
    expect(next).toEqual({ modelo: "Novo", numeroSerie: "000", garantia: "g1" });
  });

  it("espelho ausente vira objeto só com o patch", () => {
    expect(mesclarEspelhoEquipamento(undefined, { modelo: "M" })).toEqual({ modelo: "M" });
  });
});

describe("R02 — conflito de concorrência é explícito", () => {
  it("erro carrega código e orienta recarregar sem sobrescrever", () => {
    const e = erroConflitoConcorrenciaV3("a prova de entrada");
    expect(ehConflitoConcorrenciaV3(e)).toBe(true);
    expect((e as Error & { code?: string }).code).toBe(CONFLITO_CONCORRENCIA_V3);
    expect(e.message).toMatch(/outra sessão/);
    expect(e.message).toMatch(/Recarregue/);
  });

  it("erro comum não é confundido com conflito", () => {
    expect(ehConflitoConcorrenciaV3(new Error("OS não encontrada."))).toBe(false);
    expect(ehConflitoConcorrenciaV3(null)).toBe(false);
  });
});
