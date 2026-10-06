import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import {
  assinaturaRecebimentoMistoLegadaV1,
  assinaturaRecebimentoMistoV3,
  avaliarRascunhoMistoV3,
  centavosPorFormaV3,
  conteudoRecebimentoCanonicoLegadoV1,
  conteudoRecebimentoCanonicoV3,
  centavosEstritosV3,
  dataCivilValidaV3,
  formatarVencimentoV3,
  hojeLojaV3,
  montarComprovanteMistoV3,
  normalizarRecebimentoMistoV3,
  parseValorDigitadoV3,
  rotuloBotaoRecebimentoMistoV3,
  sugestaoAPrazoCentavosV3,
  validarDistribuicaoMistaV3,
  validarVencimentoAPrazoV3,
  type RecebimentoMistoInputV3,
} from "./recebimento-misto-model";
import { formaSuportadaV3, montarPagamentoMirrorV3 } from "./payment-model";

const HOJE = "2026-10-03";

/** Intl pt-BR separa "R$" do número com espaço não separável (U+00A0). */
const semNbsp = (s: string) => s.replace(/\u00a0/g, " ");

function entrada(over: Partial<RecebimentoMistoInputV3> = {}): RecebimentoMistoInputV3 {
  return {
    operacaoId: "op-misto-0001",
    sessaoId: "sess-1",
    pagamentosAgora: [{ forma: "debito", valor: 350 }],
    saldoAPrazo: { valor: 50, vencimento: "2026-11-10" },
    saldoEsperado: 400,
    ...over,
  };
}

describe("centavos estritos — valor inválido nunca é arredondado para caber", () => {
  it("aceita até 2 casas e rejeita negativo, NaN e 3 casas", () => {
    expect(centavosEstritosV3(350)).toBe(35000);
    expect(centavosEstritosV3(0.1 + 0.2)).toBe(30);
    expect(centavosEstritosV3(-1)).toBeNull();
    expect(centavosEstritosV3(Number.NaN)).toBeNull();
    expect(centavosEstritosV3(10.005)).toBeNull();
  });

  it("texto digitado pt-BR: vazio/letras/negativo → null (erro visível)", () => {
    expect(parseValorDigitadoV3("350")).toBe(35000);
    expect(parseValorDigitadoV3("350,00")).toBe(35000);
    expect(parseValorDigitadoV3("1.234,56")).toBe(123456);
    expect(parseValorDigitadoV3("50.5")).toBe(5050);
    expect(parseValorDigitadoV3("")).toBeNull();
    expect(parseValorDigitadoV3("   ")).toBeNull();
    expect(parseValorDigitadoV3("-50")).toBeNull();
    expect(parseValorDigitadoV3("abc")).toBeNull();
    expect(parseValorDigitadoV3("10,005")).toBeNull();
  });
});

describe("vencimento — data civil sem conversão de fuso", () => {
  it("rejeita ausente, inexistente, formato com hora e data anterior a hoje", () => {
    expect(validarVencimentoAPrazoV3("", HOJE).ok).toBe(false);
    expect(validarVencimentoAPrazoV3("2026-02-30", HOJE).ok).toBe(false);
    expect(validarVencimentoAPrazoV3("2026-11-10T00:00:00Z", HOJE).ok).toBe(false);
    expect(validarVencimentoAPrazoV3("10/11/2026", HOJE).ok).toBe(false);
    expect(validarVencimentoAPrazoV3("2026-10-02", HOJE).ok).toBe(false);
    expect(validarVencimentoAPrazoV3("2026-10-03", HOJE).ok).toBe(true);
    expect(validarVencimentoAPrazoV3("2028-02-29", HOJE).ok).toBe(true);
    expect(dataCivilValidaV3("2027-02-29")).toBe(false);
  });

  it("formata dd/mm/aaaa sem passar por Date (nenhum deslocamento)", () => {
    expect(formatarVencimentoV3("2026-11-10")).toBe("10/11/2026");
    expect(formatarVencimentoV3("2026-01-01")).toBe("01/01/2026");
  });

  it("hoje da loja usa America/Sao_Paulo (03:00Z ainda é o dia anterior em SP)", () => {
    expect(hojeLojaV3(new Date("2026-10-04T02:59:00.000Z"))).toBe("2026-10-03");
    expect(hojeLojaV3(new Date("2026-10-04T03:00:00.000Z"))).toBe("2026-10-04");
  });
});

