// Catálogo de peças/produtos disponíveis no estoque.
// Pronto para baixa automática quando uma OS for concluída.
export interface PecaEstoque {
  id: string;
  storeId: string;
  sku: string;
  nome: string;
  categoria?: string;
  unidade: "un" | "pc" | "mt" | "kg";
  custo: number;
  precoVenda: number;
  estoqueAtual: number;
  estoqueMinimo: number;
  ativo: boolean;
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
