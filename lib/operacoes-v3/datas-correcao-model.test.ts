import { afterEach, describe, expect, it } from "vitest";
import {
  camposCorrigiveisV3,
  esperadoCampoDataV3,
  planejarCorrecaoDatasV3,
  type CorrecaoDatasInputV3,
  type GarantiaOperacionalLinhaV3,
} from "./datas-correcao-model";
import { fimDoDiaLojaIsoV3, formatarDataOperacionalV3, lerDatasOSV3, montarDataOperacionalV3, type DataOperacionalV3 } from "./datas-operacionais-model";
import { lerGarantiaV3 } from "./pos-venda-model";
import type { OrdemServico } from "@/types/os";

// 04/10/2026 15:00 na loja.
const AGORA = new Date("2026-10-04T18:00:00.000Z");
const CTX = { agora: AGORA, operador: "Operador QA", operadorId: "user-qa", eventoId: "ev-correcao" };

function data(dia: string, hora = ""): DataOperacionalV3 {
  const r = montarDataOperacionalV3({ dia, hora });
  if (!r.ok) throw new Error(r.mensagem);
  return r.valor;
}

const ENTRADA = data("2026-09-25", "10:00");
const ENTREGA = data("2026-09-29", "16:00");

/** OS entregue com pagamento misto e a prazo já gravados (o que a correção NÃO pode tocar). */
function osEntregue(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "os-1",
    codigo: "OS-2026-00099",
    criadoEm: "2026-10-04T17:00:00.000Z",
    status: "entregue",
    operacaoStatusV3: "entregue",
    aberturaV3: {
      versao: 1,
      recepcao: { dataEntrada: ENTRADA.iso, dataEntradaMeta: ENTRADA.meta, origem: "balcao" },
      garantiaPrevista: { modelo: "tela", label: "Troca de Tela", prazoDias: 90 },
    },
    sla: { prazo: "2026-10-06T17:00:00.000Z", status: "ok", origemV3: "automatico" },
    entregueEm: ENTREGA.iso,
    retirada: { confirmado: true, retiradoPor: "Cliente", retiradoEm: ENTREGA.iso },
    entregaV3: {
      entregueEm: ENTREGA.iso,
      entregueEmMeta: ENTREGA.meta,
      registradoEm: "2026-10-04T17:30:00.000Z",
      entreguePor: "Operador",
      assinaturaRetirada: { dataUrl: "data:image/png;base64,AAA", criadoEm: "2026-10-04T17:30:00.000Z", por: "Cliente" },
    },
    pagamentoV3: { total: 400, recebido: 350, saldo: 50, status: "parcial", operacoes: ["op-1"] },
    aPrazoV3: { valor: 50, vencimento: "2026-11-04", status: "pendente" },
    recebimentoMistoRecusasV3: [{ chave: "op-x", motivo: "saldo" }],
    timeline: [
      { id: "ev-1", tipo: "criacao", autor: "Op", autorTipo: "usuario", conteudo: "OS criada.", criadoEm: "2026-10-04T17:00:00.000Z" },
      { id: "ev-2", tipo: "entrega_cliente", autor: "Op", autorTipo: "usuario", conteudo: "Entregue.", criadoEm: "2026-10-04T17:30:00.000Z" },
    ],
    campoDesconhecido: { manter: true },
    ...over,
  };
}

function input(over: Partial<CorrecaoDatasInputV3>): CorrecaoDatasInputV3 {
  return { alteracoes: {}, esperados: {}, motivo: "Entregue na sexta, registrado hoje.", ...over };
}

