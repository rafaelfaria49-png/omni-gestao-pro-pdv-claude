/**
 * OPS-V4-FLUXO-CURTO-005 — matriz pura da próxima ação (N01–N20) e da trava da
 * escrita primária. Sem I/O: a derivação só lê o que recebe.
 */
import { describe, expect, it } from "vitest";
import {
  chaveProximaAcaoV4,
  derivarProximaAcaoV4,
  travaAtivaProximaAcaoV4,
  type EntradaProximaAcaoV4,
  type ProximaAcaoV4,
} from "./proxima-acao-v4";
import type { FinancialProjectionOSV4, FinancialStatusV4 } from "./financial-projection";

const OS_ID = "os-005";

function projecao(
  financialStatus: FinancialStatusV4,
  over: Partial<FinancialProjectionOSV4> = {},
): FinancialProjectionOSV4 {
  const canDeliver = financialStatus === "PAID" || financialStatus === "AUTHORIZED_CREDIT" || financialStatus === "AUTHORIZED_NO_CHARGE";
  return {
    version: 1,
    storeId: "loja-005",
    osId: OS_ID,
    osCode: "OS-005",
    operationalStatus: "pronta",
    expectedTotal: 400,
    expectedTotalSource: ["teste"],
    approvedBudgetTotal: 400,
    osColumnTotal: 400,
    legacyTotal: null,
    billingSnapshotTotal: null,
    receivableFound: true,
    receivableId: "cr-005",
    receivableTotal: 400,
    receivableStatus: "pendente",
    receivedTotal: financialStatus === "PARTIAL" ? 350 : financialStatus === "PAID" ? 400 : 0,
    reversedTotal: 0,
    balance: financialStatus === "PARTIAL" ? 50 : financialStatus === "OPEN" ? 400 : 0,
    financialStatus,
    consistencyStatus: financialStatus === "INCONSISTENT" ? "INCONSISTENT" : "CONSISTENT",
    consistencyIssues: financialStatus === "INCONSISTENT" ? ["Total do título difere do orçamento aprovado."] : [],
    paymentMethods: [],
    collectionMode: null,
    installments: [],
    authorizedCredit: financialStatus === "AUTHORIZED_CREDIT",
    authorizedNoCharge: financialStatus === "AUTHORIZED_NO_CHARGE",
    noChargeCategory: null,
    noChargeReason: null,
    financialEvents: [],
    canReceive: financialStatus === "OPEN" || financialStatus === "PARTIAL",
    canDeliver,
    deliveryDecision: canDeliver ? "ALLOW_PAID" : "BLOCK_PENDING_BALANCE",
    loadedAt: "2026-10-07T12:00:00.000Z",
    errorCode: null,
    ...over,
  };
}

function entrada(os: Record<string, unknown> | null, over: Partial<EntradaProximaAcaoV4> = {}): EntradaProximaAcaoV4 {
  return {
    os: os ? { id: OS_ID, ...os } : null,
    carga: "estabelecida",
    cargaErro: null,
    orcamento: { materializado: false, status: null },
    financeiro: { projection: null, loading: false, error: null },
    ...over,
  };
}

const pronta = (financeiro: EntradaProximaAcaoV4["financeiro"], extra: Record<string, unknown> = {}) =>
  derivarProximaAcaoV4(entrada({ operacaoStatusV3: "pronta", status: "pronta", ...extra }, { financeiro }));

/** Nunca oferecer entrega quando a ação não é a de entrega. */
function semEntrega(acao: ProximaAcaoV4) {
  expect(acao.id).not.toBe("confirmar-entrega");
  expect(acao.stage).not.toBe("entrega");
  expect(`${acao.titulo} ${acao.cta?.label ?? ""}`).not.toMatch(/entregar|confirmar entrega/i);
}

