import type { Loja } from "@/types/loja";

export const LOJAS_SEED: Loja[] = [
  { id: "loja_matriz", nome: "Matriz — São Paulo", cnpj: "12.345.678/0001-90", cidade: "São Paulo/SP", ativa: true },
  { id: "loja_rj", nome: "Filial — Rio de Janeiro", cnpj: "12.345.678/0002-71", cidade: "Rio de Janeiro/RJ", ativa: true },
];

export const DEFAULT_STORE_ID = "loja_matriz";