describe("camposCorrigiveisV3", () => {
  it("OS entregue: entrada, previsão e entrega, com o valor 'visto' para a trava otimista", () => {
    const c = camposCorrigiveisV3(osEntregue());
    expect(c.campos.map((x) => x.campo)).toEqual(["dataEntrada", "previsaoEntrega", "dataEntrega"]);
    expect(c.campos.find((x) => x.campo === "dataEntrega")?.esperado).toBe(ENTREGA.iso);
    expect(c.campos.find((x) => x.campo === "previsaoEntrega")?.esperado).toBe("");
  });

  it("orçamento pré-OS: data da proposta e validade andam juntas (em qualquer status)", () => {
    const os = {
      comercialV4: { tipo: "orcamento_pre_os", statusComercial: "enviado", dataProposta: data("2026-09-10").iso, dataPropostaMeta: data("2026-09-10").meta },
      orcamento: { id: "o", status: "enviado", servicos: [], pecas: [], desconto: 0, total: 0, criadoEm: "x", validoAte: fimDoDiaLojaIsoV3("2026-09-17") },
      aberturaV3: { recepcao: {} },
    };
    const c = camposCorrigiveisV3(os);
    expect(c.campos.map((x) => x.campo)).toEqual(["dataEntrada", "previsaoEntrega", "dataProposta", "validoAte"]);
    // Aprovado: a validade continua corrigível junto da proposta ("validade ≥ proposta" sempre tem saída).
    const aprovado = camposCorrigiveisV3({ ...os, orcamento: { ...os.orcamento, status: "aprovado" } });
    expect(aprovado.campos.map((x) => x.campo)).toContain("validoAte");
  });

  it("R4: mover a proposta para depois da validade gravada é recusado (mesmo com o orçamento aprovado)", () => {
    const proposta = data("2026-09-10");
    const os = {
      comercialV4: { tipo: "orcamento_pre_os", statusComercial: "aprovado", dataProposta: proposta.iso, dataPropostaMeta: proposta.meta, validadeDias: 7 },
      orcamento: { id: "o", status: "aprovado", servicos: [], pecas: [], desconto: 0, total: 0, criadoEm: "x", validoAte: fimDoDiaLojaIsoV3("2026-09-17") },
      aberturaV3: { recepcao: {} },
      timeline: [],
    };
    const r = planejarCorrecaoDatasV3(
      os,
      input({ alteracoes: { dataProposta: data("2026-09-20") }, esperados: { dataProposta: esperadoCampoDataV3(proposta.iso, "dia") } }),
      CTX,
    );
    expect(r).toMatchObject({ ok: false, tipo: "validacao", campo: "validoAte" });
    if (r.ok) return;
    expect(r.mensagem).toMatch(/não pode ser anterior à data do orçamento/);
  });
});

