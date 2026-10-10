// OPS-V4-FLUXO-CURTO-006 — retirada: condição financeira honesta (fail-closed),
// serviço do orçamento real, custo da peça incluída e validação do retirante.
import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import { computeTotaisV3 } from "@/lib/operacoes-v3/orcamento-model";
import { projectFinancialOSV4, type FinancialProjectionOSV4 } from "./financial-projection";
import { derivarRetiradaFinanceiraV4, RETIRANTE_MAX_V4, servicoDaRetiradaV4, validarRetiranteV4 } from "./retirada-fluxo-v4";

const STORE = "loja-qa";
const OS_ID = "os-a";
const orcamento = (total: number, status = "aprovado") => ({
  id: "orc", status, total, desconto: 0, criadoEm: "2026-10-01T12:00:00Z",
  servicos: [{ id: "s1", descricao: "Troca de tela", valor: total }], pecas: [],
});
type Titulo = { status: string; valor?: number; historico?: unknown[] };

function projecao(opts: { total?: number; orcStatus?: string; titulo?: Titulo | null; extra?: Record<string, unknown> } = {}): FinancialProjectionOSV4 {
  const total = opts.total ?? 300;
  return projectFinancialOSV4({
    storeId: STORE,
    osId: OS_ID,
    prismaValorTotal: total,
    loadedAt: "2026-10-08T12:00:00Z",
    payload: { id: OS_ID, codigo: "OS-A", valorTotal: total, orcamento: orcamento(total, opts.orcStatus), ...(opts.extra ?? {}) } as unknown as OrdemServico & Record<string, unknown>,
    titulo: opts.titulo
      ? { id: "cr", storeId: STORE, localKey: `os-faturamento:${STORE}:${OS_ID}`, valor: opts.titulo.valor ?? total, status: opts.titulo.status, payload: { ordemServicoId: OS_ID, historico: opts.titulo.historico ?? [] } }
      : null,
  });
}
const derivar = (projection: FinancialProjectionOSV4 | null, over: Partial<Parameters<typeof derivarRetiradaFinanceiraV4>[0]> = {}) =>
  derivarRetiradaFinanceiraV4({ osId: OS_ID, projection, loading: false, error: null, ...over });

describe("OPS-V4-FLUXO-CURTO-006 — condição financeira da retirada", () => {
  it("parcial 100 de 300: saldo 200, recebível, entrega bloqueada (nunca quitado)", () => {
    const r = derivar(projecao({ titulo: { status: "parcial", historico: [{ tipo: "pagamento", valor: 100 }] } }));
    expect(r).toMatchObject({ situacao: "parcial", total: 300, recebido: 100, saldo: 200, podeReceber: true, liberaEntrega: false, tone: "warning" });
    expect(r.descricao).toMatch(/faltam R\$\s200,00/);
  });

  it("quitado 300: libera entrega e pede confirmação explícita (pagar não entrega)", () => {
    const r = derivar(projecao({ titulo: { status: "pago", historico: [{ tipo: "pagamento", valor: 100 }, { tipo: "pagamento", valor: 200 }] } }));
    expect(r).toMatchObject({ situacao: "quitado", total: 300, recebido: 300, saldo: 0, podeReceber: false, liberaEntrega: true });
    expect(r.descricao).toBe("Pagamento quitado — confirmar entrega.");
    expect(derivar(projecao({ titulo: { status: "pago", historico: [{ tipo: "liquidacao", valor: 300 }] } }), { entregue: true }).descricao).toBe("Pagamento quitado.");
  });

  it("350 + 50 a prazo: entrega autorizada a prazo e explicitamente NÃO quitada", () => {
    const r = derivar(projecao({
      total: 400,
      titulo: { status: "parcial", historico: [{ tipo: "pagamento", valor: 350 }, { tipo: "a_prazo_autorizado", valor: 50 }] },
      extra: { aPrazoV3: { modo: "a_prazo", status: "pendente", valor: 50, vencimento: "2099-12-31", autorizadoEntrega: true, autorizadoEm: "2026-10-08T12:00:00Z", autorizadoPor: "QA", tituloLocalKey: `os-faturamento:${STORE}:${OS_ID}` } },
    }));
    expect(r).toMatchObject({ situacao: "a_prazo", rotulo: "Entrega autorizada a prazo", recebido: 350, saldo: 50, liberaEntrega: true, aPrazo: { valor: 50, vencimento: "2099-12-31" } });
    expect(r.descricao).toMatch(/^Não quitada/);
    expect(r.descricao).toContain("31/12/2099");
    expect(r.rotulo).not.toMatch(/quitad/i);
  });

  it("cobrança não formalizada (total aprovado, sem título): explica a formalização no primeiro recebimento; nada liberado", () => {
    const p = projecao({ titulo: null });
    expect(p.financialStatus).toBe("CHARGE_NOT_CREATED");
    const r = derivar(p);
    expect(r).toMatchObject({ situacao: "nao_formalizada", total: 300, recebido: 0, saldo: 300, podeReceber: true, liberaEntrega: false });
    expect(r.descricao).toMatch(/criada uma única vez no primeiro recebimento/);
  });

  it("fail-closed: carregando, erro, projeção de OUTRA OS, inconsistente e desconhecida nunca liberam nem recebem", () => {
    const pago = projecao({ titulo: { status: "pago", historico: [{ tipo: "liquidacao", valor: 300 }] } });
    expect(derivar(pago, { loading: true })).toMatchObject({ situacao: "carregando", rotulo: "Confirmando situação financeira…", liberaEntrega: false, podeReceber: false });
    expect(derivar(pago, { error: "Falha de rede." })).toMatchObject({ situacao: "indisponivel", liberaEntrega: false });
    expect(derivar(pago, { osId: "os-b" })).toMatchObject({ situacao: "carregando", liberaEntrega: false });
    expect(derivar(null)).toMatchObject({ situacao: "carregando", liberaEntrega: false });
    const inconsistente = projecao({ titulo: { status: "pendente", valor: 250 } });
    expect(inconsistente.financialStatus).toBe("INCONSISTENT");
    expect(derivar(inconsistente)).toMatchObject({ situacao: "inconsistente", tone: "danger", liberaEntrega: false, podeReceber: false });
    const desconhecida = projecao({ orcStatus: "enviado" });
    expect(desconhecida.financialStatus).toBe("UNKNOWN");
    expect(derivar(desconhecida)).toMatchObject({ situacao: "indisponivel", liberaEntrega: false, podeReceber: false });
  });

  it("total zero sem autorização exige classificação; cancelado/estornado bloqueiam", () => {
    expect(derivar(projecao({ total: 0 }))).toMatchObject({ situacao: "sem_cobranca_pendente", liberaEntrega: false });
    expect(derivar(projecao({ titulo: { status: "cancelado" } }))).toMatchObject({ situacao: "cancelada", liberaEntrega: false });
  });
});

