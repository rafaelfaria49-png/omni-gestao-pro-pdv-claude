// GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 (item D) — modelo PURO de
// "Formalizar aprovação pendente": pré-condições, assinatura do escopo, entrada,
// decisão e gravação (ato atual, sem reescrever o passado).
import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import {
  aplicarFormalizacaoV3,
  assinaturaFormalizacaoV3,
  canonicoFormalizacaoV3,
  decidirFormalizacaoV3,
  DECLARACAO_FORMALIZACAO_APROVACAO_V3,
  lerFormalizacaoAprovacaoV3,
  montarEscopoFormalizacaoV3,
  NATUREZA_FORMALIZACAO_APROVACAO_V3,
  normalizarEntradaFormalizacaoV3,
  type EstadoFormalizacaoV3,
  type TituloFormalizacaoV3,
} from "./formalizacao-aprovacao-model";
import { localKeyContaReceberOSV3 } from "./payment-model";

type Payload = OrdemServico & Record<string, unknown>;
const SID = "loja-qa";
const OS = "os-1";
const AGORA = Date.parse("2026-10-09T15:00:00.000Z");
const AGORA_ISO = new Date(AGORA).toISOString();

function payload(extra: Record<string, unknown> = {}, orc: Record<string, unknown> = {}): Payload {
  return {
    id: OS,
    codigo: "OS-1",
    status: "pronta",
    operacaoStatusV3: "pronta",
    valorTotal: 420,
    aberturaV3: { garantiaPrevista: { modelo: "tela", prazoDias: 90 } },
    pagamentoV3: { total: 420, recebido: 420, saldo: 0, status: "quitado" },
    orcamento: {
      id: "orc-1",
      status: "rascunho",
      sintetizado: false,
      criadoEm: "2026-10-01T12:00:00.000Z",
      desconto: 0,
      total: 420,
      pecas: [],
      servicos: [{ id: "s1", descricao: "Troca de tela", valor: 420 }],
      ...orc,
    },
    orcamentoVersoesV3: [],
    timeline: [{ id: "ev-0", tipo: "criacao", autor: "QA", autorTipo: "usuario", conteudo: "OS criada.", criadoEm: "2026-10-01T12:00:00.000Z" }],
    ...extra,
  } as unknown as Payload;
}

function titulo(extra: Partial<TituloFormalizacaoV3> = {}, historico: unknown[] = [{ tipo: "liquidacao", valor: 420, loteId: "op-1", at: "2026-10-02T12:00:00.000Z" }]): TituloFormalizacaoV3 {
  return {
    id: "cr-1",
    storeId: SID,
    localKey: localKeyContaReceberOSV3(SID, OS),
    valor: 420,
    status: "pago",
    payload: { ordemServicoId: OS, historico },
    ...extra,
  };
}

function estado(p: Payload = payload(), t: TituloFormalizacaoV3 | null = titulo(), coluna = 420): EstadoFormalizacaoV3 {
  return { storeId: SID, osId: OS, payload: p, prismaValorTotal: coluna, titulo: t, agora: AGORA };
}