describe("planejarCorrecaoDatasV3 — D14 corrigir entrega sem refazer nada", () => {
  it("altera só as datas da entrega (e espelhos), preserva pagamento/a prazo/recusas/assinatura/timeline e audita", () => {
    const nova = data("2026-09-27", "");
    const r = planejarCorrecaoDatasV3(
      osEntregue(),
      input({ alteracoes: { dataEntrega: nova }, esperados: { dataEntrega: ENTREGA.iso }, confirmarImpactoGarantia: true }),
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const n = r.next as Record<string, any>;
    expect(n.entregaV3.entregueEm).toBe(nova.iso);
    expect(n.entregaV3.entregueEmMeta).toEqual({ precisao: "dia", dia: "2026-09-27" });
    expect(n.entregueEm).toBe(nova.iso);
    expect(n.retirada.retiradoEm).toBe(nova.iso);
    // Registro e captura reais preservados.
    expect(n.entregaV3.registradoEm).toBe("2026-10-04T17:30:00.000Z");
    expect(n.entregaV3.assinaturaRetirada.criadoEm).toBe("2026-10-04T17:30:00.000Z");
    // Pagamento, a prazo, recusas terminais e desconhecidos intactos.
    expect(n.pagamentoV3).toEqual(osEntregue().pagamentoV3);
    expect(n.aPrazoV3).toEqual(osEntregue().aPrazoV3);
    expect(n.recebimentoMistoRecusasV3).toEqual(osEntregue().recebimentoMistoRecusasV3);
    expect(n.campoDesconhecido).toEqual({ manter: true });
    expect(n.status).toBe("entregue");
    // Timeline: eventos antigos intactos + 1 evento de auditoria com horário REAL.
    expect(n.timeline).toHaveLength(3);
    expect(n.timeline.slice(0, 2)).toEqual(osEntregue().timeline);
    const ev = n.timeline[2];
    expect(ev.criadoEm).toBe(AGORA.toISOString());
    expect(ev.metadata).toMatchObject({
      evento: "datas_corrigidas",
      motivo: "Entregue na sexta, registrado hoje.",
      operadorId: "user-qa",
      campos: [{ campo: "dataEntrega", antes: ENTREGA.iso, depois: nova.iso }],
    });
    expect(n.timeline.filter((e: { tipo: string }) => e.tipo === "entrega_cliente")).toHaveLength(1);
    expect(n.atualizadoEm).toBe(AGORA.toISOString());
    // Sem payload completo/credenciais na auditoria.
    expect(JSON.stringify(ev)).not.toContain("assinaturaRetirada");
    expect(JSON.stringify(ev)).not.toContain("pagamentoV3");
  });

  it("D15: garantia derivada da entrega muda junto e exige confirmação explícita", () => {
    const nova = data("2026-09-27", "");
    const sem = planejarCorrecaoDatasV3(osEntregue(), input({ alteracoes: { dataEntrega: nova }, esperados: { dataEntrega: ENTREGA.iso } }), CTX);
    expect(sem.ok).toBe(false);
    if (sem.ok) return;
    expect(sem.tipo).toBe("confirmacao");
    expect(sem.garantia?.temImpacto).toBe(true);
    expect(sem.garantia?.inicioAntes).toBe(ENTREGA.iso);
    expect(sem.garantia?.inicioDepois).toBe(nova.iso);
    const com = planejarCorrecaoDatasV3(
      osEntregue(),
      input({ alteracoes: { dataEntrega: nova }, esperados: { dataEntrega: ENTREGA.iso }, confirmarImpactoGarantia: true }),
      CTX,
    );
    expect(com.ok).toBe(true);
    if (!com.ok) return;
    const g = lerGarantiaV3(com.next as unknown as OrdemServico, AGORA);
    expect(g.inicio).toBe(nova.iso);
    expect(g.prazoDias).toBe(90); // prazo e cobertura preservados; nunca reinicia em "hoje"
  });

  it("D15: garantia V2 ativa ancorada na entrega é deslocada; encerradas ficam intactas; nenhuma linha nova", () => {
    const nova = data("2026-09-28", "16:00"); // 1 dia antes, mesmo horário
    const linhas: GarantiaOperacionalLinhaV3[] = [
      { id: "g-ativa", status: "ativa", dataInicio: ENTREGA.iso, dataFim: "2026-12-28T19:00:00.000Z" },
      { id: "g-cancelada", status: "cancelada", dataInicio: ENTREGA.iso, dataFim: "2026-12-28T19:00:00.000Z" },
      { id: "g-outra", status: "ativa", dataInicio: "2026-09-20T12:00:00.000Z", dataFim: "2026-12-19T12:00:00.000Z" },
    ];
    const base = osEntregue({ garantia: { ativa: true, prazoDias: 90, inicioEm: ENTREGA.iso, fimEm: "2026-12-28T19:00:00.000Z" } });
    const r = planejarCorrecaoDatasV3(
      base,
      input({ alteracoes: { dataEntrega: nova }, esperados: { dataEntrega: ENTREGA.iso }, confirmarImpactoGarantia: true }),
      { ...CTX, garantias: linhas },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.garantia.linhas.map((l) => l.id)).toEqual(["g-ativa"]);
    expect(r.garantia.linhas[0]).toMatchObject({ dataInicio: nova.iso, dataFim: "2026-12-27T19:00:00.000Z" });
    expect(r.garantia.encerradasIntocadas).toBe(1);
    expect(r.garantia.payloadDeslocado).toBe(true);
    expect((r.next as any).garantia).toMatchObject({ ativa: true, prazoDias: 90, inicioEm: nova.iso, fimEm: "2026-12-27T19:00:00.000Z" });
  });

  it("R5: no servidor a confirmação vale só para o impacto exibido (assinatura); linha nova ou outra data pedem nova confirmação", () => {
    const nova = data("2026-09-28", "16:00");
    const ativa: GarantiaOperacionalLinhaV3 = { id: "g-ativa", status: "ativa", dataInicio: ENTREGA.iso, dataFim: "2026-12-28T19:00:00.000Z" };
    const servidor = { ...CTX, exigirAssinaturaGarantia: true };
    const pedido = (extra: Partial<CorrecaoDatasInputV3>) =>
      input({ alteracoes: { dataEntrega: nova }, esperados: { dataEntrega: ENTREGA.iso }, confirmarImpactoGarantia: true, ...extra });

    // Prévia sem as linhas reais (navegador) × servidor com a linha: impactos diferentes.
    const previa = planejarCorrecaoDatasV3(osEntregue(), input({ alteracoes: { dataEntrega: nova }, esperados: { dataEntrega: ENTREGA.iso } }), CTX);
    expect(!previa.ok && previa.tipo).toBe("confirmacao");
    const assinaturaPrevia = !previa.ok ? previa.garantia!.assinatura : "";
    const r1 = planejarCorrecaoDatasV3(osEntregue(), pedido({ assinaturaImpactoGarantia: assinaturaPrevia }), { ...servidor, garantias: [ativa] });
    expect(r1.ok).toBe(false);
    if (r1.ok) return;
    expect(r1.tipo).toBe("confirmacao");
    expect(r1.mensagem).toMatch(/mudou desde a sua confirmação/);
    expect(r1.garantia?.linhas.map((l) => l.id)).toEqual(["g-ativa"]);
    // Sem assinatura (confirmação "solta") também não passa no servidor.
    const semAssinatura = planejarCorrecaoDatasV3(osEntregue(), pedido({}), { ...servidor, garantias: [ativa] });
    expect(!semAssinatura.ok && semAssinatura.tipo).toBe("confirmacao");
    // Confirmando o impacto exibido pelo servidor → aplica.
    const r2 = planejarCorrecaoDatasV3(osEntregue(), pedido({ assinaturaImpactoGarantia: r1.garantia!.assinatura }), { ...servidor, garantias: [ativa] });
    expect(r2.ok).toBe(true);
    // Outra garantia ancorada criada no meio: a assinatura antiga não vale mais.
    const outra: GarantiaOperacionalLinhaV3 = { id: "g-nova", status: "ativa", dataInicio: ENTREGA.iso, dataFim: "2027-01-28T19:00:00.000Z" };
    const r3 = planejarCorrecaoDatasV3(osEntregue(), pedido({ assinaturaImpactoGarantia: r1.garantia!.assinatura }), { ...servidor, garantias: [ativa, outra] });
    expect(!r3.ok && r3.tipo).toBe("confirmacao");
    expect(!r3.ok && r3.garantia?.linhas.map((l) => l.id).sort()).toEqual(["g-ativa", "g-nova"]);
  });

  it("garantia V2 não ancorada na entrega (ex.: aprovação) não é tocada", () => {
    const base = osEntregue({ garantia: { ativa: true, prazoDias: 90, inicioEm: "2026-09-20T12:00:00.000Z", fimEm: "2026-12-19T12:00:00.000Z" } });
    const r = planejarCorrecaoDatasV3(
      base,
      input({ alteracoes: { dataEntrega: data("2026-09-27") }, esperados: { dataEntrega: ENTREGA.iso }, confirmarImpactoGarantia: true }),
      CTX,
    );
    expect(r.ok && (r.next as any).garantia.inicioEm).toBe("2026-09-20T12:00:00.000Z");
  });

  it("retorno aberto 'com garantia ativa' fora do novo período é impedimento — nada é gravado", () => {
    const base = osEntregue({
      retornosV3: [{ id: "r1", osOriginalId: "os-1", motivo: "Tela piscando", criadoEm: "2026-12-26T15:00:00.000Z", status: "aberto", garantiaAtivaNaAbertura: true }],
    });
    // Entrega em 01/09 → garantia até ~30/11: o retorno de 26/12 ficaria fora.
    const r = planejarCorrecaoDatasV3(
      base,
      input({ alteracoes: { dataEntrega: data("2026-09-01"), dataEntrada: data("2026-08-30") }, esperados: { dataEntrega: ENTREGA.iso, dataEntrada: ENTRADA.iso }, confirmarImpactoGarantia: true }),
      CTX,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.tipo).toBe("impedimento");
    expect(r.mensagem).toMatch(/retorno aberto em 26\/12\/2026/);
  });
});

describe("planejarCorrecaoDatasV3 — retorno × linha real de garantia divergente do payload", () => {
  it("linha ativa de 30 dias (payload diz 90): antecipar a entrega deixaria o retorno fora DELA → impedimento", () => {
    // Visão V3 (90 dias) continuaria cobrindo 20/10; a linha real deslocada termina em 15/10.
    const linhas: GarantiaOperacionalLinhaV3[] = [{ id: "g-30", status: "ativa", dataInicio: ENTREGA.iso, dataFim: "2026-10-29T19:00:00.000Z" }];
    const base = osEntregue({
      retornosV3: [{ id: "r1", osOriginalId: "os-1", motivo: "Tela piscando", criadoEm: "2026-10-20T15:00:00.000Z", status: "aberto", garantiaAtivaNaAbertura: true }],
    });
    const r = planejarCorrecaoDatasV3(
      base,
      input({
        alteracoes: { dataEntrega: data("2026-09-15", "16:00"), dataEntrada: data("2026-09-14") },
        esperados: { dataEntrega: ENTREGA.iso, dataEntrada: ENTRADA.iso },
        confirmarImpactoGarantia: true,
      }),
      { ...CTX, garantias: linhas },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.tipo).toBe("impedimento");
    expect(r.mensagem).toContain("retorno aberto em 20/10/2026");
    expect(r.mensagem).toContain("(15/09/2026 a 15/10/2026)");
  });

  it("a mesma antecipação sem retorno dependente é permitida e desloca a linha com o prazo dela", () => {
    const linhas: GarantiaOperacionalLinhaV3[] = [{ id: "g-30", status: "ativa", dataInicio: ENTREGA.iso, dataFim: "2026-10-29T19:00:00.000Z" }];
    const r = planejarCorrecaoDatasV3(
      osEntregue(),
      input({
        alteracoes: { dataEntrega: data("2026-09-15", "16:00"), dataEntrada: data("2026-09-14") },
        esperados: { dataEntrega: ENTREGA.iso, dataEntrada: ENTRADA.iso },
        confirmarImpactoGarantia: true,
      }),
      { ...CTX, garantias: linhas },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.garantia.linhas[0]).toMatchObject({ id: "g-30", dataFim: "2026-10-15T19:00:00.000Z" });
  });
});

describe("planejarCorrecaoDatasV3 — garantia vencida nunca é reativada (R2)", () => {
  // Entrega em 01/06 com 90 dias: venceu em 30/08 (antes de AGORA = 04/10).
  const ENTREGA_ANTIGA = data("2026-06-01");
  const ENTRADA_ANTIGA = data("2026-05-30");
  function osAntiga(over: Record<string, unknown> = {}) {
    return osEntregue({
      aberturaV3: {
        versao: 1,
        recepcao: { dataEntrada: ENTRADA_ANTIGA.iso, dataEntradaMeta: ENTRADA_ANTIGA.meta, origem: "balcao" },
        garantiaPrevista: { modelo: "tela", label: "Troca de Tela", prazoDias: 90 },
      },
      entregueEm: ENTREGA_ANTIGA.iso,
      retirada: { confirmado: true, retiradoPor: "Cliente", retiradoEm: ENTREGA_ANTIGA.iso },
      entregaV3: { entregueEm: ENTREGA_ANTIGA.iso, entregueEmMeta: ENTREGA_ANTIGA.meta, registradoEm: "2026-06-01T18:00:00.000Z" },
      ...over,
    });
  }

  it("mover a entrega para depois a ponto de a garantia vencida voltar a valer é impedimento", () => {
    const r = planejarCorrecaoDatasV3(
      osAntiga(),
      input({ alteracoes: { dataEntrega: data("2026-09-15") }, esperados: { dataEntrega: esperadoCampoDataV3(ENTREGA_ANTIGA.iso, "dia") }, confirmarImpactoGarantia: true }),
      CTX,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.tipo).toBe("impedimento");
    expect(r.mensagem).toContain("venceu em 30/08/2026");
    expect(r.mensagem).toContain("A correção não foi aplicada.");
  });

  it("linha real 'ativa' já vencida também não volta a valer", () => {
    const linhas: GarantiaOperacionalLinhaV3[] = [{ id: "g-velha", status: "ativa", dataInicio: ENTREGA_ANTIGA.iso, dataFim: "2026-07-01T15:00:00.000Z" }];
    // Sem garantia prevista na abertura: só a linha real decide.
    const base = osAntiga({ aberturaV3: { versao: 1, recepcao: { dataEntrada: ENTRADA_ANTIGA.iso, dataEntradaMeta: ENTRADA_ANTIGA.meta } } });
    const r = planejarCorrecaoDatasV3(
      base,
      input({ alteracoes: { dataEntrega: data("2026-09-20") }, esperados: { dataEntrega: esperadoCampoDataV3(ENTREGA_ANTIGA.iso, "dia") }, confirmarImpactoGarantia: true }),
      { ...CTX, garantias: linhas },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.tipo).toBe("impedimento");
    expect(r.mensagem).toContain("venceu em 01/07/2026");
  });

  it("antecipar uma entrega com garantia vencida (continua vencida) é permitido", () => {
    const r = planejarCorrecaoDatasV3(
      osAntiga(),
      input({
        alteracoes: { dataEntrega: data("2026-05-31") },
        esperados: { dataEntrega: esperadoCampoDataV3(ENTREGA_ANTIGA.iso, "dia") },
        confirmarImpactoGarantia: true,
      }),
      CTX,
    );
    expect(r.ok).toBe(true);
  });
});

describe("planejarCorrecaoDatasV3 — entrega legada e SLA da previsão (R2)", () => {
  it("entrega legada só com `entregueEm`: a correção materializa `entregaV3` com a precisão (sem inventar registro)", () => {
    const base = osEntregue({ entregaV3: undefined });
    delete (base as Record<string, unknown>).entregaV3;
    const nova = data("2026-09-27");
    const r = planejarCorrecaoDatasV3(
      base,
      input({ alteracoes: { dataEntrega: nova }, esperados: { dataEntrega: ENTREGA.iso }, confirmarImpactoGarantia: true }),
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.next as any).entregaV3).toEqual({ entregueEm: nova.iso, entregueEmMeta: nova.meta });
    const lida = lerDatasOSV3(r.next).entrega;
    expect(lida).toMatchObject({ precisao: "dia", dia: "2026-09-27" });
    expect(formatarDataOperacionalV3(lida)).toBe("27/09/2026");
  });

  it("previsão só-dia corrigida espelha o FIM do dia no SLA (não a âncora 12:00) e não vira prazo interno", () => {
    const prev = data("2026-10-08");
    const r = planejarCorrecaoDatasV3(
      osEntregue({ status: "pronta", operacaoStatusV3: "pronta" }),
      // Previsão ausente: o valor "visto" (camposCorrigiveisV3) é "".
      input({ alteracoes: { previsaoEntrega: prev }, esperados: { previsaoEntrega: "" } }),
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.next as any).sla).toMatchObject({ prazo: fimDoDiaLojaIsoV3("2026-10-08"), origemV3: "informada" });
    const datas = lerDatasOSV3(r.next);
    expect(datas.previsao).toMatchObject({ precisao: "dia", dia: "2026-10-08" });
    expect(datas.prazoInterno).toBeNull();
  });
});

