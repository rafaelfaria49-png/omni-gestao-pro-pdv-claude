import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { OrdemServico } from "@/types/os";
import type { V4Vals } from "@/components/operacoes-v4-preview/use-v4-preview";

const state = vi.hoisted(() => ({
  loja: null as null | Record<string, unknown>,
  print: vi.fn(),
}));

vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaRemota: state.loja }) }));
vi.mock("@/components/operacoes-v3/components/print/PrintPreviewV3", () => ({
  PrintPreviewV3: (props: unknown) => { state.print(props); return null; },
}));

import { DocPrintModal } from "@/components/operacoes-v4-preview/parts/DocPrintModal";

afterEach(() => {
  cleanup();
  state.print.mockClear();
  state.loja = null;
});

function os(modelo?: string): OrdemServico {
  return {
    id: "os-002",
    storeId: "loja-002",
    codigo: "OS-002",
    cliente: { nome: "E2E Garantia 002", telefone: "11999998888" },
    equipamento: { marca: "Samsung", modelo: "A15" },
    ...(modelo ? { aberturaV3: { garantiaPrevista: { modelo, prazoDias: modelo === "tela" ? 90 : 0 } } } : {}),
  } as unknown as OrdemServico;
}

function printProps(): { tipo: string | null; empresa: Record<string, unknown> } {
  const props = state.print.mock.lastCall?.[0];
  if (!props) throw new Error("PrintPreviewV3 não foi montado");
  return props as { tipo: string | null; empresa: Record<string, unknown> };
}

describe("DocPrintModal V4 montado", () => {
  it("OS, termo e entrega repassam a mesma unidade remota persistida", () => {
    state.loja = {
      id: "loja-002",
      nomeFantasia: "Loja E2E Garantia 002",
      razaoSocial: "Loja E2E Garantia 002",
      cnpj: "12.345.678/0001-90",
      telefone: "11999998888",
      endereco: { rua: "Rua QA", numero: "20", cidade: "São Paulo", estado: "SP" },
      logoUrl: "https://example.test/logo.png",
    };
    const ordem = os("tela");
    const v = { realOS: ordem, docPrintTipo: "os_cliente", closeDocPrint: vi.fn(), registrarImpressaoDoc: vi.fn() } as unknown as V4Vals;
    const view = render(<DocPrintModal v={v} />);
    const empresa = printProps().empresa;
    for (const tipo of ["termo_garantia", "termo_entrega", "comprovante_interno", "orcamento_cliente"]) {
      view.rerender(<DocPrintModal v={{ ...v, docPrintTipo: tipo as V4Vals["docPrintTipo"] }} />);
      expect(printProps()).toMatchObject({ tipo, empresa });
    }
    expect(empresa).toMatchObject({
      nomeFantasia: "Loja E2E Garantia 002",
      cnpj: "12.345.678/0001-90",
      contato: { telefone: "11999998888" },
      semFallback: true,
    });
  });

  it("loja divergente ou ausente não vira nome/CNPJ/telefone inventado", () => {
    state.loja = { id: "outra-loja", nomeFantasia: "Outra Loja", cnpj: "99.999.999/0001-99" };
    const v = { realOS: os("tela"), docPrintTipo: "os_cliente", closeDocPrint: vi.fn() } as unknown as V4Vals;
    render(<DocPrintModal v={v} />);
    expect(printProps().empresa).toMatchObject({ semFallback: true });
    expect(printProps().empresa.nomeFantasia).toBeUndefined();
    expect(printProps().empresa.cnpj).toBeUndefined();
    expect(printProps().empresa.contato).toBeUndefined();
  });

  it("garantia não definida não chega como termo imprimível", () => {
    const v = { realOS: os(), docPrintTipo: "termo_garantia", closeDocPrint: vi.fn() } as unknown as V4Vals;
    render(<DocPrintModal v={v} />);
    expect(printProps().tipo).toBeNull();
  });
});
