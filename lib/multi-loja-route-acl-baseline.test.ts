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

const ROOT = resolve(__dirname, "..")

function read(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf8")
}

// ---------------------------------------------------------------------------
// F-05 · /api/dashboard/resumo e /api/dashboard/elite sem auth + canAccessStore
// ---------------------------------------------------------------------------

describe("F-05 — /api/dashboard/resumo sem auth + canAccessStore", () => {
  const FILE = "app/api/dashboard/resumo/route.ts"

  it("[snapshot atual — bug] NÃO importa auth de @/auth", () => {
    const src = read(FILE)
    expect(src).not.toMatch(/from ["']@\/auth["']/)
  })

  it("[snapshot atual — bug] NÃO chama await auth()", () => {
    const src = read(FILE)
    expect(src).not.toContain("await auth()")
  })

  it("[snapshot atual — bug] NÃO chama canAccessStore", () => {
    const src = read(FILE)
    expect(src).not.toContain("canAccessStore")
  })

  it("[snapshot atual] usa storeIdFromAssistecRequestForRead (fallback silencioso F-01)", () => {
    const src = read(FILE)
    expect(src).toContain("storeIdFromAssistecRequestForRead")
  })

  /**
   * EXPECTED-FAILING: pós-SPRINT_01_MULTI_LOJA.
   * Troque `it.fails(` por `it(` quando auth + canAccessStore forem adicionados.
   */
  it.fails("[F-05] DEVE: importar auth(), chamar await auth() e canAccessStore antes de query", () => {
    const src = read(FILE)
    expect(src).toMatch(/from ["']@\/auth["']/)
    expect(src).toContain("await auth()")
    expect(src).toContain("canAccessStore")
  })
})

describe("F-05 — /api/dashboard/elite sem auth + canAccessStore", () => {
  const FILE = "app/api/dashboard/elite/route.ts"

  it("[snapshot atual — bug] NÃO importa auth de @/auth", () => {
    const src = read(FILE)
    expect(src).not.toMatch(/from ["']@\/auth["']/)
  })

  it("[snapshot atual — bug] NÃO chama canAccessStore", () => {
    const src = read(FILE)
    expect(src).not.toContain("canAccessStore")
  })

  it("[snapshot atual] usa storeIdFromAssistecRequestForRead (fallback silencioso F-01)", () => {
    const src = read(FILE)
    expect(src).toContain("storeIdFromAssistecRequestForRead")
  })

  it.fails("[F-05] DEVE: chamar auth() + canAccessStore (KPIs financeiros completos — alta sensibilidade)", () => {
    const src = read(FILE)
    expect(src).toMatch(/from ["']@\/auth["']/)
    expect(src).toContain("await auth()")
    expect(src).toContain("canAccessStore")
  })
})

describe("F-05 — /api/clients sem auth + canAccessStore", () => {
  const FILE = "app/api/clients/route.ts"

  it("[snapshot atual — bug] NÃO importa auth de @/auth", () => {
    const src = read(FILE)
    expect(src).not.toMatch(/from ["']@\/auth["']/)
  })

  it("[snapshot atual — bug] NÃO chama canAccessStore", () => {
    const src = read(FILE)
    expect(src).not.toContain("canAccessStore")
  })

  it.fails("[F-05] DEVE: chamar auth() + canAccessStore ou deprecar em favor de /api/clientes", () => {
    const src = read(FILE)
    // Ou adiciona auth+canAccessStore, ou a rota é removida (redirecionada para /api/clientes).
    const hasAuth = src.includes("await auth()") && src.includes("canAccessStore")
    const isDeprecated = src.includes("deprecated") || src.includes("redirect") || src.includes("410")
    expect(hasAuth || isDeprecated).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// F-06 · app/actions/whatsapp.ts tem auth() mas falta canAccessStore
// ---------------------------------------------------------------------------

describe("F-06 — app/actions/whatsapp.ts falta canAccessStore", () => {
  const FILE = "app/actions/whatsapp.ts"

  it("[snapshot atual — parcial] tem auth() — autenticação presente", () => {
    const src = read(FILE)
    expect(src).toContain("await auth()")
  })

  it("[snapshot atual — bug] NÃO importa canAccessStore", () => {
    const src = read(FILE)
    // Usuário autenticado em Loja A pode disparar action com storeId="loja-b"
    expect(src).not.toContain("canAccessStore")
  })

  it("[snapshot atual] aceita storeId cru do client sem validar acesso", () => {
    const src = read(FILE)
    // O storeId vem do input do componente cliente e vai direto para o service
    expect(src).toContain("input.storeId")
  })

  /**
   * EXPECTED-FAILING: pós-SPRINT_01_MULTI_LOJA.
   * Actions que aceitam storeId do cliente devem sempre validar canAccessStore server-side.
   */
  it.fails("[F-06] DEVE: importar e chamar canAccessStore(session, storeId) antes de sendCloud*", () => {
    const src = read(FILE)
    expect(src).toContain("canAccessStore")
  })
})

// ---------------------------------------------------------------------------
// F-07 · /api/whatsapp/send-daily tem auth() mas falta canAccessStore
// ---------------------------------------------------------------------------

describe("F-07 — /api/whatsapp/send-daily falta canAccessStore", () => {
  const FILE = "app/api/whatsapp/send-daily/route.ts"

  it("[snapshot atual — parcial] tem auth() — autenticação presente", () => {
    const src = read(FILE)
    expect(src).toContain("await auth()")
  })

  it("[snapshot atual — parcial] verifica que storeId não é vazio (guarda mínimo presente)", () => {
    const src = read(FILE)
    // resolveActiveStoreId retorna null e a rota retorna 403 se storeId vazio — bom sinal.
    // Mas não valida que o usuário TEM direito à loja informada.
    expect(src).toContain("resolveActiveStoreId")
    expect(src).toContain("!storeId")
  })

  it("[snapshot atual — bug] NÃO chama canAccessStore (usuário pode enviar resumo de outra loja)", () => {
    const src = read(FILE)
    expect(src).not.toContain("canAccessStore")
  })

  /**
   * EXPECTED-FAILING: pós-SPRINT_01_MULTI_LOJA.
   * Rota deve validar que session.user tem acesso ao storeId resolvido.
   */
  it.fails("[F-07] DEVE: chamar canAccessStore(session, storeId) após resolver storeId", () => {
    const src = read(FILE)
    expect(src).toContain("canAccessStore")
  })
})

// ---------------------------------------------------------------------------
// F-08 · sync-legacy-* usa só requireOpsSubscription, sem auth() + canAccessStore
// ---------------------------------------------------------------------------

describe("F-08 — /api/ops/sync-legacy-vendas sem auth() + canAccessStore", () => {
  const FILE = "app/api/ops/sync-legacy-vendas/route.ts"

  it("[snapshot atual — parcial] usa requireOpsSubscription (gate de assinatura presente)", () => {
    const src = read(FILE)
    expect(src).toContain("requireOpsSubscription")
  })

  it("[snapshot atual — bug] NÃO importa auth de @/auth", () => {
    const src = read(FILE)
    expect(src).not.toMatch(/from ["']@\/auth["']/)
  })

  it("[snapshot atual — bug] NÃO chama canAccessStore (escrita em qualquer loja via header)", () => {
    const src = read(FILE)
    expect(src).not.toContain("canAccessStore")
  })

  /**
   * EXPECTED-FAILING: pós-SPRINT_01_MULTI_LOJA (ou sprint dedicada de legacy ops).
   * Escrita de vendas legadas deve validar que o caller tem direito à loja alvo.
   */
  it.fails("[F-08] DEVE: chamar auth() + canAccessStore antes de upsertVendaInTransaction", () => {
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
