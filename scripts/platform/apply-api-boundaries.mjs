/** Materializa gates em cada handler e inventário explícito para revisão/CI. Sem acesso ao banco. */
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const root = process.cwd()
const publicExact = new Set([
  "auth/[...nextauth]", "auth/contador", "webhooks/stripe", "webhooks/whatsapp", "whatsapp/webhook",
  "meta-whatsapp-verify", "subscription/verify", "version", "debug/build-version", "debug/pdv-layouts-version",
])
const manual = new Set(["admin/users", "admin/users/[id]", "account/password", "platform/provision", "platform/stores/[id]/access", "subscription/seal"])
const inventory = []
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])
function accessFor(route, method) {
  if (publicExact.has(route) || route.startsWith("internal/fiscal/") || /^contador-externo\/(auth|convite|lojas)(\/|$)/.test(route)) return "external-contract"
  if (manual.has(route)) return "own-server-policy"
  if (route === "stores") return method === "GET" ? "authenticated" : "platform"
  if (route === "stores/[id]") return method === "GET" ? "authenticated" : method === "PUT" ? "settings" : "platform"
  if (route === "stores/[id]/settings") return method === "GET" ? "authenticated" : "settings"
  if (route.startsWith("stores/")) return "platform"
  if (route.startsWith("admin/")) return "platform"
  if (route === "auth/admin") return method === "DELETE" ? "own-server-policy" : "sharedPayment"
  if (/^billing\//.test(route)) return "billing"
  if (/^(credits|user\/credits)(\/|$)/.test(route)) return "ai"
  if (/^(marketing|ia-mestre|ai|whatsapp|marketplace)(\/|$)/.test(route)) return ({ marketing: "marketing", "ia-mestre": "ai", ai: "ai", whatsapp: "whatsapp", marketplace: "marketplace" })[route.split("/")[0]]
  if (route.startsWith("contador-externo/usuarios/")) return "platform"
  if (route.startsWith("contador/") || route.startsWith("contador-externo/")) return "accountant"
  if (route.startsWith("fiscal/") || route.endsWith("/solicitar-emissao")) return "fiscal"
  if (route.startsWith("catalogo/")) return "deviceCatalog"
  if (route.startsWith("product/") || route.startsWith("vision/")) return "ai"
  if (route.startsWith("finance/")) return "platform" // API legada global; usar Financeiro canônico para escopo local.
  if (route.startsWith("financeiro/")) return "finance"
  if (route.startsWith("pessoas/")) return "platform"
  if (route === "config-audit" || route === "audit/logs") return "platform"
  if (route === "audit/log") return "authenticated"
  if (route === "print/raw") return "platform" // Ponte TCP de ambiente interno.
  if (route === "dashboard/elite") return "platform"
  if (route === "dashboard/resumo") return "home"
  if (route === "settings/perfil-loja") return method === "GET" ? "authenticated" : "settings"
  if (/^(clientes|clients)(\/|$)/.test(route)) return ["GET", "HEAD"].includes(method) || ["clientes/quick", "clientes/search", "clientes/match-by-phone"].includes(route) ? "sharedCatalog" : "catalog"
  if (/^produtos(\/|$)/.test(route)) return method === "GET" ? "sharedCatalog" : "catalog"
  if (/^pdv\//.test(route)) return "sharedPayment"
  if (/^vendas(\/|$)/.test(route)) return "sales"
  if (route === "automation/handle-event") return "sharedPayment"
  if (route === "ops/sync-ledger") return "sharedPayment"
  if (route === "ops/ordens" || route === "ops/ordens/import" || route === "ops/servicos" || route.startsWith("ordens-servico")) return "service"
  if (route === "ops/inventory" || route === "ops/inventory/lookup" || route === "ops/categorias-produto") return "sharedCatalog"
  if (route === "ops/inventory/import") return "catalog"
  if (route === "ops/contas-receber-list" || route === "ops/credito-cliente" || route.startsWith("ops/terminal/") || route.startsWith("ops/devolu")) return "sharedPayment"
  if (route.startsWith("ops/caixa/")) return "cash"
  if (route === "ops/vendas-list" || route.startsWith("ops/venda-persist") || route === "ops/vendas/by-client-sale-id") return "sales"
  // Importação, recovery, sincronizadores legados e diagnóstico não integram o pacote piloto.
  return "platform"
}

for (const file of walk(path.join(root, "app/api")).filter((f) => f.endsWith(path.sep + "route.ts"))) {
  let source = fs.readFileSync(file, "utf8")
  const relative = path.relative(root, file).replaceAll(path.sep, "/")
  const route = relative.slice("app/api/".length, -"/route.ts".length)
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const edits = []
  if (route === "auth/[...nextauth]") for (const method of ["GET", "POST"]) inventory.push({ file: relative, method, access: "external-contract" })
  if (route === "clients") inventory.push({ file: relative, method: "GET", access: "sharedCatalog", delegatesTo: "app/api/clientes/route.ts" })
  if (route === "ops/import/clientes") inventory.push({ file: relative, method: "GET", access: "sharedCatalog", delegatesTo: "app/api/clientes/importar/route.ts" })
  let needsImport = false
  for (const node of ast.statements) {
    if (!ts.isFunctionDeclaration(node) || !node.name || !node.body || !node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue
    const method = node.name.text
    if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(method)) continue
    const access = accessFor(route, method)
    inventory.push({ file: relative, method, access })
    if (["external-contract", "own-server-policy"].includes(access)) continue
    const existing = node.body.getText(ast)
    const previous = existing.match(/const moduleDenied = await requireModuleApi\((\w+), "([^"]+)"\)/)
    if (previous) {
      if (previous[2] !== access) edits.push({ pos: node.body.getStart(ast) + previous.index, length: previous[0].length,
        text: `const moduleDenied = await requireModuleApi(${previous[1]}, ${JSON.stringify(access)})` })
      continue
    }
    const param = node.parameters[0]
    let arg = "accessRequest"
    if (param) {
      if (!ts.isIdentifier(param.name)) throw new Error(`REVIEW_DESTRUCTURED_HANDLER: ${relative}`)
      arg = param.name.text
    } else {
      const start = node.body.pos
      const segment = source.slice(node.name.end, start)
      const at = node.name.end + segment.lastIndexOf(")")
      edits.push({ pos: at, text: "accessRequest: Request" })
    }
    edits.push({ pos: node.body.getStart(ast) + 1, text: `\n  const moduleDenied = await requireModuleApi(${arg}, ${JSON.stringify(access)})\n  if (moduleDenied) return moduleDenied\n` })
    needsImport = true
  }
  for (const edit of edits.sort((a, b) => b.pos - a.pos)) source = source.slice(0, edit.pos) + edit.text + source.slice(edit.pos + (edit.length || 0))
  if (needsImport && !source.includes('import { requireModuleApi }')) source = 'import { requireModuleApi } from "@/lib/auth/module-access"\n' + source
  if (edits.length) fs.writeFileSync(file, source)
}
fs.writeFileSync("docs/platform/API_ACCESS_INVENTORY.json", JSON.stringify(inventory.sort((a, b) => a.file.localeCompare(b.file) || a.method.localeCompare(b.method)), null, 2) + "\n")
console.log(`Inventário: ${inventory.length} handlers; gates nos próprios handlers, contratos externos preservados.`)
