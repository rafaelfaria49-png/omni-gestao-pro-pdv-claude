import { describe, expect, it } from "vitest"
import { getEnterprisePermissions } from "./enterprise-permissions"
import { canAccessPage } from "./page-access"

const storeActor = getEnterprisePermissions("OPERADOR")
describe("Pessoas: passagem externa restrita, sem concessao DP", () => {
  it.each(["/dashboard/pessoas", "/dashboard/pessoas/", "/dashboard/pessoas/funcionarios", "/dashboard/pessoas/funcionarios/qa-vinculo", "/dashboard/pessoas/configuracoes"])("permite ao guard DP decidir %s", path => {
    expect(canAccessPage(storeActor, path)).toBe(true)
    expect(canAccessPage(null, path)).toBe(false)
  })
  it.each(["/dashboard/pessoas-extra", "/dashboard/pessoas2", "/dashboard/unidades", "/dashboard/unidades/qa-a", "/dashboard/plataforma", "/dashboard/master-console", "/dashboard/financeiro", "/dashboard/financeiro-v2"])("preserva a negacao externa de %s", path => {
    expect(canAccessPage(storeActor, path)).toBe(false)
  })
})
