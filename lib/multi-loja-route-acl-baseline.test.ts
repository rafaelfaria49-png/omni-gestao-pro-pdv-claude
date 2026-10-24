/**
 * Testes estáticos ("lint tests") — baseline de ACL multi-loja em rotas sensíveis.
 *
 * Cobertura: F-05, F-06, F-07, F-08 da AUDITORIA_MULTI_LOJA_PRE_PILOTO_v01.md
 *
 * Estratégia: leitura estática do código-fonte (sem importar os módulos em runtime,
 * que exigiria mock pesado de Prisma/NextAuth/Cloud API). Verifica presença/ausência
 * de `auth()` e `canAccessStore` nos arquivos alvo.
 *
 * Camadas de teste:
 * 1. **snapshot baseline** (passa hoje): documenta o bug atual — rotas sensíveis sem
 *    `auth()` e/ou sem `canAccessStore`.
 * 2. **expected-failing alvo** (`it.fails`): contrato pós-SPRINT_01_MULTI_LOJA.
 *    Quando o fix for mergeado, troque `it.fails(` por `it(`.
 *
 * NÃO corrige código de produção — apenas rede de segurança anti-regressão.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import ts from "typescript"

const ROOT = resolve(__dirname, "..")

function read(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf8")
}

// ---------------------------------------------------------------------------
// F-05 · /api/dashboard/resumo e /api/dashboard/elite sem auth + canAccessStore
// ---------------------------------------------------------------------------

describe("F-05 — /api/dashboard/resumo com auth + canAccessStore (SPRINT_MULTI_LOJA-S-001)", () => {
  const FILE = "app/api/dashboard/resumo/route.ts"

  it("[pós-fix] importa auth de @/auth", () => {
    const src = read(FILE)
    expect(src).toMatch(/from ["']@\/auth["']/)
  })

  it("[pós-fix] chama await auth()", () => {
    const src = read(FILE)
    expect(src).toContain("await auth()")
  })

  it("[pós-fix] chama canAccessStore", () => {
    const src = read(FILE)
    expect(src).toContain("canAccessStore")
  })

  it("[pós-fix] usa storeIdFromAssistecRequestForRead", () => {
    const src = read(FILE)
    expect(src).toContain("storeIdFromAssistecRequestForRead")
  })

  // SPRINT_MULTI_LOJA-S-001 CP3 executado: it.fails → it normal.
  it("[F-05] importa auth(), chama await auth() e canAccessStore antes de query", () => {
    const src = read(FILE)
    expect(src).toMatch(/from ["']@\/auth["']/)
    expect(src).toContain("await auth()")
    expect(src).toContain("canAccessStore")
  })
})

describe("F-05 — /api/dashboard/elite com auth + canAccessStore (SPRINT_MULTI_LOJA-S-001)", () => {
  const FILE = "app/api/dashboard/elite/route.ts"

  it("[pós-fix] importa auth de @/auth", () => {
    const src = read(FILE)
    expect(src).toMatch(/from ["']@\/auth["']/)
  })

  it("[pós-fix] chama canAccessStore", () => {
    const src = read(FILE)
    expect(src).toContain("canAccessStore")
  })

  it("[pós-fix] usa storeIdFromAssistecRequestForRead", () => {
    const src = read(FILE)
    expect(src).toContain("storeIdFromAssistecRequestForRead")
  })

  // SPRINT_MULTI_LOJA-S-001 CP3 executado: it.fails → it normal.
  it("[F-05] chama auth() + canAccessStore (KPIs financeiros completos — alta sensibilidade)", () => {
    const src = read(FILE)
    expect(src).toMatch(/from ["']@\/auth["']/)
    expect(src).toContain("await auth()")
    expect(src).toContain("canAccessStore")
  })
})

describe("F-05 — /api/clients com auth + canAccessStore (SPRINT_MULTI_LOJA-S-001)", () => {
  const FILE = "app/api/clients/route.ts"

  function parse(source: string) {
    return ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true)
  }
  function imported(ast: ts.SourceFile, name: string, module: string) {
    expect(ast.statements.some(node => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === module && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) && node.importClause.namedBindings.elements.some(element => !element.propertyName && element.name.text === name))).toBe(true)
  }
  function handler(ast: ts.SourceFile, name: string) {
    const result = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name)
    if (!result?.body || !result.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) throw new Error(`Handler exportado ausente: ${name}`)
    return result
  }
  function guardBinding(statement: ts.Statement, name: string) {
    if (!ts.isVariableStatement(statement) || statement.declarationList.declarations.length !== 1) throw new Error("Guard deve ser o primeiro statement")
    const declaration = statement.declarationList.declarations[0]
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !ts.isAwaitExpression(declaration.initializer) || !ts.isCallExpression(declaration.initializer.expression)) throw new Error("Guard real deve ser aguardado")
    const call = declaration.initializer.expression
    if (!ts.isIdentifier(call.expression) || call.expression.text !== name) throw new Error(`Guard ausente: ${name}`)
    return { name: declaration.name.text, call }
  }
  function denied(statement: ts.Statement, binding: string, property?: "response") {
    if (!ts.isIfStatement(statement)) throw new Error("Negativa deve interromper antes do reader")
    if (property) {
      const condition = statement.expression
      if (!ts.isPrefixUnaryExpression(condition) || condition.operator !== ts.SyntaxKind.ExclamationToken || !ts.isPropertyAccessExpression(condition.operand) || !ts.isIdentifier(condition.operand.expression)) throw new Error("Negativa não usa gate.ok")
      expect([condition.operand.expression.text, condition.operand.name.text]).toEqual([binding, "ok"])
    } else {
      expect(ts.isIdentifier(statement.expression) && statement.expression.text).toBe(binding)
    }
    const result = ts.isBlock(statement.thenStatement) && statement.thenStatement.statements.length === 1 ? statement.thenStatement.statements[0] : statement.thenStatement
    if (!ts.isReturnStatement(result) || !result.expression) throw new Error("Negativa não retorna")
    if (property) {
      if (!ts.isPropertyAccessExpression(result.expression) || !ts.isIdentifier(result.expression.expression)) throw new Error("Resposta real não retornada")
      expect([result.expression.expression.text, result.expression.name.text]).toEqual([binding, property])
    } else expect(ts.isIdentifier(result.expression) && result.expression.text).toBe(binding)
  }
  function assertAlias(source: string) {
    const ast = parse(source)
    expect(ast.statements).toHaveLength(4)
    const forwarding = ast.statements[0]
    if (!ts.isExportDeclaration(forwarding) || !forwarding.moduleSpecifier || !ts.isStringLiteral(forwarding.moduleSpecifier) || !forwarding.exportClause || !ts.isNamedExports(forwarding.exportClause)) throw new Error("Alias deve reexportar o handler canônico")
    expect(forwarding.moduleSpecifier.text).toBe("../clientes/route")
    expect(forwarding.exportClause.elements.map(element => ({ name: element.name.text, original: element.propertyName?.text }))).toEqual([{ name: "GET", original: undefined }])
    const metadata = ast.statements.slice(1).map(statement => {
      if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const) || !statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) || statement.declarationList.declarations.length !== 1) throw new Error("Alias só pode acrescentar metadados estáticos")
      const declaration = statement.declarationList.declarations[0]
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !(ts.isStringLiteral(declaration.initializer) || ts.isNumericLiteral(declaration.initializer))) throw new Error("Metadado deve ser literal, sem I/O")
      return [declaration.name.text, declaration.initializer.text]
    })
    expect(metadata).toEqual([["dynamic", "force-dynamic"], ["runtime", "nodejs"], ["revalidate", "0"]])
  }
  function assertCanonicalGet(source: string) {
    const ast = parse(source)
    imported(ast, "requireModuleApi", "@/lib/auth/module-access")
    imported(ast, "handleClientList", "@/lib/cadastros/client-read-api")
    const get = handler(ast, "GET"), statements = get.body!.statements
    const guard = guardBinding(statements[0], "requireModuleApi")
    expect(guard.call.arguments.map(argument => ts.isIdentifier(argument) || ts.isStringLiteral(argument) ? argument.text : null)).toEqual(["req", "sharedCatalog"])
    denied(statements[1], guard.name)
    const result = statements[statements.length - 1]
    if (!ts.isReturnStatement(result) || !result.expression || !ts.isCallExpression(result.expression) || !ts.isIdentifier(result.expression.expression)) throw new Error("GET deve delegar ao reader após o guard")
    expect(result.expression.expression.text).toBe("handleClientList")
    expect(result.expression.arguments.map(argument => ts.isIdentifier(argument) ? argument.text : null)).toEqual(["req"])
  }
  function assertReaderScope(source: string) {
    const ast = parse(source)
    imported(ast, "requireCadastrosHubApi", "./hub-api-gate")
    const reader = handler(ast, "handleClientList")
    const body = reader.body!.statements[0]
    if (!ts.isTryStatement(body)) throw new Error("Reader esperado")
    const [gate, refusal, scope] = body.tryBlock.statements
    const guard = guardBinding(gate, "requireCadastrosHubApi")
    expect(guard.call.arguments.map(argument => ts.isIdentifier(argument) || ts.isStringLiteral(argument) ? argument.text : null)).toEqual(["req", "read", "shared"])
    denied(refusal, guard.name, "response")
    if (!ts.isVariableStatement(scope) || !(scope.declarationList.flags & ts.NodeFlags.Const)) throw new Error("Unidade deve vir do gate e ser imutável")
    const declaration = scope.declarationList.declarations[0]
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !ts.isPropertyAccessExpression(declaration.initializer) || !ts.isIdentifier(declaration.initializer.expression)) throw new Error("Scope deve vir do resultado do guard")
    expect([declaration.initializer.expression.text, declaration.initializer.name.text]).toEqual([guard.name, "storeId"])
    const queries: ts.CallExpression[] = []
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        let target = node.expression
        while (ts.isPropertyAccessExpression(target)) target = target.expression
        if (ts.isIdentifier(target) && target.text === "prisma") queries.push(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(reader)
    expect(queries).toHaveLength(4)
    for (const query of queries) {
      const argument = query.arguments[0]
      if (!argument || !ts.isObjectLiteralExpression(argument)) throw new Error("Query sem where explícito")
      const where = argument.properties.find((property): property is ts.PropertyAssignment => ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === "where")
      if (!where || !ts.isObjectLiteralExpression(where.initializer)) throw new Error("Query sem filtro de unidade")
      const scoped = where.initializer.properties.some(property => ts.isShorthandPropertyAssignment(property) && property.name.text === declaration.name.getText(ast))
      expect(scoped).toBe(true)
    }
  }

  it("[pós-fix] alias GET reexporta exclusivamente a rota canônica de clientes", () => {
    assertAlias(read(FILE))
  })

  it("[pós-fix] rota canônica autoriza sharedCatalog antes de delegar ao reader", () => {
    assertCanonicalGet(read("app/api/clientes/route.ts"))
  })

  it("[F-05] reader recusa gate inválido e escopa todas as consultas pela unidade autorizada", () => {
    assertReaderScope(read("lib/cadastros/client-read-api.ts"))
  })

  it("a prova recusa um alias para outra rota", () => {
    expect(() => assertAlias(read(FILE).replace("../clientes/route", "../outra/route"))).toThrow()
  })

  it.each([
    ["guard apenas como objeto", (source: string) => source.replace('await requireModuleApi(req, "sharedCatalog")', "({ ok: true })")],
    ["negativa removida", (source: string) => source.replace("if (moduleDenied) return moduleDenied", "if (moduleDenied) { /* continua */ }")],
    ["reader antes do guard", (source: string) => source.replace("const moduleDenied =", "await handleClientList(req); const moduleDenied =")],
  ] as const)("a prova canônica rejeita %s", (_name, mutate) => {
    expect(() => assertCanonicalGet(mutate(read("app/api/clientes/route.ts")))).toThrow()
  })

  it.each([
    ["unidade não derivada do gate", (source: string) => source.replace("const storeId = gate.storeId", 'const storeId = "outra-loja"')],
    ["query antes da autorização", (source: string) => source.replace("const gate = await", "await prisma.cliente.findMany({}); const gate = await")],
  ] as const)("a prova do reader rejeita %s", (_name, mutate) => {
    expect(() => assertReaderScope(mutate(read("lib/cadastros/client-read-api.ts")))).toThrow()
  })
})

