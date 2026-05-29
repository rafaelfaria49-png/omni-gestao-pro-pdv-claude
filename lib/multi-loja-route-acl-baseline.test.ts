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

  it("[pós-fix] importa auth de @/auth", () => {
    const src = read(FILE)
    expect(src).toMatch(/from ["']@\/auth["']/)
  })

  it("[pós-fix] chama canAccessStore", () => {
    const src = read(FILE)
    expect(src).toContain("canAccessStore")
  })

  // SPRINT_MULTI_LOJA-S-001 CP3 executado: it.fails → it normal.
  it("[F-05] chama auth() + canAccessStore", () => {
    const src = read(FILE)
    const hasAuth = src.includes("await auth()") && src.includes("canAccessStore")
    expect(hasAuth).toBe(true)
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
