import { describe, expect, it } from "vitest";
import {
  montarComercialHeaderV4,
  montarFinanceiroHeaderV4,
  montarHistoricoHeaderV4,
} from "./os-header-transversal";

describe("header comercial transversal", () => {
  it("sem orçamento real → Cobrança não definida", () => {
    expect(montarComercialHeaderV4({ estado: "ausente" }).label).toBe("Cobrança não definida");
    expect(montarComercialHeaderV4({ estado: "previa", status: "rascunho", total: 400 }).hasBudget).toBe(false);
  });

  it("rascunho, enviado, aprovado e recusado usam o contrato pedido", () => {
    expect(montarComercialHeaderV4({ estado: "persistido", status: "rascunho" }).label).toBe("Orçamento · Rascunho");
    expect(montarComercialHeaderV4({ estado: "persistido", status: "enviado", total: 400 }).label).toBe(
      "Orçamento · Enviado · R$ 400,00",
    );
    expect(montarComercialHeaderV4({ estado: "persistido", status: "aprovado", total: 400 }).label).toBe(
      "R$ 400,00 · Aprovado",
    );
    expect(montarComercialHeaderV4({ estado: "persistido", status: "recusado", total: 400 }).label).toBe(
      "Orçamento recusado",
    );
  });

  it("sempre abre o orçamento real, nunca um segundo editor", () => {
    expect(montarComercialHeaderV4({ estado: "ausente" }).destino).toBe("orcamento");
    expect(montarComercialHeaderV4({ estado: "persistido", status: "aprovado" }).destino).toBe("orcamento");
  });
});

describe("header financeiro transversal", () => {
  it("sem valor definido oferece Definir cobrança e vai ao orçamento", () => {
    const chip = montarFinanceiroHeaderV4({ financialStatus: "NO_PRICE" });
    expect(chip.label).toBe("Sem cobrança");
    expect(chip.cta).toBe("Definir cobrança");
    expect(chip.destino).toBe("orcamento");
  });

  it("prévia comercial não se disfarça de cobrança real", () => {
    const chip = montarFinanceiroHeaderV4({ financialStatus: "PRICE_DEFINED", expectedTotal: 400 });
    expect(chip.label).toBe("Prévia sem cobrança");
    expect(chip.destino).toBe("orcamento");
  });

  it("orçamento aprovado sem recebimento → A receber", () => {
    const chip = montarFinanceiroHeaderV4({ financialStatus: "OPEN", expectedTotal: 400, balance: 400 });
    expect(chip.label).toBe("R$ 400,00 a receber");
    expect(chip.cta).toBe("Financeiro");
    expect(chip.destino).toBe("financeiro");
  });

  it("recebimento parcial mostra o saldo pendente", () => {
    const chip = montarFinanceiroHeaderV4({
      financialStatus: "PARTIAL",
      expectedTotal: 400,
      receivedTotal: 100,
      balance: 300,
    });
    expect(chip.label).toBe("Parcial  R$ 300,00 pendente");
  });

  it("quitado não pede CTA de cobrança", () => {
    const chip = montarFinanceiroHeaderV4({ financialStatus: "PAID", expectedTotal: 400 });
    expect(chip.label).toBe("Quitado");
    expect(chip.cta).toBeNull();
    expect(chip.destino).toBe("financeiro");
  });

  it("leitura indisponível não se disfarça de ausência de cobrança", () => {
    const erro = montarFinanceiroHeaderV4({ error: "timeout" });
    expect(erro.label).toBe("Financeiro indisponível");
    expect(erro.destino).toBe("financeiro");
    const unknown = montarFinanceiroHeaderV4({ financialStatus: "UNKNOWN" });
    expect(unknown.label).toBe("Financeiro indisponível");
    expect(unknown.label).not.toBe("Cobrança não definida");
  });
});

describe("header histórico transversal", () => {
  it("mostra a contagem só quando há eventos", () => {
    expect(montarHistoricoHeaderV4(0).countLabel).toBeNull();
    expect(montarHistoricoHeaderV4(1).countLabel).toBe("1 evento");
    expect(montarHistoricoHeaderV4(12).countLabel).toBe("12 eventos");
  });
});

describe("OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — chips com pagamento e pendência comercial separados", () => {
  it("Comercial sinaliza a pendência que bloqueia a entrega (warn/danger) e leva ao orçamento", () => {
    expect(montarComercialHeaderV4({ estado: "persistido", status: "rascunho", total: 420, pendencia: { rotulo: "Aprovação pendente", tone: "warn" } }))
      .toMatchObject({ label: "Aprovação pendente", tone: "warn", destino: "orcamento", hasBudget: true });
    expect(montarComercialHeaderV4({ estado: "persistido", status: "recusado", pendencia: { rotulo: "Orçamento recusado", tone: "danger" } }).tone).toBe("danger");
    expect(montarComercialHeaderV4({ estado: "persistido", status: "rascunho" })).toMatchObject({ label: "Orçamento · Rascunho", tone: "neutro" });
  });

  it("UNKNOWN com pagamento verificado mostra o fato (nunca 'Quitado'); sem fato segue 'Financeiro indisponível'", () => {
    const verificado = montarFinanceiroHeaderV4({ financialStatus: "UNKNOWN", pagamentoVerificado: { label: "Pagamento registrado R$ 420,00", liquidado: true } });
    expect(verificado).toMatchObject({ label: "Pagamento registrado R$ 420,00", tone: "success", cta: null, destino: "financeiro" });
    expect(verificado.label).not.toMatch(/Quitado/);
    expect(montarFinanceiroHeaderV4({ financialStatus: "UNKNOWN", pagamentoEmConferencia: true })).toMatchObject({ label: "Pagamento em conferência", tone: "warn" });
    expect(montarFinanceiroHeaderV4({ financialStatus: "UNKNOWN" })).toMatchObject({ label: "Financeiro indisponível", tone: "danger" });
    expect(montarFinanceiroHeaderV4({ error: "falha" })).toMatchObject({ label: "Financeiro indisponível", tone: "danger" });
  });
});

describe("OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — R1: conferência em qualquer status", () => {
  it("PAID legado com fatos rejeitados não aparece como Quitado verde", () => {
    const h = montarFinanceiroHeaderV4({ financialStatus: "PAID", expectedTotal: 300, receivedTotal: 300, balance: 0, pagamentoEmConferencia: true });
    expect(h).toMatchObject({ label: "Pagamento em conferência", tone: "warn" });
    expect(montarFinanceiroHeaderV4({ financialStatus: "PARTIAL", pagamentoEmConferencia: true }).label).toBe("Pagamento em conferência");
    expect(montarFinanceiroHeaderV4({ financialStatus: "INCONSISTENT", pagamentoEmConferencia: true })).toMatchObject({ label: "Financeiro inconsistente", tone: "danger" });
  });

  it("UNKNOWN sem Conta a Receber e sem falha de leitura não é 'indisponível'", () => {
    expect(montarFinanceiroHeaderV4({ financialStatus: "UNKNOWN", semContaAReceber: true })).toMatchObject({ label: "Sem Conta a Receber", tone: "neutro" });
  });
});