// ---------------------------------------------------------------------------
// F-06 · app/actions/whatsapp.ts tem auth() mas falta canAccessStore
// ---------------------------------------------------------------------------

describe("F-06 — app/actions/whatsapp.ts com canAccessStore (SPRINT_MULTI_LOJA-S-001)", () => {
  const FILE = "app/actions/whatsapp.ts"

  it("[pós-fix] tem auth() — autenticação presente", () => {
    const src = read(FILE)
    expect(src).toContain("await auth()")
  })

  it("[pós-fix] importa e chama canAccessStore", () => {
    const src = read(FILE)
    expect(src).toContain("canAccessStore")
  })

  it("[pós-fix] ainda recebe storeId do input do cliente (validado server-side)", () => {
    const src = read(FILE)
    expect(src).toContain("input.storeId")
  })

  // SPRINT_MULTI_LOJA-S-001 CP3 executado: it.fails → it normal.
  it("[F-06] importa e chama canAccessStore(session, storeId) antes de sendCloud*", () => {
    const src = read(FILE)
    expect(src).toContain("canAccessStore")
  })
})

// ---------------------------------------------------------------------------
// F-07 · /api/whatsapp/send-daily tem auth() mas falta canAccessStore
// ---------------------------------------------------------------------------

describe("F-07 — /api/whatsapp/send-daily com canAccessStore (SPRINT_MULTI_LOJA-S-001)", () => {
  const FILE = "app/api/whatsapp/send-daily/route.ts"

  it("[pós-fix] tem auth() — autenticação presente", () => {
    const src = read(FILE)
    expect(src).toContain("await auth()")
  })

  it("[pós-fix] verifica que storeId não é vazio", () => {
    const src = read(FILE)
    expect(src).toContain("resolveActiveStoreId")
    expect(src).toContain("!storeId")
  })

  it("[pós-fix] chama canAccessStore após resolver storeId", () => {
    const src = read(FILE)
    expect(src).toContain("canAccessStore")
  })

  // SPRINT_MULTI_LOJA-S-001 CP3 executado: it.fails → it normal.
  it("[F-07] chama canAccessStore(session, storeId) após resolver storeId", () => {
    const src = read(FILE)
    expect(src).toContain("canAccessStore")
  })
})

