// GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 (item A) — critério ÚNICO de elegibilidade
// comercial dos writers de recebimento. Puro: mesma reconciliação da entrega
// (`reconciliarTotaisFinanceirosV3`) e mesmos códigos/destinos da projeção V4 (GOAL 001).
import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import {
  avaliarElegibilidadeComercialV3,
  DESTINO_INELEGIBILIDADE_COMERCIAL_V3,
  RecebimentoInelegivelErroV3,
  type CodigoInelegibilidadeComercialV3,
} from "./elegibilidade-comercial";
import { projectFinancialOSV4 } from "@/lib/operacoes-v4/financial-projection";

type Payload = OrdemServico & Record<string, unknown>;

const AGORA = Date.parse("2026-10-09T15:00:00.000Z");
const ONTEM = "2026-10-08T23:59:59.000Z";
const AMANHA = "2026-10-11T02:59:59.000Z";

function orcamento(status: string, total = 420, extra: Record<string, unknown> = {}) {
  return { id: "orc-1", status, sintetizado: false, criadoEm: ONTEM, desconto: 0, total, pecas: [], servicos: [{ id: "s1", descricao: "Troca de tela", valor: total }], ...extra };
}

function os(extra: Record<string, unknown> = {}): Payload {
  return { id: "os-1", codigo: "OS-1", status: "pronta", operacaoStatusV3: "pronta", timeline: [], ...extra } as unknown as Payload;
}

function avaliar(payload: Payload, prismaValorTotal = 420) {
  return avaliarElegibilidadeComercialV3({ storeId: "loja-qa", osId: "os-1", payload, prismaValorTotal, agora: AGORA });
}

describe("avaliarElegibilidadeComercialV3 — preço elegível", () => {
  it("orçamento aprovado coerente com a coluna e o legado: elegível com o total em centavos", () => {
    expect(avaliar(os({ orcamento: orcamento("aprovado"), valorTotal: 420 }))).toEqual({ elegivel: true, totalCentavos: 42000 });
  });

  it("sem orçamento real, preço vindo da coluna (OS legada) segue elegível — mesma regra da entrega", () => {
    expect(avaliar(os({}), 300)).toEqual({ elegivel: true, totalCentavos: 30000 });
  });

  it("prévia sintetizada não é orçamento real: decide a coluna, como na entrega", () => {
    expect(avaliar(os({ orcamento: { ...orcamento("rascunho"), sintetizado: true } }), 420)).toEqual({ elegivel: true, totalCentavos: 42000 });
  });

  it("não depende do status técnico: OS em execução com orçamento aprovado (sinal) segue elegível", () => {
    expect(avaliar(os({ status: "em_execucao", operacaoStatusV3: "em_execucao", orcamento: orcamento("aprovado") }))).toMatchObject({ elegivel: true });
  });
});

describe("avaliarElegibilidadeComercialV3 — recusa com motivo e destino", () => {
  const casos: Array<[string, Payload, number, CodigoInelegibilidadeComercialV3]> = [
    ["rascunho", os({ orcamento: orcamento("rascunho") }), 420, "APROVACAO_COMERCIAL_PENDENTE"],
    ["enviado dentro da validade", os({ orcamento: orcamento("enviado", 420, { validoAte: AMANHA }) }), 420, "APROVACAO_COMERCIAL_PENDENTE"],
    ["enviado vencido", os({ orcamento: orcamento("enviado", 420, { validoAte: ONTEM }) }), 420, "ORCAMENTO_EXPIRADO"],
    ["rascunho com validade passada (status efetivo segue rascunho)", os({ orcamento: orcamento("rascunho", 420, { validoAte: ONTEM }) }), 420, "APROVACAO_COMERCIAL_PENDENTE"],
    ["recusado", os({ orcamento: orcamento("recusado") }), 420, "ORCAMENTO_RECUSADO"],
    ["expirado persistido", os({ orcamento: orcamento("expirado") }), 420, "ORCAMENTO_EXPIRADO"],
    ["só zeros sem aprovação", os({}), 0, "PRECO_AUSENTE"],
    ["aprovado divergente da coluna", os({ orcamento: orcamento("aprovado") }), 400, "VALORES_DIVERGENTES"],
    ["valor legado inválido", os({ orcamento: orcamento("aprovado"), valorTotal: "abc" }), 420, "VALORES_DIVERGENTES"],
    ["total declarado diverge do calculado", os({ orcamento: { ...orcamento("aprovado"), total: 0 } }), 420, "VALORES_DIVERGENTES"],
  ];
  for (const [nome, payload, coluna, codigo] of casos) {
    it(`${nome} → ${codigo} (${DESTINO_INELEGIBILIDADE_COMERCIAL_V3[codigo]})`, () => {
      const r = avaliar(payload, coluna);
      expect(r).toMatchObject({ elegivel: false, codigo, destino: DESTINO_INELEGIBILIDADE_COMERCIAL_V3[codigo] });
      if (!r.elegivel) expect(r.mensagem).toMatch(/^Recebimento recusado: /);
    });
  }

  it("divergência informa o diagnóstico da reconciliação (sem corrigir nada)", () => {
    const r = avaliar(os({ orcamento: orcamento("aprovado") }), 400);
    expect(r).toMatchObject({ elegivel: false, codigo: "VALORES_DIVERGENTES", detalhe: "Fontes positivas do total da OS divergem entre si." });
  });
});

