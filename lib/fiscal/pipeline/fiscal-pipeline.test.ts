/**
 * BL-FISCAL-008 — Pipeline fiscal ponta-a-ponta (homologação a seco, dormente).
 *
 * Cobre: fluxo feliz, snapshot inválido, erro de assinatura, erro de provider, erro de validação,
 * XML adulterado, pipeline determinístico. Tudo simulado — sem persistência, sem transmissão.
 */
import { describe, it, expect } from "vitest"
import { runFiscalPipeline, runFiscalPipelineDetailed } from "./index"
import { dryRunSnapshot } from "../dry-run"
import { createMockProvider } from "../provider"
import { verifyNfceSignature } from "../signing"

const CTX = { serie: 1, numero: 42 }

describe("runFiscalPipeline · fluxo feliz (stub homologação)", () => {
  it("dry-run + provider autorizam (simulado); relatório consolidado coerente", async () => {
    const r = await runFiscalPipeline(dryRunSnapshot("simples"), { contexto: CTX })
    expect(r.assinaturaValida).toBe(true)
    expect(r.dryRun.validacaoEstrutural.ok).toBe(true)
    expect(r.provider?.simulado).toBe(true)
    expect(r.provider?.emissao?.ok).toBe(true)
    expect(r.provider?.emissao?.statusNota).toBe("AUTORIZADA")
    expect(r.provider?.emissao?.chaveAcesso).toMatch(/^SIM-CHAVE-/)
    expect(r.chaveAcesso).toMatch(/^\d{44}$/)
    expect(r.prontoParaHomologacao).toBe(true)
    expect(r.descartado).toBe(true)
    // etapas todas ok
    const st = (n: string) => r.etapas.find((e) => e.nome === n)?.status
    expect(st("dry_run")).toBe("pendente") // XSD não configurado → dry-run pendente, mas não erro
    expect(st("provider_emissao")).toBe("ok")
  })
})

describe("runFiscalPipeline · snapshot inválido", () => {
  it("item sem NCM → status erro, provider pulado, nada autorizado", async () => {
    const r = await runFiscalPipeline(dryRunSnapshot("invalido_item_sem_ncm"), { contexto: CTX })
    expect(r.status).toBe("erro")
    expect(r.provider).toBeNull()
    expect(r.prontoParaHomologacao).toBe(false)
    expect(r.etapas.find((e) => e.nome === "provider_emissao")?.status).toBe("pulada")
    expect(r.descartado).toBe(true)
  })
})

describe("runFiscalPipeline · erro de assinatura", () => {
  it("material de certificado ausente → assinatura falha → provider pulado", async () => {
    const r = await runFiscalPipeline(dryRunSnapshot("simples"), {
      contexto: CTX,
      certificado: { privateKeyPem: "", certificatePem: "" },
    })
    expect(r.status).toBe("erro")
    expect(r.assinaturaValida).toBe(false)
    expect(r.provider).toBeNull()
    expect(r.dryRun.etapas.find((e) => e.nome === "assinatura")?.status).toBe("erro")
  })
})

describe("runFiscalPipeline · erro de provider (MockProvider)", () => {
  it("provider.emitir → erro: pipeline erro, dry-run ainda ok", async () => {
    const provider = createMockProvider({ outcomes: { emitir: "erro" }, clock: () => "2027-06-01T12:00:00.000Z" })
    const r = await runFiscalPipeline(dryRunSnapshot("simples"), { contexto: CTX, provider })
    expect(r.dryRun.assinaturaValida).toBe(true) // a assinatura passou
    expect(r.provider?.emissao?.ok).toBe(false)
    expect(r.provider?.emissao?.resultado).toBe("erro")
    expect(r.status).toBe("erro")
    expect(r.prontoParaHomologacao).toBe(false)
  })

  it("provider.emitir → rejeitado: pipeline erro com rejeição", async () => {
    const provider = createMockProvider({ outcomes: { emitir: "rejeitado" }, clock: () => "2027-06-01T12:00:00.000Z" })
    const r = await runFiscalPipeline(dryRunSnapshot("simples"), { contexto: CTX, provider })
    expect(r.provider?.emissao?.statusNota).toBe("REJEITADA")
    expect(r.status).toBe("erro")
  })
})

describe("runFiscalPipeline · erro de validação (tributação fora do baseline)", () => {
  it("regime normal → XML não gera → pipeline erro, provider pulado", async () => {
    // snapshot com regime fora do baseline (tributacao.ok=false) construído a partir do fixture
    const base = dryRunSnapshot("simples")
    const invalido = {
      ...base,
      tributacao: { ...base.tributacao!, ok: false, pendencias: ["regime fora do baseline"], itens: [] },
    }
    const r = await runFiscalPipeline(invalido, { contexto: CTX })
    expect(r.status).toBe("erro")
    expect(r.provider).toBeNull()
  })
})

describe("runFiscalPipeline · XML adulterado é detectável", () => {
  it("adulterar o XML assinado produzido pelo pipeline invalida a verificação", async () => {
    const d = await runFiscalPipelineDetailed(dryRunSnapshot("simples"), { contexto: CTX })
    expect(d.xmlAssinado).toBeTruthy()
    const tampered = d.xmlAssinado!.replace("<vNF>50.00</vNF>", "<vNF>1.00</vNF>")
    const v = verifyNfceSignature(tampered)
    expect(v.valido).toBe(false)
    expect(v.digestConfere).toBe(false)
  })
})

describe("runFiscalPipeline · determinístico", () => {
  it("mesma entrada (stub) → relatório consolidado byte-idêntico (sem timestamps)", async () => {
    const a = await runFiscalPipeline(dryRunSnapshot("simples"), { contexto: CTX })
    const b = await runFiscalPipeline(dryRunSnapshot("simples"), { contexto: CTX })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it("relatório consolidado NÃO contém XML nem certificado (só hashes/status)", async () => {
    const r = await runFiscalPipeline(dryRunSnapshot("simples"), { contexto: CTX })
    const blob = JSON.stringify(r)
    expect(blob).not.toContain("<infNFe")
    expect(blob).not.toContain("BEGIN PRIVATE KEY")
    expect(blob).not.toContain("BEGIN CERTIFICATE")
    // hashes presentes no dry-run aninhado
    expect(r.dryRun.hashXmlAssinado).toMatch(/^[0-9a-f]{64}$/)
  })
})
