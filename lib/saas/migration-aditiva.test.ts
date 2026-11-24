import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Verificação estática: a migration do SAAS-001A é exclusivamente aditiva.
const SQL = readFileSync("prisma/migrations/20261124120000_saas_fundacao_comercial/migration.sql", "utf8").replace(/\r\n/g, "\n")
// O corpo da função de gatilho ($$ … $$) é removido antes de quebrar em comandos.
const semCorpo = SQL.replace(/--.*$/gm, "").replace(/\$\$[\s\S]*?\$\$/g, "$$corpo$$")
const comandos = semCorpo.split(";").map((c) => c.trim()).filter(Boolean)
const ehGatilho = (c: string) => /^CREATE (FUNCTION|TRIGGER) /.test(c)

describe("migration 20261124120000_saas_fundacao_comercial", () => {
  it("só tem comandos de criação (CREATE …, ALTER TABLE … ADD …)", () => {
    expect(comandos.length).toBeGreaterThan(40)
    for (const c of comandos) {
      const ok = /^CREATE (TABLE|UNIQUE INDEX|INDEX|FUNCTION|TRIGGER) /.test(c) || /^ALTER TABLE "[a-z_]+" ADD (COLUMN|CONSTRAINT) /.test(c)
      expect(ok, c.slice(0, 120)).toBe(true)
    }
  })
  it("nenhum DROP, TRUNCATE, DELETE, UPDATE de dados, RENAME ou mudança de tipo", () => {
    const dados = comandos
      .filter((c) => !ehGatilho(c))
      .join("\n")
      .replace(/ON DELETE (RESTRICT|CASCADE) ON UPDATE CASCADE/g, "")
    expect(dados).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME)\b/i)
    expect(dados).not.toMatch(/ALTER COLUMN|SET DATA TYPE|SET NOT NULL/i)
  })
  it("gatilhos só protegem as duas tabelas de registro (só-inserção)", () => {
    const alvos = comandos.filter((c) => /^CREATE TRIGGER /.test(c)).map((c) => /ON "([a-z_]+)"/.exec(c)?.[1])
    expect(alvos.sort()).toEqual(["platform_audit_logs", "platform_audit_logs", "subscription_history", "subscription_history"])
  })
  it("a única tabela existente tocada é stores, com coluna NULLABLE, índice e FK", () => {
    const alteradas = [...SQL.matchAll(/ALTER TABLE "([a-z_]+)" ADD COLUMN\s+"(\w+)" (\w+)([^;]*);/g)].map((m) => [m[1], m[2], m[3], m[4].trim()])
    expect(alteradas).toEqual([["stores", "organizationId", "TEXT", ""]])
    expect(SQL).toContain('CREATE INDEX "stores_organizationId_idx" ON "stores"("organizationId")')
    expect(SQL).toMatch(/"stores_organizationId_fkey" FOREIGN KEY \("organizationId"\) REFERENCES "organizations"\("id"\) ON DELETE RESTRICT/)
  })
  it("não há backfill: nenhum INSERT", () => {
    expect(SQL).not.toMatch(/\bINSERT\b/i)
  })
})
