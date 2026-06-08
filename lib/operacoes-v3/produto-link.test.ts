import { describe, it, expect } from "vitest";
import type { ProdutoDTO } from "@/app/actions/cadastros";
import {
  pecaFromProdutoV3,
  pecaVinculadaAoEstoqueV3,
  produtoDTOToCatalogoV3,
  vincularPecaProdutoV3,
  type ProdutoCatalogoV3,
} from "./produto-link";

function dto(over: Partial<ProdutoDTO> = {}): ProdutoDTO {
  return {
    id: "prod-1",
    nome: "Tela iPhone 13",
    sku: "TELA-IP13",
    barras: "7890001234567",
    categoria: "Telas",
    marca: "Apple",
    fornecedor: "—",
    estoque: 5,
    custo: 120,
    preco: 350,
    margem: 65,
    garantia: 90,
    status: "Ativo",
    ...over,
  };
}

const catalogo: ProdutoCatalogoV3 = {
  id: "prod-1",
  nome: "Tela iPhone 13",
  sku: "TELA-IP13",
  barcode: "7890001234567",
  estoque: 5,
  custo: 120,
  preco: 350,
  garantiaDias: 90,
};

describe("produto-link · produtoDTOToCatalogoV3", () => {
  it("normaliza o DTO do cadastro para a visão do picker", () => {
    expect(produtoDTOToCatalogoV3(dto())).toEqual(catalogo);
  });

  it('trata sku ausente ("—") e barras vazia como string vazia', () => {
    const c = produtoDTOToCatalogoV3(dto({ sku: "—", barras: "" }));
    expect(c.sku).toBe("");
    expect(c.barcode).toBe("");
  });
});

describe("produto-link · pecaVinculadaAoEstoqueV3 (vinculada × manual)", () => {
  it("vinculada quando há produtoId", () => {
    expect(pecaVinculadaAoEstoqueV3({ id: "x", nome: "Tela", quantidade: 1, valorUnitario: 0, produtoId: "prod-1" })).toBe(true);
  });
  it("vinculada quando origem é prisma", () => {
    expect(pecaVinculadaAoEstoqueV3({ id: "x", nome: "Tela", quantidade: 1, valorUnitario: 0, produtoOrigem: "prisma" })).toBe(true);
  });
  it("manual quando não há produtoId nem origem prisma (compat retroativa)", () => {
    expect(pecaVinculadaAoEstoqueV3({ id: "x", nome: "Tela", quantidade: 1, valorUnitario: 0 })).toBe(false);
    expect(pecaVinculadaAoEstoqueV3({ id: "x", nome: "Tela", quantidade: 1, valorUnitario: 0, produtoOrigem: "manual" })).toBe(false);
    expect(pecaVinculadaAoEstoqueV3(null)).toBe(false);
  });
});

describe("produto-link · pecaFromProdutoV3", () => {
  it("cria peça vinculada com produtoId/sku/barcode e preço/custo do catálogo", () => {
    const p = pecaFromProdutoV3(catalogo, { quantidade: 2 });
    expect(p.produtoId).toBe("prod-1");
    expect(p.sku).toBe("TELA-IP13");
    expect(p.barcode).toBe("7890001234567");
    expect(p.produtoOrigem).toBe("prisma");
    expect(p.quantidade).toBe(2);
    expect(p.valorUnitario).toBe(350);
    expect(p.custoUnitario).toBe(120);
    expect(p.prazoGarantiaDias).toBe(90);
    expect(p.kindV3).toBe("cobrado");
    expect(pecaVinculadaAoEstoqueV3(p)).toBe(true);
    expect(p.id).toBeTruthy();
  });

  it("respeita kind e quantidade mínima 1", () => {
    const p = pecaFromProdutoV3(catalogo, { quantidade: 0, kindV3: "brinde" });
    expect(p.quantidade).toBe(1);
    expect(p.kindV3).toBe("brinde");
  });

  it("garantia 0 vira undefined (sem cobertura)", () => {
    const p = pecaFromProdutoV3({ ...catalogo, garantiaDias: 0 });
    expect(p.prazoGarantiaDias).toBeUndefined();
  });
});

describe("produto-link · vincularPecaProdutoV3", () => {
  it("gera patch de vínculo sem id/quantidade (preserva a linha)", () => {
    const patch = vincularPecaProdutoV3(catalogo);
    expect(patch).toMatchObject({ produtoId: "prod-1", produtoOrigem: "prisma", valorUnitario: 350, custoUnitario: 120 });
    expect(patch.id).toBeUndefined();
    expect(patch.quantidade).toBeUndefined();
    // aplicado a uma peça manual, torna-a vinculada
    const manual = { id: "L1", nome: "Peça", quantidade: 3, valorUnitario: 0, kindV3: "cobrado" as const };
    const linked = { ...manual, ...patch };
    expect(linked.quantidade).toBe(3);
    expect(pecaVinculadaAoEstoqueV3(linked)).toBe(true);
  });
});