describe("normalizarRecebimentoMistoV3 — a prazo nunca vira forma de dinheiro", () => {
  it("caso 400 = débito 350 + a prazo 50", () => {
    const r = normalizarRecebimentoMistoV3(entrada(), HOJE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.pagamentosAgora).toEqual([{ forma: "debito", centavos: 35000 }]);
    expect(r.valor.receberAgoraCentavos).toBe(35000);
    expect(r.valor.aPrazo).toEqual({ centavos: 5000, vencimento: "2026-11-10", observacao: null });
    expect(r.valor.sessaoId).toBe("sess-1");
  });

  it("crediário/parcelado/carteira não são aceitos como pagamento imediato", () => {
    for (const forma of ["crediario", "parcelado", "carteira"] as const) {
      expect(formaSuportadaV3(forma)).toBe(false);
      const r = normalizarRecebimentoMistoV3(entrada({ pagamentosAgora: [{ forma, valor: 350 }] }), HOJE);
      expect(r.ok).toBe(false);
    }
  });

  it("linha vazia/negativa/zero não é descartada em silêncio: invalida a entrada", () => {
    for (const valor of [0, -10, Number.NaN, 10.005]) {
      const r = normalizarRecebimentoMistoV3(entrada({ pagamentosAgora: [{ forma: "debito", valor: 350 }, { forma: "dinheiro", valor }] }), HOJE);
      expect(r.ok).toBe(false);
    }
  });

  it("vencimento inválido bloqueia (código entrada_invalida)", () => {
    const r = normalizarRecebimentoMistoV3(entrada({ saldoAPrazo: { valor: 50, vencimento: "2026-02-30" } }), HOJE);
    expect(r).toMatchObject({ ok: false, code: "entrada_invalida" });
  });

  it("pagamento imediato exige sessão de caixa; 100% a prazo não", () => {
    expect(normalizarRecebimentoMistoV3(entrada({ sessaoId: undefined }), HOJE).ok).toBe(false);
    const soPrazo = normalizarRecebimentoMistoV3(
      entrada({ sessaoId: undefined, pagamentosAgora: [], saldoAPrazo: { valor: 400, vencimento: "2026-11-10" } }),
      HOJE,
    );
    expect(soPrazo.ok).toBe(true);
    if (soPrazo.ok) expect(soPrazo.valor.sessaoId).toBeNull();
  });

  it("operacaoId obrigatório e opaco", () => {
    expect(normalizarRecebimentoMistoV3(entrada({ operacaoId: "" }), HOJE).ok).toBe(false);
    expect(normalizarRecebimentoMistoV3(entrada({ operacaoId: "loja:os:1" }), HOJE).ok).toBe(false);
  });
});

describe("validarDistribuicaoMistaV3 — saldo do servidor, sem redistribuir", () => {
  const n = (over: Partial<RecebimentoMistoInputV3> = {}) => {
    const r = normalizarRecebimentoMistoV3(entrada(over), HOJE);
    if (!r.ok) throw new Error(r.mensagem);
    return r.valor;
  };

  it("cobre exatamente o saldo → ok", () => {
    expect(validarDistribuicaoMistaV3(n(), 40000).ok).toBe(true);
  });

  it("saldo mudou desde a tela → conflito recuperável", () => {
    expect(validarDistribuicaoMistaV3(n(), 30000)).toMatchObject({ ok: false, code: "saldo_divergente" });
  });

  it("valor acima do saldo → bloqueia", () => {
    const v = n({ pagamentosAgora: [{ forma: "debito", valor: 450 }], saldoAPrazo: { valor: 50, vencimento: "2026-11-10" }, saldoEsperado: 400 });
    expect(validarDistribuicaoMistaV3(v, 40000)).toMatchObject({ ok: false, code: "valor_acima_do_saldo" });
  });

  it("distribuição que não fecha o saldo → bloqueia (nada vira desconto)", () => {
    const v = n({ pagamentosAgora: [{ forma: "debito", valor: 300 }], saldoAPrazo: { valor: 50, vencimento: "2026-11-10" } });
    expect(validarDistribuicaoMistaV3(v, 40000)).toMatchObject({ ok: false, code: "distribuicao_inconsistente" });
  });

  it("sem saldo → OS quitada", () => {
    expect(validarDistribuicaoMistaV3(n(), 0)).toMatchObject({ ok: false, code: "os_quitada" });
  });
});

