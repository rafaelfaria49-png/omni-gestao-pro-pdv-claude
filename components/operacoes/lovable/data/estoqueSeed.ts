import type { PecaEstoque } from "@/types/estoque";
import { DEFAULT_STORE_ID } from "./lojasSeed";

export const PECAS_SEED: PecaEstoque[] = [
  { id: "pe_001", storeId: DEFAULT_STORE_ID, sku: "HP-M404-KT", nome: "Kit de tração HP M404", categoria: "Impressoras", unidade: "un", custo: 180, precoVenda: 289.9, estoqueAtual: 4, estoqueMinimo: 2, ativo: true },
  { id: "pe_002", storeId: DEFAULT_STORE_ID, sku: "KNG-NV500", nome: "SSD NVMe 500GB Kingston", categoria: "Armazenamento", unidade: "un", custo: 240, precoVenda: 349, estoqueAtual: 12, estoqueMinimo: 3, ativo: true },
  { id: "pe_003", storeId: DEFAULT_STORE_ID, sku: "SMG-S22-TLA", nome: "Tela Samsung Galaxy S22", categoria: "Telas", unidade: "un", custo: 420, precoVenda: 690, estoqueAtual: 2, estoqueMinimo: 2, ativo: true },
  { id: "pe_004", storeId: DEFAULT_STORE_ID, sku: "BAT-IP13", nome: "Bateria iPhone 13 original", categoria: "Baterias", unidade: "un", custo: 180, precoVenda: 320, estoqueAtual: 6, estoqueMinimo: 3, ativo: true },
  { id: "pe_005", storeId: DEFAULT_STORE_ID, sku: "TCL-ACR-A5", nome: "Teclado Acer Aspire 5 ABNT2", categoria: "Periféricos", unidade: "un", custo: 95, precoVenda: 180, estoqueAtual: 5, estoqueMinimo: 2, ativo: true },
  { id: "pe_006", storeId: DEFAULT_STORE_ID, sku: "PSTA-TRM", nome: "Pasta térmica premium 4g", categoria: "Insumos", unidade: "un", custo: 12, precoVenda: 35, estoqueAtual: 30, estoqueMinimo: 10, ativo: true },
];
