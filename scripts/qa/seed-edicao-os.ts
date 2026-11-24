/** Somente banco QA exclusivo; nunca lê nem escreve Production. */
import { PrismaClient, type Prisma } from "../../generated/prisma";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { hashSupervisorPin, newOpaqueUnusablePin } from "../../lib/auth/pin-hash";
import { localKeyContaReceberOSV3, montarAPrazoMirrorV3, montarPagamentoMirrorV3 } from "../../lib/operacoes-v3/payment-model";
import { adicionarVersaoTermoGarantiaV3 } from "../../lib/operacoes-v3/garantia-termos-model";
import { MODULES } from "../../lib/auth/access-policy";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (url.pathname !== "/omni_ops_edicao_qa" || !url.hostname.includes("ep-lucky-tree-b68myr8i") || process.env.VERCEL_ENV === "production") throw new Error("Seed restrito ao banco QA exclusivo da edição OS.");
  const db = new PrismaClient();
  const storeId = "qa-edicao-os";
  const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
  const agora = new Date().toISOString(), vencimento = "2027-03-10";
  await db.store.upsert({ where: { id: storeId }, create: { id: storeId, name: "QA · Edição completa de OS", profile: "ASSISTENCIA", subscriptionPlan: "OURO", moduleAccess: { version: 1, modules: [...MODULES] } }, update: {} });
  if (!process.env.QA_PASSWORD || !process.env.QA_SUPERVISOR_PIN) throw new Error("Credenciais QA ausentes.");
  const admin = await db.adminUser.upsert({ where: { email: process.env.QA_ADMIN_EMAIL! }, create: { email: process.env.QA_ADMIN_EMAIL!, name: "Responsável QA Edição OS", password: await bcrypt.hash(process.env.QA_PASSWORD, 12), role: "ADMIN", accessScope: "STORE", lojaId: storeId }, update: {} });
  await db.adminUserStore.upsert({ where: { adminUserId_storeId: { adminUserId: admin.id, storeId } }, create: { adminUserId: admin.id, storeId }, update: {} });
  let supervisor = await db.user.findFirst({ where: { name: "Supervisor QA Edição OS" } });
  if (!supervisor) supervisor = await db.user.create({ data: { name: "Supervisor QA Edição OS", role: "ADMIN", pin: newOpaqueUnusablePin(), pinHash: await hashSupervisorPin(process.env.QA_SUPERVISOR_PIN) } });
  const sessao = await db.sessaoCaixa.upsert({ where: { id: "qa-edicao-caixa" }, create: { id: "qa-edicao-caixa", storeId, operador: admin.name, status: "ABERTA", saldoInicial: 0 }, update: {} });
  const casos = [
    { codigo: "QA-OS-ABERTA", status: "aberta", recebido: 0, titulo: false },
    { codigo: "QA-OS-APROVADA", status: "aprovado", recebido: 0 },
    { codigo: "QA-OS-ENTREGUE", status: "entregue", recebido: 0 },
    { codigo: "QA-OS-PRAZO-330", status: "entregue", recebido: 0, parcelas: true },
    { codigo: "QA-OS-PARCIAL", status: "entregue", recebido: 100 },
    { codigo: "QA-OS-QUITADA", status: "entregue", recebido: 330 },
    { codigo: "QA-OS-CPF", status: "aprovado", recebido: 0, cpf: "11111111111" },
    { codigo: "QA-OS-CUSTO", status: "entregue", recebido: 330 },
  ];
  for (const caso of casos) {
    const id = caso.codigo.toLowerCase();
    if (await db.ordemServico.findUnique({ where: { id } })) continue;
    const c = await db.cliente.create({ data: { storeId, name: `Cliente sintético · ${caso.codigo}`, document: caso.cpf || "", documentKey: null, phone: "11999990000" } });
    const localKey = localKeyContaReceberOSV3(storeId, id);
    const prazo = montarAPrazoMirrorV3({ valor: 330 - caso.recebido, vencimento, tituloLocalKey: localKey, autorizadoPor: supervisor.name, now: agora });
    let payload = {
      id, codigo: caso.codigo, storeId, clienteId: c.id, cliente: { id: c.id, nome: c.name, documento: c.document, telefone: c.phone },
      equipamento: { id: `eq-${id}`, tipo: "Smartphone", marca: "QA", modelo: "Aparelho sintético", numeroSerie: `SINTETICO-${id}`, defeitoRelatado: "Troca de tela — cenário sintético de edição" },
      status: caso.status, operacaoStatus: caso.status, operacaoStatusV3: caso.status, prioridade: "normal", origem: "balcao", sla: { prazo: `${vencimento}T12:00:00Z`, status: "ok" },
      orcamento: { id: `orc-${id}`, status: caso.status === "aberta" ? "rascunho" : "aprovado", servicos: [{ id: "servico-tela", descricao: "Troca de tela sintética", valor: 330, custoV3: 120, garantiaModeloId: "tela", prazoGarantiaDias: 90 }], pecas: [], desconto: 0, total: 330, criadoEm: agora, atualizadoEm: agora },
      pecas: [], anexos: [], observacoes: [], timeline: [], garantia: { ativa: false }, criadoEm: agora, atualizadoEm: agora,
      aberturaV3: { recepcao: { recebidoPor: "Recepção QA", localFisico: "Bancada QA" } },
      ...(caso.titulo !== false ? { faturamentoPendente: true, faturamentoStatus: "pendente", faturamentoOrigem: "orcamento_os", faturamentoTotal: 330, faturamentoCriadoEm: agora, faturamentoReferencia: caso.codigo, faturamentoModoCobranca: "parcelado", pagamentoV3: montarPagamentoMirrorV3({ total: 330, recebido: caso.recebido, tituloLocalKey: localKey, now: agora }), ...(caso.recebido < 330 ? { aPrazoV3: prazo } : {}) } : {}),
      ...(caso.status === "entregue" ? { entregueEm: agora, entregaV3: { entregueEm: agora, entreguePor: "QA", retiradoPor: c.name } } : {}),
    };
    if (caso.status === "entregue") payload = adicionarVersaoTermoGarantiaV3(payload, { tipo: "original", agora, operadorId: admin.id, operador: admin.name, motivo: "Emissão de documento sintético QA", origem: "qa" });
    await db.ordemServico.create({ data: { id, storeId, clienteId: c.id, numero: caso.codigo, status: caso.status === "entregue" ? "Entregue" : "Aberto", equipamento: "Smartphone QA Aparelho sintético", defeito: "Troca de tela sintética", valorTotal: 330, payload: json(payload) } });
    if (caso.titulo !== false) {
      const historico = [...(caso.recebido ? [{ tipo: "pagamento", valor: caso.recebido, formaPagamento: "dinheiro", at: agora, userLabel: admin.name, loteId: randomUUID() }] : []), ...(caso.recebido < 330 ? [{ tipo: "a_prazo_autorizado", valor: 330 - caso.recebido, vencimento, at: agora, userLabel: supervisor.name }] : [])];
      const t = await db.contaReceberTitulo.create({ data: { storeId, localKey, descricao: `OS ${caso.codigo} — QA`, cliente: c.name, valor: 330, vencimento, status: caso.recebido === 330 ? "liquidado" : "pendente", payload: json({ ordemServicoId: id, ordemNumero: caso.codigo, origem: "os", clienteId: c.id, historico, ...(caso.parcelas ? { parcelas: [1, 2, 3].map((n) => ({ id: `qa-parcela-${n}`, numero: n, valor: 110, vencimento: `2027-0${n + 2}-10` })) } : {}) }) } });
      if (caso.recebido) {
        await db.movimentacaoFinanceira.create({ data: { storeId, tipo: "entrada", origem: "os", referenciaId: t.id, descricao: `Recebimento sintético ${caso.codigo}`, valor: caso.recebido } });
        await db.caixaOperacao.create({ data: { storeId, sessaoId: sessao.id, tipo: "recebimento", valor: caso.recebido, motivo: "Recebimento inteiramente sintético QA", operador: admin.name, payload: { tituloId: t.id, ordemServicoId: id, formaPagamento: "dinheiro" } } });
      }
    }
  }
  console.log(`QA pronto: ${casos.length} cenários sintéticos; usuário restrito à loja QA; PIN bcrypt; nenhum dado produtivo.`);
  await db.$disconnect();
}
void main().catch(() => { console.error("Falha no seed QA; nenhuma ação produtiva foi executada."); process.exitCode = 1; });