describe("assinatura de idempotência", () => {
  it("ordem das linhas não muda a operação; valor muda", () => {
    const a = normalizarRecebimentoMistoV3(entrada({ pagamentosAgora: [{ forma: "dinheiro", valor: 100 }, { forma: "debito", valor: 250 }] }), HOJE);
    const b = normalizarRecebimentoMistoV3(entrada({ pagamentosAgora: [{ forma: "debito", valor: 250 }, { forma: "dinheiro", valor: 100 }] }), HOJE);
    const c = normalizarRecebimentoMistoV3(entrada({ pagamentosAgora: [{ forma: "debito", valor: 260 }, { forma: "dinheiro", valor: 90 }] }), HOJE);
    if (!a.ok || !b.ok || !c.ok) throw new Error("entrada inválida");
    const escopo = { storeId: "loja-qa", osId: "os-qa" };
    expect(assinaturaRecebimentoMistoV3(escopo, a.valor)).toBe(assinaturaRecebimentoMistoV3(escopo, b.valor));
    expect(assinaturaRecebimentoMistoV3(escopo, a.valor)).not.toBe(assinaturaRecebimentoMistoV3(escopo, c.valor));
    expect(assinaturaRecebimentoMistoV3(escopo, a.valor)).not.toBe(assinaturaRecebimentoMistoV3({ ...escopo, osId: "outra" }, a.valor));
  });
});

describe("rascunho da tela", () => {
  it("débito 350 + a prazo (sugestão = restante 50) + vencimento → ok", () => {
    const linhas = [
      { forma: "debito" as const, valorStr: "350" },
      { forma: "a_prazo" as const, valorStr: "" },
    ];
    expect(sugestaoAPrazoCentavosV3(linhas, 1, 400)).toBe(5000);
    const r = avaliarRascunhoMistoV3({ linhas: [linhas[0]!, { forma: "a_prazo", valorStr: "50,00" }], vencimento: "2026-11-10", saldo: 400, hoje: HOJE });
    expect(r.ok).toBe(true);
    expect(r.receberAgoraCentavos).toBe(35000);
    expect(r.aPrazoCentavos).toBe(5000);
    expect(r.pagamentosAgora).toEqual([{ forma: "debito", valor: 350 }]);
    expect(semNbsp(rotuloBotaoRecebimentoMistoV3(r.receberAgoraCentavos, r.aPrazoCentavos))).toBe("Registrar R$ 350,00 + R$ 50,00 a prazo");
  });

  it("sem vencimento, linha em branco ou soma que não fecha → erros visíveis", () => {
    const semVenc = avaliarRascunhoMistoV3({ linhas: [{ forma: "debito", valorStr: "350" }, { forma: "a_prazo", valorStr: "50" }], vencimento: "", saldo: 400, hoje: HOJE });
    expect(semVenc.ok).toBe(false);
    const branco = avaliarRascunhoMistoV3({
      linhas: [{ forma: "debito", valorStr: "350" }, { forma: "dinheiro", valorStr: "" }, { forma: "a_prazo", valorStr: "50" }],
      vencimento: "2026-11-10",
      saldo: 400,
      hoje: HOJE,
    });
    expect(branco.ok).toBe(false);
    expect(branco.erros.join(" ")).toMatch(/Linha 2/);
    const naoFecha = avaliarRascunhoMistoV3({ linhas: [{ forma: "debito", valorStr: "300" }, { forma: "a_prazo", valorStr: "50" }], vencimento: "2026-11-10", saldo: 400, hoje: HOJE });
    expect(naoFecha.ok).toBe(false);
    expect(naoFecha.restanteCentavos).toBe(5000);
  });

  it("100% a prazo: botão de formalização, sem dinheiro recebido", () => {
    const r = avaliarRascunhoMistoV3({ linhas: [{ forma: "a_prazo", valorStr: "400.00" }], vencimento: "2026-11-10", saldo: 400, hoje: HOJE });
    expect(r.ok).toBe(true);
    expect(r.receberAgoraCentavos).toBe(0);
    expect(semNbsp(rotuloBotaoRecebimentoMistoV3(0, r.aPrazoCentavos))).toBe("Formalizar R$ 400,00 a prazo");
  });

  it("no máximo uma linha a prazo", () => {
    const r = avaliarRascunhoMistoV3({
      linhas: [{ forma: "a_prazo", valorStr: "200" }, { forma: "a_prazo", valorStr: "200" }],
      vencimento: "2026-11-10",
      saldo: 400,
      hoje: HOJE,
    });
    expect(r.ok).toBe(false);
  });
});

