import { db } from "./_db";
import { delay, nowIso, uid } from "./_helpers";
import type { Venda } from "@/types/venda";
import type { OrdemServico } from "@/types/os";
import { baixarPeca } from "./estoque";

export async function listVendas(storeId?: string): Promise<Venda[]> {
  await delay();
  return storeId ? db.vendas.filter((v) => v.storeId === storeId) : [...db.vendas];
}

// Converte uma OS pronta/entregue em uma Venda — base do fluxo de faturamento.
export async function criarVendaDeOS(os: OrdemServico): Promise<Venda> {
  await delay(80);
  if (!os.orcamento) throw new Error("OS sem orçamento — impossível faturar");
  const venda: Venda = {
    id: uid("vnd"),
    storeId: os.storeId,
    numero: `VND-${new Date().getFullYear()}-${(db.vendas.length + 1).toString().padStart(5, "0")}`,
    clienteId: os.clienteId,
    origem: "os",
    origemRefId: os.id,
    itens: os.orcamento.pecas,
    servicos: os.orcamento.servicos,
    desconto: os.orcamento.desconto,
    total: os.orcamento.total,
    status: "emitida",
    criadoEm: nowIso(),
  };
  db.vendas.push(venda);
  // baixa estoque de cada peça vinculada
  for (const item of venda.itens) {
    await baixarPeca(item.id, item.quantidade, "venda", venda.id);
  }
  return venda;
}