describe("avaliarElegibilidadeComercialV3 — dado hostil nunca vira exceção no writer", () => {
  const hostis: Array<[string, Payload]> = [
    ["linha nula", os({ orcamento: { ...orcamento("aprovado"), servicos: [null] } })],
    ["grupoId numérico", os({ orcamento: { ...orcamento("aprovado"), servicos: [{ id: "s1", descricao: "x", valor: 420, grupoId: 17 }] } })],
    ["valor {toString:null}", os({ orcamento: { ...orcamento("aprovado"), servicos: [{ id: "s1", descricao: "x", valor: JSON.parse('{"toString":null}') }] } })],
    ["status __proto__", os({ orcamento: orcamento("__proto__") })],
    ["status constructor", os({ orcamento: orcamento("constructor") })],
    ["status toString", os({ orcamento: orcamento("toString") })],
    ["validade numérica em enviado", os({ orcamento: orcamento("enviado", 420, { validoAte: 123 }) })],
    ["validade objeto em enviado", os({ orcamento: orcamento("enviado", 420, { validoAte: { dia: "2026-10-01" } }) })],
    ["orçamento lista", os({ orcamento: [orcamento("aprovado")] })],
  ];
  for (const [nome, payload] of hostis) {
    it(`${nome}: sem exceção e sem elegibilidade inventada`, () => {
      let r: ReturnType<typeof avaliar> | undefined;
      expect(() => { r = avaliar(payload); }).not.toThrow();
      expect(r!.elegivel === false || r!.elegivel === true).toBe(true);
      if (nome.startsWith("status") || nome.startsWith("validade")) expect(r).toMatchObject({ elegivel: false, codigo: "APROVACAO_COMERCIAL_PENDENTE" });
    });
  }

  it("validade não textual nunca vira 'vencido' (mesma leitura da projeção V4)", () => {
    expect(avaliar(os({ orcamento: orcamento("enviado", 420, { validoAte: 123 }) }))).toMatchObject({ codigo: "APROVACAO_COMERCIAL_PENDENTE" });
  });
});

describe("mesma regra da entrega e da projeção V4 (GOAL 001)", () => {
  // Sem título: o guard da entrega bloqueia por motivo COMERCIAL exatamente quando a
  // elegibilidade recusa — e a projeção nomeia o MESMO código.
  const matriz: Array<[string, Payload, number]> = [
    ["aprovado", os({ orcamento: orcamento("aprovado"), valorTotal: 420 }), 420],
    ["legado sem orçamento", os({}), 300],
    ["rascunho", os({ orcamento: orcamento("rascunho") }), 420],
    ["enviado", os({ orcamento: orcamento("enviado", 420, { validoAte: AMANHA }) }), 420],
    ["enviado vencido", os({ orcamento: orcamento("enviado", 420, { validoAte: ONTEM }) }), 420],
    ["recusado", os({ orcamento: orcamento("recusado") }), 420],
    ["zeros", os({}), 0],
    ["divergente", os({ orcamento: orcamento("aprovado") }), 400],
  ];
  for (const [nome, payload, coluna] of matriz) {
    it(nome, () => {
      const elegibilidade = avaliar(payload, coluna);
      const projecao = projectFinancialOSV4({
        storeId: "loja-qa",
        osId: "os-1",
        payload,
        prismaValorTotal: coluna,
        titulo: null,
        loadedAt: new Date(AGORA).toISOString(),
      });
      const impedimento = projecao.acoes?.impedimento ?? null;
      if (elegibilidade.elegivel) {
        expect(impedimento?.codigo).toBe("COBRANCA_NAO_FORMALIZADA");
        expect(projecao.expectedTotal).toBe(elegibilidade.totalCentavos / 100);
      } else {
        expect(impedimento).toEqual({ codigo: elegibilidade.codigo, destino: elegibilidade.destino });
      }
    });
  }
});

describe("RecebimentoInelegivelErroV3", () => {
  it("leva código, destino e mensagem da recusa", () => {
    const r = avaliar(os({ orcamento: orcamento("rascunho") }));
    if (r.elegivel) throw new Error("esperava recusa");
    const e = new RecebimentoInelegivelErroV3(r);
    expect(e).toBeInstanceOf(Error);
    expect(e).toMatchObject({ name: "RecebimentoInelegivelErroV3", codigo: "APROVACAO_COMERCIAL_PENDENTE", destino: "comercial", message: r.mensagem });
  });
});
