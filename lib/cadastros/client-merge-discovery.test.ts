/**
 * CAD-R2-018-B — Testes do duplicate discovery (read-only, bounded, store-scoped).
 * Sem banco: fonte de scan fake em memória.
 */
import { describe, expect, it } from "vitest"
import {
  discoverDuplicateGroups,
  discoverForClient,
  DUPLICATE_DISCOVERY_MAX_GROUPS,
  DUPLICATE_DISCOVERY_MAX_SCAN,
  type DuplicateScanRow,
  type DuplicateScanSource,
} from "@/lib/cadastros/client-merge-discovery"
import { createMemoryClientIdentitySource } from "@/lib/cadastros/client-identity"
import type { ClientIdentityRecord } from "@/lib/cadastros/client-identity"

const CPF_A = "529.982.247-25"
const CPF_A_DIGITS = "52998224725"
const CPF_B = "390.533.447-05"
const PHONE_A = "(11) 98888-7777"
const PHONE_B = "11977776666"

const STORE_A = "loja-a"
const STORE_B = "loja-b"

function row(partial: Partial<DuplicateScanRow> & { id: string; storeId: string }): DuplicateScanRow {
  return {
    name: "Cliente",
    kind: "PF",
    document: "",
    phone: null,
    email: null,
    city: "",
    active: true,
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...partial,
  }
}

function fakeScan(seed: DuplicateScanRow[]): DuplicateScanSource {
  const sorted = [...seed].sort((a, b) => (a.id < b.id ? -1 : 1))
  return {
    async listClients(storeId, take) {
      return sorted.filter((r) => r.storeId === storeId).slice(0, take)
    },
    async getClient(storeId, clientId) {
      return sorted.find((r) => r.storeId === storeId && r.id === clientId) ?? null
    },
  }
}

function memorySource(seed: DuplicateScanRow[]) {
  const recs: ClientIdentityRecord[] = seed.map((r) => ({
    id: r.id,
    storeId: r.storeId,
    document: r.document,
    phone: r.phone,
    email: r.email,
    name: r.name,
  }))
  return createMemoryClientIdentitySource(recs)
}

