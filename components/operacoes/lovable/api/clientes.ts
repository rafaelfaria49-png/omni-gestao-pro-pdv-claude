import { db } from "./_db";
import { delay } from "./_helpers";
import type { ClienteRecord } from "@/data/clientesSeed";

export async function listClientes(storeId?: string): Promise<ClienteRecord[]> {
  await delay();
  return storeId ? db.clientes.filter((c) => c.storeId === storeId) : [...db.clientes];
}

export async function getCliente(id: string): Promise<ClienteRecord | undefined> {
  await delay(40);
  return db.clientes.find((c) => c.id === id);
}
