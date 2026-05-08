import { listVendasHub, criarVendaDeOSAction } from "@/app/actions/operacoes";
import type { Venda } from "@/types/venda";
import type { OrdemServico } from "@/types/os";

export async function listVendas(storeId?: string): Promise<Venda[]> {
  if (!storeId) return [];
  return listVendasHub(storeId);
}

export async function criarVendaDeOS(os: OrdemServico): Promise<Venda> {
  return criarVendaDeOSAction(os);
}
