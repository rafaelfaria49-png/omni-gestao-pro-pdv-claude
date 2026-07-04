// Testes PUROS do mapeamento Atendimento Rápido V4 → AtendimentoRapidoInputV3
// (OPS-V4-ATENDIMENTO-RAPIDO-CONNECT-014). Ambiente node: o helper e
// `validarAtendimentoRapidoV3` são puros (sem Prisma/React/next-auth).
import { describe, expect, it } from "vitest";
import {
  atendimentoRapidoFormVazioV4,
  buildAtendimentoRapidoInputFromFormV4,
  selecionarServicoRapidoV4,
  type AtendimentoRapidoFormV4,
} from "./atendimento-rapido-form";
import { validarAtendimentoRapidoV3, SERVICOS_RAPIDOS_V3 } from "@/lib/operacoes-v3/atendimento-rapido-model";

function form(over: Partial<AtendimentoRapidoFormV4> = {}): AtendimentoRapidoFormV4 {
  return { ...atendimentoRapidoFormVazioV4(), ...over };
}

describe("atendimentoRapidoFormVazioV4", () => {
  it("nasce no modo balcão, sem cliente selecionado, valor zero, forma dinheiro", () => {
    const f = atendimentoRapidoFormVazioV4();
    expect(f.clienteModo).toBe("balcao");
    expect(f.clienteExistente).toBeNull();
    expect(f.servicoNome).toBe("");
    expect(f.servicoValor).toBe(0);
    expect(f.formaPagamento).toBe("dinheiro");
  });
});

describe("selecionarServicoRapidoV4", () => {
  it("aplica nome + valor padrão do serviço pré-definido (catálogo curado da V3)", () => {
    const preset = SERVICOS_RAPIDOS_V3[0]!;
    const f = selecionarServicoRapidoV4(atendimentoRapidoFormVazioV4(), preset);
    expect(f.servicoNome).toBe(preset.nome);
    expect(f.servicoValor).toBe(preset.valorPadrao);
  });

  it("não muta o formulário original (imutável)", () => {
    const original = atendimentoRapidoFormVazioV4();
    const preset = SERVICOS_RAPIDOS_V3[0]!;
    const f2 = selecionarServicoRapidoV4(original, preset);
    expect(f2).not.toBe(original);
    expect(original.servicoNome).toBe("");
  });
});

describe("buildAtendimentoRapidoInputFromFormV4 — cliente", () => {
  it("modo balcao → cliente { modo: balcao } (sem nome/telefone inventado)", () => {
    const input = buildAtendimentoRapidoInputFromFormV4(form({ servicoNome: "X", servicoValor: 10 }));
    expect(input.cliente).toEqual({ modo: "balcao" });
  });

  it("modo existente → usa o cliente selecionado (id/nome/telefone)", () => {
    const input = buildAtendimentoRapidoInputFromFormV4(
      form({
        clienteModo: "existente",
        clienteExistente: { id: "cli-1", nome: "Fulano", telefone: "11999" },
        servicoNome: "X",
        servicoValor: 10,
      }),
    );
    expect(input.cliente).toEqual({ modo: "existente", clienteId: "cli-1", nome: "Fulano", telefone: "11999" });
  });

  it("modo existente sem seleção → clienteId/nome/telefone undefined (não inventa)", () => {
    const input = buildAtendimentoRapidoInputFromFormV4(
      form({ clienteModo: "existente", clienteExistente: null, servicoNome: "X", servicoValor: 10 }),
    );
    expect(input.cliente).toEqual({ modo: "existente", clienteId: undefined, nome: undefined, telefone: undefined });
  });

  it("modo novo → nome/telefone trimados; telefone em branco vira undefined", () => {
    const input = buildAtendimentoRapidoInputFromFormV4(
      form({ clienteModo: "novo", clienteNovoNome: "  Maria  ", clienteNovoTelefone: "   ", servicoNome: "X", servicoValor: 10 }),
    );
    expect(input.cliente).toEqual({ modo: "novo", nome: "Maria", telefone: undefined });
  });
});