describe("montarEscopoFormalizacaoV3 — pré-condições", () => {
  it("rascunho + título da mesma OS/loja com pagamento vigente e valores iguais: escopo assinado", () => {
    const r = montarEscopoFormalizacaoV3(estado());
    expect(r).toMatchObject({ ok: true, vencido: false });
    if (!r.ok) return;
    expect(r.escopo).toMatchObject({
      versao: 1,
      osId: OS,
      orcamento: { id: "orc-1", status: "rascunho", revisao: 0, totalCentavos: 42000, descontoCentavos: 0, linhas: [{ tipo: "servico", id: "s1", descricao: "Troca de tela", valorCentavos: 42000 }] },
      titulo: { id: "cr-1", valorCentavos: 42000, status: "pago" },
      lancamentos: [{ tipo: "liquidacao", valorCentavos: 42000, operacaoId: "op-1" }],
      recebidoLiquidoCentavos: 42000,
    });
  });

  it("enviado também é pendente; validade passada marca vencido (exige ratificação depois)", () => {
    const r = montarEscopoFormalizacaoV3(estado(payload({}, { status: "enviado", validoAte: "2026-10-05T02:59:59.000Z" })));
    expect(r).toMatchObject({ ok: true, vencido: true });
  });

  const recusas: Array<[string, EstadoFormalizacaoV3, string]> = [
    ["OS cancelada", estado(payload({ status: "cancelada", operacaoStatusV3: "cancelada" })), "os_cancelada"],
    ["orçamento já aprovado", estado(payload({}, { status: "aprovado" })), "nao_pendente"],
    ["orçamento recusado", estado(payload({}, { status: "recusado" })), "nao_pendente"],
    ["sem orçamento", estado(payload({ orcamento: undefined })), "nao_pendente"],
    ["prévia sintetizada", estado(payload({}, { sintetizado: true })), "nao_pendente"],
    ["linha ilegível", estado(payload({}, { servicos: [null] })), "orcamento_ilegivel"],
    ["total declarado não numérico", estado(payload({}, { total: "420" })), "orcamento_ilegivel"],
    ["grupo sem seleção", estado(payload({}, {
      servicos: [
        { id: "a", descricao: "Tela A", valor: 420, grupoId: "g1" },
        { id: "b", descricao: "Tela B", valor: 500, grupoId: "g1" },
      ],
      gruposV3: [{ id: "g1", rotulo: "Tela", regra: "escolha_1" }],
    })), "escopo_incompleto"],
    ["sem título", estado(payload(), null), "titulo_nao_verificavel"],
    ["título de outra loja", estado(payload(), titulo({ storeId: "outra" })), "titulo_nao_verificavel"],
    ["título com outra chave", estado(payload(), titulo({ localKey: "os-faturamento:loja-qa:os-2" })), "titulo_nao_verificavel"],
    ["título de outra OS", estado(payload(), titulo({ payload: { ordemServicoId: "os-2", historico: [{ tipo: "liquidacao", valor: 420 }] } })), "titulo_nao_verificavel"],
    ["título cancelado", estado(payload(), titulo({ status: "cancelado" })), "titulo_nao_verificavel"],
    ["histórico ilegível", estado(payload(), titulo({}, [{ tipo: "pagamento", valor: "abc" }])), "titulo_nao_verificavel"],
    ["recebido acima do título", estado(payload(), titulo({}, [{ tipo: "pagamento", valor: 500 }])), "titulo_nao_verificavel"],
    ["sem pagamento", estado(payload(), titulo({ status: "pendente" }, [])), "sem_pagamento_vigente"],
    ["pagamento estornado por inteiro", estado(payload(), titulo({ status: "pendente" }, [{ tipo: "pagamento", valor: 420 }, { tipo: "estorno_pagamento", valor: 420 }])), "sem_pagamento_vigente"],
    ["declarado ≠ calculado", estado(payload({}, { total: 400 })), "valores_divergentes"],
    ["título ≠ orçamento", estado(payload(), titulo({ valor: 400 }, [{ tipo: "liquidacao", valor: 400 }])), "valores_divergentes"],
    ["coluna ≠ orçamento", estado(payload(), titulo(), 400), "valores_divergentes"],
    ["legado ≠ orçamento", estado(payload({ valorTotal: 400 })), "valores_divergentes"],
    ["um centavo de diferença também diverge", estado(payload(), titulo(), 420.01), "valores_divergentes"],
  ];
  for (const [nome, e, code] of recusas) {
    it(`${nome} → ${code}`, () => {
      expect(montarEscopoFormalizacaoV3(e)).toMatchObject({ ok: false, code });
    });
  }

  it("payload.valorTotal ausente não é exigido (\"quando houver\")", () => {
    const p = payload();
    delete (p as Record<string, unknown>).valorTotal;
    expect(montarEscopoFormalizacaoV3(estado(p))).toMatchObject({ ok: true });
  });

  it("pagamento parcial vigente sobre título coerente também é formalizável", () => {
    expect(montarEscopoFormalizacaoV3(estado(payload(), titulo({ status: "parcial" }, [{ tipo: "pagamento", valor: 100, loteId: "op-1" }])))).toMatchObject({
      ok: true,
      escopo: { recebidoLiquidoCentavos: 10000, titulo: { status: "parcial" } },
    });
  });
});

