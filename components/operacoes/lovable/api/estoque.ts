import { listProdutos } from "@/app/actions/cadastros";
import { nowIso, uid } from "./_helpers";
import type { MovimentoEstoque, PecaEstoque } from "@/types/estoque";

// Módulo que move estoque de verdade fica em lib/operacoes/adapters/os-estoque.ts.
// Aqui apenas expomos o catálogo (Prisma Produto → PecaEstoque) para a UI.

let CURRENT_STORE_ID = "loja-1";

export async function listPecas(storeId?: string): Promise<PecaEstoque[]> {
  const sid = storeId ?? CURRENT_STORE_ID;
  if (storeId) CURRENT_STORE_ID = storeId;
  const produtos = await listProdutos(sid);
  return produtos
    .filter((p) => p.status !== "Inativo")
    .map((p) => ({
      id: p.id,
      storeId: sid,
      produtoId: p.id,
      sku: p.sku ?? "—",
      barcode: p.barras || undefined,
      nome: p.nome,
      categoria: p.categoria !== "—" ? p.categoria : undefined,
      unidade: "un" as const,
      custo: p.custo,
      precoVenda: p.preco,
      estoqueAtual: p.estoque,
      estoqueMinimo: 1,
      ativo: p.status === "Ativo",
      origem: "prisma" as const,
    }));
}

export async function getPeca(id: string): Promise<PecaEstoque | undefined> {
  const list = await listPecas();
  return list.find((p) => p.id === id);
}

// Reserva e baixa são gerenciadas pelo OS adapter (os-estoque.ts).
// Estas funções retornam um movimento local para compatibilidade com a UI.

export async function reservarPeca(
  pecaId: string,
  quantidade: number,
  osId: string,
): Promise<MovimentoEstoque> {
  return {
    id: uid("mov"),
    storeId: CURRENT_STORE_ID,
    pecaId,
    tipo: "reserva",
    quantidade,
    origem: "os",
    origemId: osId,
    criadoEm: nowIso(),
  };
}

export async function baixarPeca(
  pecaId: string,
  quantidade: number,
  origem: "os" | "venda",
  origemId: string,
): Promise<MovimentoEstoque> {
  return {
    id: uid("mov"),
    storeId: CURRENT_STORE_ID,
    pecaId,
    tipo: "saida",
    quantidade,
    origem,
    origemId,
    criadoEm: nowIso(),
  };
}
