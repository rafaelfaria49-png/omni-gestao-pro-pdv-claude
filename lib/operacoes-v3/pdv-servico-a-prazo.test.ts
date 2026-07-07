/**
 * GOAL OPS-V4-RECEBIMENTO-A-PRAZO-MINIMO-006 — guarda estática de `lancarOSAPrazoV3`.
 *
 * `lancarOSAPrazoV3` não pode ser testada com Prisma real neste projeto (sem infra
 * de banco em teste), então verificamos o CONTRATO por leitura do código-fonte:
 * a função nunca deve chamar liquidação/movimentação/caixa, nunca deve exigir
 * sessão de caixa aberta, e `receberOSV3` (recebimento imediato) precisa continuar
 * com todos os seus passos originais, inalterada.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { statusTituloAPrazoV3 } from "./payment-model";

const DIR = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(DIR, "pdv-servico-actions.ts"), "utf8");

/** Extrai o corpo de uma função exportada pelo nome, da assinatura até o `\n}` que fecha no início da linha. */
function extractFunctionBody(src: string, fnName: string): string {
  const start = src.indexOf(`export async function ${fnName}(`);
  expect(start, `função ${fnName} não encontrada`).toBeGreaterThan(-1);
  const end = src.indexOf("\n}", start);
  expect(end, `fechamento de ${fnName} não encontrado`).toBeGreaterThan(-1);
  return src.slice(start, end);
}

describe("lancarOSAPrazoV3 — NÃO é recebimento (guarda estática)", () => {
  const body = extractFunctionBody(source, "lancarOSAPrazoV3");

  it("nunca chama liquidarContaReceber/registrarPagamentoParcial (nunca 'paga' o título)", () => {
    expect(body).not.toContain("liquidarContaReceber(");
    expect(body).not.toContain("registrarPagamentoParcial(");
  });

  it("nunca lança movimentação de entrada nem operação de caixa", () => {
    expect(body).not.toContain("createMovimentacaoEntradaFromReceber(");
    expect(body).not.toContain("caixaOperacao.create(");
    expect(body).not.toContain('tipo: "recebimento_cr"');
  });

  it("nunca exige sessão de caixa aberta (sem checagem de sessaoCaixa)", () => {
    expect(body).not.toContain("sessaoCaixa.findFirst");
    expect(body).not.toContain("Caixa fechado");
  });

  it("garante/mantém o MESMO título único da OS (resolverTituloOS/localKey)", () => {
    expect(body).toContain("resolverTituloOS(sid, id, loaded, { create: true })");
  });

  it("marca a autorização no histórico com um tipo que NUNCA soma como recebido (não é 'pagamento'/'liquidacao')", () => {
    expect(body).toMatch(/tipo:\s*"a_prazo_autorizado"/);
    expect(body).not.toMatch(/tipo:\s*"pagamento"/);
    expect(body).not.toMatch(/tipo:\s*"liquidacao"/);
  });

  it("espelha em payload.aPrazoV3 — nunca em payload.pagamentoV3 (dinheiro recebido)", () => {
    expect(body).toContain("aPrazoV3: aPrazo");
    expect(body).not.toContain("pagamentoV3: mirror");
  });

  // GOAL OPS-V4-RECEBIMENTO-A-PRAZO-MINIMO-006-FIX-PARCIAL-STATUS: ressalva da
  // auditoria de aceite — o status gravado no título NUNCA pode regredir de
  // "parcial" para "pendente" quando já havia recebimento anterior.
  it("usa statusTituloAPrazoV3(titulo.recebido) — nunca força status: \"pendente\" incondicionalmente", () => {
    expect(body).toContain("statusTituloAPrazoV3(titulo.recebido)");
    expect(body).not.toMatch(/status:\s*"pendente"/);
  });

  it("nunca chama liquidação/estorno mesmo indiretamente ao recalcular status (sem 'pago'/'estornado' hardcoded)", () => {
    expect(body).not.toMatch(/status:\s*"pago"/);
    expect(body).not.toMatch(/status:\s*"estornado"/);
  });
});

// GOAL OPS-V4-RECEBIMENTO-A-PRAZO-MINIMO-006-FIX-PARCIAL-STATUS
describe("statusTituloAPrazoV3 — preserva 'parcial' quando já houve recebimento anterior", () => {
  it("cenário da ressalva: OS total R$ 470, recebido R$ 100 (sinal) → status permanece 'parcial', nunca 'pendente'", () => {
    // Reproduz exatamente o caso da auditoria de aceite: `resolverTituloOS` já
    // teria calculado `titulo.recebido = 100` (via `sumPagamentosFromHistoricoPayload`
    // do historico real, que preserva a entrada "pagamento" anterior) e
    // `titulo.saldo = 370` — este teste cobre só a decisão de STATUS a gravar,
    // que é o que a ressalva pedia para corrigir.
    const recebidoAnterior = 100;
    const saldoAFormalizar = 470 - recebidoAnterior; // 370 — valor que o operador vê no resumo "a prazo"
    expect(saldoAFormalizar).toBe(370);
    expect(statusTituloAPrazoV3(recebidoAnterior)).toBe("parcial");
  });

  it("sem nenhum recebimento anterior → status 'pendente'", () => {
    expect(statusTituloAPrazoV3(0)).toBe("pendente");
  });

  it("nunca retorna 'pago'/'cancelado'/'estornado' — só pendente ou parcial", () => {
    expect(["pendente", "parcial"]).toContain(statusTituloAPrazoV3(0));
    expect(["pendente", "parcial"]).toContain(statusTituloAPrazoV3(250));
  });
});

describe("receberOSV3 — recebimento imediato continua com todos os passos originais (inalterado)", () => {
  const body = extractFunctionBody(source, "receberOSV3");

  it("continua exigindo sessão de caixa ABERTA", () => {
    expect(body).toContain("sessaoCaixa.findFirst");
    expect(body).toContain('status: "ABERTA"');
  });

  it("continua liquidando/baixando o título via os services financeiros originais", () => {
    expect(body).toContain("liquidarContaReceber(");
    expect(body).toContain("registrarPagamentoParcial(");
  });

  it("continua lançando movimentação e operação de caixa por forma", () => {
    expect(body).toContain("createMovimentacaoEntradaFromReceber(");
    expect(body).toContain("caixaOperacao");
    expect(body).toContain('tipo: "recebimento_cr"');
  });

  it("continua validando formas suportadas (sem habilitar parcelado/crediário/carteira)", () => {
    expect(body).toContain("formaSuportadaV3(");
  });
});
