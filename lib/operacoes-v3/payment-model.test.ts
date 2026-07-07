import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import { buildContaReceberLocalKey } from "@/lib/financeiro/contracts/local-key";
import {
  computeSaldoV3,
  formaSuportadaV3,
  lerAPrazoV3,
  lerPagamentoV3,
  localKeyContaReceberOSV3,
  montarAPrazoMirrorV3,
  montarPagamentoMirrorV3,
  somaSplitV3,
  statusTituloAPrazoV3,
  totalCobravelV3,
  validarRecebimentoV3,
  validarSplitV3,
  type SplitLinhaV3,
} from "./payment-model";

function os(over: Record<string, unknown>): OrdemServico {
  return { id: "os1", codigo: "OS-1", timeline: [], ...over } as unknown as OrdemServico;
}
const orc = (servicos: unknown[], desconto = 0) => ({ id: "o", status: "aprovado", criadoEm: "x", desconto, total: 0, servicos, pecas: [] });

describe("pagamento — saldo / status", () => {
  it("aberto / parcial / quitado / sem cobrança", () => {
    expect(computeSaldoV3(480, 0).status).toBe("aberto");
    expect(computeSaldoV3(480, 200)).toMatchObject({ saldo: 280, status: "parcial" });
    expect(computeSaldoV3(480, 480).status).toBe("quitado");
    expect(computeSaldoV3(0, 0).status).toBe("sem_cobranca");
  });

  it("recebido nunca passa do total; saldo nunca negativo", () => {
    const r = computeSaldoV3(100, 150);
    expect(r.recebido).toBe(100);
    expect(r.saldo).toBe(0);
    expect(r.status).toBe("quitado");
  });
});

describe("pagamento — leitura da OS", () => {
  it("deriva total do orçamento quando não há espelho (recebido 0 = aberto)", () => {
    const o = os({ orcamento: orc([{ id: "s1", descricao: "Serviço", valor: 480, kindV3: "cobrado" }]) });
    expect(totalCobravelV3(o)).toBe(480);
    expect(lerPagamentoV3(o)).toMatchObject({ total: 480, recebido: 0, saldo: 480, status: "aberto" });
  });

  it("usa o espelho payload.pagamentoV3 quando presente", () => {
    const o = os({ pagamentoV3: { total: 480, recebido: 200, ultimaForma: "pix" } });
    const p = lerPagamentoV3(o);
    expect(p).toMatchObject({ total: 480, recebido: 200, saldo: 280, status: "parcial", ultimaForma: "pix" });
  });

  it("sem orçamento e sem espelho → sem cobrança", () => {
    expect(lerPagamentoV3(os({})).status).toBe("sem_cobranca");
  });

  it("FIX PDV Serviço: total cai para a COLUNA Prisma (prismaValorTotal) quando o payload não tem orçamento real", () => {
    // Reproduz OS-2026-00004: valor mora na coluna `valorTotal` do Prisma, não no JSONB.
    // O servidor (carregarOS) passa a injetar `prismaValorTotal`; o total deve ser 300 (não 0).
    const o = os({ prismaValorTotal: 300 });
    expect(totalCobravelV3(o)).toBe(300);
    expect(lerPagamentoV3(o)).toMatchObject({ total: 300, recebido: 0, saldo: 300, status: "aberto" });
  });

  it("orçamento real tem precedência sobre a coluna Prisma (mesma regra do seletor)", () => {
    const o = os({ orcamento: orc([{ id: "s1", descricao: "Serviço", valor: 480, kindV3: "cobrado" }]), prismaValorTotal: 300 });
    expect(totalCobravelV3(o)).toBe(480);
  });
});

describe("pagamento — validação de recebimento", () => {
  it("bloqueia <= 0, > saldo e saldo zerado; define op liquidar/parcial", () => {
    expect(validarRecebimentoV3(0, 280).ok).toBe(false);
    expect(validarRecebimentoV3(300, 280).ok).toBe(false);
    expect(validarRecebimentoV3(100, 0).ok).toBe(false);
    expect(validarRecebimentoV3(100, 280)).toMatchObject({ ok: true, op: "parcial" });
    expect(validarRecebimentoV3(280, 280)).toMatchObject({ ok: true, op: "liquidar" });
  });
});

describe("pagamento — formas / split", () => {
  it("formas suportadas x a conectar", () => {
    expect(formaSuportadaV3("dinheiro")).toBe(true);
    expect(formaSuportadaV3("pix")).toBe(true);
    expect(formaSuportadaV3("crediario")).toBe(false);
    expect(formaSuportadaV3("carteira")).toBe(false);
  });

  it("split: soma e validação contra saldo + forma não suportada", () => {
    const linhas: SplitLinhaV3[] = [{ forma: "dinheiro", valor: 100 }, { forma: "pix", valor: 80 }];
    expect(somaSplitV3(linhas)).toBe(180);
    expect(validarSplitV3(linhas, 280)).toMatchObject({ ok: true, op: "parcial" });
    expect(validarSplitV3(linhas, 150).ok).toBe(false); // 180 > 150
    expect(validarSplitV3([{ forma: "crediario", valor: 50 }], 280).ok).toBe(false);
    expect(validarSplitV3([], 280).ok).toBe(false);
  });
});

