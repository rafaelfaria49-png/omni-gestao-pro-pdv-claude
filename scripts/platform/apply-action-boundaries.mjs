import fs from "node:fs"
import ts from "typescript"
const inventory = []
const modules = { "estoque.ts": "stock", "inventario.ts": "stock", "operacoes.ts": "service", "ordens.ts": "service", "whatsapp.ts": "whatsapp", "vendas-enterprise.ts": "sales", "terminais.ts": "pdv", "produto-ia.ts": "ai", "produto-texto-livre.ts": "catalog", "cliente-texto-livre.ts": "catalog", "cadastros.ts": "catalog", "omni-agent.ts": "agent", "omni-agent-memory.ts": "agent", "omni-agent-timeline.ts": "agent", "backfill-venda-cliente.ts": "platform" }
for (const [file, defaultModule] of Object.entries(modules)) {
  const full = `app/actions/${file}`
  let source = fs.readFileSync(full, "utf8")
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const edits = []
  for (const node of ast.statements) {
    if (!ts.isFunctionDeclaration(node) || !node.name || !node.body || !node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue
    const name = node.name.text
    if (name === "listLojasCadastros") {
      inventory.push({ file: full, action: name, module: "own-server-policy", store: "session memberships" })
      continue
    }
    const params = node.parameters.map((p) => p.name.getText(ast))
    let accessModule = defaultModule
    if (name === "listVendasHub") accessModule = "sales"
    if (["listClientes", "listProdutos", "createCliente"].includes(name)) accessModule = "sharedCatalog"
    if (file === "terminais.ts" && name !== "listTerminais") accessModule = "settings"
    if (["listTecnicos", "upsertTecnico", "listServicos", "upsertServico"].includes(name)) accessModule = "service"
    if (["listEquipamentosModelos", "upsertEquipamentoModelo"].includes(name)) accessModule = "deviceCatalog"
    if (name === "countMarketplaceListings") accessModule = "marketplace"
    let store = params.find((p) => ["storeId", "lojaId", "_storeId"].includes(p))
    if (!store && params[0] === "input") store = "input.storeId"
    if (!store && params[0] === "os") store = "os.storeId"
    if (!store && params[0] === "reqLike") store = "storeIdFromAssistecRequestForWrite(reqLike as unknown as Request) || \"\""
    if (!store) accessModule = "platform"
    const call = accessModule === "platform" ? "await requirePlatformAction()" : `await requireModuleAction(${store}, ${JSON.stringify(accessModule)})`
    inventory.push({ file: full, action: name, module: accessModule, store: store || "platform" })
    if (!node.body.getText(ast).includes(call)) edits.push({ pos: node.body.getStart(ast) + 1, text: `\n  ${call}\n` })
  }
  for (const edit of edits.sort((a, b) => b.pos - a.pos)) source = source.slice(0, edit.pos) + edit.text + source.slice(edit.pos)
  if (edits.length && !source.includes('from "@/lib/auth/module-access"')) {
    // Preserva a diretiva use server como primeira instrução.
    const at = source.indexOf("\n") + 1
    source = source.slice(0, at) + 'import { requireModuleAction, requirePlatformAction } from "@/lib/auth/module-access"\n' + source.slice(at)
  }
  if (edits.length) fs.writeFileSync(full, source)
}
fs.writeFileSync("docs/platform/ACTION_ACCESS_INVENTORY.json", JSON.stringify(inventory, null, 2) + "\n")
console.log(`Inventário de ${inventory.length} Server Actions protegido no servidor.`)
