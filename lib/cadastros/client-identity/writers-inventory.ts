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
    notes: "Server Action do Cadastros HUB. storeId via requireCadastrosActionAccess.",
  },
  {
    id: "action-updateCliente",
    kind: "INTERACTIVE",
    path: "app/actions/cadastros.ts#updateCliente",
    writes: true,
    notes: "Server Action de edição. findFirst {id, storeId} antes do update.",
  },
  {
    id: "os-criarCliente",
    kind: "INTERACTIVE",
    path: "components/operacoes/lovable/api/clientes.ts#criarCliente",
    writes: true,
    notes: "Wrapper da Nova OS — delega a createCliente. Não é um segundo motor.",
  },
  {
    id: "os-v3-resolver",
    kind: "QUICK_CREATE",
    path: "lib/operacoes-v3/cliente-resolver.ts",
    writes: true,
    notes: "Resolve/cria cliente para OS V3 (novo + Cliente Balcão por nome).",
  },
  {
    id: "rest-post-clientes",
    kind: "REST",
    path: "app/api/clientes/route.ts#POST",
    writes: true,
    notes: "CRUD admin. Gate requireCadastrosHubApi write/admin. Sem dedupe.",
  },
  {
    id: "rest-patch-cliente",
    kind: "REST",
    path: "app/api/clientes/[id]/route.ts#PATCH",
    writes: true,
    notes: "updateMany {id, storeId}. Sem identidade canônica.",
  },
  {
    id: "rest-quick-create",
    kind: "QUICK_CREATE",
    path: "app/api/clientes/quick/route.ts#POST",
    writes: true,
    notes: "Cadastro rápido do PDV. phone opcional. Sem dedupe.",
  },
  {
    id: "import-json",
    kind: "IMPORT",
    path: "lib/import-clientes-json.ts",
    writes: true,
    notes: "Match por phone cru ou name exato na store. Sem DV de documento.",
  },
  {
    id: "import-handler",
    kind: "IMPORT",
    path: "lib/clientes-import-handler.ts#importClientesItems",
    writes: true,
    notes: "Mesma heurística phone/name. Rotas /api/ops/import/clientes.",
  },
  {
    id: "import-avancado",
    kind: "IMPORT",
    path: "lib/importador-avancado/persistidor.ts#persistirClientes",
    writes: true,
    notes: "Dedupe por docDigitsForDedupe (11/14 sem DV) + nome. Store-scoped.",
  },
  {
    id: "import-smart-genius",
    kind: "IMPORT",
    path: "lib/importador-avancado/smart-genius/persistir.ts#persistirClientesSmart",
    writes: true,
    notes: "Dedupe por nome case-insensitive. Sem documento. Dívida para 008.",
  },
  {
    id: "rest-bulk-action",
    kind: "DELETE_MERGE",
    path: "app/api/clientes/bulk-action/route.ts",
    writes: true,
    notes: "Inativa ou exclui. Não faz merge de identidade.",
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
    kind: "BACKGROUND",
    path: "scripts/reimport-clientes.mjs",
    writes: true,
    notes: "Script operacional. Fora do runtime da app.",
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
