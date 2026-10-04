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

  it("garante/mantém o MESMO título único da OS, lido só DENTRO da transação sob a trava por OS", () => {
    expect(body).toContain("garantirTituloOSTravadoV3(tx,");
    expect(body).toContain("recebimentoLoteAdvisoryLock(tx, chaveLockRecebimentoMistoV3(sid, id))");
    // A formalização grava com o MESMO `tx` (linha travada) — nunca um upsert solto.
    expect(body).toMatch(/upsertContaReceber\(\{[\s\S]*db: tx,[\s\S]*\}\);/);
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

// GOAL OPS-V3-RECEBIMENTO-MISTO-A-PRAZO-001 — a confirmação mista é UMA transação.
describe("registrarRecebimentoMistoOSV3 — imediato + a prazo numa única transação", () => {
  const body = extractFunctionBody(source, "registrarRecebimentoMistoOSV3");
  const service = readFileSync(join(DIR, "recebimento-misto-service.ts"), "utf8");

  it("delega a UMA prisma.$transaction com o serviço transacional", () => {
    expect(body).toContain("prisma.$transaction(");
    expect(body).toContain("executarRecebimentoMistoOSV3(");
  });

  it("nunca encadeia receberOSV3 + lancarOSAPrazoV3 (duas operações independentes)", () => {
    expect(body).not.toContain("receberOSV3(");
    expect(body).not.toContain("lancarOSAPrazoV3(");
  });

  it("exige permissão real de gerar cobrança além de editar a OS", () => {
    expect(body).toMatch(/p\.operacoes\.editarOs && p\.operacoes\.gerarCobranca/);
  });

  it("serviço: nenhuma escrita financeira best-effort (sem .catch engolindo erro)", () => {
    expect(service).not.toContain(".catch(");
    expect(service).toContain("idempotenciaDoChamador: true");
    expect(service).toContain('tipo: "recebimento_cr"');
    expect(service).toContain("tipo: MARCADOR_A_PRAZO");
  });
});

describe("receberOSV3 — recebimento imediato mantém todos os passos, agora numa transação sob a trava da OS", () => {
  const body = extractFunctionBody(source, "receberOSV3");

  it("continua exigindo sessão de caixa ABERTA (relida e travada dentro da transação)", () => {
    expect(body).toContain("travarSessaoCaixa(tx, sid, sessaoId)");
    expect(body).toContain('sessao.status !== "ABERTA"');
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

// OPS-V3-RECEBIMENTO-MISTO-A-PRAZO-001 (R2/P0+P1): todos os writers de pagamento da OS
// rodam numa transação sob a MESMA trava por OS — nenhum lê o título antes dela.
describe("writers de pagamento da OS — uma transação, trava por OS, nada best-effort", () => {
  for (const nome of ["receberOSV3", "estornarRecebimentoOSV3", "lancarOSAPrazoV3", "registrarRecebimentoMistoOSV3"]) {
    const body = extractFunctionBody(source, nome);

    it(`${nome}: delega a UMA prisma.$transaction`, () => {
      expect(body).toContain("prisma.$transaction(");
    });

    it(`${nome}: nenhuma escrita financeira best-effort (sem .catch engolindo erro)`, () => {
      expect(body).not.toContain(".catch(");
    });
  }

  for (const nome of ["receberOSV3", "estornarRecebimentoOSV3", "lancarOSAPrazoV3"]) {
    const body = extractFunctionBody(source, nome);

    it(`${nome}: a trava por OS é a PRIMEIRA instrução da transação`, () => {
      expect(body).toMatch(/prisma\.\$transaction\(async \(tx\)[^{]*\{\s*(\/\/[^\n]*\n\s*)*await recebimentoLoteAdvisoryLock\(tx, chaveLockRecebimentoMistoV3\(sid, id\)\);/);
    });

    it(`${nome}: título e OS só são lidos/gravados com o mesmo tx`, () => {
      expect(body).not.toMatch(/prisma\.(contaReceberTitulo|ordemServico|caixaOperacao)\./);
      expect(body).not.toContain("carregarOS(");
      expect(body).not.toContain("resolverTituloOS(");
    });
  }

  it("receberOSV3: replay pela identidade da operação ANTES da sessão; caixa carimbado com operacaoId", () => {
    const body = extractFunctionBody(source, "receberOSV3");
    const replay = body.indexOf("replayRecebimentoOSV3(tx");
    const sessao = body.indexOf("travarSessaoCaixa(tx");
    expect(replay).toBeGreaterThan(-1);
    expect(replay).toBeLessThan(sessao);
    expect(body).toContain('payload: { path: ["operacaoId"], equals: operacaoId }');
    expect(body).toContain("idempotenciaDoChamador: true");
    expect(body).toMatch(/operacaoId,\s*requestFingerprint,/);
  });

  it("estornarRecebimentoOSV3: o estorno do título participa da transação (db: tx)", () => {
    const body = extractFunctionBody(source, "estornarRecebimentoOSV3");
    expect(body).toMatch(/estornarContaReceber\(\{[\s\S]*db: tx,[\s\S]*\}\);/);
  });
});