describe("comprovante misto — nunca 'Quitação de R$ 400,00'", () => {
  const os = { id: "os-1", codigo: "OS-QA-1", cliente: { nome: "Cliente QA" }, equipamento: { marca: "Samsung", modelo: "A54" } } as unknown as OrdemServico;

  it("recebido 350 (débito) + saldo a prazo 50", () => {
    const pagamento = montarPagamentoMirrorV3({ total: 400, recebido: 350 });
    const c = montarComprovanteMistoV3({
      os,
      pagamentosAgora: [{ forma: "debito", valor: 350 }],
      valorRecebidoAgora: 350,
      recebidoAnteriormente: 0,
      pagamento,
      aPrazo: { valor: 50, vencimento: "2026-11-10" },
      operador: "Operador QA",
      dataHora: "2026-10-03T15:00:00.000Z",
    });
    expect(c).toMatchObject({
      totalOS: 400,
      valorPago: 350,
      recebidoAcumulado: 350,
      saldoRestante: 50,
      statusPagamento: "parcial",
      tipoComprovante: "recebimento_misto",
      situacaoLabel: "Pagamento parcial — saldo a prazo",
      aPrazo: { valor: 50, vencimento: "2026-11-10" },
    });
    expect(c.formas).toEqual([{ forma: "debito", label: "Débito", valor: 350 }]);
    expect(JSON.stringify(c)).not.toMatch(/Quita/);
  });

  it("100% a prazo vira resumo de formalização (valor pago 0, sem formas)", () => {
    const c = montarComprovanteMistoV3({
      os,
      pagamentosAgora: [],
      valorRecebidoAgora: 0,
      recebidoAnteriormente: 0,
      pagamento: montarPagamentoMirrorV3({ total: 400, recebido: 0 }),
      aPrazo: { valor: 400, vencimento: "2026-11-10" },
      operador: "Operador QA",
      dataHora: "2026-10-03T15:00:00.000Z",
    });
    expect(c.tipoComprovante).toBe("formalizacao_a_prazo");
    expect(c.valorPago).toBe(0);
    expect(c.formas).toEqual([]);
  });
});

