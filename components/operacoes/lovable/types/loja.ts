// Multi-loja: toda entidade operacional referencia uma loja.
export interface Loja {
  id: string;
  nome: string;
  cnpj?: string;
  cidade?: string;
  ativa: boolean;
}
