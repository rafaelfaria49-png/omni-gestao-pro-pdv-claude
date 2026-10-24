/**
 * GOAL_SEGURANCA_CORRECAO_VENDA_MULTILOJA — testes da camada de autorização das
 * rotas de correção de venda (`/api/vendas/[id]/corrigir*`).
 *
 * Duas camadas:
 *  1. **Comportamental** — exercita `requireCorrecaoVendaAuth` de verdade, mockando
 *     `@/auth` (sessão), o I/O Prisma e o fallback legado. Membership, módulos e
 *     permissões de papel continuam nos guards reais, sem autoridade PLATFORM.
 *  2. **Wiring estático** ("lint test", padrão de multi-loja-route-acl-baseline) —
 *     garante que cada uma das 5 rotas corrigir* realmente chama o guard, mantém o PIN
 *     e escopa por loja. Anti-regressão: ninguém adiciona uma rota corrigir* sem ACL.
 *
 * Escopo de loja do PIN (decisão do GOAL): o PIN vive em `User` (global, sem storeId).
 * O limite de loja é garantido pela SESSÃO do operador — um operador restrito a outra
 * loja é bloqueado por `canAccessStore` ANTES de o PIN importar.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it, expect, vi, beforeEach } from "vitest"
import ts from "typescript"

const h = vi.hoisted(() => ({
  authMock: vi.fn(),
  subMock: vi.fn(),
  prismaQuery: vi.fn(),
}))

vi.mock("@/auth", () => ({ auth: h.authMock }))
vi.mock("@/lib/ops-api-gate", () => ({ requireOpsSubscription: h.subMock }))
vi.mock("@/lib/prisma", () => ({ prisma: { adminUser: { findUnique: h.prismaQuery } } }))

import { requireCorrecaoVendaAuth } from "@/lib/vendas/guard-correcao-venda"
import { requireModuleApi } from "@/lib/auth/module-access"

type SessLike = {
  user: {
    id: string; role: string; accessScope: "STORE"; platformAuthority: false
    storeAccess: "all" | "restricted"; allowedStoreIds: string[]
    storeModules: Record<string, string[]>
  }
}

function sess(
  role: string,
  storeAccess: "all" | "restricted",
  allowedStoreIds?: string[],
): SessLike {
  const stores = allowedStoreIds ?? ["loja-A", "loja-B"]
  return { user: {
    id: "op-1", role, accessScope: "STORE", platformAuthority: false, storeAccess,
    allowedStoreIds: stores, storeModules: Object.fromEntries(stores.map(id => [id, ["pdv"]])),
  } }
}

beforeEach(() => {
  h.authMock.mockReset()
  h.subMock.mockReset()
  h.prismaQuery.mockReset()
})

// ---------------------------------------------------------------------------
// 1. Comportamental — requireCorrecaoVendaAuth
// ---------------------------------------------------------------------------

describe("requireCorrecaoVendaAuth — sessão escopa a loja + permissão", () => {
  it("ADMIN com acesso total → libera (não altera comportamento quando tudo correto)", async () => {
    h.authMock.mockResolvedValue(sess("ADMIN", "all"))
    const r = await requireCorrecaoVendaAuth("loja-A")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.session?.user?.id).toBe("op-1")
  })

  it("GERENTE com acesso total → libera (mantém pdv.cancelarVenda)", async () => {
    h.authMock.mockResolvedValue(sess("GERENTE", "all"))
    const r = await requireCorrecaoVendaAuth("loja-A")
    expect(r.ok).toBe(true)
  })

  it("operador restrito À MESMA loja → libera (PIN da mesma loja passa)", async () => {
    h.authMock.mockResolvedValue(sess("ADMIN", "restricted", ["loja-A"]))
    const r = await requireCorrecaoVendaAuth("loja-A")
    expect(r.ok).toBe(true)
  })

  it("operador restrito a OUTRA loja → bloqueia (PIN de outra loja não autoriza)", async () => {
    h.authMock.mockResolvedValue(sess("ADMIN", "restricted", ["loja-A"]))
    const r = await requireCorrecaoVendaAuth("loja-B")
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(403)
      expect(r.error).toMatch(/unidade/i)
    }
  })

  it("operador sem nenhuma loja permitida → bloqueia", async () => {
    h.authMock.mockResolvedValue(sess("ADMIN", "restricted", []))
    const r = await requireCorrecaoVendaAuth("loja-A")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  it("CAIXA (sem permissão de cancelar/corrigir) → bloqueia mesmo com acesso à loja", async () => {
    h.authMock.mockResolvedValue(sess("CAIXA", "all"))
    const r = await requireCorrecaoVendaAuth("loja-A")
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(403)
      expect(r.error).toMatch(/permiss/i)
    }
  })

  it("VENDEDOR (sem permissão) → bloqueia", async () => {
    h.authMock.mockResolvedValue(sess("VENDEDOR", "all"))
    const r = await requireCorrecaoVendaAuth("loja-A")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  it("membership sem módulo PDV não autoriza correção nem aciona fallback ou Prisma", async () => {
    const session = sess("ADMIN", "restricted", ["loja-A"])
    session.user.storeModules["loja-A"] = []
    h.authMock.mockResolvedValue(session)
    expect(await requireCorrecaoVendaAuth("loja-A")).toMatchObject({ ok: false, status: 403 })
    expect(h.subMock).not.toHaveBeenCalled()
    expect(h.prismaQuery).not.toHaveBeenCalled()
  })

  it("ADMIN STORE com storeAccess all não ganha acesso fora das memberships", async () => {
    h.authMock.mockResolvedValue(sess("ADMIN", "all", ["loja-A"]))
    expect(await requireCorrecaoVendaAuth("loja-B")).toMatchObject({ ok: false, status: 403 })
    expect(h.subMock).not.toHaveBeenCalled()
    expect(h.prismaQuery).not.toHaveBeenCalled()
  })

  it("a borda sales recusa anônimo antes de fallback legado ou Prisma", async () => {
    h.authMock.mockResolvedValue(null)
    h.subMock.mockResolvedValue({ ok: true })
    const response = await requireModuleApi(new Request("http://local/api/vendas/id/corrigir"), "sales")
    expect(response?.status).toBe(401)
    expect(h.subMock).not.toHaveBeenCalled()
    expect(h.prismaQuery).not.toHaveBeenCalled()
  })
})

describe("requireCorrecaoVendaAuth — fallback de assinatura (PDV legado sem sessão)", () => {
  it("sem sessão + assinatura válida → libera com session null", async () => {
    h.authMock.mockResolvedValue(null)
    h.subMock.mockResolvedValue({ ok: true })
    const r = await requireCorrecaoVendaAuth("loja-A")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.session).toBeNull()
  })

  it("sem sessão + sem assinatura (401) → bloqueia", async () => {
    h.authMock.mockResolvedValue(null)
    h.subMock.mockResolvedValue({ ok: false, res: { status: 401 } })
    const r = await requireCorrecaoVendaAuth("loja-A")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(401)
  })

  it("sem sessão + assinatura inválida (403) → bloqueia", async () => {
    h.authMock.mockResolvedValue(null)
    h.subMock.mockResolvedValue({ ok: false, res: { status: 403 } })
    const r = await requireCorrecaoVendaAuth("loja-A")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// 2. Wiring estático — todas as rotas corrigir* enforçam o guard
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, "..", "..")
function read(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf8")
}

const ROTAS_CORRIGIR = [
  "app/api/vendas/[id]/corrigir/route.ts",
  "app/api/vendas/[id]/corrigir-itens/route.ts",
  "app/api/vendas/[id]/corrigir-item-meta/route.ts",
  "app/api/vendas/[id]/corrigir-parcelas/route.ts",
  "app/api/vendas/[id]/corrigir-titulo/route.ts",
]

describe("Wiring — cada rota corrigir* reforça sessão/loja/permissão (anti-regressão)", () => {
  for (const f of ROTAS_CORRIGIR) {
    it(`[${f}] importa e chama requireCorrecaoVendaAuth`, () => {
      const src = read(f)
      expect(src).toContain('from "@/lib/vendas/guard-correcao-venda"')
      expect(src).toContain("requireCorrecaoVendaAuth(storeId)")
    })

    it(`[${f}] escopa por loja (opsLojaIdFromRequest) e mantém o PIN de supervisor`, () => {
      const src = read(f)
      expect(src).toContain("opsLojaIdFromRequest(")
      expect(src).toContain("supervisorPin")
      expect(src).toContain("authenticateSupervisorPin")
      expect(src).not.toMatch(/where:\s*\{\s*pin:/)
    })

    it(`[${f}] registra auditoria com storeId + rota`, () => {
      const src = read(f)
      expect(src).toContain("storeId,")
      expect(src).toMatch(/rota: "vendas\/corrig/)
    })

    it(`[${f}] não chama auth() diretamente (delega ao guard)`, () => {
      const src = read(f)
      expect(src).not.toMatch(/from ["']@\/auth["']/)
    })

    it(`[${f}] executa e retorna a negativa do guard sales antes de resolver loja ou consultar`, () => {
      const ast = ts.createSourceFile(f, read(f), ts.ScriptTarget.Latest, true)
      const handler = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "POST")
      if (!handler?.body) throw new Error("POST ausente")
      const [guard, deny] = handler.body.statements
      if (!ts.isVariableStatement(guard)) throw new Error("O primeiro statement deve ser o guard")
      const declaration = guard.declarationList.declarations[0]
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !ts.isAwaitExpression(declaration.initializer) || !ts.isCallExpression(declaration.initializer.expression)) throw new Error("Guard não aguardado")
      const call = declaration.initializer.expression
      expect(call.expression.getText(ast)).toBe("requireModuleApi")
      expect(call.arguments.map(arg => arg.getText(ast))).toEqual(["req", '"sales"'])
      if (!ts.isIfStatement(deny) || !ts.isIdentifier(deny.expression) || !ts.isReturnStatement(deny.thenStatement)) throw new Error("Negativa deve retornar antes do restante do handler")
      expect(deny.expression.text).toBe(declaration.name.text)
      expect(deny.thenStatement.expression?.getText(ast)).toBe(declaration.name.text)
      expect(ast.statements.some(node => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "@/lib/auth/module-access" && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) && node.importClause.namedBindings.elements.some(element => !element.propertyName && element.name.text === "requireModuleApi"))).toBe(true)
    })
  }
})
