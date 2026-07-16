/**
 * GOAL-004 — canonização fiscal na porta Cadastros V2 (`upsertProduto`).
 *
 * Exercita a MESMA composição do `upsertProduto`: merge de 2 níveis (ou spread no create) +
 * `canonicalizeProdutoFiscalMetadata`, reutilizando os helpers reais publicados. Sem Prisma,
 * sem banco — só a lógica pura de metadata.
 */
import { describe, expect, it } from "vitest"
import { fiscalInputFromBody, getProdutoFiscal } from "@/lib/produto-fiscal"
import { mergeProdutoMetadataTwoLevels } from "@/lib/cadastros/produto-upsert-metadata"
import { canonicalizeProdutoFiscalMetadata } from "@/lib/produtos/produto-fiscal-upsert"

type Body = Record<string, unknown> & { metadata?: Record<string, unknown> | null }

/**
 * Espelha o trecho de metadata do `upsertProduto` (menos acessórios, ortogonal e testado à
 * parte): create = spread do `metadata` enviado; update = merge de 2 níveis sobre o existente;
 * em ambos, canoniza `metadata.fiscal` apenas quando há sinal fiscal no body.
 */
function upsertMetadata(existing: Record<string, unknown> | null, body: Body): Record<string, unknown> {
  const incoming = (body.metadata ?? null) as Record<string, unknown> | null
  let next: unknown =
    existing != null ? mergeProdutoMetadataTwoLevels(existing, incoming) : { ...(incoming ?? {}) }
  const fiscalInput = fiscalInputFromBody(body)
  if (fiscalInput) next = canonicalizeProdutoFiscalMetadata(next, fiscalInput)
  return next as Record<string, unknown>
}

describe("canonização fiscal do upsertProduto (Cadastros V2)", () => {
  it("CREATE: NCM/CEST válidos geram metadata.fiscal canônico", () => {
    const meta = upsertMetadata(null, { metadata: { fiscal: { ncm: "85176200", cest: "0106400" } } })
    expect(meta.fiscal).toEqual({ ncm: "85176200", cest: "0106400" })
    expect(getProdutoFiscal({ metadata: meta })).toMatchObject({ ncm: "85176200", cest: "0106400" })
  })

  it("CREATE: sanea formatos (NCM com pontuação, CEST com zero à esquerda, vazios descartados)", () => {
    const meta = upsertMetadata(null, {
      metadata: { fiscal: { ncm: "8517.62.00", cest: "106400", cfop: "" } },
    })
    expect(meta.fiscal).toEqual({ ncm: "85176200", cest: "0106400" })
    expect("cfop" in (meta.fiscal as Record<string, unknown>)).toBe(false)
  })

  it("UPDATE sem campos fiscais preserva o metadata.fiscal existente", () => {
    const existing = { fiscal: { ncm: "85176200", cest: "0106400" }, atributos: { descricao: "x" } }
    const meta = upsertMetadata(existing, { metadata: { atributos: { descricao: "y" } } })
    expect(meta.fiscal).toEqual({ ncm: "85176200", cest: "0106400" })
    expect(meta.atributos).toEqual({ descricao: "y" })
  })

  it("UPDATE parcial altera só o campo enviado e preserva os demais (não-destrutivo)", () => {
    const existing = { fiscal: { ncm: "85176200", cest: "0106400" } }
    const meta = upsertMetadata(existing, { metadata: { fiscal: { ncm: "99887766" } } })
    expect(meta.fiscal).toEqual({ ncm: "99887766", cest: "0106400" })
  })

  it("preserva metadata de outros namespaces ao canonizar o fiscal", () => {
    const existing = {
      fiscal: { ncm: "85176200" },
      atributos: { descricao: "Cabo", tags: ["cabo"] },
      catalogoAparelhos: { deviceModelKeys: ["a05"] },
      acessorios: { version: 1 },
    }
    const meta = upsertMetadata(existing, { metadata: { fiscal: { cest: "0106400" } } })
    expect(meta.fiscal).toEqual({ ncm: "85176200", cest: "0106400" })
    expect(meta.atributos).toEqual(existing.atributos)
    expect(meta.catalogoAparelhos).toEqual(existing.catalogoAparelhos)
    expect(meta.acessorios).toEqual(existing.acessorios)
  })

  it("campo fiscal desconhecido não entra em metadata.fiscal", () => {
    const meta = upsertMetadata(null, {
      metadata: { fiscal: { ncm: "85176200", tributacao: "Simples", foo: "bar" } },
    })
    expect(meta.fiscal).toEqual({ ncm: "85176200" })
  })

  it("dados legados no topo não substituem a forma canônica (e não são apagados)", () => {
    const existing = { ncm: "00000000", fiscal: { ncm: "85176200", cest: "0106400" } }
    const meta = upsertMetadata(existing, { metadata: { fiscal: { cfop: "5102" } } })
    // metadata.fiscal continua sendo a fonte canônica; o legado do topo é preservado, não promovido.
    expect(meta.fiscal).toEqual({ ncm: "85176200", cest: "0106400", cfop: "5102" })
    expect(meta.ncm).toBe("00000000")
    expect(getProdutoFiscal({ metadata: meta }).ncm).toBe("85176200")
  })

  it("input inválido não cria default fiscal falso", () => {
    const meta = upsertMetadata(null, { metadata: { fiscal: { ncm: "12", cfop: "abc" } } })
    expect("fiscal" in meta).toBe(false)
  })

  it("CREATE e UPDATE (a partir de vazio) produzem a mesma identidade canônica", () => {
    const body: Body = { metadata: { fiscal: { ncm: "85176200", cest: "0106400" } } }
    const created = upsertMetadata(null, body)
    const updated = upsertMetadata({}, body)
    expect(created.fiscal).toEqual(updated.fiscal)
  })

  it("payload real do Cadastros V2 canoniza o fiscal e mantém o regime fora do bloco canônico", () => {
    const meta = upsertMetadata(null, {
      metadata: {
        cadastroIa: { phase: "fase1-stub", source: "manual" },
        atributos: { descricao: "Cabo USB-C", tags: ["cabo"], modeloCompativel: "" },
        barcodeLookup: { gtin: "7891234567890", provedor: "cosmos" },
        fiscal: { ncm: "85176200", cest: "0106400" },
        fiscalRegime: { tributacao: "Simples", origem: "operador", atualizadoEm: "2026-07-16T00:00:00.000Z" },
      },
    })
    expect(meta.fiscal).toEqual({ ncm: "85176200", cest: "0106400" })
    expect((meta.fiscalRegime as Record<string, unknown>).tributacao).toBe("Simples")
    expect("tributacao" in (meta.fiscal as Record<string, unknown>)).toBe(false)
    expect(meta.cadastroIa).toEqual({ phase: "fase1-stub", source: "manual" })
    expect(meta.barcodeLookup).toEqual({ gtin: "7891234567890", provedor: "cosmos" })
  })
})