describe("pagamento — chave única + espelho (Correção 2A.1)", () => {
  it("usa a MESMA chave do adapter financeiro V2 (os-faturamento:*), nunca receber:os:*", () => {
    const k = localKeyContaReceberOSV3("loja-2", "os-9");
    expect(k).toBe("os-faturamento:loja-2:os-9");
    // idêntica ao contrato oficial do adapter V2 → o banco garante 1 título por OS
    expect(k).toBe(buildContaReceberLocalKey({ kind: "adapter_os_faturamento", storeId: "loja-2", ordemServicoId: "os-9" }));
    expect(k).not.toContain("receber:os:");
  });

  it("monta o espelho com status correto", () => {
    const m = montarPagamentoMirrorV3({ total: 480, recebido: 480, ultimaForma: "pix", tituloLocalKey: "os-faturamento:x:y", now: "2026-06-05T00:00:00Z" });
    expect(m).toMatchObject({ total: 480, recebido: 480, saldo: 0, status: "quitado", ultimaForma: "pix", tituloLocalKey: "os-faturamento:x:y", atualizadoEm: "2026-06-05T00:00:00Z" });
  });
});

// GOAL OPS-V4-RECEBIMENTO-A-PRAZO-MINIMO-006 — "a prazo" NÃO é recebimento: espelho
// separado (`aPrazoV3`), nunca altera `pagamentoV3` (recebido/saldo continuam intactos).
describe("pagamento — 'a prazo' (espelho separado, sem alterar recebido/saldo)", () => {
  it("monta o espelho a_prazo pendente, autorizando entrega, sem tocar pagamentoV3", () => {
    const m = montarAPrazoMirrorV3({ valor: 320, vencimento: "2026-08-01", tituloLocalKey: "os-faturamento:x:y", autorizadoPor: "Ana", observacao: "  combinado  ", now: "2026-06-05T00:00:00Z" });
    expect(m).toEqual({
      modo: "a_prazo",
      status: "pendente",
      valor: 320,
      vencimento: "2026-08-01",
      tituloLocalKey: "os-faturamento:x:y",
      autorizadoEntrega: true,
      autorizadoEm: "2026-06-05T00:00:00Z",
      autorizadoPor: "Ana",
      observacao: "combinado",
    });
  });

  it("lerAPrazoV3: null quando a OS não tem espelho", () => {
    expect(lerAPrazoV3(os({}))).toBeNull();
  });

  it("lerAPrazoV3: null quando o espelho não é 'pendente' (ex.: cancelado)", () => {
    const o = os({ aPrazoV3: { modo: "a_prazo", status: "cancelado", valor: 320, vencimento: "2026-08-01", autorizadoEntrega: true } });
    expect(lerAPrazoV3(o)).toBeNull();
  });

  it("lerAPrazoV3: lê o espelho pendente autorizado", () => {
    const o = os({ aPrazoV3: { modo: "a_prazo", status: "pendente", valor: 320, vencimento: "2026-08-01", autorizadoEntrega: true, tituloLocalKey: "os-faturamento:x:y" } });
    expect(lerAPrazoV3(o)).toMatchObject({ status: "pendente", valor: 320, vencimento: "2026-08-01", autorizadoEntrega: true });
  });

  it("'a prazo' nunca altera pagamentoV3 — recebido/saldo continuam os do espelho real (dinheiro)", () => {
    const o = os({
      pagamentoV3: { total: 320, recebido: 0 },
      aPrazoV3: { modo: "a_prazo", status: "pendente", valor: 320, vencimento: "2026-08-01", autorizadoEntrega: true },
    });
    // O saldo/recebido REAL (dinheiro) é inteiramente derivado de `pagamentoV3` —
    // a autorização "a prazo" não soma como recebido nem reduz o saldo.
    expect(lerPagamentoV3(o)).toMatchObject({ total: 320, recebido: 0, saldo: 320, status: "aberto" });
  });

  // GOAL OPS-V4-RECEBIMENTO-A-PRAZO-MINIMO-006-FIX-PARCIAL-STATUS: o status do
  // TÍTULO (Conta a Receber) gravado ao lançar a prazo nunca pode regredir de
  // "parcial" para "pendente" quando já havia recebimento anterior.
  it("statusTituloAPrazoV3: preserva 'parcial' com recebimento anterior; 'pendente' só sem recebido nenhum", () => {
    expect(statusTituloAPrazoV3(100)).toBe("parcial");
    expect(statusTituloAPrazoV3(0.01)).toBe("parcial");
    expect(statusTituloAPrazoV3(0)).toBe("pendente");
  });
});