describe("OPS-V4-FLUXO-CURTO-005 — derivarProximaAcaoV4 (N01–N20)", () => {
  it("N01 aberta → Iniciar diagnóstico (write, escrita existente, altera o status)", () => {
    const a = derivarProximaAcaoV4(entrada({ operacaoStatusV3: "aberta", status: "aberta" }));
    expect(a).toMatchObject({
      estado: "acao",
      titulo: "Iniciar diagnóstico",
      efeito: "write",
      escrita: "iniciar_diagnostico",
      stage: "diagnostico",
      controleNaEtapa: false,
      cta: { label: "Iniciar diagnóstico", disabled: false },
      tone: "primary",
    });
    expect(a.descricao).toMatch(/status da OS/i);
  });

  it("N01b aberta sem carga estabelecida → mesma ação, CTA desabilitado com motivo", () => {
    const a = derivarProximaAcaoV4(entrada({ operacaoStatusV3: "aberta" }, { carga: "carregando" }));
    expect(a.cta).toEqual({ label: "Iniciar diagnóstico", disabled: true });
    expect(a.motivo).toMatch(/carregar/i);
  });

  it("N01c (R P1) Entrada com rascunho não salvo → escrita desabilitada com motivo; navegação intacta", () => {
    for (const st of ["aberta", "aprovado"] as const) {
      const a = derivarProximaAcaoV4(entrada({ operacaoStatusV3: st }, { entradaComRascunho: true }));
      expect(a.efeito, st).toBe("write");
      expect(a.cta?.disabled, st).toBe(true);
      expect(a.motivo, st).toMatch(/Salve ou descarte as alterações da Entrada/);
    }
    const nav = derivarProximaAcaoV4(entrada({ operacaoStatusV3: "em_execucao" }, { entradaComRascunho: true }));
    expect(nav).toMatchObject({ efeito: "navigate", cta: { label: "Abrir execução", disabled: false } });
  });

  it("N02 diagnóstico sem orçamento materializado → Preparar orçamento (navigate, sem gerar nada)", () => {
    const a = derivarProximaAcaoV4(entrada({ operacaoStatusV3: "diagnostico" }));
    expect(a).toMatchObject({ estado: "navegacao", titulo: "Preparar orçamento", efeito: "navigate", stage: "orcamento" });
    expect(a.escrita).toBeUndefined();
    expect(a.cta).toEqual({ label: "Abrir orçamento", disabled: false });
  });

  it("N02b diagnóstico com orçamento materializado → Revisar orçamento", () => {
    const a = derivarProximaAcaoV4(entrada({ operacaoStatusV3: "diagnostico" }, { orcamento: { materializado: true, status: "rascunho" } }));
    expect(a).toMatchObject({ titulo: "Revisar orçamento", efeito: "navigate", stage: "orcamento" });
  });

  it("N03 aguardando aprovação → Aguardando decisão do cliente; só abre o orçamento, nunca aprova", () => {
    const a = derivarProximaAcaoV4(entrada({ operacaoStatusV3: "aguardando_aprovacao" }, { orcamento: { materializado: true, status: "enviado" } }));
    expect(a).toMatchObject({ estado: "aguardando", titulo: "Aguardando decisão do cliente", efeito: "navigate", stage: "orcamento" });
    expect(a.escrita).toBeUndefined();
    expect(a.cta?.label).toBe("Abrir orçamento");
    expect(`${a.titulo} ${a.cta?.label}`).not.toMatch(/aprovar|registrar aprova/i);
  });

  it("N04 aprovado → Iniciar execução (write existente; controle também vive na Execução)", () => {
    const a = derivarProximaAcaoV4(entrada({ operacaoStatusV3: "aprovado" }));
    expect(a).toMatchObject({
      estado: "acao",
      titulo: "Iniciar execução",
      efeito: "write",
      escrita: "iniciar_execucao",
      stage: "execucao",
      controleNaEtapa: true,
      cta: { label: "Iniciar execução", disabled: false },
    });
  });

  it("N05 aguardando peça → espera honesta; abre a Execução, sem inventar chegada da peça", () => {
    const a = derivarProximaAcaoV4(entrada({ operacaoStatusV3: "aguardando_peca" }));
    expect(a).toMatchObject({ estado: "aguardando", titulo: "Aguardando peça", efeito: "navigate", stage: "execucao", tone: "warning" });
    expect(a.descricao).toMatch(/peça estiver disponível/);
    expect(a.escrita).toBeUndefined();
    expect(a.cta?.label).toBe("Abrir execução");
  });

  it("N06 em execução → Marcar como pronta, mas o CTA só navega à Execução", () => {
    const a = derivarProximaAcaoV4(entrada({ operacaoStatusV3: "em_execucao" }));
    expect(a).toMatchObject({ estado: "navegacao", titulo: "Marcar como pronta", efeito: "navigate", stage: "execucao", controleNaEtapa: true });
    expect(a.escrita).toBeUndefined();
    expect(a.cta?.label).toBe("Abrir execução");
  });

  it("N07 pronta + OPEN → Receber pagamento no Financeiro (com saldo)", () => {
    const a = pronta({ projection: projecao("OPEN"), loading: false, error: null });
    expect(a).toMatchObject({ estado: "navegacao", titulo: "Receber pagamento", efeito: "navigate", stage: "financeiro" });
    expect(a.descricao).toMatch(/R\$\s?400,00/);
    semEntrega(a);
  });

  it("N08 pronta + PARTIAL → Receber pagamento (saldo restante 350+50)", () => {
    const a = pronta({ projection: projecao("PARTIAL"), loading: false, error: null });
    expect(a).toMatchObject({ titulo: "Receber pagamento", stage: "financeiro" });
    expect(a.descricao).toMatch(/parcial/i);
    expect(a.descricao).toMatch(/R\$\s?50,00/);
    semEntrega(a);
  });

  it("N09 pronta + PAID (canDeliver) → Confirmar entrega, só navegando à Entrega", () => {
    const a = pronta({ projection: projecao("PAID"), loading: false, error: null });
    expect(a).toMatchObject({ estado: "navegacao", titulo: "Confirmar entrega", efeito: "navigate", stage: "entrega", tone: "success" });
    expect(a.escrita).toBeUndefined();
    expect(a.cta?.label).toBe("Abrir entrega");
  });

  it("N10 pronta + crédito autorizado (canDeliver) → Confirmar entrega", () => {
    const a = pronta({ projection: projecao("AUTHORIZED_CREDIT", { deliveryDecision: "ALLOW_AUTHORIZED_CREDIT" }), loading: false, error: null });
    expect(a).toMatchObject({ titulo: "Confirmar entrega", stage: "entrega" });
    expect(a.descricao).toMatch(/a prazo/i);
  });

  it("N11 pronta + UNKNOWN → Revisar financeiro (bloqueada), nunca entrega", () => {
    const a = pronta({ projection: projecao("UNKNOWN", { canDeliver: false }), loading: false, error: null });
    expect(a).toMatchObject({ estado: "bloqueada", titulo: "Revisar financeiro", stage: "financeiro" });
    semEntrega(a);
  });

  it("N12 pronta + INCONSISTENT → Revisar financeiro com o motivo da projeção", () => {
    const a = pronta({ projection: projecao("INCONSISTENT"), loading: false, error: null });
    expect(a).toMatchObject({ estado: "bloqueada", titulo: "Revisar financeiro" });
    expect(a.motivo).toMatch(/difere/);
    semEntrega(a);
  });

  it("N12b demais estados não-entregáveis (NO_PRICE, PRICE_DEFINED, CHARGE_NOT_CREATED, CANCELLED, REVERSED) → revisar", () => {
    for (const st of ["NO_PRICE", "PRICE_DEFINED", "CHARGE_NOT_CREATED", "CANCELLED", "REVERSED"] as const) {
      const a = pronta({ projection: projecao(st, { canDeliver: false }), loading: false, error: null });
      expect(a.titulo, st).toBe("Revisar financeiro");
      semEntrega(a);
    }
  });

  it("N13 financeiro carregando → 'Carregando situação financeira…', sem ação perigosa", () => {
    const a = pronta({ projection: null, loading: true, error: null });
    expect(a).toMatchObject({ estado: "indisponivel", titulo: "Carregando situação financeira…", efeito: "wait" });
    expect(a.cta).toEqual({ label: "Carregando…", disabled: true });
    semEntrega(a);
    // Mesmo com projeção quitada "antiga" ainda presente, loading não oferece entrega.
    semEntrega(pronta({ projection: projecao("PAID"), loading: true, error: null }));
  });

  it("N14 recebida (V3) com canDeliver → Entrega; diz que falta a confirmação formal (nunca vira entregue)", () => {
    const a = derivarProximaAcaoV4(
      entrada({ operacaoStatusV3: "recebida", status: "pronta" }, { financeiro: { projection: projecao("PAID"), loading: false, error: null } }),
    );
    expect(a).toMatchObject({ titulo: "Confirmar entrega", stage: "entrega", efeito: "navigate" });
    expect(a.descricao).toMatch(/falta a confirmação formal de entrega/);
    // recebida com saldo segue o mesmo gate financeiro.
    const comSaldo = derivarProximaAcaoV4(
      entrada({ operacaoStatusV3: "recebida" }, { financeiro: { projection: projecao("OPEN"), loading: false, error: null } }),
    );
    expect(comSaldo.titulo).toBe("Receber pagamento");
  });

  it("N15 entregue → fluxo concluído; pós-venda só como navegação secundária", () => {
    const a = derivarProximaAcaoV4(entrada({ operacaoStatusV3: "entregue" }));
    expect(a).toMatchObject({ estado: "concluida", titulo: "Fluxo operacional concluído", efeito: "none", cta: null });
    expect(a.secundaria).toEqual({ id: "abrir-posvenda", label: "Abrir pós-venda", stage: "posvenda" });
  });

  it("N16 cancelada → sem ação primária mutante; só 'Ver histórico'", () => {
    const a = derivarProximaAcaoV4(entrada({ operacaoStatusV3: "cancelada", operacaoStatus: "aberta" }));
    expect(a).toMatchObject({ estado: "concluida", titulo: "OS cancelada", efeito: "none", cta: null });
    expect(a.escrita).toBeUndefined();
    expect(a.secundaria?.stage).toBe("historico");
  });

  it("N16b status não reconhecido → fail-closed, sem ação operacional", () => {
    const a = derivarProximaAcaoV4(entrada({ operacaoStatusV3: "status_inventado", status: "aberta" }));
    expect(a).toMatchObject({ estado: "indisponivel", efeito: "none", cta: null });
    expect(a.escrita).toBeUndefined();
  });

  it("N17 ausência de OS → nenhuma ação (nunca usa snapshot local)", () => {
    for (const carga of ["estabelecida", "carregando"] as const) {
      const a = derivarProximaAcaoV4(entrada(null, { carga }));
      expect(a).toMatchObject({ estado: "indisponivel", efeito: "none", cta: null, secundaria: null });
    }
  });

  it("N18 leitura com erro → estado seguro (detalhe: sem ação; financeiro: revisar, com retry)", () => {
    const det = derivarProximaAcaoV4(entrada({ operacaoStatusV3: "aprovado" }, { carga: "erro", cargaErro: "Falha ao carregar a OS." }));
    expect(det).toMatchObject({ estado: "bloqueada", efeito: "none", cta: null, motivo: "Falha ao carregar a OS." });
    expect(det.secundaria).toMatchObject({ recarregar: "detalhe" });
    // Erro sem nem a linha da lista: mesmo estado seguro (nunca "Carregando…" eterno).
    const semLinha = derivarProximaAcaoV4(entrada(null, { carga: "erro", cargaErro: "OS não encontrada." }));
    expect(semLinha).toMatchObject({ estado: "bloqueada", cta: null, motivo: "OS não encontrada." });

    const fin = pronta({ projection: null, loading: false, error: "Sem permissão para consultar o financeiro desta OS." });
    expect(fin).toMatchObject({ estado: "bloqueada", titulo: "Revisar financeiro", stage: "financeiro" });
    expect(fin.secundaria).toMatchObject({ recarregar: "financeiro" });
    semEntrega(fin);
  });

  it("N19 mesma OS após reload → ação estável (pura, determinística, não muta a entrada)", () => {
    const input = entrada({ operacaoStatusV3: "pronta" }, { financeiro: { projection: projecao("OPEN"), loading: false, error: null } });
    const copia = JSON.parse(JSON.stringify(input));
    const a = derivarProximaAcaoV4(input);
    const b = derivarProximaAcaoV4(JSON.parse(JSON.stringify(input)));
    expect(b).toEqual(a);
    expect(input).toEqual(copia);
  });

  it("N20 troca de OS durante load → sem ação stale (projeção de outra OS nunca decide)", () => {
    // A (quitada) estava carregada; B (pronta) acabou de ser selecionada: a projeção de A não decide B.
    const projecaoDeA = projecao("PAID", { osId: "os-A" });
    const b = derivarProximaAcaoV4({
      os: { id: "os-B", operacaoStatusV3: "pronta" },
      carga: "carregando",
      orcamento: { materializado: true },
      financeiro: { projection: projecaoDeA, loading: false, error: null },
    });
    expect(b.titulo).toBe("Carregando situação financeira…");
    semEntrega(b);
    // B aprovado com detalhe ainda carregando: mostra a ação de B, mas não grava ainda.
    const b2 = derivarProximaAcaoV4({
      os: { id: "os-B", operacaoStatusV3: "aprovado" },
      carga: "carregando",
      orcamento: { materializado: true },
      financeiro: { projection: projecaoDeA, loading: true, error: null },
    });
    expect(b2).toMatchObject({ titulo: "Iniciar execução", cta: { disabled: true } });
  });

  it("C12 (puro) pendências da Entrada não entram na derivação: status avançado mantém a ação", () => {
    const a = derivarProximaAcaoV4(
      entrada({
        operacaoStatusV3: "aprovado",
        // Entrada praticamente vazia: sem prova, sem acessórios, sem checklist.
        provaEntradaV3: undefined,
        checklist: [],
        aberturaV3: { recepcao: {} },
      }),
    );
    expect(a.titulo).toBe("Iniciar execução");
  });
});

