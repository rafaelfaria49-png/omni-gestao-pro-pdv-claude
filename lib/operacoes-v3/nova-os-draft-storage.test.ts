import { describe, expect, it } from "vitest";
import { novaOSDraftVazioV3 } from "./nova-os-model";
import {
  isNovaOSDraftMeaningfulV3,
  novaOSDraftStorageKey,
  sanitizeNovaOSDraftForStorageV3,
} from "./nova-os-draft-storage";

describe("nova-os-draft-storage — chave por unidade", () => {
  it("escopa a chave por storeId", () => {
    expect(novaOSDraftStorageKey("loja-2")).toBe("omnigestao:operacoes-v3:nova-os-draft:loja-2");
    expect(novaOSDraftStorageKey("  loja-9  ")).toBe("omnigestao:operacoes-v3:nova-os-draft:loja-9");
  });
});

describe("isNovaOSDraftMeaningfulV3 — dirty check", () => {
  it("rascunho vazio NÃO é significativo (não dispara restore/guard)", () => {
    expect(isNovaOSDraftMeaningfulV3(novaOSDraftVazioV3())).toBe(false);
  });

  it("nome de cliente novo torna significativo", () => {
    const d = novaOSDraftVazioV3();
    d.cliente.nome = "Maria";
    expect(isNovaOSDraftMeaningfulV3(d)).toBe(true);
  });

  it("cliente existente selecionado torna significativo", () => {
    const d = novaOSDraftVazioV3();
    d.cliente.id = "cuid-123";
    expect(isNovaOSDraftMeaningfulV3(d)).toBe(true);
  });

  it("marca/modelo do equipamento torna significativo", () => {
    const d = novaOSDraftVazioV3();
    d.equipamento.modelo = "iPhone 13";
    expect(isNovaOSDraftMeaningfulV3(d)).toBe(true);
  });

  it("apenas a senha do aparelho já torna significativo", () => {
    const d = novaOSDraftVazioV3();
    d.equipamento.senha = "1234";
    expect(isNovaOSDraftMeaningfulV3(d)).toBe(true);
  });

  it("defeito relatado torna significativo", () => {
    const d = novaOSDraftVazioV3();
    d.problema.defeitoRelatado = "Não liga";
    expect(isNovaOSDraftMeaningfulV3(d)).toBe(true);
  });

  it("item adicionado torna significativo", () => {
    const d = novaOSDraftVazioV3();
    d.itens.push({ id: "1", categoria: "servico", descricao: "Troca", quantidade: 1, custoUnitario: 0, valorUnitario: 100, kind: "cobrado", baixaEstoque: false });
    expect(isNovaOSDraftMeaningfulV3(d)).toBe(true);
  });

  it("mudar prioridade/origem da recepção torna significativo", () => {
    const d = novaOSDraftVazioV3();
    d.recepcao.prioridade = "alta";
    expect(isNovaOSDraftMeaningfulV3(d)).toBe(true);
  });

  it("null/undefined não quebra", () => {
    expect(isNovaOSDraftMeaningfulV3(null)).toBe(false);
    expect(isNovaOSDraftMeaningfulV3(undefined)).toBe(false);
  });
});

describe("sanitizeNovaOSDraftForStorageV3 — privacidade", () => {
  it("remove a senha do aparelho antes de persistir", () => {
    const d = novaOSDraftVazioV3();
    d.equipamento.senha = "padrao:1-2-3";
    d.equipamento.marca = "Samsung";
    const safe = sanitizeNovaOSDraftForStorageV3(d);
    expect(safe.equipamento.senha).toBeUndefined();
    // não muta o original nem perde os demais campos
    expect(d.equipamento.senha).toBe("padrao:1-2-3");
    expect(safe.equipamento.marca).toBe("Samsung");
  });
});
