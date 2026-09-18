/**
 * CAD-R2-018-B — boundaries estáticos da camada de merge.
 *
 * Garante: UMA transaction por execute (zero nested), sem auto-merge/IA,
 * sem PII em logs, campos finais via ClientWriteService, gates nas rotas,
 * discovery read-only e regressão dos writers do CAD-R2-008.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = resolve(".")

function ler(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8")
}

function semComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1")
}

const SERVICE = "lib/cadastros/client-merge-service.ts"
const DISCOVERY = "lib/cadastros/client-merge-discovery.ts"
const CONTRACT = "lib/cadastros/client-merge-contract.ts"

describe("CAD-R2-018-B — atomicidade", () => {
  it("execute abre UMA transaction; zero nested", () => {
    const src = semComentarios(ler(SERVICE))
    const openings = src.match(/\.\$transaction\s*\(/g) ?? []
    expect(openings).toHaveLength(1)
    expect(src).toMatch(/db\.\$transaction/)
  })

  it("campos finais passam pelo ClientWriteService (sem escrita direta de Cliente)", () => {
    const src = semComentarios(ler(SERVICE))
    expect(src).toMatch(/updateClientTx\s*\(/)
    expect(src).not.toMatch(/tx\.cliente\.create\s*\(/)
    expect(src).not.toMatch(/tx\.cliente\.update\s*\(/)
    expect(src).not.toMatch(/tx\.cliente\.upsert\s*\(/)
    expect(src).not.toMatch(/createClient\s*\(/)
  })

  it("lock consultivo serializa merges concorrentes do mesmo par", () => {
    const src = semComentarios(ler(SERVICE))
    expect(src).toMatch(/pg_advisory_xact_lock\(hashtext\(/)
  })

  it("falha dentro da transaction lança (rollback); retorno de failure fora", () => {
    const src = semComentarios(ler(SERVICE))
    expect(src).toMatch(/throw new MergeHalt/)
    expect(src).toMatch(/if \(e instanceof MergeHalt\) return e\.failure/)
  })
})

describe("CAD-R2-018-B — sem auto-merge / sem IA / sem PII em logs", () => {
  it("nenhum auto-merge ou escolha automática de survivor", () => {
    for (const rel of [SERVICE, DISCOVERY, CONTRACT]) {
      const src = semComentarios(ler(rel))
      expect(src, rel).not.toMatch(/autoMerge\s*:\s*true/)
      expect(src, rel).not.toMatch(/AUTO_MERGE\s*=\s*true/)
      expect(src, rel).not.toMatch(/escolherSurvivor|pickSurvivor|autoSurvivor|survivorAutomatico/i)
    }
  })

  it("nenhuma IA participa do merge", () => {
    for (const rel of [SERVICE, DISCOVERY, CONTRACT, "lib/cadastros/client-merge-http.ts"]) {
      const src = semComentarios(ler(rel))
      expect(src, rel).not.toMatch(/openai|openrouter|anthropic|generateObject|generative-ai/i)
      expect(src, rel).not.toMatch(/\bllm\b/i)
    }
  })

  it("nenhum log de debug; erro de servidor sem PII", () => {
    const src = semComentarios(ler(SERVICE))
    expect(src).not.toMatch(/console\.(log|info|warn|debug)\(/)
    const errors = src.split("\n").filter((line) => line.includes("console.error"))
    expect(errors.length).toBeGreaterThan(0)
    for (const line of errors) {
      expect(line).not.toMatch(/document|phone|email|survivor\.name|loser\.name/i)
    }
  })

  it("auditoria do merge não carrega PII bruta", () => {
    const src = semComentarios(ler(SERVICE))
    const anchor = src.indexOf("action: CLIENT_MERGE_AUDIT_ACTION")
    expect(anchor).toBeGreaterThan(-1)
    const auditSlice = src.slice(anchor, anchor + 2000)
    expect(auditSlice).toMatch(/survivorId/)
    expect(auditSlice).toMatch(/loserId/)
    expect(auditSlice).toMatch(/fingerprint/)
    expect(auditSlice).not.toMatch(/\.document\b/)
    expect(auditSlice).not.toMatch(/\.phone\b/)
    expect(auditSlice).not.toMatch(/\.email\b/)
  })
})

describe("CAD-R2-018-B — discovery read-only", () => {
  it("sem escrita, sem browser storage, sem cross-store", () => {
    const src = semComentarios(ler(DISCOVERY))
    expect(src).not.toMatch(/\.(create|update|upsert|delete|deleteMany)\s*\(/)
    expect(src).not.toMatch(/localStorage|sessionStorage|window\./)
    expect(src).toMatch(/storeId/)
  })

  it("nome nunca agrupa; bounds explícitos", () => {
    const src = semComentarios(ler(DISCOVERY))
    expect(src).not.toMatch(/bucket.*name|groupByName|nameBucket/i)
    expect(src).toMatch(/DUPLICATE_DISCOVERY_MAX_SCAN/)
    expect(src).toMatch(/DUPLICATE_DISCOVERY_MAX_GROUPS/)
  })

  it("contrato é puro (sem server-only, sem Prisma runtime)", () => {
    const src = ler(CONTRACT)
    expect(src).not.toMatch(/server\/only/)
    expect(src).not.toMatch(/from "@\/lib\/prisma"/)
  })
})

describe("CAD-R2-018-B — rotas com gates", () => {
  it("duplicates é leitura compartilhada; plan/execute exigem escrita admin", () => {
    expect(ler("app/api/clientes/duplicates/route.ts")).toMatch(/requireCadastrosHubApi\(req,\s*"read",\s*"shared"\)/)
    expect(ler("app/api/clientes/merge/plan/route.ts")).toMatch(/requireCadastrosHubApi\(req,\s*"write",\s*"admin"\)/)
    expect(ler("app/api/clientes/merge/execute/route.ts")).toMatch(/requireCadastrosHubApi\(req,\s*"write",\s*"admin"\)/)
  })

  it("execute exige fingerprint + confirmação explícita", () => {
    const src = semComentarios(ler("app/api/clientes/merge/execute/route.ts"))
    expect(src).toMatch(/fingerprint/)
    expect(src).toMatch(/confirmation/)
  })

  it("HUB tem entrada de revisão sem redesenho", () => {
    expect(ler("app/dashboard/clientes/ClientesPageClient.tsx")).toMatch(/Revisar duplicidades/)
    expect(ler("app/dashboard/clientes/ClientesPageClient.tsx")).toMatch(/DuplicateMergeDialog/)
    const dialog = semComentarios(ler("app/dashboard/clientes/DuplicateMergeDialog.tsx"))
    expect(dialog).toMatch(/ASSISTEC_LOJA_HEADER/)
    expect(dialog).toMatch(/removido permanentemente/)
  })
})

describe("CAD-R2-018-B — regressão CAD-R2-008", () => {
  it("ClientWriteService segue sem delete; merge não cria cliente direto", () => {
    const write = semComentarios(ler("lib/cadastros/client-write-service.ts"))
    expect(write).not.toMatch(/deleteMany|\.delete\(/)
    const merge = semComentarios(ler(SERVICE))
    expect(merge).toMatch(/updateClientTx\s*\(/)
    expect(merge).not.toMatch(/createClientTx\s*\(/)
  })

  it("inventário registra a capability de merge sem reclassificar writers", () => {
    const inv = ler("lib/cadastros/client-identity/writers-inventory.ts")
    expect(inv).toMatch(/rest-merge-execute/)
    expect(inv).toMatch(/hub-duplicate-review/)
    expect(inv).toMatch(/action-createCliente/)
  })

  it("flag de merge ligada; identidade segue sem auto-merge", () => {
    expect(ler("lib/cadastros/client-identity/types.ts")).toMatch(/CLIENT_MERGE_IMPLEMENTED\s*=\s*true/)
    expect(ler("lib/cadastros/client-identity/types.ts")).toMatch(/CLIENT_IDENTITY_AUTO_MERGE\s*=\s*false/)
    expect(ler("lib/cadastros/client-identity/types.ts")).toMatch(/CLIENT_IDENTITY_AI_DECISION\s*=\s*false/)
  })
})