describe("planejarCorrecaoDatasV3 — trava otimista considera a precisão (R3)", () => {
  it("trocar só-dia por 12:00 explícito (mesma ISO) é mudança: quem tem o snapshot antigo recebe conflito", () => {
    const soDia = data("2026-09-29");
    const comHora = data("2026-09-29", "12:00");
    expect(comHora.iso).toBe(soDia.iso);
    const base = osEntregue({
      entregueEm: soDia.iso,
      retirada: { confirmado: true, retiradoPor: "Cliente", retiradoEm: soDia.iso },
      entregaV3: { entregueEm: soDia.iso, entregueEmMeta: soDia.meta, registradoEm: "2026-10-04T17:30:00.000Z" },
    });
    const visto = camposCorrigiveisV3(base).campos.find((c) => c.campo === "dataEntrega")!.esperado;
    expect(visto).toBe(`${soDia.iso}|dia`);
    const a = planejarCorrecaoDatasV3(base, input({ alteracoes: { dataEntrega: comHora }, esperados: { dataEntrega: visto }, confirmarImpactoGarantia: true }), CTX);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = planejarCorrecaoDatasV3(
      a.next,
      input({ alteracoes: { dataEntrega: data("2026-09-28") }, esperados: { dataEntrega: visto }, confirmarImpactoGarantia: true }),
      CTX,
    );
    expect(b).toMatchObject({ ok: false, tipo: "conflito", campo: "dataEntrega" });
  });
});

