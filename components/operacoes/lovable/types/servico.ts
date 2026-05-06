// Catálogo de Serviços ofertados pela assistência.
// Cada serviço tem custo interno (oculto ao cliente), valor de venda
// e termo de garantia padrão aplicado automaticamente quando usado em uma OS.
export interface CatalogoServico {
  id: string;
  storeId: string;
  nome: string;
  categoria?: string;
  custoInterno: number;     // valor pago pela loja (oculto ao cliente)
  valorVenda: number;       // valor cobrado do cliente
  prazoGarantiaDias: number;
  termoGarantia: string;    // texto longo, exibido no fechamento e impresso
  ativo: boolean;
}
