/**
 * Inventário estático dos writers de `Cliente` encontrados na auditoria
 * CAD-R2-018-A. Não migra nenhum writer (isso é CAD-R2-008).
 */
export type ClientWriterKind =
  | "INTERACTIVE"
  | "REST"
  | "IMPORT"
  | "QUICK_CREATE"
  | "BACKGROUND"
  | "DRAFT_APPLY"
  | "DELETE_MERGE"
  | "DEAD"

export type ClientWriterInventoryEntry = {
  id: string
  kind: ClientWriterKind
  path: string
  writes: boolean
  notes: string
}

export const CLIENT_WRITER_INVENTORY: readonly ClientWriterInventoryEntry[] = [
  {
    id: "action-createCliente",
    kind: "INTERACTIVE",
    path: "app/actions/cadastros.ts#createCliente",
    writes: true,
    notes: "Adapter fino → ClientWriteService. storeId via requireCadastrosActionAccess.",
  },
  {
    id: "action-updateCliente",
    kind: "INTERACTIVE",
    path: "app/actions/cadastros.ts#updateCliente",
    writes: true,
    notes: "Adapter fino → ClientWriteService. findFirst {id, storeId} no service.",
  },
  {
    id: "os-criarCliente",
    kind: "INTERACTIVE",
    path: "components/operacoes/lovable/api/clientes.ts#criarCliente",
    writes: true,
    notes: "Wrapper da Nova OS — delega a createCliente (ClientWriteService). Não é um segundo motor.",
  },
  {
    id: "os-v3-resolver",
    kind: "QUICK_CREATE",
    path: "lib/operacoes-v3/cliente-resolver.ts",
    writes: true,
    notes: "Resolve cliente para OS V3. Criação via criarCliente → ClientWriteService. Cliente Balcão é singleton operacional por nome, não regra geral de dedupe.",
  },
  {
    id: "rest-post-clientes",
    kind: "REST",
    path: "app/api/clientes/route.ts#POST",
    writes: true,
    notes: "CRUD admin. Adapter fino → ClientWriteService. Gate requireCadastrosHubApi write/admin.",
  },
  {
    id: "rest-patch-cliente",
    kind: "REST",
    path: "app/api/clientes/[id]/route.ts#PATCH",
    writes: true,
    notes: "Adapter fino → ClientWriteService. PATCH omit vs clear no service.",
  },
  {
    id: "rest-quick-create",
    kind: "QUICK_CREATE",
    path: "app/api/clientes/quick/route.ts#POST",
    writes: true,
    notes: "Cadastro rápido do PDV. Adapter fino → ClientWriteService. phone opcional (validação no adapter).",
  },
  {
    id: "import-json",
    kind: "IMPORT",
    path: "lib/import-clientes-json.ts",
    writes: true,
    notes: "Import JSON. Adapter fino → ClientWriteService. Sem match por nome/telefone próprio.",
  },
  {
    id: "import-handler",
    kind: "IMPORT",
    path: "lib/clientes-import-handler.ts#importClientesItems",
    writes: true,
    notes: "Import handler. Adapter fino → ClientWriteService. Rotas /api/ops/import/clientes.",
  },
  {
    id: "import-avancado",
    kind: "IMPORT",
    path: "lib/importador-avancado/persistidor.ts#persistirClientes",
    writes: true,
    notes: "Adapter fino → ClientWriteService. Sem dedupe próprio por documento/nome.",
  },
  {
    id: "import-smart-genius",
    kind: "IMPORT",
    path: "lib/importador-avancado/smart-genius/persistir.ts#persistirClientesSmart",
    writes: true,
    notes: "Adapter fino → ClientWriteService. Nome NÃO é identidade.",
  },
  {
    id: "rest-bulk-action",
    kind: "DELETE_MERGE",
    path: "app/api/clientes/bulk-action/route.ts",
    writes: true,
    notes: "Inativa via updateClientTx (active). Exclui permanece fora do ClientWriteService.",
  },
  {
    id: "rest-bulk-delete",
    kind: "DELETE_MERGE",
    path: "app/api/clientes/bulk-delete/route.ts",
    writes: true,
    notes: "deleteMany store-scoped. Sem consolidação de duplicatas.",
  },
  {
    id: "rest-delete-id",
    kind: "DELETE_MERGE",
    path: "app/api/clientes/[id]/route.ts#DELETE",
    writes: true,
    notes: "deleteMany {id, storeId}. Sem merge.",
  },
  {
    id: "script-reimport",
    kind: "DEAD",
    path: "scripts/reimport-clientes.mjs",
    writes: true,
    notes: "Script operacional legado (colunas lojaId/nome/nomeNorm inexistentes no schema atual). Fora do runtime.",
  },
  {
    id: "script-cleanup",
    kind: "BACKGROUND",
    path: "scripts/cleanup-recent-clientes.mjs",
    writes: true,
    notes: "Script de limpeza. Não é merge de identidade.",
  },
  {
    id: "script-migrate-loja",
    kind: "DEAD",
    path: "scripts/migrate-loja-ids.mjs",
    writes: true,
    notes: "Usa coluna lojaId inexistente no schema Prisma atual.",
  },
  {
    id: "cross-store-stub",
    kind: "DEAD",
    path: "lib/clientes-cross-store-import.stub.ts",
    writes: false,
    notes: "Stub. UI flag false. Import entre lojas NÃO implementado.",
  },
  {
    id: "lovable-getCliente",
    kind: "DEAD",
    path: "components/operacoes/lovable/api/clientes.ts#getCliente",
    writes: false,
    notes: "Sempre retorna undefined. Sem persistência.",
  },
] as const

export const ACTIVE_CLIENT_WRITERS = CLIENT_WRITER_INVENTORY.filter((w) => w.writes && w.kind !== "DEAD")

export const CLIENT_IDENTITY_FIELDS = [
  "storeId",
  "name",
  "kind",
  "document",
  "phone",
  "email",
  "city",
  "tags",
] as const