describe("planejarCorrecaoDatasV3 — regras e concorrência (D05/D17)", () => {
  it("D17: snapshot velho (esperado ≠ gravado) recebe conflito, sem sobrescrita", () => {
    const r = planejarCorrecaoDatasV3(
      osEntregue(),
      input({ alteracoes: { dataEntrega: data("2026-09-27") }, esperados: { dataEntrega: "2026-09-29T15:00:00.000Z" }, confirmarImpactoGarantia: true }),
      CTX,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.tipo).toBe("conflito");
    expect(r.campo).toBe("dataEntrega");
  });

  it("D05: entrega antes da entrada, entrega no futuro e entrada depois da entrega são recusadas", () => {
    const antes = planejarCorrecaoDatasV3(osEntregue(), input({ alteracoes: { dataEntrega: data("2026-09-24") }, esperados: { dataEntrega: ENTREGA.iso }, confirmarImpactoGarantia: true }), CTX);
    expect(!antes.ok && antes.campo).toBe("dataEntrega");
    expect(!antes.ok && antes.mensagem).toMatch(/não pode ser anterior/);
    const futura = planejarCorrecaoDatasV3(osEntregue(), input({ alteracoes: { dataEntrega: data("2026-10-05") }, esperados: { dataEntrega: ENTREGA.iso }, confirmarImpactoGarantia: true }), CTX);
    expect(!futura.ok && futura.mensagem).toMatch(/futuro/);
    const entradaDepois = planejarCorrecaoDatasV3(osEntregue(), input({ alteracoes: { dataEntrada: data("2026-09-30") }, esperados: { dataEntrada: ENTRADA.iso } }), CTX);
    expect(!entradaDepois.ok && entradaDepois.campo).toBe("dataEntrada");
    expect(!entradaDepois.ok && entradaDepois.mensagem).toMatch(/posterior/);
  });

  it("motivo obrigatório, data malformada e campo inexistente", () => {
    expect(planejarCorrecaoDatasV3(osEntregue(), input({ motivo: " ", alteracoes: { dataEntrada: data("2026-09-24") }, esperados: { dataEntrada: ENTRADA.iso } }), CTX).ok).toBe(false);
    const malformada = planejarCorrecaoDatasV3(
      osEntregue(),
      input({ alteracoes: { dataEntrada: { iso: "2026-02-30T15:00:00.000Z", meta: { precisao: "dia", dia: "2026-02-30" } } }, esperados: { dataEntrada: ENTRADA.iso } }),
      CTX,
    );
    expect(!malformada.ok && malformada.tipo).toBe("validacao");
    const naoEntregue = planejarCorrecaoDatasV3(
      { ...osEntregue(), entregaV3: undefined, entregueEm: undefined, retirada: undefined },
      input({ alteracoes: { dataEntrega: data("2026-09-27") }, esperados: { dataEntrega: "" } }),
      CTX,
    );
    expect(!naoEntregue.ok && naoEntregue.mensagem).toMatch(/não pode ser corrigida/);
  });

  it("sem mudança real não grava nada", () => {
    const r = planejarCorrecaoDatasV3(osEntregue(), input({ alteracoes: { dataEntrada: ENTRADA }, esperados: { dataEntrada: ENTRADA.iso } }), CTX);
    expect(!r.ok && r.mensagem).toBe("Nenhuma data foi alterada.");
  });
});