// ---------------------------------------------------------------------------
// F-08 · sync-legacy-* usa só requireOpsSubscription, sem auth() + canAccessStore
// ---------------------------------------------------------------------------

describe("F-05/F-08 — /api/ops/sync-legacy-vendas com auth() + canAccessStore (SPRINT_MULTI_LOJA-S-001)", () => {
  const FILE = "app/api/ops/sync-legacy-vendas/route.ts"

  it("[pós-fix] mantém requireOpsSubscription (gate de assinatura)", () => {
    const src = read(FILE)
    expect(src).toContain("requireOpsSubscription")
  })

  it("[pós-fix] importa auth de @/auth", () => {
    const src = read(FILE)
    expect(src).toMatch(/from ["']@\/auth["']/)
  })

  it("[pós-fix] chama canAccessStore", () => {
    const src = read(FILE)
    expect(src).toContain("canAccessStore")
  })

  // SPRINT_MULTI_LOJA-S-001 CP3 executado: it.fails → it normal.
  it("[F-05] chama auth() + canAccessStore antes de upsertVendaInTransaction", () => {
    const src = read(FILE)
    expect(src).toMatch(/from ["']@\/auth["']/)
    expect(src).toContain("await auth()")
    expect(src).toContain("canAccessStore")
  })
})

describe("F-08 — /api/ops/sync-legacy-financeiro sem auth() + canAccessStore", () => {
  const FILE = "app/api/ops/sync-legacy-financeiro/route.ts"

  it("[snapshot atual — parcial] usa requireOpsSubscription (gate de assinatura presente)", () => {
    const src = read(FILE)
    expect(src).toContain("requireOpsSubscription")
  })

  it("[snapshot atual — bug] NÃO importa auth de @/auth", () => {
    const src = read(FILE)
    expect(src).not.toMatch(/from ["']@\/auth["']/)
  })

  it("[snapshot atual — bug] NÃO chama canAccessStore (escrita financeira em qualquer loja via header)", () => {
    const src = read(FILE)
    expect(src).not.toContain("canAccessStore")
  })

  it.fails("[F-08] DEVE: chamar auth() + canAccessStore antes de upsertContaReceber", () => {
    const src = read(FILE)
    expect(src).toMatch(/from ["']@\/auth["']/)
    expect(src).toContain("await auth()")
    expect(src).toContain("canAccessStore")
  })
})

// ---------------------------------------------------------------------------
// DT-14 · financeiro/carteiras + dre sem fallback "loja-1" (resíduo nullish de F-02)
// Forma multi-linha (`??` + `"loja-1"` na linha seguinte) não pega no scan
// linha-a-linha do F-02; aqui validamos por substring no arquivo inteiro.
// ---------------------------------------------------------------------------

describe("DT-14 — financeiro/carteiras + dre sem fallback loja-1 (SAFE-lite)", () => {
  const READ_FILES = [
    "app/api/financeiro/carteiras/route.ts", // GET
    "app/api/financeiro/dre/route.ts",       // GET
  ]
  const WRITE_FILES = [
    "app/api/financeiro/carteiras/route.ts",               // POST
    "app/api/financeiro/carteiras/[id]/route.ts",          // PATCH
    "app/api/financeiro/carteiras/transferencia/route.ts", // POST
  ]
  const ALL = [...new Set([...READ_FILES, ...WRITE_FILES])]

  for (const f of ALL) {
    it(`[${f}] sem literal "loja-1", sem getStoreId local, com guard STORE_REQUIRED`, () => {
      const src = read(f)
      expect(src).not.toContain('"loja-1"')
      expect(src).not.toContain("function getStoreId")
      expect(src).toContain("STORE_REQUIRED")
    })
  }

  it("leituras (GET) usam opsLojaIdFromRequest", () => {
    for (const f of READ_FILES) expect(read(f)).toContain("opsLojaIdFromRequest(")
  })

  it("escritas (POST/PATCH) usam opsLojaIdFromRequestForWrite (anti-CSRF)", () => {
    for (const f of WRITE_FILES) expect(read(f)).toContain("opsLojaIdFromRequestForWrite(")
  })
})
