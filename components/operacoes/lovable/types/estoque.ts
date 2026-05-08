// Catálogo de peças/produtos disponíveis no estoque.
// Pronto para baixa automática quando uma OS for concluída.
export interface PecaEstoque {
  id: string;
  storeId: string;
  /** Id real do Produto (Prisma) quando aplicável. */
  produtoId?: string;
  sku: string;
  barcode?: string;
  nome: string;
  categoria?: string;
  unidade: "un" | "pc" | "mt" | "kg";
  custo: number;
  precoVenda: number;
  estoqueAtual: number;
  estoqueMinimo: number;
  ativo: boolean;
  origem?: "prisma" | "mock";
}

export interface MovimentoEstoque {
  id: string;
  storeId: string;
  pecaId: string;
  tipo: "entrada" | "saida" | "reserva" | "ajuste";
  quantidade: number;
  origem: "os" | "venda" | "compra" | "manual";
  origemId?: string;
  criadoEm: string;
}