// R4/P1: a identidade do recebimento canônico é ECONÔMICA — igual na tela e no servidor.
describe("conteudoRecebimentoCanonicoV3", () => {
  it("forma única e split com as mesmas formas/valores são o MESMO recebimento, em qualquer ordem", () => {
    const unica = conteudoRecebimentoCanonicoV3({ sessaoId: "s1", forma: "pix", valor: 100 });
    expect(conteudoRecebimentoCanonicoV3({ sessaoId: "s1", linhas: [{ forma: "pix", valor: 100 }] })).toBe(unica);
    const ab = conteudoRecebimentoCanonicoV3({ sessaoId: "s1", linhas: [{ forma: "pix", valor: 50 }, { forma: "dinheiro", valor: 50 }] });
    const ba = conteudoRecebimentoCanonicoV3({ sessaoId: "s1", linhas: [{ forma: "dinheiro", valor: 50 }, { forma: "pix", valor: 50 }] });
    expect(ab).toBe(ba);
  });

  it("linha zerada não conta; outra sessão, outra forma ou outro valor é outro recebimento", () => {
    const base = conteudoRecebimentoCanonicoV3({ sessaoId: "s1", linhas: [{ forma: "pix", valor: 100 }] });
    expect(conteudoRecebimentoCanonicoV3({ sessaoId: "s1", linhas: [{ forma: "pix", valor: 100 }, { forma: "dinheiro", valor: 0 }] })).toBe(base);
    expect(conteudoRecebimentoCanonicoV3({ sessaoId: "s2", linhas: [{ forma: "pix", valor: 100 }] })).not.toBe(base);
    expect(conteudoRecebimentoCanonicoV3({ sessaoId: "s1", linhas: [{ forma: "debito", valor: 100 }] })).not.toBe(base);
    expect(conteudoRecebimentoCanonicoV3({ sessaoId: "s1", linhas: [{ forma: "pix", valor: 100.01 }] })).not.toBe(base);
  });
});

// OPS-RECEBIMENTO-MISTO-P1-HARDENING-001 — identidade econômica = TOTAL por forma, em centavos.
describe("P1-A · identidade econômica agregada por forma (T01–T07)", () => {
  const c = (linhas: Array<{ forma: string; valor: number }>, sessaoId = "CAIXA-A") => conteudoRecebimentoCanonicoV3({ sessaoId, linhas });
  const pix100 = c([{ forma: "pix", valor: 100 }]);

  it("T01: PIX 100 == PIX 50 + PIX 50", () => {
    expect(c([{ forma: "pix", valor: 50 }, { forma: "pix", valor: 50 }])).toBe(pix100);
  });
  it("T02: PIX 100 == PIX 25 + PIX 25 + PIX 50 (e == PIX 20 + PIX 30 + PIX 50)", () => {
    expect(c([{ forma: "pix", valor: 25 }, { forma: "pix", valor: 25 }, { forma: "pix", valor: 50 }])).toBe(pix100);
    expect(c([{ forma: "pix", valor: 20 }, { forma: "pix", valor: 30 }, { forma: "pix", valor: 50 }])).toBe(pix100);
  });
  it("T03: a ordem das formas não altera a identidade (Dinheiro 20 + PIX 80 == PIX 80 + Dinheiro 20)", () => {
    expect(c([{ forma: "dinheiro", valor: 20 }, { forma: "pix", valor: 80 }])).toBe(c([{ forma: "pix", valor: 80 }, { forma: "dinheiro", valor: 20 }]));
    expect(c([{ forma: "pix", valor: 40 }, { forma: "dinheiro", valor: 20 }, { forma: "pix", valor: 40 }])).toBe(c([{ forma: "dinheiro", valor: 20 }, { forma: "pix", valor: 80 }]));
  });
  it("T04: formas diferentes permanecem distintas (PIX 100 != Débito 100; PIX 50 + Débito 50 != PIX 100)", () => {
    expect(c([{ forma: "debito", valor: 100 }])).not.toBe(pix100);
    expect(c([{ forma: "pix", valor: 50 }, { forma: "debito", valor: 50 }])).not.toBe(pix100);
  });
  it("T05: sessão diferente permanece distinta (CAIXA-A != CAIXA-B)", () => {
    expect(c([{ forma: "pix", valor: 100 }], "CAIXA-B")).not.toBe(pix100);
  });
  it("T06: 1 centavo de diferença permanece distinto (PIX 100 != PIX 99,99; PIX 50 + PIX 49,99 != PIX 100)", () => {
    expect(c([{ forma: "pix", valor: 99.99 }])).not.toBe(pix100);
    expect(c([{ forma: "pix", valor: 50 }, { forma: "pix", valor: 49.99 }])).not.toBe(pix100);
  });
  it("T07: forma única e split equivalente produzem a mesma identidade", () => {
    expect(conteudoRecebimentoCanonicoV3({ sessaoId: "CAIXA-A", forma: "pix", valor: 100 })).toBe(pix100);
    expect(conteudoRecebimentoCanonicoV3({ sessaoId: "CAIXA-A", forma: "pix", valor: 100 })).toBe(c([{ forma: "pix", valor: 60 }, { forma: "pix", valor: 40 }]));
  });
  it("trabalha em centavos inteiros: 0,1 + 0,2 de PIX == 0,30 de PIX (sem float bruto na identidade)", () => {
    expect(c([{ forma: "pix", valor: 0.1 }, { forma: "pix", valor: 0.2 }])).toBe(c([{ forma: "pix", valor: 0.3 }]));
    expect(centavosPorFormaV3([{ forma: "pix", centavos: 10 }, { forma: "pix", centavos: 20 }, { forma: "debito", centavos: 5 }])).toEqual([
      { forma: "debito", centavos: 5 },
      { forma: "pix", centavos: 30 },
    ]);
  });
  it("legado v1: recalculado para a MESMA requisição, distingue representações (só serve para reconhecer gravações antigas)", () => {
    const legado = (linhas: Array<{ forma: string; valor: number }>) => conteudoRecebimentoCanonicoLegadoV1({ sessaoId: "CAIXA-A", linhas });
    expect(legado([{ forma: "pix", valor: 100 }])).toBe(JSON.stringify({ v: 1, sessaoId: "CAIXA-A", linhas: [["pix", 10000]] }));
    expect(legado([{ forma: "pix", valor: 50 }, { forma: "pix", valor: 50 }])).toBe(JSON.stringify({ v: 1, sessaoId: "CAIXA-A", linhas: [["pix", 5000], ["pix", 5000]] }));
    expect(legado([{ forma: "pix", valor: 50 }, { forma: "pix", valor: 50 }])).not.toBe(legado([{ forma: "pix", valor: 100 }]));
    expect(pix100).not.toBe(legado([{ forma: "pix", valor: 100 }]));
  });
});

