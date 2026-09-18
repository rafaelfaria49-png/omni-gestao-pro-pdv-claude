/**
 * CAD-R2-019 — Chave canônica de documento forte + agregação de auditoria.
 *
 * Puro, sem banco: cobre normalização determinística (CPF/CNPJ válidos,
 * máscara vs. dígitos, vazio/inválido → null), idempotência do backfill
 * (reaplicar a chave não muda nada) e o gate do preflight (duplicidade
 * forte mesma-store bloqueia; cross-store permite).
 */
import { describe, expect, it } from "vitest"

import { toStrongDocumentKey } from "@/lib/cadastros/client-identity/document"
import {
  classifyDocumentBucket,
  describeDocumentFormat,
  preflightResult,
  summarizeDocumentAudit,
} from "@/lib/cadastros/client-document-audit"

const CPF_A = "529.982.247-25"
const CPF_A_DIGITS = "52998224725"
const CPF_B = "390.533.447-05"
const CNPJ_A = "11.222.333/0001-81"
const CNPJ_A_DIGITS = "11222333000181"

describe("toStrongDocumentKey", () => {
  it("CPF válido → 11 dígitos", () => {
    expect(toStrongDocumentKey(CPF_A)).toBe(CPF_A_DIGITS)
  })

  it("CNPJ válido → 14 dígitos", () => {
    expect(toStrongDocumentKey(CNPJ_A)).toBe(CNPJ_A_DIGITS)
  })

  it("máscara vs. dígitos equivalentes colidem na mesma chave", () => {
    expect(toStrongDocumentKey(CPF_A)).toBe(toStrongDocumentKey(CPF_A_DIGITS))
    expect(toStrongDocumentKey(CNPJ_A)).toBe(toStrongDocumentKey(CNPJ_A_DIGITS))
  })

  it("vazio/ausente → null (não participa da unique)", () => {
    for (const raw of ["", "   ", null, undefined, 0]) {
      expect(toStrongDocumentKey(raw)).toBeNull()
    }
  })

  it("inválido → null (nunca inventa/corrige DV)", () => {
    expect(toStrongDocumentKey("11111111111")).toBeNull()
    expect(toStrongDocumentKey("00000000000")).toBeNull()
    expect(toStrongDocumentKey("52998224724")).toBeNull()
    expect(toStrongDocumentKey("11.222.333/0001-82")).toBeNull()
    expect(toStrongDocumentKey("00000000000000")).toBeNull()
    expect(toStrongDocumentKey("123")).toBeNull()
    expect(toStrongDocumentKey("abcdefghijk")).toBeNull()
  })

  it("documentos fortes distintos geram chaves distintas", () => {
    expect(toStrongDocumentKey(CPF_A)).not.toBe(toStrongDocumentKey(CPF_B))
  })

  it("é determinística e idempotente", () => {
    const once = toStrongDocumentKey(CPF_A)
    expect(toStrongDocumentKey(once)).toBe(once)
    expect(toStrongDocumentKey(CPF_A)).toBe(once)
  })
})

describe("classifyDocumentBucket / describeDocumentFormat", () => {
  it("classifica vazio / inválido / forte", () => {
    expect(classifyDocumentBucket("")).toBe("empty")
    expect(classifyDocumentBucket(null)).toBe("empty")
    expect(classifyDocumentBucket("11111111111")).toBe("invalid")
    expect(classifyDocumentBucket(CPF_A)).toBe("strong")
    expect(classifyDocumentBucket(CNPJ_A_DIGITS)).toBe("strong")
  })

  it("distingue canônico de mascarado sem expor dígitos", () => {
    expect(describeDocumentFormat(CPF_A_DIGITS)).toBe("canonical")
    expect(describeDocumentFormat(CPF_A)).toBe("masked")
    expect(describeDocumentFormat("")).toBe("other")
    expect(describeDocumentFormat("11111111111")).toBe("other")
  })
})

describe("summarizeDocumentAudit", () => {
  it("agrega contagens sem PII e detecta duplicidade forte mesma-store", () => {
    const summary = summarizeDocumentAudit([
      { id: "c1", storeId: "loja-a", document: CPF_A },
      { id: "c2", storeId: "loja-a", document: CPF_A_DIGITS },
      { id: "c3", storeId: "loja-a", document: "" },
      { id: "c4", storeId: "loja-a", document: "11111111111" },
      { id: "c5", storeId: "loja-b", document: CPF_A },
    ])
    expect(summary.total).toBe(5)
    expect(summary.strong).toBe(3)
    expect(summary.empty).toBe(1)
    expect(summary.invalid).toBe(1)
    expect(summary.masked).toBe(2)
    expect(summary.canonical).toBe(1)
    expect(summary.sameStoreStrongGroups).toHaveLength(1)
    expect(summary.sameStoreStrongGroups[0]?.storeId).toBe("loja-a")
    expect(summary.sameStoreStrongGroups[0]?.memberIds).toEqual(["c1", "c2"])
    expect(summary.crossStoreKeyCount).toBe(1)
    expect(preflightResult(summary)).toBe("BLOCKED")
    const blob = JSON.stringify(summary)
    expect(blob).not.toContain(CPF_A_DIGITS)
    expect(blob).not.toContain(CPF_A)
  })

  it("PASS quando não há duplicidade forte mesma-store", () => {
    const summary = summarizeDocumentAudit([
      { id: "c1", storeId: "loja-a", document: CPF_A },
      { id: "c2", storeId: "loja-a", document: CPF_B },
      { id: "c3", storeId: "loja-b", document: CPF_A },
      { id: "c4", storeId: "loja-a", document: "" },
      { id: "c5", storeId: "loja-a", document: "invalido" },
    ])
    expect(summary.sameStoreStrongGroups).toEqual([])
    expect(summary.crossStoreKeyCount).toBe(1)
    expect(preflightResult(summary)).toBe("PASS")
  })

  it("vazio/inválido repetidos nunca formam grupo", () => {
    const summary = summarizeDocumentAudit([
      { id: "c1", storeId: "loja-a", document: "" },
      { id: "c2", storeId: "loja-a", document: "" },
      { id: "c3", storeId: "loja-a", document: "11111111111" },
      { id: "c4", storeId: "loja-a", document: "11111111111" },
    ])
    expect(summary.sameStoreStrongGroups).toEqual([])
    expect(preflightResult(summary)).toBe("PASS")
  })
})