describe("OPS-V4-FLUXO-CURTO-006 — serviço e custo da retirada (T50)", () => {
  const pecaInterna = { id: "p1", nome: "Tela QA", quantidade: 1, valorUnitario: 0, custoUnitario: 92, kindV3: "interno", produtoId: "prod-qa" };

  it("peça incluída (interna) com custo 92: total ao cliente 300, custo 92 — sem soma dupla", () => {
    const orc = { servicos: [{ id: "s1", descricao: "Troca de tela", valor: 300 }], pecas: [pecaInterna], desconto: 0 };
    expect(computeTotaisV3(orc as never)).toMatchObject({ total: 300, custo: 92, lucro: 208 });
  });

  it("serviço da retirada vem do orçamento real e omite a peça interna", () => {
    const os = { orcamento: { ...orcamento(300), pecas: [pecaInterna] } } as unknown as OrdemServico;
    expect(servicoDaRetiradaV4(os)).toEqual({ itens: ["Troca de tela"], aprovado: true });
    expect(servicoDaRetiradaV4({ orcamento: { ...orcamento(300, "enviado") } } as unknown as OrdemServico).aprovado).toBe(false);
    expect(servicoDaRetiradaV4({ orcamento: { ...orcamento(300), sintetizado: true } } as unknown as OrdemServico)).toEqual({ itens: [], aprovado: false });
    expect(servicoDaRetiradaV4(null)).toEqual({ itens: [], aprovado: false });
  });
});

describe("OPS-V4-FLUXO-CURTO-006 — retirado por", () => {
  it("obrigatório (contrato F): normaliza espaços, recusa vazio, limite de tamanho", () => {
    expect(validarRetiranteV4("  Ana   Souza ")).toEqual({ ok: true, recebidoPor: "Ana Souza" });
    expect(validarRetiranteV4("   ")).toEqual({ ok: false, mensagem: "Informe quem está retirando o aparelho." });
    expect(validarRetiranteV4(null)).toEqual({ ok: false, mensagem: "Informe quem está retirando o aparelho." });
    expect(validarRetiranteV4("x".repeat(RETIRANTE_MAX_V4 + 1)).ok).toBe(false);
  });

  it("sem a guia da retirada (obrigatorio: false) o vazio segue para a regra do servidor", () => {
    expect(validarRetiranteV4("", { obrigatorio: false })).toEqual({ ok: true, recebidoPor: undefined });
  });
});