describe("normalizarEntradaFormalizacaoV3", () => {
  const escopo = (montarEscopoFormalizacaoV3(estado()) as { escopo: unknown }).escopo;
  const base = { operacaoId: "op-formaliza-1", motivo: "Cliente aprovou por WhatsApp em 02/10.", declaracaoAceita: true, escopo };
  it("entrada completa é aceita (evidência vazia vira nula)", () => {
    expect(normalizarEntradaFormalizacaoV3({ ...base, evidencia: "  " })).toMatchObject({ ok: true, valor: { evidencia: null, ratificarVencido: false } });
  });
  const invalidas: Array<[string, unknown]> = [
    ["sem dados", null],
    ["operação inválida", { ...base, operacaoId: "x" }],
    ["motivo curto", { ...base, motivo: "curto" }],
    ["motivo longo", { ...base, motivo: "x".repeat(501) }],
    ["declaração não aceita", { ...base, declaracaoAceita: false }],
    ["declaração como texto", { ...base, declaracaoAceita: "sim" }],
    ["evidência não textual", { ...base, evidencia: 12 }],
    ["evidência longa", { ...base, evidencia: "x".repeat(301) }],
    ["sem escopo", { ...base, escopo: undefined }],
    ["escopo de outra versão", { ...base, escopo: { versao: 2 } }],
    ["ratificação não booleana", { ...base, ratificarVencido: "sim" }],
  ];
  for (const [nome, input] of invalidas) {
    it(`${nome} → entrada_invalida`, () => {
      expect(normalizarEntradaFormalizacaoV3(input)).toMatchObject({ ok: false, code: "entrada_invalida" });
    });
  }
});

describe("decidirFormalizacaoV3 — revalidação contra o que o responsável viu", () => {
  const montar = (e: EstadoFormalizacaoV3) => {
    const m = montarEscopoFormalizacaoV3(e);
    if (!m.ok) throw new Error(m.mensagem);
    return m;
  };
  const entrada = (escopo: unknown, extra: Record<string, unknown> = {}) => {
    const n = normalizarEntradaFormalizacaoV3({ operacaoId: "op-formaliza-1", motivo: "Cliente aprovou presencialmente.", declaracaoAceita: true, escopo, ...extra });
    if (!n.ok) throw new Error(n.mensagem);
    return n.valor;
  };

  it("mesmo escopo: autorizado", () => {
    expect(decidirFormalizacaoV3(estado(), entrada(montar(estado()).escopo))).toMatchObject({ ok: true, vencido: false });
  });

  it("linha, revisão, título ou pagamento mudados depois da conferência: conflito, nunca correção", () => {
    const visto = montar(estado()).escopo;
    const mudancas: EstadoFormalizacaoV3[] = [
      estado(payload({}, { servicos: [{ id: "s1", descricao: "Troca de tela original", valor: 420 }] })),
      estado(payload({ orcamentoVersoesV3: [{ versao: 1 }] })),
      estado(payload(), titulo({ id: "cr-2" })),
      estado(payload(), titulo({ status: "parcial" }, [{ tipo: "pagamento", valor: 100, loteId: "op-1" }])),
      estado(payload(), titulo({}, [{ tipo: "liquidacao", valor: 420, loteId: "op-OUTRA", at: "2026-10-02T12:00:00.000Z" }])),
    ];
    for (const e of mudancas) expect(decidirFormalizacaoV3(e, entrada(visto))).toMatchObject({ ok: false, code: "escopo_divergente" });
  });

  it("vencido exige ratificação explícita no momento atual", () => {
    const vencido = estado(payload({}, { status: "enviado", validoAte: "2026-10-05T02:59:59.000Z" }));
    const visto = montar(vencido).escopo;
    expect(decidirFormalizacaoV3(vencido, entrada(visto))).toMatchObject({ ok: false, code: "vencido_sem_ratificacao" });
    expect(decidirFormalizacaoV3(vencido, entrada(visto, { ratificarVencido: true }))).toMatchObject({ ok: true, vencido: true });
  });

  it("pré-condição perdida no meio (ex.: orçamento aprovado por outro caminho) recusa antes de comparar", () => {
    const visto = montar(estado()).escopo;
    expect(decidirFormalizacaoV3(estado(payload({}, { status: "aprovado" })), entrada(visto))).toMatchObject({ ok: false, code: "nao_pendente" });
  });
});

