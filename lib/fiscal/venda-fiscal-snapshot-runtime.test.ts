/**
 * GOAL-005 — Runtime de Solicitação de Emissão Fiscal (caller real do snapshot).
 *
 * Cobre:
 *  - fail-closed: loja sem `fiscalEnabled = true` → 423 (não ativa, não emite).
 *  - transição NAO_FISCAL → PENDENTE (única escrita de negócio).
 *  - idempotência: PENDENTE re-chamado → não re-transiciona, retorna existente.
 *  - estado inválido (EMITINDO/AUTORIZADA/etc.) → 409.
 *  - venda cancelada → 409.
 *  - venda não encontrada → 404.
 *  - guards das rotas comerciais com venda PENDENTE (assertVendaFiscalEditavel).
 *  - não-releitura de dado vivo: `venda.findFirst` chamado 1× (não re-lê pós-snapshot).
 *  - imutabilidade: hash do snapshot persistido não muda entre chamadas.
 *  - zero job, zero emissão, zero SEFAZ (não chama emission/provider/numbering).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks Prisma + snapshot service ──────────────────────────────────────────────────

const db = vi.hoisted(() => ({
  vendaFindFirst: vi.fn(),
  vendaUpdate: vi.fn(),
  configFindUnique: vi.fn(),
}))

const snapshotService = vi.hoisted(() => ({
  createVendaFiscalSnapshot: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    venda: { findFirst: db.vendaFindFirst, update: db.vendaUpdate },
    configuracaoFiscalLoja: { findUnique: db.configFindUnique },
  },
}))

vi.mock("./venda-fiscal-snapshot-service", () => ({
  createVendaFiscalSnapshot: snapshotService.createVendaFiscalSnapshot,
}))

import { solicitarEmissaoVenda } from "./venda-fiscal-snapshot-runtime"
import {
  assertVendaFiscalEditavel,
  assertVendaFiscalCancelavel,
  canEmitirFiscalmente,
} from "./venda-fiscal-state-machine"
import { FiscalStatusVenda } from "@/generated/prisma"

// ── Fixtures ─────────────────────────────────────────────────────────────────────────

const VENDA_NAO_FISCAL = {
  id: "venda-1",
  fiscalStatus: "NAO_FISCAL",
  status: "concluida",
}

const VENDA_PENDENTE = {
  id: "venda-1",
  fiscalStatus: "PENDENTE",
  status: "concluida",
}

const VENDA_EMITINDO = {
  id: "venda-1",
  fiscalStatus: "EMITINDO",
  status: "concluida",
}

const VENDA_CANCELADA = {
  id: "venda-1",
  fiscalStatus: "NAO_FISCAL",
  status: "cancelada",
}

const CONFIG_HABILITADA = { fiscalEnabled: true }
const CONFIG_DESABILITADA = { fiscalEnabled: false }

const SNAPSHOT_OK = {
  ok: true as const,
  created: true,
  notaFiscalId: "nf-1",
  localKey: "nfce-snapshot:loja-1:venda-1",
  diagnostico: {
    prontoParaEmissao: true,
    pendencias: [],
    itensSemFiscal: [],
  },
  snapshotHash: "a".repeat(64),
  hashContratoVersao: 1,
}

const SNAPSHOT_JA_EXISTENTE = {
  ok: true as const,
  created: false,
  notaFiscalId: "nf-1",
  localKey: "nfce-snapshot:loja-1:venda-1",
  diagnostico: null,
  snapshotHash: "a".repeat(64),
  hashContratoVersao: 1,
}

const SNAPSHOT_COM_PENDENCIAS = {
  ok: true as const,
  created: true,
  notaFiscalId: "nf-1",
  localKey: "nfce-snapshot:loja-1:venda-1",
  diagnostico: {
    prontoParaEmissao: false,
    pendencias: ["NCM", "CFOP"],
    itensSemFiscal: [1],
  },
  snapshotHash: "b".repeat(64),
  hashContratoVersao: 1,
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Fail-closed ──────────────────────────────────────────────────────────────────────

describe("solicitarEmissaoVenda · fail-closed (default-off)", () => {
  it("loja sem `fiscalEnabled` → 423 Locked (não ativa, não emite, não cria job)", async () => {
    db.vendaFindFirst.mockResolvedValueOnce(VENDA_NAO_FISCAL)
    db.configFindUnique.mockResolvedValueOnce(CONFIG_DESABILITADA)

    const r = await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-1",
      operador: "Admin",
    })

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(423)
      expect(r.code).toBe("loja_fiscal_desabilitada")
    }
    // NÃO chama o snapshot service (fail-closed ANTES de congelar).
    expect(snapshotService.createVendaFiscalSnapshot).not.toHaveBeenCalled()
    // NÃO transiciona a venda.
    expect(db.vendaUpdate).not.toHaveBeenCalled()
  })

  it("loja sem configuração fiscal (config null) → 423 Locked", async () => {
    db.vendaFindFirst.mockResolvedValueOnce(VENDA_NAO_FISCAL)
    db.configFindUnique.mockResolvedValueOnce(null)

    const r = await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-1",
      operador: "Admin",
    })

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(423)
      expect(r.code).toBe("loja_fiscal_desabilitada")
    }
    expect(snapshotService.createVendaFiscalSnapshot).not.toHaveBeenCalled()
    expect(db.vendaUpdate).not.toHaveBeenCalled()
  })

  it("produção inerte: default-off garante que nenhuma loja não-habilitada emite", async () => {
    // Simula 3 lojas, todas desabilitadas — nenhuma deve passar do fail-closed.
    for (const sid of ["loja-1", "loja-2", "loja-3"]) {
      db.vendaFindFirst.mockResolvedValueOnce(VENDA_NAO_FISCAL)
      db.configFindUnique.mockResolvedValueOnce(CONFIG_DESABILITADA)
      const r = await solicitarEmissaoVenda({
        storeId: sid,
        pedidoId: "VDA-1",
        operador: "Admin",
      })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.status).toBe(423)
    }
    expect(snapshotService.createVendaFiscalSnapshot).not.toHaveBeenCalled()
    expect(db.vendaUpdate).not.toHaveBeenCalled()
  })
})

// ── Transição de estado ──────────────────────────────────────────────────────────────

describe("solicitarEmissaoVenda · transição NAO_FISCAL → PENDENTE", () => {
  it("NAO_FISCAL + fiscalEnabled + snapshot OK → transiciona para PENDENTE", async () => {
    db.vendaFindFirst.mockResolvedValueOnce(VENDA_NAO_FISCAL)
    db.configFindUnique.mockResolvedValueOnce(CONFIG_HABILITADA)
    snapshotService.createVendaFiscalSnapshot.mockResolvedValueOnce(SNAPSHOT_OK)
    db.vendaUpdate.mockResolvedValueOnce({ ...VENDA_NAO_FISCAL, fiscalStatus: "PENDENTE" })

    const r = await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-1",
      operador: "Admin",
    })

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.transitioned).toBe(true)
      expect(r.created).toBe(true)
      expect(r.snapshotHash).toBe("a".repeat(64))
      expect(r.hashContratoVersao).toBe(1)
      expect(r.contratoVersao).toBe(1)
    }
    // ÚNICA escrita de negócio: Venda.fiscalStatus → PENDENTE.
    expect(db.vendaUpdate).toHaveBeenCalledTimes(1)
    const updateCall = db.vendaUpdate.mock.calls[0][0]
    expect(updateCall.where.id).toBe("venda-1")
    expect(updateCall.data.fiscalStatus).toBe(FiscalStatusVenda.PENDENTE)
  })

  it("venda não encontrada → 404", async () => {
    db.vendaFindFirst.mockResolvedValueOnce(null)

    const r = await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-INEXISTENTE",
      operador: "Admin",
    })

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(404)
      expect(r.code).toBe("venda_nao_encontrada")
    }
    expect(db.vendaUpdate).not.toHaveBeenCalled()
  })

  it("venda cancelada → 409 (não pode solicitar emissão)", async () => {
    db.vendaFindFirst.mockResolvedValueOnce(VENDA_CANCELADA)

    const r = await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-1",
      operador: "Admin",
    })

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(409)
      expect(r.code).toBe("venda_cancelada")
    }
    expect(snapshotService.createVendaFiscalSnapshot).not.toHaveBeenCalled()
    expect(db.vendaUpdate).not.toHaveBeenCalled()
  })

  it("venda EMITINDO → 409 (não pode re-solicitar de estado avançado)", async () => {
    db.vendaFindFirst.mockResolvedValueOnce(VENDA_EMITINDO)

    const r = await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-1",
      operador: "Admin",
    })

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(409)
      expect(r.code).toBe("fiscal_status_invalido")
    }
    expect(snapshotService.createVendaFiscalSnapshot).not.toHaveBeenCalled()
    expect(db.vendaUpdate).not.toHaveBeenCalled()
  })

  it("snapshot falha (loja sem identidade fiscal) → 422 (não transiciona)", async () => {
    db.vendaFindFirst.mockResolvedValueOnce(VENDA_NAO_FISCAL)
    db.configFindUnique.mockResolvedValueOnce(CONFIG_HABILITADA)
    snapshotService.createVendaFiscalSnapshot.mockResolvedValueOnce({
      ok: false,
      code: "loja_sem_identidade_fiscal",
      error: "Loja sem CNPJ/razão social/UF.",
      pendencias: ["CNPJ", "Razão social", "UF"],
    })

    const r = await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-1",
      operador: "Admin",
    })

    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(422)
      expect(r.code).toBe("loja_sem_identidade_fiscal")
      expect(r.pendencias).toEqual(["CNPJ", "Razão social", "UF"])
    }
    // NÃO transiciona se o snapshot falhou.
    expect(db.vendaUpdate).not.toHaveBeenCalled()
  })
})

// ── Idempotência ─────────────────────────────────────────────────────────────────────

describe("solicitarEmissaoVenda · idempotência (PENDENTE re-chamado)", () => {
  it("PENDENTE + snapshot já existe → não re-transiciona, retorna hash existente", async () => {
    db.vendaFindFirst.mockResolvedValueOnce(VENDA_PENDENTE)
    db.configFindUnique.mockResolvedValueOnce(CONFIG_HABILITADA)
    snapshotService.createVendaFiscalSnapshot.mockResolvedValueOnce(SNAPSHOT_JA_EXISTENTE)

    const r = await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-1",
      operador: "Admin",
    })

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.transitioned).toBe(false) // já estava PENDENTE
      expect(r.created).toBe(false) // snapshot já existia
      expect(r.snapshotHash).toBe("a".repeat(64)) // hash do snapshot existente
    }
    // NÃO chama venda.update (já está PENDENTE — idempotente).
    expect(db.vendaUpdate).not.toHaveBeenCalled()
  })

  it("NAO_FISCAL + snapshot já existe (race) → transiciona mas created=false", async () => {
    // Cenário: a NotaFiscal foi criada por outra chamada concorrente, mas a
    // Venda ainda está NAO_FISCAL. A runtime deve transicionar para PENDENTE
    // e retornar o snapshot existente (created=false).
    db.vendaFindFirst.mockResolvedValueOnce(VENDA_NAO_FISCAL)
    db.configFindUnique.mockResolvedValueOnce(CONFIG_HABILITADA)
    snapshotService.createVendaFiscalSnapshot.mockResolvedValueOnce(SNAPSHOT_JA_EXISTENTE)
    db.vendaUpdate.mockResolvedValueOnce({ ...VENDA_NAO_FISCAL, fiscalStatus: "PENDENTE" })

    const r = await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-1",
      operador: "Admin",
    })

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.transitioned).toBe(true) // estava NAO_FISCAL → transiciona
      expect(r.created).toBe(false) // snapshot já existia (race)
    }
    expect(db.vendaUpdate).toHaveBeenCalledTimes(1)
  })

  it("chamar 2× seguidas: 1ª cria+transiciona, 2ª idempotente (não re-transiciona)", async () => {
    // 1ª chamada: NAO_FISCAL → cria snapshot + transiciona
    db.vendaFindFirst.mockResolvedValueOnce(VENDA_NAO_FISCAL)
    db.configFindUnique.mockResolvedValueOnce(CONFIG_HABILITADA)
    snapshotService.createVendaFiscalSnapshot.mockResolvedValueOnce(SNAPSHOT_OK)
    db.vendaUpdate.mockResolvedValueOnce({ ...VENDA_NAO_FISCAL, fiscalStatus: "PENDENTE" })

    const r1 = await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-1",
      operador: "Admin",
    })
    expect(r1.ok).toBe(true)
    let r1Hash = ""
    if (r1.ok) {
      expect(r1.transitioned).toBe(true)
      expect(r1.created).toBe(true)
      r1Hash = r1.snapshotHash
    }

    // 2ª chamada: PENDENTE → snapshot já existe, não re-transiciona
    db.vendaFindFirst.mockResolvedValueOnce(VENDA_PENDENTE)
    db.configFindUnique.mockResolvedValueOnce(CONFIG_HABILITADA)
    snapshotService.createVendaFiscalSnapshot.mockResolvedValueOnce(SNAPSHOT_JA_EXISTENTE)

    const r2 = await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-1",
      operador: "Admin",
    })
    expect(r2.ok).toBe(true)
    if (r2.ok) {
      expect(r2.transitioned).toBe(false)
      expect(r2.created).toBe(false)
      expect(r2.snapshotHash).toBe(r1Hash) // mesmo hash (imutável)
    }

    // Total: 1 update (só na 1ª chamada).
    expect(db.vendaUpdate).toHaveBeenCalledTimes(1)
  })
})

// ── Validação de elegibilidade fiscal ─────────────────────────────────────────────────

describe("solicitarEmissaoVenda · validação de elegibilidade fiscal", () => {
  it("produtos com pendências → transiciona mesmo assim (diagnóstico registrado)", async () => {
    // O snapshot é CONGELADO com pendências — a transição acontece porque a
    // solicitação foi feita. A emissão futura verificará o diagnóstico.
    db.vendaFindFirst.mockResolvedValueOnce(VENDA_NAO_FISCAL)
    db.configFindUnique.mockResolvedValueOnce(CONFIG_HABILITADA)
    snapshotService.createVendaFiscalSnapshot.mockResolvedValueOnce(SNAPSHOT_COM_PENDENCIAS)
    db.vendaUpdate.mockResolvedValueOnce({ ...VENDA_NAO_FISCAL, fiscalStatus: "PENDENTE" })

    const r = await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-1",
      operador: "Admin",
    })

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.transitioned).toBe(true)
      expect(r.diagnostico?.prontoParaEmissao).toBe(false)
      expect(r.diagnostico?.pendencias).toEqual(["NCM", "CFOP"])
      expect(r.diagnostico?.itensSemFiscal).toEqual([1])
    }
    expect(db.vendaUpdate).toHaveBeenCalledTimes(1)
  })
})

// ── Não-releitura de dado vivo ────────────────────────────────────────────────────────

describe("solicitarEmissaoVenda · não relê dados vivos após congelar", () => {
  it("`venda.findFirst` chamado exatamente 1× (não re-lê após snapshot)", async () => {
    db.vendaFindFirst.mockResolvedValueOnce(VENDA_NAO_FISCAL)
    db.configFindUnique.mockResolvedValueOnce(CONFIG_HABILITADA)
    snapshotService.createVendaFiscalSnapshot.mockResolvedValueOnce(SNAPSHOT_OK)
    db.vendaUpdate.mockResolvedValueOnce({ ...VENDA_NAO_FISCAL, fiscalStatus: "PENDENTE" })

    await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-1",
      operador: "Admin",
    })

    // A runtime carrega a venda 1× (para validar estado). O snapshot service
    // carrega novamente (internamente), mas a runtime NÃO re-lê após o snapshot.
    // O diagnóstico no resultado vem do snapshot CONGELADO, não de um re-read.
    expect(db.vendaFindFirst).toHaveBeenCalledTimes(1)
  })

  it("resultado vem do snapshot congelado (diagnostico), não de re-read da venda", async () => {
    db.vendaFindFirst.mockResolvedValueOnce(VENDA_NAO_FISCAL)
    db.configFindUnique.mockResolvedValueOnce(CONFIG_HABILITADA)
    snapshotService.createVendaFiscalSnapshot.mockResolvedValueOnce(SNAPSHOT_OK)
    db.vendaUpdate.mockResolvedValueOnce({ ...VENDA_NAO_FISCAL, fiscalStatus: "PENDENTE" })

    const r = await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-1",
      operador: "Admin",
    })

    expect(r.ok).toBe(true)
    if (r.ok) {
      // O diagnóstico é do snapshot (não re-lido da venda).
      expect(r.diagnostico).toEqual(SNAPSHOT_OK.diagnostico)
      expect(r.snapshotHash).toBe(SNAPSHOT_OK.snapshotHash)
      expect(r.localKey).toBe(SNAPSHOT_OK.localKey)
    }
  })
})

// ── Imutabilidade após solicitação ────────────────────────────────────────────────────

describe("solicitarEmissaoVenda · imutabilidade após solicitação", () => {
  it("hash do snapshot não muda entre chamadas idempotentes", async () => {
    // 1ª chamada
    db.vendaFindFirst.mockResolvedValueOnce(VENDA_NAO_FISCAL)
    db.configFindUnique.mockResolvedValueOnce(CONFIG_HABILITADA)
    snapshotService.createVendaFiscalSnapshot.mockResolvedValueOnce(SNAPSHOT_OK)
    db.vendaUpdate.mockResolvedValueOnce({ ...VENDA_NAO_FISCAL, fiscalStatus: "PENDENTE" })

    const r1 = await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-1",
      operador: "Admin",
    })
    expect(r1.ok).toBe(true)

    // 2ª chamada (idempotente) — mesmo hash
    db.vendaFindFirst.mockResolvedValueOnce(VENDA_PENDENTE)
    db.configFindUnique.mockResolvedValueOnce(CONFIG_HABILITADA)
    snapshotService.createVendaFiscalSnapshot.mockResolvedValueOnce(SNAPSHOT_JA_EXISTENTE)

    const r2 = await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-1",
      operador: "Admin",
    })
    expect(r2.ok).toBe(true)
    if (r1.ok && r2.ok) {
      expect(r2.snapshotHash).toBe(r1.snapshotHash)
      expect(r2.hashContratoVersao).toBe(r1.hashContratoVersao)
      expect(r2.contratoVersao).toBe(r1.contratoVersao)
    }
  })
})

// ── Guards das rotas comerciais com venda PENDENTE ────────────────────────────────────

describe("guards das rotas comerciais · venda PENDENTE", () => {
  it("assertVendaFiscalEditavel(PENDENTE) → ok (corrigir permitido)", () => {
    const gate = assertVendaFiscalEditavel({ fiscalStatus: "PENDENTE" })
    expect(gate.ok).toBe(true)
  })

  it("assertVendaFiscalCancelavel(PENDENTE) → ok (cancelar operacional permitido)", () => {
    const gate = assertVendaFiscalCancelavel({ fiscalStatus: "PENDENTE" })
    expect(gate.ok).toBe(true)
  })

  it("canEmitirFiscalmente(PENDENTE) → true (pronto para emissão futura)", () => {
    expect(canEmitirFiscalmente("PENDENTE")).toBe(true)
  })

  it("assertVendaFiscalEditavel(EMITINDO) → bloqueia (409)", () => {
    const gate = assertVendaFiscalEditavel({ fiscalStatus: "EMITINDO" })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(409)
      expect(gate.code).toBe("fiscal_bloqueio_emitindo")
    }
  })

  it("assertVendaFiscalEditavel(AUTORIZADA) → bloqueia (409)", () => {
    const gate = assertVendaFiscalEditavel({ fiscalStatus: "AUTORIZADA" })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(409)
      expect(gate.code).toBe("fiscal_bloqueio_autorizada")
    }
  })

  it("assertVendaFiscalCancelavel(AUTORIZADA) → bloqueia (cancelamento operacional)", () => {
    const gate = assertVendaFiscalCancelavel({ fiscalStatus: "AUTORIZADA" })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(409)
    }
  })
})

// ── Zero job, zero emissão, zero SEFAZ ────────────────────────────────────────────────

describe("solicitarEmissaoVenda · invariantes do GOAL-005", () => {
  it("não cria FiscalEmissaoJob (zero job)", async () => {
    db.vendaFindFirst.mockResolvedValueOnce(VENDA_NAO_FISCAL)
    db.configFindUnique.mockResolvedValueOnce(CONFIG_HABILITADA)
    snapshotService.createVendaFiscalSnapshot.mockResolvedValueOnce(SNAPSHOT_OK)
    db.vendaUpdate.mockResolvedValueOnce({ ...VENDA_NAO_FISCAL, fiscalStatus: "PENDENTE" })

    await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-1",
      operador: "Admin",
    })

    // O mock do prisma NÃO tem `fiscalEmissaoJob` — se a runtime tentasse criar
    // um job, o teste falharia com "Cannot read properties of undefined".
    // Esta asserção documenta a invariante: zero job.
    expect(db.vendaUpdate).toHaveBeenCalledTimes(1)
    expect(db.vendaUpdate.mock.calls[0][0].data.fiscalStatus).toBe(FiscalStatusVenda.PENDENTE)
  })

  it("única escrita de negócio: Venda.fiscalStatus (nada mais)", async () => {
    db.vendaFindFirst.mockResolvedValueOnce(VENDA_NAO_FISCAL)
    db.configFindUnique.mockResolvedValueOnce(CONFIG_HABILITADA)
    snapshotService.createVendaFiscalSnapshot.mockResolvedValueOnce(SNAPSHOT_OK)
    db.vendaUpdate.mockResolvedValueOnce({ ...VENDA_NAO_FISCAL, fiscalStatus: "PENDENTE" })

    await solicitarEmissaoVenda({
      storeId: "loja-1",
      pedidoId: "VDA-1",
      operador: "Admin",
    })

    // A runtime só chama `venda.update` — não chama `notaFiscal.update`,
    // `fiscalEmissaoJob.create`, nem qualquer outro write de negócio.
    expect(db.vendaUpdate).toHaveBeenCalledTimes(1)
    const updateData = db.vendaUpdate.mock.calls[0][0].data
    expect(Object.keys(updateData)).toEqual(["fiscalStatus"])
    expect(updateData.fiscalStatus).toBe(FiscalStatusVenda.PENDENTE)
  })
})
