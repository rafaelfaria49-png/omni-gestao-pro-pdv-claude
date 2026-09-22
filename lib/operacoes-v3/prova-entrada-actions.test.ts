import { describe, expect, it } from "vitest";
import {
  aplicarPatchIntencionalProvaEntrada,
  ehConflitoConcorrenciaV3,
  erroConflitoConcorrenciaV3,
  espelhoPatchIdentificacao,
  mesclarEspelhoEquipamento,
  CONFLITO_CONCORRENCIA_V3,
  type PatchProvaEntradaV3,
} from "@/lib/operacoes-v4/entrada-form";
import { identidadeAtualV4 } from "@/lib/operacoes-v4/identidade-aparelho";
import type { OrdemServico } from "@/types/os";
import type { AcessorioEntradaV3, ProvaEntradaV3 } from "./prova-entrada-model";

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

describe("R02 — baseline por campo: sequencial stale preserva; mesmo campo conflita", () => {
  const baseM1Violeta = () =>
    provaBase({
      identificacao: { imei: "1", serial: "S", operadora: "Vivo", modelo: "M1", cor: "Violeta" },
    });

  it("B salva modelo=M2; A stale (M1) salva só cor=Preto → final M2 + Preto", () => {
    // A envia SOMENTE o tocado (cor), com baseline Violeta; modelo não viaja.
    const latest = baseM1Violeta();
    latest.identificacao.modelo = "M2";
    const next = aplicarPatchIntencionalProvaEntrada(latest, {
      identificacao: { valores: { cor: "Preto" } },
      esperados: { identificacao: { cor: "Violeta" } },
    });
    expect(next.identificacao.cor).toBe("Preto");
    expect(next.identificacao.modelo).toBe("M2");
  });

  it("mesmo campo: B salva cor=Verde; A (baseline Violeta) tenta Preto → conflito, Verde preservado", () => {
    const latest = baseM1Violeta();
    latest.identificacao.cor = "Verde";
    let erro: unknown = null;
    try {
      aplicarPatchIntencionalProvaEntrada(latest, {
        identificacao: { valores: { cor: "Preto" } },
        esperados: { identificacao: { cor: "Violeta" } },
      });
    } catch (e) {
      erro = e;
    }
    expect(ehConflitoConcorrenciaV3(erro)).toBe(true);
    expect(String((erro as Error).message)).toMatch(/identificacao\.cor/);
    // Nada aplicado: o latest segue intacto para releitura.
    expect(latest.identificacao.cor).toBe("Verde");
  });

  it("fatia de lista com baseline divergente conflita em vez de clobber", () => {
    const latest = provaBase();
    latest.estadoFisico = [{ componente: "tela", status: "avariado" }];
    expect(() =>
      aplicarPatchIntencionalProvaEntrada(latest, {
        estadoFisico: [{ componente: "tela", status: "ok" }],
        esperados: { estadoFisico: [{ componente: "tela", status: "ok" }] },
      }),
    ).toThrowError(/estadoFisico/);
  });

  it("sem esperados aplica direto (chamadores legados sem baseline)", () => {
    const next = aplicarPatchIntencionalProvaEntrada(baseM1Violeta(), {
      identificacao: { valores: { cor: "Preto" } },
    });
    expect(next.identificacao.cor).toBe("Preto");
    expect(next.identificacao.modelo).toBe("M1");
  });
});