describe("assinatura e JSON canônico", () => {
  it("ordem de chaves não muda a assinatura; `__proto__` é só dado", () => {
    expect(canonicoFormalizacaoV3({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(canonicoFormalizacaoV3({ a: [1, { c: 3, d: 2 }], b: 1 }));
    const comProto = JSON.parse('{"__proto__": {"x": 1}, "y": 2}');
    expect(canonicoFormalizacaoV3(comProto)).toBe('{"__proto__":{"x":1},"y":2}');
  });

  it("mesmo conteúdo = mesma assinatura; motivo/evidência/escopo diferentes = outra", () => {
    const escopo = (montarEscopoFormalizacaoV3(estado()) as { escopo: unknown }).escopo;
    const e = (extra: Record<string, unknown> = {}) => {
      const n = normalizarEntradaFormalizacaoV3({ operacaoId: "op-formaliza-1", motivo: "Cliente aprovou presencialmente.", declaracaoAceita: true, escopo, ...extra });
      if (!n.ok) throw new Error(n.mensagem);
      return n.valor;
    };
    const a = assinaturaFormalizacaoV3({ storeId: SID, osId: OS }, e());
    expect(assinaturaFormalizacaoV3({ storeId: SID, osId: OS }, e())).toBe(a);
    expect(assinaturaFormalizacaoV3({ storeId: SID, osId: OS }, e({ motivo: "Outro motivo registrado." }))).not.toBe(a);
    expect(assinaturaFormalizacaoV3({ storeId: SID, osId: OS }, e({ evidencia: "foto 12" }))).not.toBe(a);
    expect(assinaturaFormalizacaoV3({ storeId: SID, osId: "os-2" }, e())).not.toBe(a);
  });
});

describe("aplicarFormalizacaoV3 — ato atual, sem reescrever o passado", () => {
  const e = estado(payload({}, { status: "enviado", validoAte: "2026-10-05T02:59:59.000Z", enviadoEm: "2026-10-01T13:00:00.000Z" }));
  const m = montarEscopoFormalizacaoV3(e);
  if (!m.ok) throw new Error(m.mensagem);
  const n = normalizarEntradaFormalizacaoV3({ operacaoId: "op-formaliza-1", motivo: "Cliente aprovou presencialmente.", declaracaoAceita: true, escopo: m.escopo, evidencia: "foto do aceite", ratificarVencido: true });
  if (!n.ok) throw new Error(n.mensagem);
  const { payload: depois, registro } = aplicarFormalizacaoV3(e.payload, {
    entrada: n.valor,
    escopo: m.escopo,
    vencido: m.vencido,
    requestFingerprint: "fp-1",
    operador: "Admin QA",
    operadorId: "u-admin",
    agora: AGORA_ISO,
    eventoId: "ev-formaliza",
  });

  it("orçamento aprovado no instante ATUAL; validade, envio, linhas e totais intactos", () => {
    const antes = e.payload.orcamento as unknown as Record<string, unknown>;
    expect(depois.orcamento).toEqual({ ...antes, status: "aprovado", respondidoEm: AGORA_ISO, atualizadoEm: AGORA_ISO });
  });

  it("registro do ato com motivo, declaração, evidência, escopo, quem/quando e ratificação", () => {
    expect(registro).toMatchObject({
      versao: 1,
      natureza: NATUREZA_FORMALIZACAO_APROVACAO_V3,
      atoAtual: true,
      operacaoId: "op-formaliza-1",
      requestFingerprint: "fp-1",
      motivo: "Cliente aprovou presencialmente.",
      declaracao: DECLARACAO_FORMALIZACAO_APROVACAO_V3,
      evidencia: "foto do aceite",
      orcamentoStatusAnterior: "enviado",
      validoAte: "2026-10-05T02:59:59.000Z",
      vencido: true,
      vencimentoRatificado: true,
      formalizadoPorId: "u-admin",
      formalizadoPorNome: "Admin QA",
      formalizadoEm: AGORA_ISO,
    });
    expect(registro.escopo).toEqual(m.escopo);
    expect(lerFormalizacaoAprovacaoV3(depois)).toEqual(registro);
  });

  it("nova versão com a natureza e UM evento de timeline (os anteriores intactos)", () => {
    expect(depois.orcamentoVersoesV3).toEqual([
      expect.objectContaining({ versao: 1, status: "aprovado", total: 420, registradoEm: AGORA_ISO, registradoPor: "Admin QA", natureza: NATUREZA_FORMALIZACAO_APROVACAO_V3, operacaoId: "op-formaliza-1" }),
    ]);
    const timeline = depois.timeline as unknown as Array<Record<string, unknown>>;
    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toEqual((e.payload.timeline as unknown as unknown[])[0]);
    expect(timeline[1]).toMatchObject({ id: "ev-formaliza", tipo: "orcamento_aprovado", criadoEm: AGORA_ISO, metadata: { natureza: NATUREZA_FORMALIZACAO_APROVACAO_V3, formalizacao: true, vencimentoRatificado: true } });
    expect(String(timeline[1]!.conteudo)).toContain("não a aprovação original do cliente");
  });

  it("garantia, status técnico, espelho de pagamento e demais campos não mudam", () => {
    const { orcamento: _o, orcamentoVersoesV3: _v, timeline: _t, atualizadoEm: _a, formalizacaoAprovacaoV3: _f, ...restoDepois } = depois as Record<string, unknown>;
    const { orcamento: _o2, orcamentoVersoesV3: _v2, timeline: _t2, ...restoAntes } = e.payload as Record<string, unknown>;
    expect(restoDepois).toEqual(restoAntes);
  });
});

describe("R1-P2 — escopo exibido é o efetivamente escolhido (valor ao cliente, cortesia, alternativa)", () => {
  it("orçamento R$ 300: escolhido 400 − 100, alternativa 450 não escolhida, brinde 20; assinatura cobre o orçamento inteiro", () => {
    const orc = {
      total: 300,
      gruposV3: [{ id: "g1", rotulo: "Tela", regra: "escolha_1" }],
      servicos: [
        { id: "s-orig", descricao: "Tela original", valor: 400, desconto: 100, grupoId: "g1", selecionadaV3: true },
        { id: "s-alt", descricao: "Tela premium", valor: 450, grupoId: "g1" },
        { id: "s-brinde", descricao: "Película", valor: 20, kindV3: "brinde" },
      ],
    };
    const p = payload({ valorTotal: 300 }, orc);
    const t = titulo({ valor: 300 }, [{ tipo: "liquidacao", valor: 300, loteId: "op-1", at: "2026-10-02T12:00:00.000Z" }]);
    const m = montarEscopoFormalizacaoV3(estado(p, t, 300));
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.escopo.orcamento.totalCentavos).toBe(30000);
    expect(m.escopo.orcamento.linhas.map((l) => [l.descricao, l.situacao, l.valorCentavos, l.grupo ?? null])).toEqual([
      ["Tela original", "cobrada", 30000, "Tela"],
      ["Tela premium", "alternativa_nao_escolhida", 45000, "Tela"],
      ["Película", "cortesia", 0, null],
    ]);
    // A assinatura revalidada continua sendo o conteúdo inteiro (seleção, desconto, grupos).
    const outra = montarEscopoFormalizacaoV3(estado(payload({ valorTotal: 300 }, { ...orc, servicos: [{ ...orc.servicos[0], descricao: "Tela compatível" }, orc.servicos[1], orc.servicos[2]] }), t, 300));
    expect(outra.ok && outra.escopo.orcamento.conteudo).not.toBe(m.escopo.orcamento.conteudo);
  });
});