describe("discoverDuplicateGroups", () => {
  it("documento forte idêntico forma grupo EXACT revisável", async () => {
    const source = fakeScan([
      row({ id: "c1", storeId: STORE_A, name: "Ana", document: CPF_A }),
      row({ id: "c2", storeId: STORE_A, name: "Ana S", document: CPF_A_DIGITS }),
    ])
    const res = await discoverDuplicateGroups({ storeId: STORE_A, source })
    expect(res.scanned).toBe(2)
    expect(res.groups).toHaveLength(1)
    const g = res.groups[0]
    expect(g.kind).toBe("EXACT_DOCUMENT")
    expect(g.outcome).toBe("EXACT_DOCUMENT_MATCH")
    expect(g.reviewable).toBe(true)
    expect(g.memberIds).toEqual(["c1", "c2"])
    expect(g.pairs).toHaveLength(1)
    expect(g.pairs[0].reviewable).toBe(true)
  })

  it("telefone em comum sem documento forma grupo CONTACT revisável", async () => {
    const source = fakeScan([
      row({ id: "c1", storeId: STORE_A, name: "Ana", phone: PHONE_A }),
      row({ id: "c2", storeId: STORE_A, name: "Ana Souza", phone: "11988887777" }),
    ])
    const res = await discoverDuplicateGroups({ storeId: STORE_A, source })
    expect(res.groups).toHaveLength(1)
    expect(res.groups[0].kind).toBe("CONTACT")
    expect(res.groups[0].outcome).toBe("POSSIBLE_CONTACT_MATCH")
    expect(res.groups[0].reviewable).toBe(true)
  })

  it("nome idêntico sozinho nunca gera candidato", async () => {
    const source = fakeScan([
      row({ id: "c1", storeId: STORE_A, name: "José Silva" }),
      row({ id: "c2", storeId: STORE_A, name: "José Silva" }),
      row({ id: "c3", storeId: STORE_A, name: "José Silva", city: "SP" }),
    ])
    const res = await discoverDuplicateGroups({ storeId: STORE_A, source })
    expect(res.groups).toHaveLength(0)
  })

  it("nunca atravessa lojas", async () => {
    const source = fakeScan([
      row({ id: "c1", storeId: STORE_A, document: CPF_A }),
      row({ id: "c2", storeId: STORE_B, document: CPF_A }),
    ])
    const res = await discoverDuplicateGroups({ storeId: STORE_A, source })
    expect(res.groups).toHaveLength(0)
    const resB = await discoverDuplicateGroups({ storeId: STORE_B, source })
    expect(resB.groups).toHaveLength(0)
  })

  it("documentos fortes diferentes com mesmo telefone = conflito bloqueado", async () => {
    const source = fakeScan([
      row({ id: "c1", storeId: STORE_A, document: CPF_A, phone: PHONE_A }),
      row({ id: "c2", storeId: STORE_A, document: CPF_B, phone: "11988887777" }),
    ])
    const res = await discoverDuplicateGroups({ storeId: STORE_A, source })
    // Par cai no bucket de contato; classificação do par = conflito.
    const conflict = res.groups.find((g) => g.outcome === "IDENTITY_CONFLICT")
    expect(conflict).toBeDefined()
    expect(conflict?.reviewable).toBe(false)
    expect(conflict?.pairs.every((p) => !p.reviewable)).toBe(true)
  })

  it("três clientes com mesmo documento = grupo ambíguo fail-closed, pares listados", async () => {
    const source = fakeScan([
      row({ id: "c1", storeId: STORE_A, document: CPF_A }),
      row({ id: "c2", storeId: STORE_A, document: CPF_A }),
      row({ id: "c3", storeId: STORE_A, document: CPF_A }),
    ])
    const res = await discoverDuplicateGroups({ storeId: STORE_A, source })
    const g = res.groups.find((k) => k.kind === "EXACT_DOCUMENT")
    expect(g).toBeDefined()
    expect(g?.outcome).toBe("AMBIGUOUS")
    expect(g?.reviewable).toBe(false)
    expect(g?.pairs).toHaveLength(3)
  })

  it("respeita bounds (maxScan/maxGroups) e sinaliza truncamento", async () => {
    const seed: DuplicateScanRow[] = []
    for (let i = 0; i < 12; i++) {
      seed.push(row({ id: `a${i}`, storeId: STORE_A, document: CPF_A }))
    }
    const source = fakeScan(seed)
    const res = await discoverDuplicateGroups({ storeId: STORE_A, source, maxScan: 5 })
    expect(res.scanned).toBeLessThanOrEqual(5)
    expect(res.truncated).toBe(true)
    expect(DUPLICATE_DISCOVERY_MAX_SCAN).toBe(500)
    expect(DUPLICATE_DISCOVERY_MAX_GROUPS).toBe(50)
  })

  it("scope vazio não varre nada", async () => {
    const source = fakeScan([row({ id: "c1", storeId: STORE_A, document: CPF_A })])
    const res = await discoverDuplicateGroups({ storeId: "  ", source })
    expect(res.groups).toHaveLength(0)
    expect(res.scanned).toBe(0)
  })
})

