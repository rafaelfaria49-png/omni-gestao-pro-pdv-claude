import type { ClienteRecord } from "@/data/clientesSeed";
import { listClientes as listClientesCadastros, createCliente, type ClienteKind } from "@/app/actions/cadastros";

export async function listClientes(storeId?: string): Promise<ClienteRecord[]> {
  if (!storeId) return [];
  const rows = await listClientesCadastros(storeId);
  return rows.map((c) => ({
    id: c.id,
    storeId,
    nome: c.nome,
    telefone: c.telefone !== "—" ? c.telefone : undefined,
    whatsapp: c.telefone !== "—" ? c.telefone : undefined,
    documento: c.documento !== "—" ? c.documento : undefined,
    email: undefined,
    criadoEm: new Date().toISOString(),
    // campo extra opcional usado em algumas telas (não quebra UI)
    cidade: c.cidade !== "—" ? c.cidade : undefined,
  })) as unknown as ClienteRecord[];
}

export async function getCliente(id: string): Promise<ClienteRecord | undefined> {
  // Busca pontual não é usada no fluxo principal ainda; mantém simples via listagem.
  // (Mantém contrato sem inventar nova API.)
  return undefined;
}

/**
 * Cadastra um cliente real (Prisma) a partir do Operações HUB — usado pela Nova OS
 * para permitir registrar um cliente sem sair do modal. Reaproveita a Server Action
 * oficial `createCliente` do Cadastros (mesma tabela, mesmo isolamento por loja).
 */
export async function criarCliente(
  storeId: string,
  input: { nome: string; telefone?: string; documento?: string; tipo?: ClienteKind },
): Promise<ClienteRecord> {
  const sid = storeId?.trim();
  if (!sid) throw new Error("Selecione uma unidade ativa para cadastrar o cliente.");
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome do cliente.");
  const telefone = input.telefone?.trim() || undefined;
  const documento = input.documento?.trim() || undefined;
  const { id } = await createCliente(sid, { nome, tipo: input.tipo ?? "PF", telefone, documento });
  return {
    id,
    storeId: sid,
    nome,
    telefone,
    whatsapp: telefone,
    documento,
    email: undefined,
    criadoEm: new Date().toISOString(),
  } as unknown as ClienteRecord;
}