describe("planejarCorrecaoDatasV3 — previsão, atendimento rápido e proposta", () => {
  it("D06: remover a previsão volta a 'não informada'; o espelho NÃO vira prazo interno — volta à regra padrão (cadastro + 2 dias)", () => {
    const prev = data("2026-09-28", "18:00");
    const base = osEntregue({
      aberturaV3: { versao: 1, recepcao: { dataEntrada: ENTRADA.iso, dataEntradaMeta: ENTRADA.meta, previsaoEntrega: prev.iso, previsaoEntregaMeta: prev.meta } },
      sla: { prazo: prev.iso, status: "ok", origemV3: "informada" },
    });
    const r = planejarCorrecaoDatasV3(base, input({ alteracoes: { previsaoEntrega: null }, esperados: { previsaoEntrega: prev.iso } }), CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const datas = lerDatasOSV3(r.next);
    expect(datas.previsao).toBeNull();
    // Cadastro 04/10 17:00Z + 2 dias — nunca a promessa apagada (28/09 18:00).
    expect(datas.prazoInterno).toMatchObject({ origem: "automatico" });
    expect(datas.prazoInterno?.data.iso).toBe("2026-10-06T17:00:00.000Z");
    expect((r.next as any).sla).toMatchObject({ prazo: "2026-10-06T17:00:00.000Z", origemV3: "automatico" });
  });

  it("remover a previsão preserva um prazo interno PRÓPRIO (não espelhado)", () => {
    const prev = data("2026-09-28", "18:00");
    const base = osEntregue({
      aberturaV3: { versao: 1, recepcao: { dataEntrada: ENTRADA.iso, dataEntradaMeta: ENTRADA.meta, previsaoEntrega: prev.iso, previsaoEntregaMeta: prev.meta } },
      sla: { prazo: "2026-09-27T12:00:00.000Z", status: "ok", origemV3: "automatico" },
    });
    const r = planejarCorrecaoDatasV3(base, input({ alteracoes: { previsaoEntrega: null }, esperados: { previsaoEntrega: prev.iso } }), CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.next as any).sla).toMatchObject({ prazo: "2026-09-27T12:00:00.000Z", origemV3: "automatico" });
  });

  it("D12: corrigir atendimento rápido muda só datas (concluidoEm + espelhos), nunca recebimento", () => {
    const base = {
      ...osEntregue({ entregaV3: undefined, retirada: undefined }),
      atendimentoRapidoV3: { versao: 1, servico: "Película", valor: 20, forma: "pix", concluidoEm: ENTREGA.iso, concluidoEmMeta: ENTREGA.meta, registradoEm: "2026-10-04T17:30:00.000Z" },
    };
    const nova = data("2026-09-26", "11:00");
    const r = planejarCorrecaoDatasV3(base, input({ alteracoes: { dataEntrega: nova }, esperados: { dataEntrega: ENTREGA.iso }, confirmarImpactoGarantia: true }), CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const n = r.next as any;
    expect(n.atendimentoRapidoV3).toMatchObject({ concluidoEm: nova.iso, concluidoEmMeta: nova.meta, valor: 20, forma: "pix", registradoEm: "2026-10-04T17:30:00.000Z" });
    expect(n.entregueEm).toBe(nova.iso);
    expect(n.pagamentoV3).toEqual(osEntregue().pagamentoV3);
    expect(camposCorrigiveisV3(base).campos.find((c) => c.campo === "dataEntrega")?.rotulo).toBe("Saída do atendimento");
  });

  it("D10: proposta retroativa e validade corrigidas com auditoria; validadeDias coerente", () => {
    const proposta = data("2026-09-10");
    const os = {
      comercialV4: { tipo: "orcamento_pre_os", statusComercial: "enviado", dataProposta: proposta.iso, dataPropostaMeta: proposta.meta, validadeDias: 7 },
      orcamento: { id: "o", status: "enviado", servicos: [], pecas: [], desconto: 0, total: 0, criadoEm: "2026-10-04T17:00:00.000Z", enviadoEm: "2026-10-04T17:05:00.000Z", validoAte: fimDoDiaLojaIsoV3("2026-09-17") },
      aberturaV3: { recepcao: {} },
      timeline: [],
    };
    const validade = { iso: fimDoDiaLojaIsoV3("2026-09-30"), meta: { precisao: "dia" as const, dia: "2026-09-30" } };
    const r = planejarCorrecaoDatasV3(
      os,
      input({ alteracoes: { dataProposta: data("2026-09-08"), validoAte: validade }, esperados: { dataProposta: esperadoCampoDataV3(proposta.iso, "dia"), validoAte: fimDoDiaLojaIsoV3("2026-09-17") } }),
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const n = r.next as any;
    expect(n.comercialV4.dataProposta).toBe(data("2026-09-08").iso);
    expect(n.comercialV4.validadeDias).toBe(22);
    expect(n.orcamento.validoAte).toBe(validade.iso);
    expect(n.orcamento.enviadoEm).toBe("2026-10-04T17:05:00.000Z"); // evento real preservado
    const invalida = planejarCorrecaoDatasV3(
      os,
      input({ alteracoes: { validoAte: { iso: fimDoDiaLojaIsoV3("2026-09-01"), meta: { precisao: "dia", dia: "2026-09-01" } } }, esperados: { validoAte: fimDoDiaLojaIsoV3("2026-09-17") } }),
      CTX,
    );
    expect(!invalida.ok && invalida.campo).toBe("validoAte");
  });
});

describe("R8: cobertura por DIA civil quando a entrega vale só pelo dia (retorno protegido no último dia inteiro)", () => {
  const TZ_ORIGINAL = process.env.TZ;
  afterEach(() => {
    if (TZ_ORIGINAL === undefined) delete process.env.TZ;
    else process.env.TZ = TZ_ORIGINAL;
  });

  function osEntregueSoDia(entradaDia: string, entregaDia: string, retornoEm: string) {
    const entrada = data(entradaDia);
    const entrega = data(entregaDia);
    const base = osEntregue({
      aberturaV3: {
        versao: 1,
        recepcao: { dataEntrada: entrada.iso, dataEntradaMeta: entrada.meta, origem: "balcao" },
        garantiaPrevista: { modelo: "tela", label: "Troca de Tela", prazoDias: 90 },
      },
      entregueEm: entrega.iso,
      retirada: { confirmado: true, retiradoPor: "Cliente", retiradoEm: entrega.iso },
      entregaV3: { entregueEm: entrega.iso, entregueEmMeta: entrega.meta, registradoEm: "2026-10-04T17:30:00.000Z", entreguePor: "Operador" },
      retornosV3: [{ id: "r1", osOriginalId: "os-1", motivo: "Tela piscando", criadoEm: retornoEm, status: "aberto", garantiaAtivaNaAbertura: true }],
    });
    return { base, entrega };
  }
  const corrigir = (base: Record<string, unknown>, entrega: DataOperacionalV3, novoDia: string) =>
    planejarCorrecaoDatasV3(
      base,
      input({ alteracoes: { dataEntrega: data(novoDia) }, esperados: { dataEntrega: esperadoCampoDataV3(entrega.iso, "dia") }, confirmarImpactoGarantia: true }),
      CTX,
    );

  it("retorno às 16:00 do último dia (âncora técnica 12:00) estava coberto: antecipar a entrega é impedimento", () => {
    const { base, entrega } = osEntregueSoDia("2025-12-20", "2026-01-01", "2026-04-01T19:00:00.000Z"); // 01/04 16:00 na loja
    const r = corrigir(base, entrega, "2025-12-31");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.tipo).toBe("impedimento");
    expect(r.mensagem).toContain("retorno aberto em 01/04/2026");
  });

  it("mesma regra com outro fuso no processo (process.env.TZ): o dia civil é sempre o da loja", () => {
    for (const tz of ["Asia/Tokyo", "UTC", "America/Los_Angeles"]) {
      process.env.TZ = tz;
      const { base, entrega } = osEntregueSoDia("2025-12-20", "2026-01-01", "2026-04-01T19:00:00.000Z");
      const r = corrigir(base, entrega, "2025-12-31");
      expect(!r.ok && r.tipo).toBe("impedimento");
    }
  });

  it("horário de verão histórico: retorno na 2ª ocorrência de 17/02/2018 23:30 ainda é o último dia coberto", () => {
    const { base, entrega } = osEntregueSoDia("2017-11-01", "2017-11-19", "2018-02-18T02:30:00.000Z");
    const r = corrigir(base, entrega, "2017-11-18");
    expect(!r.ok && r.tipo).toBe("impedimento");
  });

  it("adiar a entrega mantém o retorno coberto: a correção segue", () => {
    const { base, entrega } = osEntregueSoDia("2025-12-20", "2026-01-01", "2026-04-01T19:00:00.000Z");
    expect(corrigir(base, entrega, "2026-01-02").ok).toBe(true);
  });
});