describe("P1-A · assinatura do misto agregada por forma (+ legado v1 estrito)", () => {
  const escopo = { storeId: "loja-qa", osId: "os-qa" };
  const norm = (pagamentosAgora: RecebimentoMistoInputV3["pagamentosAgora"]) => {
    const r = normalizarRecebimentoMistoV3(entrada({ pagamentosAgora }), HOJE);
    if (!r.ok) throw new Error(r.mensagem);
    return r.valor;
  };
  it("PIX 100 == PIX 50 + PIX 50 na mesma confirmação; outra forma/valor não", () => {
    const pix100 = assinaturaRecebimentoMistoV3(escopo, norm([{ forma: "pix", valor: 100 }]));
    expect(assinaturaRecebimentoMistoV3(escopo, norm([{ forma: "pix", valor: 50 }, { forma: "pix", valor: 50 }]))).toBe(pix100);
    expect(assinaturaRecebimentoMistoV3(escopo, norm([{ forma: "debito", valor: 100 }]))).not.toBe(pix100);
    expect(assinaturaRecebimentoMistoV3(escopo, norm([{ forma: "pix", valor: 99.99 }]))).not.toBe(pix100);
  });
  it("v1 legado preserva o formato antigo (linhas ordenadas, sem agregar)", () => {
    const n = norm([{ forma: "pix", valor: 50 }, { forma: "pix", valor: 50 }]);
    expect(JSON.parse(assinaturaRecebimentoMistoLegadaV1(escopo, n))).toMatchObject({
      v: 1,
      pagamentosAgora: [{ forma: "pix", centavos: 5000 }, { forma: "pix", centavos: 5000 }],
    });
    expect(JSON.parse(assinaturaRecebimentoMistoV3(escopo, n))).toMatchObject({ v: 2, pagamentosAgora: [{ forma: "pix", centavos: 10000 }] });
  });
});
