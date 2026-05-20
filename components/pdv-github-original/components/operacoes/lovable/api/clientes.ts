import type { ClienteRecord } from "@/data/clientesSeed";
import { listClientes as listClientesCadastros } from "@/app/actions/cadastros";

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
