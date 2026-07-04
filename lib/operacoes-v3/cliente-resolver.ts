// ============================================================================
// Operações V3 — GOAL OPS-V4-CLIENTE-RESOLVER-UNIFICADO-022
// ----------------------------------------------------------------------------
// Único ponto de resolução/criação de cliente para os fluxos de Operações V3
// (Nova OS, Atendimento Rápido, e futuro Orçamento Rápido). Cada fluxo chama
// com `opts` explícitas — nada de comportamento implícito por caminho de código.
//
// Fallbacks/merges de nome/telefone (ex.: "Cliente" no Atendimento Rápido
// existente, ou draft.cliente.nome sem fallback na Nova OS) continuam sendo
// decisão do CHAMADOR — o resolver não aplica default nenhum ao modo
// "existente" além do que a entrada já traz, preservando a paridade exata de
// cada fluxo (ver PRESERVAR no GOAL).
//
// Plain module (não "use server"): chamado apenas por Server Actions da V3
// (nova-os-actions / atendimento-rapido-actions), como `estoque-sync.ts`.
// ============================================================================

// Caminho completo (em vez do alias `@/api/clientes`) para resolver também sob
// o `vitest.config.ts` (que só mapeia `@` → raiz, sem os aliases finos do
// tsconfig) — mesmo arquivo físico, permite mockar este módulo em teste.
import { listClientes, criarCliente } from "@/components/operacoes/lovable/api/clientes";

export type ClienteResolverModoV3 = "existente" | "novo" | "balcao";

export interface ResolverClienteInputV3 {
  modo: ClienteResolverModoV3;
  /** modo === "existente" (obrigatório nesse modo). */
  clienteId?: string;
  /** modo === "novo" (obrigatório nesse modo); usado como está em "existente" — sem fallback. */
  nome?: string;
  telefone?: string;
  /** Só é lido/criado quando `opts.permitirCamposEstendidos` é true. */
  documento?: string;
  /** Só é lido quando `opts.permitirCamposEstendidos` é true (nunca vai para `criarCliente`). */
  email?: string;
  /** Só é lido quando `opts.permitirCamposEstendidos` é true; default "PF". */
  tipo?: "PF" | "PJ";
}

export interface ResolverClienteOpcoesV3 {
  /** Permite modo "balcao" (Cliente Balcão singleton por loja). */
  permitirBalcao: boolean;
  /** Permite documento/email/tipo PJ na criação e no retorno. */
  permitirCamposEstendidos: boolean;
}

export interface ClienteResolvidoOperacoesV3 {
  id: string;
  nome: string;
  telefone?: string;
  documento?: string;
  email?: string;
}

/** Label operacional do consumidor de balcão (cliente singleton por unidade). */
export const CLIENTE_BALCAO_NOME_V3 = "Cliente Balcão";

/**
 * "Cliente Balcão" como SINGLETON por unidade — evita poluir o cadastro com um
 * cliente novo a cada atendimento. Reaproveita o existente (match por nome) ou
 * cria UMA vez. Sem documento/telefone (não exige dados pessoais).
 */
async function resolverClienteBalcaoV3(storeId: string): Promise<ClienteResolvidoOperacoesV3> {
  const clientes = await listClientes(storeId);
  const alvo = CLIENTE_BALCAO_NOME_V3.toLowerCase();
  const existente = clientes.find((c) => (c.nome ?? "").trim().toLowerCase() === alvo);
  if (existente) return { id: existente.id, nome: existente.nome, telefone: existente.telefone ?? undefined };
  const novo = await criarCliente(storeId, { nome: CLIENTE_BALCAO_NOME_V3, tipo: "PF" });
  return { id: novo.id, nome: novo.nome, telefone: undefined };
}

/**
 * Resolve/cria um cliente REAL para os fluxos de Operações V3, com o comportamento
 * de cada fluxo controlado por `opts` — nenhum caminho fica implícito no código.
 * Lança Error com mensagem amigável quando a entrada é inválida para o modo pedido.
 */
export async function resolverClienteOperacoesV3(
  storeId: string,
  input: ResolverClienteInputV3,
  opts: ResolverClienteOpcoesV3,
): Promise<ClienteResolvidoOperacoesV3> {
  const sid = (storeId ?? "").trim();

  if (input.modo === "balcao") {
    if (!opts.permitirBalcao) throw new Error("Cliente balcão não é permitido neste fluxo.");
    return resolverClienteBalcaoV3(sid);
  }

  if (input.modo === "existente") {
    const id = input.clienteId?.trim();
    if (!id) throw new Error("Selecione o cliente existente.");
    return {
      id,
      nome: input.nome ?? "",
      telefone: input.telefone,
      documento: opts.permitirCamposEstendidos ? input.documento : undefined,
      email: opts.permitirCamposEstendidos ? input.email : undefined,
    };
  }

  // modo "novo"
  const nome = input.nome?.trim();
  if (!nome) throw new Error("Informe o nome do cliente.");
  const telefone = input.telefone?.trim() || undefined;
  const documento = opts.permitirCamposEstendidos ? input.documento?.trim() || undefined : undefined;
  const tipo = opts.permitirCamposEstendidos ? (input.tipo ?? "PF") : "PF";

  const novo = await criarCliente(sid, { nome, telefone, documento, tipo });
  return {
    id: novo.id,
    nome: novo.nome || nome,
    telefone: novo.telefone ?? telefone,
    documento: opts.permitirCamposEstendidos ? (novo.documento ?? documento) : undefined,
    email: opts.permitirCamposEstendidos ? input.email : undefined,
  };
}