describe("OPS-V4-FLUXO-CURTO-005 — trava da escrita primária", () => {
  const detalheA = { id: "os-A" };
  const atual = (over: Partial<Parameters<typeof travaAtivaProximaAcaoV4>[1]> = {}) => ({
    chave: chaveProximaAcaoV4("loja-1", "os-A"),
    detalhe: detalheA as unknown,
    detalheCarregando: false,
    detalheErro: false,
    ...over,
  });

  it("chave exige loja e OS", () => {
    expect(chaveProximaAcaoV4("loja-1", "os-A")).toBe("loja-1::os-A");
    expect(chaveProximaAcaoV4("", "os-A")).toBe("");
    expect(chaveProximaAcaoV4("loja-1", null)).toBe("");
  });

  it("escrita em voo trava a mesma loja+OS (duplo clique)", () => {
    const trava = { chave: "loja-1::os-A", detalheRef: detalheA, concluida: false };
    expect(travaAtivaProximaAcaoV4(trava, atual())).toBe(true);
  });

  it("escrita concluída segue travada até o detalhe da mesma OS ser relido", () => {
    const trava = { chave: "loja-1::os-A", detalheRef: detalheA, concluida: true };
    expect(travaAtivaProximaAcaoV4(trava, atual())).toBe(true);
    expect(travaAtivaProximaAcaoV4(trava, atual({ detalheCarregando: true }))).toBe(true);
    expect(travaAtivaProximaAcaoV4(trava, atual({ detalhe: { id: "os-A", relido: true } }))).toBe(false);
    expect(travaAtivaProximaAcaoV4(trava, atual({ detalheErro: true }))).toBe(false);
  });

  it("outra OS ou outra loja nunca é afetada", () => {
    const trava = { chave: "loja-1::os-A", detalheRef: detalheA, concluida: false };
    expect(travaAtivaProximaAcaoV4(trava, atual({ chave: chaveProximaAcaoV4("loja-1", "os-B") }))).toBe(false);
    expect(travaAtivaProximaAcaoV4(trava, atual({ chave: chaveProximaAcaoV4("loja-2", "os-A") }))).toBe(false);
    expect(travaAtivaProximaAcaoV4(null, atual())).toBe(false);
  });
});
