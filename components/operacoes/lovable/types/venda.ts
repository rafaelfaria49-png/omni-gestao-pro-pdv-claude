// Vendas geradas a partir de OS concluídas ou diretamente do balcão.
import type { PecaUsada, Servico } from "./os";

export type VendaStatus = "rascunho" | "emitida" | "paga" | "cancelada";
export type VendaOrigem = "os" | "balcao" | "ecommerce";

export interface Venda {
  id: string;
  storeId: string;
  numero: string;            // VND-2026-00045
  clienteId: string;
  origem: VendaOrigem;
  origemRefId?: string;      // osId quando origem = "os"
  itens: PecaUsada[];
  servicos: Servico[];
  desconto: number;
  total: number;
  status: VendaStatus;
  criadoEm: string;
  pagoEm?: string;
}
