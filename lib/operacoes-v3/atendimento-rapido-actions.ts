"use server";

// ============================================================================
// Operações V3 — Atendimento Rápido · write-path REAL (serviço de balcão)
// ----------------------------------------------------------------------------
// Registra um serviço rápido concluído REUSANDO a espinha existente, sem motor
// novo e sem tocar schema:
//   1. resolve o cliente (Cliente Balcão singleton / novo / existente);
//   2. cria a OS pelo caminho seguro `criarOSEnterpriseV3` (Nova OS write-path);
//   3. recebe o pagamento por `receberOSV3` → entra no caixa/fechamento;
//   4. conclui marcando a OS como "entregue" + tag `atendimentoRapidoV3`.
//
// NÃO modifica PDV de produtos/finalizeSaleTransaction, Financeiro, estoque,
// WhatsApp/Portal, BL-07, Marketplace nem Fiscal — só CHAMA serviços existentes.
// Serviço rápido é só serviço (sem peça) → nenhuma baixa de estoque acontece.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma";
import type { EventoTimeline, OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import { listClientes, criarCliente } from "@/api/clientes";
import { criarOSEnterpriseV3 } from "./nova-os-actions";
import { getCaixaSessaoAbertaV3, receberOSV3 } from "./pdv-servico-actions";
import { projetarStatusV2 } from "./status-machine";
import {
  CLIENTE_BALCAO_NOME_V3,
  montarDraftAtendimentoRapidoV3,
  validarAtendimentoRapidoV3,
  type AtendimentoRapidoInputV3,
} from "./atendimento-rapido-model";
import type { ComprovanteReciboV3 } from "./payment-model";

function operadorLabel(session: Session | null): string {
  const u = session?.user;
  return (u?.name || u?.email || "Você").trim() || "Você";
}
function nowIso(): string {
  return new Date().toISOString();
}
function eventId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ev_${Date.now()}`;
}

interface ClienteResolvidoV3 {
  id: string;
  nome: string;
  telefone?: string;
}

/**
 * "Cliente Balcão" como SINGLETON por unidade — evita poluir o cadastro com um
 * cliente novo a cada atendimento. Reaproveita o existente (match por nome) ou
 * cria UMA vez. Sem documento/telefone (não exige dados pessoais).
 */
async function resolverClienteBalcaoV3(storeId: string): Promise<ClienteResolvidoV3> {
  const clientes = await listClientes(storeId);
  const alvo = CLIENTE_BALCAO_NOME_V3.toLowerCase();
  const existente = clientes.find((c) => (c.nome ?? "").trim().toLowerCase() === alvo);
  if (existente) return { id: existente.id, nome: existente.nome, telefone: existente.telefone ?? undefined };
  const novo = await criarCliente(storeId, { nome: CLIENTE_BALCAO_NOME_V3, tipo: "PF" });
  return { id: novo.id, nome: novo.nome, telefone: undefined };
}

export interface FinalizarAtendimentoRapidoResultV3 {
  osId: string;
  codigo?: string;
  clienteNome: string;
  valorRecebido: number;
  recibo: ComprovanteReciboV3;
}

/**
 * Finaliza um serviço rápido: cria a OS, recebe no caixa e conclui. Lança Error
 * com mensagem amigável em qualquer falha (a UI mantém os dados preenchidos).
 */
export async function finalizarAtendimentoRapidoV3(
  storeId: string,
  input: AtendimentoRapidoInputV3,
): Promise<FinalizarAtendimentoRapidoResultV3> {
  const sid = (storeId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");

  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para finalizar o atendimento.");

  const erro = validarAtendimentoRapidoV3(input);
  if (erro) throw new Error(erro);

  // Caixa precisa estar ABERTO (o recebimento entra no fechamento).
  const sessao = await getCaixaSessaoAbertaV3(sid);
  if (!sessao.aberta || !sessao.sessaoId) {
    throw new Error("Abra o caixa no PDV para finalizar o serviço rápido (o recebimento entra no fechamento).");
  }

  // 1. Cliente (sem duplicar): balcão singleton / novo / existente.
  let cliente: ClienteResolvidoV3;
  if (input.cliente.modo === "existente") {
    const id = input.cliente.clienteId?.trim();
    if (!id) throw new Error("Selecione o cliente existente ou use Cliente balcão.");
    cliente = { id, nome: input.cliente.nome?.trim() || "Cliente", telefone: input.cliente.telefone?.trim() || undefined };
  } else if (input.cliente.modo === "novo") {
    const nome = input.cliente.nome?.trim();
    if (!nome) throw new Error("Informe o nome do novo cliente ou use Cliente balcão.");
    const novo = await criarCliente(sid, { nome, telefone: input.cliente.telefone?.trim() || undefined, tipo: "PF" });
    cliente = { id: novo.id, nome: novo.nome, telefone: novo.telefone ?? undefined };
  } else {
    cliente = await resolverClienteBalcaoV3(sid);
  }

  // 2. Cria a OS reusando a Nova OS Enterprise (caminho seguro, audita + numera).
  const draft = montarDraftAtendimentoRapidoV3(input, cliente);
  const { os } = await criarOSEnterpriseV3(sid, draft);
  const osId = os.id;

  // 3. Recebe o pagamento (forma única) → conta a receber + caixaOperacao no fechamento.
  const valor = Math.round(Number(input.servico.valor) * 100) / 100;
  const receb = await receberOSV3(sid, osId, {
    forma: input.formaPagamento,
    valor,
    sessaoId: sessao.sessaoId,
    observacao: `Atendimento rápido: ${input.servico.nome.trim()}`,
  });

  // 4. Conclui: marca como ENTREGUE (serviço de balcão concluído na hora) + tag.
  //    Patch direto do payload (born-done) — serviço-only, sem efeito de estoque.
  const operador = operadorLabel(session);
  const dataHora = nowIso();
  const row = await prisma.ordemServico.findFirst({ where: { id: osId, storeId: sid }, select: { id: true, payload: true } });
  if (row) {
    const payload = (row.payload as Record<string, unknown> | null) ?? {};
    const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
    const evento: EventoTimeline = {
      id: eventId(),
      tipo: "mudanca_status",
      autor: operador,
      autorTipo: "usuario",
      conteudo: `Atendimento rápido concluído (${input.servico.nome.trim()}).`,
      metadata: { para: "entregue", atendimentoRapido: true },
      criadoEm: dataHora,
    };
    const nextPayload: Record<string, unknown> = {
      ...payload,
      operacaoStatusV3: "entregue",
      status: projetarStatusV2("entregue"),
      atendimentoRapidoV3: {
        versao: 1,
        servico: input.servico.nome.trim(),
        valor,
        forma: input.formaPagamento,
        concluidoEm: dataHora,
        operador,
      },
      timeline: [...timeline, evento],
      atualizadoEm: dataHora,
    };
    await prisma.ordemServico.update({ where: { id: osId }, data: { payload: nextPayload as unknown as Prisma.InputJsonValue } });
  }

  revalidatePath("/dashboard/operacoes-v3");
  return {
    osId,
    codigo: (os as OrdemServico).codigo,
    clienteNome: cliente.nome,
    valorRecebido: receb.valorRecebido,
    recibo: receb.recibo,
  };
}