describe("R independente 9464b00 — 1. baseline efetiva da identificação", () => {
  const provaSemCor = () =>
    provaBase({ identificacao: { imei: "1", serial: "S", operadora: "Vivo", modelo: "M1" } });

  it("equipamento.cor=Violeta + prova.cor ausente → editar Preto com expected=Violeta = sucesso", () => {
    const next = aplicarPatchIntencionalProvaEntrada(
      provaSemCor(),
      {
        identificacao: { valores: { cor: "Preto" } },
        esperados: { identificacao: { cor: "Violeta" } },
      },
      { identidadeEfetiva: { cor: "Violeta" } },
    );
    expect(next.identificacao.cor).toBe("Preto");
    expect(next.identificacao.modelo).toBe("M1");
  });

  it('campo realmente ausente (""/undefined) → primeiro preenchimento = sucesso', () => {
    const base = provaBase({ identificacao: {} });
    const porVazio = aplicarPatchIntencionalProvaEntrada(base, {
      identificacao: { valores: { cor: "Preto" } },
      esperados: { identificacao: { cor: "" } },
    });
    expect(porVazio.identificacao.cor).toBe("Preto");
    const semEsperados = aplicarPatchIntencionalProvaEntrada(base, {
      identificacao: { valores: { serial: "S9" } },
    });
    expect(semEsperados.identificacao.serial).toBe("S9");
  });

  it("alteração concorrente real no mesmo campo = conflito (efetiva Verde × baseline Violeta)", () => {
    let erro: unknown = null;
    try {
      aplicarPatchIntencionalProvaEntrada(
        provaBase({ identificacao: { imei: "1", modelo: "M1", cor: "Verde" } }),
        {
          identificacao: { valores: { cor: "Preto" } },
          esperados: { identificacao: { cor: "Violeta" } },
        },
        { identidadeEfetiva: { cor: "Verde" } },
      );
    } catch (e) {
      erro = e;
    }
    expect(ehConflitoConcorrenciaV3(erro)).toBe(true);
    expect(String((erro as Error).message)).toMatch(/identificacao\.cor/);
  });
});

describe("R independente 9464b00 — 2. limpeza dos espelhos", () => {
  it("espelhoPatchIdentificacao: valores espelham; limpar remove o espelho (undefined)", () => {
    expect(espelhoPatchIdentificacao({ cor: "Preto", modelo: "M", imei: "9" })).toEqual({
      cor: "Preto",
      modelo: "M",
      numeroSerie: "9",
    });
    const patch = espelhoPatchIdentificacao({}, ["cor", "modelo", "imei"]);
    expect("cor" in patch && patch.cor).toBeUndefined();
    expect("modelo" in patch && patch.modelo).toBeUndefined();
    expect("numeroSerie" in patch && patch.numeroSerie).toBeUndefined();
    // Serial/operadora não têm espelho.
    expect(espelhoPatchIdentificacao({}, ["serial", "operadora"])).toEqual({});
  });

  it("mesclarEspelhoEquipamento: undefined remove a chave e preserva as demais", () => {
    const next = mesclarEspelhoEquipamento(
      { modelo: "M1", cor: "Violeta", numeroSerie: "111", garantia: "g1" },
      { cor: undefined },
    );
    expect(next).toEqual({ modelo: "M1", numeroSerie: "111", garantia: "g1" });
    expect("cor" in next).toBe(false);
  });

  it("Violeta → limpar cor → reload efetivo = cor vazia, sem ressuscitar Violeta", () => {
    // Prova limpa o campo…
    const prova = aplicarPatchIntencionalProvaEntrada(
      provaBase({ identificacao: { imei: "1", modelo: "M1", cor: "Violeta" } }),
      { identificacao: { valores: {}, limpar: ["cor"] }, esperados: { identificacao: { cor: "Violeta" } } },
      { identidadeEfetiva: { cor: "Violeta", modelo: "M1", imei: "1" } },
    );
    expect(prova.identificacao.cor).toBeUndefined();
    // …e o espelho acompanha, preservando as demais chaves…
    const equipamento = mesclarEspelhoEquipamento(
      { modelo: "M1", cor: "Violeta", numeroSerie: "1", tipo: "celular" },
      espelhoPatchIdentificacao({}, ["cor"]),
    );
    expect(equipamento).toEqual({ modelo: "M1", numeroSerie: "1", tipo: "celular" });
    // …logo a leitura efetiva (equipamento tem prioridade) volta vazia.
    const os = { equipamento, provaEntradaV3: JSON.parse(JSON.stringify(prova)) } as unknown as OrdemServico;
    expect(identidadeAtualV4(os).cor).toBe("");
    expect(identidadeAtualV4(os).modelo).toBe("M1");
  });
});

