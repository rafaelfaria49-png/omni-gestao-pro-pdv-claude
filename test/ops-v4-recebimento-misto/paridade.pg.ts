import { afterAll, expect, it, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "qa-v4-misto", name: "QA V4", role: "ADMIN", storeAccess: "all" } })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { exigirBancoQA } from "../ops-v3-recebimento-misto/qa-bootstrap.mjs";
import { prisma } from "@/lib/prisma";
import { registrarRecebimentoMistoOSV3, receberOSV3 } from "@/lib/operacoes-v3/pdv-servico-actions";
import { lerProjecaoFinanceiraOSV4 } from "@/lib/operacoes-v4/financial-projection-actions";
import { avaliarRecebimentoV4, buildRecebimentoMistoV4 } from "@/lib/operacoes-v4/receber-pagamento-form";
exigirBancoQA(process.env);
afterAll(async () => { await prisma.$disconnect(); });

it("V4 payload real 350+50 → mesmo título → recebimento posterior 50 → PAID sem parcela", async () => {
  const storeId = `qa-v4-misto-${Date.now()}`;
  await prisma.store.create({ data: { id: storeId, name: "QA Paridade V4" } });
  const row = await prisma.ordemServico.create({ data: {
    storeId, numero: "OS-QA-V4-MISTO", equipamento: "Samsung A54", defeito: "Tela QA", valorTotal: 400,
    payload: { codigo: "OS-QA-V4-MISTO", status: "pronta", operacaoStatusV3: "pronta", cliente: { nome: "Cliente QA" }, equipamento: { marca: "Samsung", modelo: "A54" }, valorTotal: 400, orcamento: { id: "orc-qa", status: "aprovado", total: 400, pecas: [], servicos: [{ id: "s1", descricao: "Tela QA", valor: 300 }, { id: "s2", descricao: "Limpeza QA", valor: 100 }], desconto: 0, criadoEm: new Date().toISOString() }, timeline: [] },
  } });
  const sessao = await prisma.sessaoCaixa.create({ data: { storeId, status: "ABERTA", operador: "QA" } });
  const rascunho = avaliarRecebimentoV4({ linhas: [{ forma: "debito", valorStr: "350" }, { forma: "a_prazo", valorStr: "50" }], saldo: 400, intencao: "quitacao", vencimento: "2099-12-31", caixaAberto: true, aPrazoExistente: false });
  expect(rascunho.ok).toBe(true);
  const dados = buildRecebimentoMistoV4({ rascunho, saldo: 400, vencimento: "2099-12-31", sessaoId: sessao.id, intencao: "quitacao" });
  const res = await registrarRecebimentoMistoOSV3(storeId, row.id, { ...dados, operacaoId: `qa-v4-${Date.now()}` });
  expect(res.ok).toBe(true);
  const localKey = `os-faturamento:${storeId}:${row.id}`;
  const titulos = await prisma.contaReceberTitulo.findMany({ where: { storeId, localKey } });
  expect(titulos).toHaveLength(1); expect(titulos[0]).toMatchObject({ valor: 400, status: "parcial", vencimento: "2099-12-31" });
  const parcial = await lerProjecaoFinanceiraOSV4(storeId, row.id);
  expect(parcial).toMatchObject({ receivedTotal: 350, balance: 50, financialStatus: "AUTHORIZED_CREDIT", authorizedCredit: true, installments: [{ amount: 50 }] });
  const caixa = await prisma.caixaOperacao.findMany({ where: { storeId, sessaoId: sessao.id } });
  expect(caixa.map((c) => c.valor)).toEqual([350]);
  const movs = await prisma.movimentacaoFinanceira.findMany({ where: { storeId } }); expect(movs.map((m) => m.valor)).toEqual([350]);
  await receberOSV3(storeId, row.id, { linhas: [{ forma: "dinheiro", valor: 50 }], sessaoId: sessao.id });
  const final = await prisma.contaReceberTitulo.findMany({ where: { storeId, localKey } });
  expect(final).toHaveLength(1); expect(final[0]).toMatchObject({ id: titulos[0]!.id, valor: 400, status: "pago" });
  const pago = await lerProjecaoFinanceiraOSV4(storeId, row.id);
  expect(pago).toMatchObject({ receivedTotal: 400, balance: 0, financialStatus: "PAID", authorizedCredit: false, installments: [] });
});
