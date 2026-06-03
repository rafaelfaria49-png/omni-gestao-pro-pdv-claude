import { describe, expect, it } from "vitest";
import {
  computeTotaisNovaOSV3,
  garantiaModeloV3,
  novaOSDraftVazioV3,
  validarNovaOSDraftV3,
  type NovaOSDraftV3,
  type NovaOSItemV3,
} from "./nova-os-model";

const item = (over: Partial<NovaOSItemV3>): NovaOSItemV3 => ({
  id: "i",
  categoria: "servico",
  descricao: "Item",
  quantidade: 1,
  custoUnitario: 0,
  valorUnitario: 0,
  kind: "cobrado",
  baixaEstoque: false,
  ...over,
});

const draft = (over: Partial<NovaOSDraftV3>): NovaOSDraftV3 => ({ ...novaOSDraftVazioV3(), ...over });

describe("Nova OS V3 — totais", () => {
  it("cobrado impacta custo e valor; brinde/interno só custo", () => {
    const t = computeTotaisNovaOSV3(
      [
        item({ categoria: "servico", valorUnitario: 300, custoUnitario: 120, kind: "cobrado" }),
        item({ categoria: "peca", quantidade: 1, valorUnitario: 250, custoUnitario: 150, kind: "cobrado" }),
        item({ categoria: "peca", quantidade: 1, valorUnitario: 40, custoUnitario: 10, kind: "brinde" }),
        item({ categoria: "peca", quantidade: 1, valorUnitario: 30, custoUnitario: 8, kind: "interno" }),
      ],
      0,
    );
    expect(t.subtotal).toBe(550); // 300 + 250
    expect(t.total).toBe(550);
    expect(t.custo).toBe(288); // 120 + 150 + 10 + 8
    expect(t.lucro).toBe(550 - 288);
  });

  it("quantidade multiplica custo e valor; desconto reduz total, nunca negativo", () => {
    const t = computeTotaisNovaOSV3([item({ categoria: "peca", quantidade: 3, valorUnitario: 100, custoUnitario: 40, kind: "cobrado" })], 50);
    expect(t.subtotal).toBe(300);
    expect(t.custo).toBe(120);
    expect(t.total).toBe(250);
    expect(computeTotaisNovaOSV3([item({ valorUnitario: 100, kind: "cobrado" })], 99999).total).toBe(0);
  });

  it("brinde com valor digitado ainda assim não entra no total ao cliente", () => {
    const t = computeTotaisNovaOSV3([item({ valorUnitario: 999, custoUnitario: 20, kind: "brinde" })], 0);
    expect(t.subtotal).toBe(0);
    expect(t.custo).toBe(20);
  });
});

describe("Nova OS V3 — validação", () => {
  it("exige cliente, marca/modelo e defeito", () => {
    expect(validarNovaOSDraftV3(draft({}))).toMatch(/cliente/i);
    const comCliente = draft({ cliente: { nome: "João", tipo: "PF" } });
    expect(validarNovaOSDraftV3(comCliente)).toMatch(/marca e modelo/i);
    const comEquip = draft({
      cliente: { nome: "João", tipo: "PF" },
      equipamento: { tipo: "Smartphone", marca: "Apple", modelo: "iPhone 13", senhaTipo: "numerica", acessorios: [] },
    });
    expect(validarNovaOSDraftV3(comEquip)).toMatch(/defeito/i);
  });

  it("rascunho completo é válido", () => {
    const ok = draft({
      cliente: { nome: "Maria", tipo: "PF" },
      equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "A54", senhaTipo: "numerica", acessorios: [] },
      problema: { defeitoRelatado: "Tela quebrada" },
    });
    expect(validarNovaOSDraftV3(ok)).toBeNull();
  });

  it("cliente existente (id) dispensa nome novo", () => {
    const ok = draft({
      cliente: { id: "cli_1", nome: "", tipo: "PF" },
      equipamento: { tipo: "Smartphone", marca: "Apple", modelo: "iPhone 12", senhaTipo: "numerica", acessorios: [] },
      problema: { defeitoRelatado: "Não liga" },
    });
    expect(validarNovaOSDraftV3(ok)).toBeNull();
  });

  it("item sem descrição ou quantidade inválida é barrado", () => {
    const base = draft({
      cliente: { nome: "Maria", tipo: "PF" },
      equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "A54", senhaTipo: "numerica", acessorios: [] },
      problema: { defeitoRelatado: "Tela" },
    });
    expect(validarNovaOSDraftV3({ ...base, itens: [item({ descricao: "  " })] })).toMatch(/sem descrição/i);
    expect(validarNovaOSDraftV3({ ...base, itens: [item({ descricao: "Peça", quantidade: 0 })] })).toMatch(/quantidade/i);
  });
});

describe("Nova OS V3 — garantia modelos", () => {
  it("resolve modelo por id e cai no 1º quando inválido", () => {
    expect(garantiaModeloV3("software").prazoDias).toBe(30);
    expect(garantiaModeloV3("personalizado").prazoDias).toBeUndefined();
    expect(garantiaModeloV3("inexistente").id).toBe("tela");
  });
});