describe("R independente 9464b00 — 3. credenciais stale por campo", () => {
  const basePinGoogle = () => provaBase({ credenciais: { pin: "1111", contaGoogle: "a" } });

  it("B muda Google=b; A stale muda só PIN=2222 → final PIN=2222 + Google=b", () => {
    const latest = basePinGoogle();
    latest.credenciais.contaGoogle = "b"; // sessão B gravou
    const next = aplicarPatchIntencionalProvaEntrada(latest, {
      credenciais: { valores: { pin: "2222" } },
      esperados: { credenciais: { pin: "1111" } },
    });
    expect(next.credenciais.pin).toBe("2222");
    expect(next.credenciais.contaGoogle).toBe("b");
  });

  it("mesmo campo alterado pelas duas sessões = conflito (PIN 1111→b por B, A tenta 2222)", () => {
    const latest = basePinGoogle();
    latest.credenciais.pin = "9999"; // sessão B gravou outro PIN
    let erro: unknown = null;
    try {
      aplicarPatchIntencionalProvaEntrada(latest, {
        credenciais: { valores: { pin: "2222" } },
        esperados: { credenciais: { pin: "1111" } },
      });
    } catch (e) {
      erro = e;
    }
    expect(ehConflitoConcorrenciaV3(erro)).toBe(true);
    expect(String((erro as Error).message)).toMatch(/credenciais\.pin/);
    expect(latest.credenciais.pin).toBe("9999");
  });

  it('primeiro preenchimento de campo ausente (""/ausente) = sucesso', () => {
    const base = provaBase({ credenciais: {} });
    const next = aplicarPatchIntencionalProvaEntrada(base, {
      credenciais: { valores: { pin: "2222" } },
      esperados: { credenciais: { pin: "" } },
    });
    expect(next.credenciais.pin).toBe("2222");
  });
});

describe("R independente 9464b00 — 4. acessórios com baseline", () => {
  const NENHUM: AcessorioEntradaV3[] = [
    { id: "chip", presente: false },
    { id: "carregador", presente: false },
    { id: "capinha", presente: false },
  ];
  const COM_CARREGADOR: AcessorioEntradaV3[] = [
    { id: "chip", presente: false },
    { id: "carregador", presente: true },
    { id: "capinha", presente: false },
  ];
  const COM_CAPINHA_SEM_CARREGADOR: AcessorioEntradaV3[] = [
    { id: "chip", presente: false },
    { id: "carregador", presente: false },
    { id: "capinha", presente: true },
  ];

  it("baseline igual + sem divergência = aplica", () => {
    const base = provaBase({ acessorios: NENHUM });
    const next = aplicarPatchIntencionalProvaEntrada(base as ProvaEntradaV3, {
      acessorios: COM_CARREGADOR,
      esperados: { acessorios: NENHUM },
    } as unknown as PatchProvaEntradaV3);
    expect(next.acessorios).toEqual(COM_CARREGADOR);
  });

  it("B marca Carregador; A stale marca Capinha sem ver Carregador → conflito, sem remoção silenciosa", () => {
    const latest = provaBase({ acessorios: COM_CARREGADOR });
    let erro: unknown = null;
    try {
      aplicarPatchIntencionalProvaEntrada(latest as ProvaEntradaV3, {
        acessorios: COM_CAPINHA_SEM_CARREGADOR,
        esperados: { acessorios: NENHUM },
      } as unknown as PatchProvaEntradaV3);
    } catch (e) {
      erro = e;
    }
    expect(ehConflitoConcorrenciaV3(erro)).toBe(true);
    expect(String((erro as Error).message)).toMatch(/acessorios/);
    expect(latest.acessorios).toEqual(COM_CARREGADOR);
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
