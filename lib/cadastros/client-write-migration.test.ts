/**
 * CAD-R2-008 — writers ativos não possuem motor paralelo de persistência.
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

const WRITERS = [
  "app/actions/cadastros.ts",
  "app/api/clientes/route.ts",
  "app/api/clientes/[id]/route.ts",
  "app/api/clientes/quick/route.ts",
  "lib/import-clientes-json.ts",
  "lib/clientes-import-handler.ts",
  "lib/importador-avancado/persistidor.ts",
  "lib/importador-avancado/smart-genius/persistir.ts",
  "lib/operacoes-v3/cliente-resolver.ts",
  "components/operacoes/lovable/api/clientes.ts",
]

const WRITE_RE = /prisma\s*\.\s*cliente\s*\.\s*(create|update|upsert|updateMany|createMany)\s*\(/

describe("CAD-R2-008 — writers migrados", () => {
  it("nenhum writer ativo chama prisma.cliente.create/update/upsert", () => {
    for (const rel of WRITERS) {
      const src = semComentarios(ler(rel))
      expect(src, rel).not.toMatch(WRITE_RE)
    }
  })

  it("Actions e REST delegam ao ClientWriteService", () => {
    expect(ler("app/actions/cadastros.ts")).toMatch(/createClient\(/)
    expect(ler("app/actions/cadastros.ts")).toMatch(/updateClient\(/)
    expect(ler("app/api/clientes/route.ts")).toMatch(/createClient\(/)
    expect(ler("app/api/clientes/[id]/route.ts")).toMatch(/updateClient\(/)
    expect(ler("app/api/clientes/quick/route.ts")).toMatch(/createClient\(/)
  })

  it("importadores não deduplicam por nome", () => {
    const avancado = semComentarios(ler("lib/importador-avancado/persistidor.ts"))
    const persistirClientes = avancado.slice(
      avancado.indexOf("async function persistirClientes"),
      avancado.indexOf("async function persistirFornecedores"),
    )
    expect(persistirClientes).toMatch(/createClient\(/)
    expect(persistirClientes).not.toMatch(/name:\s*\{\s*equals/)
    expect(persistirClientes).not.toMatch(/docDigitsForDedupe\(campos\.document\)[\s\S]*findFirst/)

    const smart = semComentarios(ler("lib/importador-avancado/smart-genius/persistir.ts"))
    const fn = smart.slice(
      smart.indexOf("export async function persistirClientesSmart"),
      smart.indexOf("export async function persistirContasReceberSmart"),
    )
    expect(fn).toMatch(/createClient\(/)
    expect(fn).not.toMatch(/idPorNome|mode:\s*"insensitive"/)
    expect(fn).not.toMatch(/Promise\.all/)
  })

  it("OS V3 não possui motor paralelo — cria via criarCliente", () => {
    const src = semComentarios(ler("lib/operacoes-v3/cliente-resolver.ts"))
    expect(src).toMatch(/criarCliente\(/)
    expect(src).not.toMatch(WRITE_RE)
  })

  it("hard delete permanece fora do ClientWriteService", () => {
    const svc = semComentarios(ler("lib/cadastros/client-write-service.ts"))
    expect(svc).not.toMatch(/deleteMany|\.delete\(/)
    expect(ler("app/api/clientes/[id]/route.ts")).toMatch(/deleteMany/)
  })
})