describe("discoverForClient", () => {
  it("seed com documento idêntico é revisável com 1 candidato", async () => {
    const seed = [
      row({ id: "seed", storeId: STORE_A, document: CPF_A }),
      row({ id: "c2", storeId: STORE_A, document: CPF_A_DIGITS }),
    ]
    const res = await discoverForClient({
      storeId: STORE_A,
      clientId: "seed",
      scanSource: fakeScan(seed),
      identitySource: memorySource(seed),
    })
    expect(res.outcome).toBe("EXACT_DOCUMENT_MATCH")
    expect(res.reviewable).toBe(true)
    expect(res.candidates.map((c) => c.id)).toEqual(["c2"])
    expect(res.seed?.id).toBe("seed")
  })

  it("seed com contato em comum é revisável", async () => {
    const seed = [
      row({ id: "seed", storeId: STORE_A, phone: PHONE_A }),
      row({ id: "c2", storeId: STORE_A, phone: "11988887777" }),
    ]
    const res = await discoverForClient({
      storeId: STORE_A,
      clientId: "seed",
      scanSource: fakeScan(seed),
      identitySource: memorySource(seed),
    })
    expect(res.outcome).toBe("POSSIBLE_CONTACT_MATCH")
    expect(res.reviewable).toBe(true)
  })

  it("seed com conflito de documento forte fica bloqueado", async () => {
    const seed = [
      row({ id: "seed", storeId: STORE_A, document: CPF_A, phone: PHONE_A }),
      row({ id: "c2", storeId: STORE_A, document: CPF_B, phone: "11988887777" }),
    ]
    const res = await discoverForClient({
      storeId: STORE_A,
      clientId: "seed",
      scanSource: fakeScan(seed),
      identitySource: memorySource(seed),
    })
    expect(res.outcome).toBe("IDENTITY_CONFLICT")
    expect(res.reviewable).toBe(false)
  })

  it("seed com dois contatos = ambíguo fail-closed", async () => {
    const seed = [
      row({ id: "seed", storeId: STORE_A, phone: PHONE_A, email: "a@x.com" }),
      row({ id: "c2", storeId: STORE_A, phone: "11988887777" }),
      row({ id: "c3", storeId: STORE_A, email: "a@x.com" }),
    ]
    const res = await discoverForClient({
      storeId: STORE_A,
      clientId: "seed",
      scanSource: fakeScan(seed),
      identitySource: memorySource(seed),
    })
    expect(res.outcome).toBe("AMBIGUOUS")
    expect(res.reviewable).toBe(false)
  })

  it("seed desconhecido ou de outra loja = NO_MATCH sem vazar nada", async () => {
    const seed = [row({ id: "c1", storeId: STORE_A, name: "Sigiloso da Loja A", document: CPF_A })]
    const missing = await discoverForClient({
      storeId: STORE_A,
      clientId: "nope",
      scanSource: fakeScan(seed),
      identitySource: memorySource(seed),
    })
    expect(missing.outcome).toBe("NO_MATCH")
    expect(missing.seed).toBeNull()
    const cross = await discoverForClient({
      storeId: STORE_B,
      clientId: "c1",
      scanSource: fakeScan(seed),
      identitySource: memorySource(seed),
    })
    expect(cross.outcome).toBe("NO_MATCH")
    expect(cross.seed).toBeNull()
    expect(cross.candidates).toHaveLength(0)
    expect(JSON.stringify(cross)).not.toContain("Sigiloso")
    expect(JSON.stringify(cross)).not.toContain(CPF_A_DIGITS)
  })

  it("nome igual ao seed não gera candidato", async () => {
    const seed = [
      row({ id: "seed", storeId: STORE_A, name: "Maria" }),
      row({ id: "c2", storeId: STORE_A, name: "Maria" }),
    ]
    const res = await discoverForClient({
      storeId: STORE_A,
      clientId: "seed",
      scanSource: fakeScan(seed),
      identitySource: memorySource(seed),
    })
    expect(res.outcome).toBe("NO_MATCH")
    expect(res.candidates).toHaveLength(0)
  })

  it("telefone secundário distinto (PHONE_B) não casa com PHONE_A", async () => {
    const seed = [
      row({ id: "seed", storeId: STORE_A, phone: PHONE_A }),
      row({ id: "c2", storeId: STORE_A, phone: PHONE_B }),
    ]
    const res = await discoverForClient({
      storeId: STORE_A,
      clientId: "seed",
      scanSource: fakeScan(seed),
      identitySource: memorySource(seed),
    })
    expect(res.outcome).toBe("NO_MATCH")
  })
})
