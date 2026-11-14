"use server";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma, ContaReceberTitulo } from "@/generated/prisma";
import type { OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { getSessionEntitlement } from "@/lib/auth/session-entitlement";
import { ADMIN_AUTHORIZATION_COOKIE, resolvePinAuthorizationSecret, verifyPinAuthorizationToken } from "@/lib/auth/pin-authorization";
import { SUPERVISOR_ROLE_FILTER } from "@/lib/auth/verify-supervisor-pin";
import { toStrongDocumentKey } from "@/lib/cadastros/client-identity/document";
import { getContaReceberByLocalKey, travarTituloContaReceber } from "@/lib/financeiro/services/contas-receber-service";
import { recebimentoLoteAdvisoryLock } from "@/lib/financeiro/services/recebimento-lote-service";
import { chaveLockRecebimentoMistoV3, conferirPendenciaFinanceiraV3 } from "./recebimento-misto-service";
import { lerOSTravadaV3, TX_PAYLOAD_OS_V3, type OSTravadaV3 } from "./os-payload-lock";
import { localKeyContaReceberOSV3, montarPagamentoMirrorV3 } from "./payment-model";
import { computeTotaisV3, type OrcamentoV3, type SalvarOrcamentoV3Input } from "./orcamento-model";
import { ACAO_EDICAO_OS_V3, serializarEdicaoV3, orcamentoEditadoCompletoV3, previaEdicaoCompletaV3, semearEdicaoCompletaV3, validarEdicaoCompletaV3, type EdicaoCompletaV3, type RevisaoEdicaoV3 } from "./edicao-completa-model";
import { objetoEdicao, planejarEdicaoFinanceiraV3, reconciliarEdicaoFinanceiraV3, redistribuirParcelasEdicaoV3 } from "./edicao-financeira";
import { gravarCoberturasGarantiaV3 } from "./garantia-servicos-model";
import { adicionarVersaoTermoGarantiaV3, lerVersoesTermoGarantiaV3 } from "./garantia-termos-model";
import { lerEntregaV3 } from "./pos-venda-model";
import { diaNaLojaV3, hojeNaLojaV3 } from "./datas-operacionais-model";
import { versionarDocumentosEdicaoOSV3 } from "./edicao-documentos-model";
import { lerProvaEntradaV3 } from "./prova-entrada-model";

const revisaoSchema = z.object({ versao: z.string().length(64), operacaoId: z.string().uuid(), motivo: z.string().trim().min(10).max(500) });
const hash = (v: unknown) => createHash("sha256").update(serializarEdicaoV3(v)).digest("hex");
const json = (v: unknown) => JSON.parse(serializarEdicaoV3(v)) as Prisma.InputJsonValue;

async function autorizarEdicao(storeId: string, osId: string) {
  if (!storeId?.trim() || !osId?.trim()) throw new Error("Selecione a loja e a OS.");
  const guard = await requireEnterpriseWith(storeId, (p) => p.operacoes.editarOs, "Sem permissão para editar esta OS.");
  if (!guard.ok) throw new Error(guard.error);
  const entitlement = await getSessionEntitlement();
  if (!entitlement.ok) throw new Error("Sessão inválida. Entre novamente.");
  return guard;
}

async function carregarTravado(tx: Prisma.TransactionClient, storeId: string, osId: string) {
  await recebimentoLoteAdvisoryLock(tx, chaveLockRecebimentoMistoV3(storeId, osId));
  const row = await lerOSTravadaV3(tx, storeId, osId);
  if (!row?.payloadValido) throw new Error("OS não encontrada nesta loja ou sem dados compatíveis.");
  if (row.payload.id !== osId || row.payload.storeId !== storeId) throw new Error("Identidade persistida da OS divergente. Reconcilie o cadastro antes de editar.");
  if (row.payload.status === "cancelada") throw new Error("OS cancelada não pode ser editada.");
  await conferirPendenciaFinanceiraV3(tx, storeId, osId, "edicao-os", "outro");
  const localKey = localKeyContaReceberOSV3(storeId, osId);
  await travarTituloContaReceber(tx, storeId, { localKey });
  const titulo = await getContaReceberByLocalKey(storeId, localKey, tx);
  const cliente = await tx.cliente.findFirst({ where: { id: row.payload.clienteId, storeId }, select: { id: true, name: true, document: true, documentKey: true, phone: true, email: true, updatedAt: true } });
  if (!cliente) throw new Error("Cliente da OS não encontrado nesta loja.");
  const versao = hash([storeId, osId, row.updatedAt, row.payload, row.valorTotal, titulo, cliente]);
  return { row, titulo, cliente, versao };
}

function recursoEdicao(storeId: string, osId: string, d: EdicaoCompletaV3, r: RevisaoEdicaoV3) {
  // Vincula também os valores e o motivo exibidos na revisão; outro formulário exige outro PIN.
  return `${osId}:${hash([storeId, osId, d, r])}`;
}

async function conferirAlteracoes(tx: Prisma.TransactionClient, storeId: string, row: OSTravadaV3, titulo: ContaReceberTitulo | null, d: EdicaoCompletaV3, permissions: { financeiro: { edit: boolean }; operacoes: { garantia: boolean } }) {
  const antes = semearEdicaoCompletaV3(row.payload, titulo);
  const mudouCliente = antes.cliente.id !== d.cliente.id;
  if (mudouCliente) {
    const alvo = await tx.cliente.findFirst({ where: { id: d.cliente.id, storeId, active: true }, select: { id: true, name: true, document: true, phone: true, email: true } });
    const esperado = alvo ? { id: alvo.id, nome: alvo.name, documento: alvo.document || "", telefone: alvo.phone || "", email: alvo.email || "" } : null;
    if (!esperado || serializarEdicaoV3(esperado) !== serializarEdicaoV3(d.cliente)) throw new Error("O cadastro selecionado mudou ou não pertence à loja. Busque o cliente novamente; para corrigir seus dados, use o cadastro de clientes.");
  }
  const orcamento = orcamentoEditadoCompletoV3(row.payload, d, new Date().toISOString());
  const anterior = row.valorTotal;
  const total = computeTotaisV3(orcamento).total;
  if (!Number.isFinite(total) || total < 0) throw new Error("Total inválido.");
  const mudouPagamento = serializarEdicaoV3(antes.pagamento) !== serializarEdicaoV3(d.pagamento);
  const mudouFinanceiro = Math.round(anterior * 100) !== Math.round(total * 100) || mudouPagamento || mudouCliente && !!titulo;
  const mudouGarantia = serializarEdicaoV3(antes.garantias) !== serializarEdicaoV3(d.garantias);
  for (const g of d.garantias) {
    const anterior = antes.garantias.find((a) => a.linhaId === g.linhaId);
    if (g.inicioOriginal !== anterior?.inicioOriginal || g.vencimentoOriginal !== anterior?.vencimentoOriginal) throw new Error("Use Corrigir datas para alterar os marcos da garantia.");
    if (!anterior && !d.servicos.some((s) => s.id === g.linhaId) && !d.pecas.some((p) => p.id === g.linhaId)) throw new Error("Cobertura de garantia sem vínculo com um item da OS.");
  }
  if (mudouGarantia && d.garantias.some((g) => g.modeloId === "nao_definida" && !antes.garantias.some((a) => serializarEdicaoV3(a) === serializarEdicaoV3(g)))) throw new Error("Escolha um modelo de garantia para a cobertura alterada.");
  if (mudouGarantia && !permissions.operacoes.garantia) throw new Error("Sem permissão para alterar garantia.");
  if (mudouGarantia && lerEntregaV3(row.payload).entregue && !lerVersoesTermoGarantiaV3(row.payload).length) throw new Error("Reemita o termo legado pelo fluxo autorizado de garantia antes de gerar o aditivo.");
  // A edição comercial não consome nem devolve estoque. Alterações de quantidade/SKU
  // após consumo devem passar pelo fluxo de estoque que registra o delta físico.
  const fisico = (pecas: EdicaoCompletaV3["pecas"]) => pecas.map((p) => [p.id, p.produtoId ?? null, p.quantidade]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  if (row.payload.estoqueConsumido && serializarEdicaoV3(fisico(antes.pecas)) !== serializarEdicaoV3(fisico(d.pecas))) throw new Error("Estoque já consumido: ajuste quantidades ou produtos pelo fluxo de estoque antes da edição comercial.");
  if (mudouFinanceiro) {
    if (!permissions.financeiro.edit) throw new Error("Sem permissão financeira para alterar cobrança.");
    const vinculados = await tx.contaReceberTitulo.count({ where: { storeId, OR: [{ localKey: localKeyContaReceberOSV3(storeId, row.id) }, { payload: { path: ["ordemServicoId"], equals: row.id } }, { payload: { path: ["osId"], equals: row.id } }] } });
    if (vinculados > 1) throw new Error("Mais de um título vinculado à OS. Reconcilie os títulos no Financeiro antes de corrigir o preço.");
    if (titulo && d.pagamento.vencimento !== antes.pagamento.vencimento && Array.isArray(objetoEdicao(titulo.payload).parcelas) && (objetoEdicao(titulo.payload).parcelas as unknown[]).length > 1) throw new Error("Cobrança parcelada: renegocie os vencimentos das parcelas no Financeiro. A correção de preço preserva os vencimentos atuais.");
    // Serializable: fechamento ou lançamento concorrente invalida a transação.
    const dia = hojeNaLojaV3();
    const datas = [dia, titulo ? diaNaLojaV3(titulo.createdAt.toISOString()) : null].filter((v): v is string => !!v);
    const fechados = await tx.fechamentoFinanceiro.count({ where: { storeId, status: "fechado", OR: datas.flatMap((d) => [{ tipo: "diario", dataReferencia: d }, { tipo: "mensal", dataReferencia: `${d.slice(0, 7)}-01` }]) } });
    const refs = [row.id, titulo?.id].filter((v): v is string => !!v);
    const movimentos = await tx.movimentacaoFinanceira.count({ where: { storeId, referenciaId: { in: refs } } });
    const caixa = await tx.caixaOperacao.count({ where: { storeId, OR: refs.flatMap((id) => [{ payload: { path: ["ordemServicoId"], equals: id } }, { payload: { path: ["tituloId"], equals: id } }, { payload: { path: ["referenciaId"], equals: id } }]) } });
    planejarEdicaoFinanceiraV3(titulo, anterior, total, mudouPagamento || mudouCliente, movimentos + caixa > 0, fechados > 0);
    const original = row.payload.orcamento as OrcamentoV3 | undefined;
    if (original && Math.round(computeTotaisV3(original).total * 100) !== Math.round(anterior * 100)) throw new Error("Total da OS diverge do orçamento. Reconcilie a cobrança no Financeiro antes de editar.");
    if (!titulo && (row.payload.faturamentoPendente || row.payload.aPrazoV3 || Number(objetoEdicao(row.payload.pagamentoV3).recebido) > 0)) throw new Error("Cobrança original ausente. Reconcilie no Financeiro.");
    if (row.payload.faturamentoParcelas?.length) redistribuirParcelasEdicaoV3(row.payload.faturamentoParcelas, anterior, total);
  }
  return { antes, orcamento, total, mudouFinanceiro, mudouGarantia, alteracoes: previaEdicaoCompletaV3(antes, d) };
}

export async function carregarEdicaoCompletaOSV3(storeId: string, osId: string) {
  await autorizarEdicao(storeId, osId);
  return prisma.$transaction(async (tx) => {
    const c = await carregarTravado(tx, storeId, osId);
    return { dados: semearEdicaoCompletaV3(c.row.payload, c.titulo), versao: c.versao, codigo: c.row.numero || c.row.payload.codigo, status: c.row.payload.status };
  }, { ...TX_PAYLOAD_OS_V3, isolationLevel: "Serializable" });
}

export async function revisarEdicaoCompletaOSV3(storeId: string, osId: string, entrada: EdicaoCompletaV3, revisao: RevisaoEdicaoV3) {
  const guard = await autorizarEdicao(storeId, osId);
  const d = validarEdicaoCompletaV3(entrada), r = revisaoSchema.parse(revisao);
  return prisma.$transaction(async (tx) => {
    const c = await carregarTravado(tx, storeId, osId);
    if (c.versao !== r.versao) throw new Error("A OS, o cliente ou a cobrança mudou. Reabra o formulário e revise os dados atuais.");
    const p = await conferirAlteracoes(tx, storeId, c.row, c.titulo, d, guard.permissions);
    if (!p.alteracoes.length) throw new Error("Nenhuma alteração para salvar.");
    return { alteracoes: p.alteracoes, totalAnterior: c.row.valorTotal, totalNovo: p.total, scope: { action: ACAO_EDICAO_OS_V3, resource: recursoEdicao(storeId, osId, d, r) }, aditivo: lerEntregaV3(c.row.payload).entregue };
  }, { ...TX_PAYLOAD_OS_V3, isolationLevel: "Serializable" });
}

export async function salvarEdicaoCompletaOSV3(storeId: string, osId: string, entrada: EdicaoCompletaV3, revisao: RevisaoEdicaoV3): Promise<OrdemServico> {
  const guard = await autorizarEdicao(storeId, osId);
  const d = validarEdicaoCompletaV3(entrada), r = revisaoSchema.parse(revisao);
  const jar = await cookies();
  const pin = await verifyPinAuthorizationToken(jar.get(ADMIN_AUTHORIZATION_COOKIE)?.value, resolvePinAuthorizationSecret(), { userId: guard.session.user.id, storeId, action: ACAO_EDICAO_OS_V3, resource: recursoEdicao(storeId, osId, d, r) });
  if (!pin.ok) throw new Error("Autorização específica de supervisor obrigatória. Revise e solicite o PIN novamente.");
  const resultado = await prisma.$transaction(async (tx) => {
    const c = await carregarTravado(tx, storeId, osId);
    const supervisor = await tx.user.findFirst({ where: { id: pin.payload.supervisorId, ...SUPERVISOR_ROLE_FILTER }, select: { id: true, name: true } });
    if (!supervisor) throw new Error("Supervisor não está mais autorizado.");
    const edicoes = Array.isArray(c.row.payload.edicoesCompletasV3) ? c.row.payload.edicoesCompletasV3 as Array<Record<string, unknown>> : [];
    const requestHash = hash([d, r]);
    const replay = edicoes.find((e) => e.operacaoId === r.operacaoId);
    if (replay) {
      if (replay.requestHash !== requestHash || replay.operadorId !== guard.session.user.id) throw new Error("Esta operação já foi usada com outros dados.");
      return c.row.payload;
    }
    if (c.versao !== r.versao) throw new Error("A OS, o cliente ou a cobrança mudou. Reabra o formulário e revise antes de salvar.");
    const p = await conferirAlteracoes(tx, storeId, c.row, c.titulo, d, guard.permissions);
    if (!p.alteracoes.length) throw new Error("Nenhuma alteração para salvar.");
    const agora = new Date().toISOString();
    const contexto = { agora, operadorId: guard.session.user.id, supervisorId: supervisor.id, operacaoId: r.operacaoId, motivo: r.motivo };
    // CPF/nome do cadastro e snapshot da OS são corrigidos juntos. A unique de
    // documentKey impede associar o CPF de outro cliente a este cadastro.
    if (p.antes.cliente.id === d.cliente.id && serializarEdicaoV3(p.antes.cliente) !== serializarEdicaoV3(d.cliente)) {
      // O snapshot da OS pode ser mais antigo que o cadastro. Só os campos que
      // o operador alterou podem substituir o cadastro atual.
      const clientePatch: Prisma.ClienteUpdateInput = {};
      if (p.antes.cliente.nome !== d.cliente.nome) clientePatch.name = d.cliente.nome.trim();
      if (p.antes.cliente.documento !== d.cliente.documento) { clientePatch.document = d.cliente.documento.trim(); clientePatch.documentKey = toStrongDocumentKey(d.cliente.documento); }
      if (p.antes.cliente.telefone !== d.cliente.telefone) clientePatch.phone = d.cliente.telefone || null;
      if (p.antes.cliente.email !== d.cliente.email) clientePatch.email = d.cliente.email || null;
      await tx.cliente.update({ where: { id: c.cliente.id, updatedAt: c.cliente.updatedAt }, data: clientePatch });
      if (c.titulo && !p.mudouFinanceiro && p.antes.cliente.nome !== d.cliente.nome) {
        const payloadTitulo = { ...objetoEdicao(c.titulo.payload), cliente: d.cliente.nome, clienteNome: d.cliente.nome };
        await tx.contaReceberTitulo.update({ where: { id: c.titulo.id }, data: { cliente: d.cliente.nome, payload: json(payloadTitulo) } });
        await tx.auditoriaFinanceira.create({ data: { storeId, entidade: "receber", entidadeId: c.titulo.id, acao: "editar", usuarioId: guard.session.user.id, antes: json({ cliente: c.titulo.cliente }), depois: json({ cliente: d.cliente.nome, ...contexto }) } });
      }
    }
    const abertura = objetoEdicao(c.row.payload.aberturaV3);
    let next = {
      ...c.row.payload,
      clienteId: d.cliente.id,
      cliente: { ...c.row.payload.cliente, ...d.cliente },
      equipamento: { ...c.row.payload.equipamento, ...d.equipamento, defeitoRelatado: d.problema },
      observacaoCliente: d.observacaoCliente,
      aberturaV3: { ...abertura, recepcao: { ...objetoEdicao(abertura.recepcao), ...d.recepcao } },
      orcamento: p.orcamento, pecas: d.pecas,
      servicosCatalogo: c.row.payload.servicosCatalogo?.map((s) => { const editado = d.servicos.find((l) => l.id === s.servicoId); return editado ? { ...s, descricao: editado.descricao, custoInterno: editado.custoV3 ?? s.custoInterno, valorVenda: editado.valor } : s; }),
      orcamentoVersoesV3: [...(Array.isArray(c.row.payload.orcamentoVersoesV3) ? c.row.payload.orcamentoVersoesV3 : []), { snapshot: c.row.payload.orcamento ?? null, registradoEm: agora, registradoPor: guard.session.user.id }],
      atualizadoEm: agora,
    } as typeof c.row.payload;
    if (serializarEdicaoV3(p.antes.equipamento) !== serializarEdicaoV3(d.equipamento)) {
      const prova = lerProvaEntradaV3(c.row.payload);
      next.provaEntradaV3 = { ...prova, atualizadoEm: agora, identificacao: { ...prova.identificacao, modelo: d.equipamento.modelo, serial: d.equipamento.numeroSerie, imei: d.equipamento.imei, cor: d.equipamento.cor, operadora: d.equipamento.operadora } };
    }
    if (p.mudouFinanceiro && c.titulo) {
      await reconciliarEdicaoFinanceiraV3(tx, c.titulo, d, p.total, contexto, p.orcamento);
      next.pagamentoV3 = montarPagamentoMirrorV3({ total: p.total, recebido: 0, tituloLocalKey: c.titulo.localKey!, now: agora });
      if (next.aPrazoV3) next.aPrazoV3 = { ...objetoEdicao(next.aPrazoV3), valor: p.total, vencimento: d.pagamento.vencimento, autorizadoEm: agora, autorizadoPor: supervisor.name };
      if (next.faturamentoTotal !== undefined) next.faturamentoTotal = p.total;
      if (next.faturamentoParcelas?.length) next.faturamentoParcelas = redistribuirParcelasEdicaoV3(next.faturamentoParcelas, c.row.valorTotal, p.total) as typeof next.faturamentoParcelas;
      next.faturamentoFormaPagamento = d.pagamento.formaPreferida;
      next.faturamentoRevisadoEm = agora;
      next.faturamentoValorAnterior = c.row.valorTotal;
      next.faturamentoValorAtual = p.total;
    }
    if (next.prismaValorTotal !== undefined) next.prismaValorTotal = p.total;
    if (p.mudouGarantia) next = gravarCoberturasGarantiaV3(next, d.garantias);
    const entregue = lerEntregaV3(c.row.payload).entregue;
    const comercial = (v: EdicaoCompletaV3) => ({ cliente: v.cliente, equipamento: v.equipamento, problema: v.problema, servicos: v.servicos.map(({ custoV3: _c, ...s }) => s), pecas: v.pecas.map(({ custoUnitario: _c, ...s }) => s), desconto: v.desconto, pagamento: v.pagamento, garantias: v.garantias });
    const relevante = serializarEdicaoV3(comercial(p.antes)) !== serializarEdicaoV3(comercial(d));
    if (relevante) next = versionarDocumentosEdicaoOSV3(c.row.payload, next, agora, r.motivo);
    if (entregue && relevante && lerVersoesTermoGarantiaV3(next).length) next = adicionarVersaoTermoGarantiaV3(next, { tipo: "aditivo", agora, operadorId: guard.session.user.id, operador: guard.session.user.name || guard.session.user.id, motivo: r.motivo, origem: "edicao_completa" });
    const registro = { ...contexto, requestHash, versaoAnterior: r.versao, antes: p.antes, depois: d, alteracoes: p.alteracoes, aditivo: entregue && relevante };
    next.edicoesCompletasV3 = [...edicoes, registro];
    if (entregue && relevante) next.aditivosEdicaoOSV3 = [...(Array.isArray(next.aditivosEdicaoOSV3) ? next.aditivosEdicaoOSV3 : []), { ...registro, numero: (Array.isArray(next.aditivosEdicaoOSV3) ? next.aditivosEdicaoOSV3.length : 0) + 1 }];
    next.timeline = [...c.row.payload.timeline, { id: r.operacaoId, tipo: "orcamento_aprovado_revisado", autor: guard.session.user.name || guard.session.user.id, autorTipo: "usuario", criadoEm: agora, conteudo: `OS corrigida com autorização de ${supervisor.name}. Motivo: ${r.motivo}${entregue && relevante ? " Aditivo registrado." : ""}`, metadata: { ...contexto, alteracoes: p.alteracoes, origem: "edicao_completa" } }];
    await tx.logsAuditoria.create({ data: { action: "OS_EDICAO_COMPLETA", userLabel: guard.session.user.id, detail: `OS ${osId}: ${r.motivo}`, metadata: serializarEdicaoV3({ storeId, osId, ...registro }), source: "operacoes-v3-v4" } });
    await tx.ordemServico.update({ where: { id: osId, storeId }, data: { payload: json(next), clienteId: d.cliente.id, valorTotal: p.total, equipamento: [d.equipamento.tipo, d.equipamento.marca, d.equipamento.modelo].filter(Boolean).join(" "), defeito: d.problema } });
    return next;
  }, { ...TX_PAYLOAD_OS_V3, isolationLevel: "Serializable" });
  revalidatePath("/dashboard/operacoes-v3");
  revalidatePath("/dashboard/operacoes-v4-preview");
  revalidatePath("/dashboard/financeiro");
  return resultado;
}

/** Compatibilidade: o antigo motor só escreve mediante a mesma revisão e PIN. */
export async function corrigirOrcamentoCompletoSeguroV3(storeId: string, osId: string, input: SalvarOrcamentoV3Input, revisao?: RevisaoEdicaoV3): Promise<OrdemServico> {
  if (!revisao) throw new Error("Use Editar OS: revisão completa, motivo e autorização específica de supervisor são obrigatórios.");
  const carregado = await carregarEdicaoCompletaOSV3(storeId, osId);
  return salvarEdicaoCompletaOSV3(storeId, osId, { ...carregado.dados, servicos: input.servicos, pecas: input.pecas, desconto: input.desconto }, revisao);
}

type ResultadoEdicao<T> = { ok: true; data: T } | { ok: false; error: string };
async function resultadoEdicao<T>(fn: () => Promise<T>): Promise<ResultadoEdicao<T>> {
  try { return { ok: true, data: await fn() }; }
  catch (e) {
    const code = objetoEdicao(e).code;
    if (code === "P2034" || code === "P2025") return { ok: false, error: "Os dados mudaram durante a gravação. Reabra a OS e revise novamente; nenhuma alteração parcial foi salva." };
    if (code === "P2002") return { ok: false, error: "Este CPF/CNPJ já pertence a outro cliente da loja. Corrija o vínculo antes de salvar." };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues.map((i) => `${i.path.join(" / ")}: ${i.message}`).join("; ") };
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível concluir a edição. Reabra a OS." };
  }
}

// Mensagens de negócio são devolvidas: o Next oculta erros lançados em Production/Preview.
export async function carregarEditorOSV3(storeId: string, osId: string) {
  return resultadoEdicao(() => carregarEdicaoCompletaOSV3(storeId, osId));
}
export async function revisarEditorOSV3(storeId: string, osId: string, d: EdicaoCompletaV3, r: RevisaoEdicaoV3) {
  return resultadoEdicao(() => revisarEdicaoCompletaOSV3(storeId, osId, d, r));
}
export async function salvarEditorOSV3(storeId: string, osId: string, d: EdicaoCompletaV3, r: RevisaoEdicaoV3) {
  return resultadoEdicao(() => salvarEdicaoCompletaOSV3(storeId, osId, d, r));
}
