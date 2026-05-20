import type { Cliente } from "@/types/os";
import { DEFAULT_STORE_ID } from "./lojasSeed";

// Clientes "reais" do CRM. As OS apontam para estes via clienteId.
export interface ClienteRecord extends Cliente {
  storeId: string;
  criadoEm: string;
}

export const CLIENTES_SEED: ClienteRecord[] = [
  { id: "c1", storeId: DEFAULT_STORE_ID, nome: "Patrícia Almeida", telefone: "(11) 99812-4421", whatsapp: "(11) 99812-4421", email: "patricia.almeida@email.com", criadoEm: "2025-08-12T10:00:00Z" },
  { id: "c2", storeId: DEFAULT_STORE_ID, nome: "Marcos Fernandes", telefone: "(21) 98432-1100", email: "marcos.f@empresa.com.br", criadoEm: "2025-09-01T10:00:00Z" },
  { id: "c3", storeId: DEFAULT_STORE_ID, nome: "Construtora Vértice LTDA", documento: "32.114.998/0001-22", telefone: "(11) 4002-8922", email: "ti@vertice.com.br", criadoEm: "2024-11-20T10:00:00Z" },
  { id: "c4", storeId: DEFAULT_STORE_ID, nome: "Eduardo Tanaka", telefone: "(11) 97755-2210", whatsapp: "(11) 97755-2210", criadoEm: "2025-10-04T10:00:00Z" },
  { id: "c5", storeId: "loja_rj", nome: "Beatriz Moraes", telefone: "(31) 99221-7788", criadoEm: "2025-07-19T10:00:00Z" },
  { id: "c6", storeId: DEFAULT_STORE_ID, nome: "Gustavo Lima", telefone: "(48) 99114-2002", criadoEm: "2025-06-02T10:00:00Z" },
];