describe("buildAtendimentoRapidoInputFromFormV4 — serviço e equipamento", () => {
  it("trima nome/descrição do serviço e clampa valor negativo para 0", () => {
    const input = buildAtendimentoRapidoInputFromFormV4(
      form({ servicoNome: "  Troca de tela  ", servicoValor: -10, servicoDescricao: "  detalhe  " }),
    );
    expect(input.servico).toEqual({ nome: "Troca de tela", valor: 0, descricao: "detalhe" });
  });

  it("descrição em branco vira undefined (sem string vazia gravada)", () => {
    const input = buildAtendimentoRapidoInputFromFormV4(form({ servicoNome: "X", servicoValor: 10, servicoDescricao: "   " }));
    expect(input.servico.descricao).toBeUndefined();
  });

  it("equipamento vazio (marca e modelo em branco) vira undefined (não inventa objeto)", () => {
    const input = buildAtendimentoRapidoInputFromFormV4(form({ servicoNome: "X", servicoValor: 10 }));
    expect(input.equipamento).toBeUndefined();
  });

  it("equipamento com só marca (sem modelo) já entra no input — equipamento é opcional no contrato V3", () => {
    const input = buildAtendimentoRapidoInputFromFormV4(
      form({ servicoNome: "X", servicoValor: 10, equipMarca: "Motorola" }),
    );
    expect(input.equipamento).toEqual({ marca: "Motorola", modelo: undefined });
  });
});

describe("buildAtendimentoRapidoInputFromFormV4 — pagamento e observação", () => {
  it("repassa a forma de pagamento escolhida sem transformar", () => {
    const input = buildAtendimentoRapidoInputFromFormV4(
      form({ servicoNome: "X", servicoValor: 10, formaPagamento: "pix" }),
    );
    expect(input.formaPagamento).toBe("pix");
  });

  it("observação em branco vira undefined", () => {
    const input = buildAtendimentoRapidoInputFromFormV4(form({ servicoNome: "X", servicoValor: 10, observacao: "   " }));
    expect(input.observacao).toBeUndefined();
  });
});

describe("buildAtendimentoRapidoInputFromFormV4 — integra com validarAtendimentoRapidoV3 (V3, reaproveitada sem duplicar regra)", () => {
  it("sem serviço → erro de serviço", () => {
    const input = buildAtendimentoRapidoInputFromFormV4(form());
    expect(validarAtendimentoRapidoV3(input)).toMatch(/serviço/i);
  });

  it("valor zero → erro de valor", () => {
    const input = buildAtendimentoRapidoInputFromFormV4(form({ servicoNome: "X", servicoValor: 0 }));
    expect(validarAtendimentoRapidoV3(input)).toMatch(/valor/i);
  });

  it("modo existente sem seleção → erro de cliente", () => {
    const input = buildAtendimentoRapidoInputFromFormV4(
      form({ clienteModo: "existente", servicoNome: "X", servicoValor: 10 }),
    );
    expect(validarAtendimentoRapidoV3(input)).toMatch(/cliente/i);
  });

  it("modo novo sem nome → erro de cliente novo", () => {
    const input = buildAtendimentoRapidoInputFromFormV4(
      form({ clienteModo: "novo", clienteNovoNome: "   ", servicoNome: "X", servicoValor: 10 }),
    );
    expect(validarAtendimentoRapidoV3(input)).toMatch(/novo cliente/i);
  });

  it("balcão + serviço + valor válidos → sem erro (pronto para finalizarAtendimentoRapidoV3)", () => {
    const input = buildAtendimentoRapidoInputFromFormV4(form({ servicoNome: "Troca de tela", servicoValor: 150 }));
    expect(validarAtendimentoRapidoV3(input)).toBeNull();
  });
});
