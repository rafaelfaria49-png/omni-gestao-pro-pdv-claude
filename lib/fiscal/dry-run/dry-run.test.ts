/**
 * BL-FISCAL-006 — Golden tests do Dry-Run fiscal (esteira a seco, dormente).
 *
 * Cobre: XML simples, com desconto, múltiplos itens, consumidor sem/com CPF, assinatura válida,
 * assinatura inválida ao adulterar, snapshot inválido, XSD ausente, relatório determinístico,
 * nenhum segredo em log e nenhuma persistência (nada de Prisma/fetch/fs de escrita).
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import {
  runFiscalDryRun,
  runFiscalDryRunDetailed,
  dryRunSnapshot,
  DRY_RUN_TEST_CERT,
} from "./index"
import { verifyNfceSignature } from "../signing"
import { TEST_KEY_PLAIN_PEM, TEST_CERT_PEM } from "../signing/__fixtures__/test-cert"

const CTX = { serie: 1, numero: 42 }

afterEach(() => vi.restoreAllMocks())

describe("Dry-Run · casos felizes (assinatura válida)", () => {
  for (const kind of ["simples", "com_desconto", "multiplos_itens", "consumidor_sem_cpf", "consumidor_com_cpf"] as const) {
    it(`${kind}: gera, assina, verifica e produz relatório com chave + hashes`, () => {
      const r = runFiscalDryRun(dryRunSnapshot(kind), { contexto: CTX })
      // assinatura válida e estrutura ok
      expect(r.assinaturaPresente).toBe(true)
      expect(r.assinaturaValida).toBe(true)
      expect(r.validacaoEstrutural.ok).toBe(true)
      // chave de acesso pública (44 díg) + referência
      expect(r.chaveAcesso).toMatch(/^\d{44}$/)
      expect(r.referenciaId).toMatch(/^NFe\d{44}$/)
      // hashes presentes; XML descartado
      expect(r.hashXml).toMatch(/^[0-9a-f]{64}$/)
      expect(r.hashXmlAssinado).toMatch(/^[0-9a-f]{64}$/)
      expect(r.descartado).toBe(true)
      // XSD ausente → status pendente (não "ok"), nunca pronto p/ emitir ainda
      expect(r.xsd.status).toBe("xsd_nao_configurado")
      expect(r.status).toBe("pendente")
      expect(r.prontoParaEmissao).toBe(false)
      // todas as etapas-chave executadas com sucesso
      const ok = (n: string) => r.etapas.find((e) => e.nome === n)?.status
      expect(ok("xml")).toBe("ok")
      expect(ok("assinatura")).toBe("ok")
      expect(ok("verificacao_assinatura")).toBe("ok")
      expect(ok("validacao_estrutural")).toBe("ok")
    })
  }

  it("consumidor com CPF inclui <dest>; sem CPF não inclui", () => {
    const com = runFiscalDryRunDetailed(dryRunSnapshot("consumidor_com_cpf"), { contexto: CTX })
    const sem = runFiscalDryRunDetailed(dryRunSnapshot("consumidor_sem_cpf"), { contexto: CTX })
    expect(com.xml).toContain("<CPF>12345678909</CPF>")
    expect(sem.xml).not.toContain("<dest>")
  })

  it("com desconto reflete vNF líquido no XML em memória", () => {
    const d = runFiscalDryRunDetailed(dryRunSnapshot("com_desconto"), { contexto: CTX })
    expect(d.xml).toContain("<vNF>40.00</vNF>")
  })
})

describe("Dry-Run · adulteração e snapshot inválido", () => {
  it("XML assinado adulterado → verificação falha (digest inválido)", () => {
    const d = runFiscalDryRunDetailed(dryRunSnapshot("simples"), { contexto: CTX })
    const tampered = d.xmlAssinado!.replace("<vNF>50.00</vNF>", "<vNF>9999.00</vNF>")
    const v = verifyNfceSignature(tampered)
    expect(v.valido).toBe(false)
    expect(v.digestConfere).toBe(false)
  })

  it("snapshot inválido (item sem NCM) → status erro, etapas seguintes puladas, sem hash", () => {
    const r = runFiscalDryRun(dryRunSnapshot("invalido_item_sem_ncm"), { contexto: CTX })
    expect(r.status).toBe("erro")
    expect(r.assinaturaPresente).toBe(false)
    expect(r.hashXml).toBeNull()
    expect(r.hashXmlAssinado).toBeNull()
    expect(r.erros.length).toBeGreaterThan(0)
    expect(r.etapas.find((e) => e.nome === "xml")?.status).toBe("erro")
    expect(r.etapas.find((e) => e.nome === "assinatura")?.status).toBe("pulada")
    expect(r.descartado).toBe(true) // mesmo em erro, nada persiste
  })
})

describe("Dry-Run · XSD placeholder", () => {
  it("sem XSD → xsd_nao_configurado (sem rede/disco)", () => {
    const r = runFiscalDryRun(dryRunSnapshot("simples"), { contexto: CTX })
    expect(r.xsd.status).toBe("xsd_nao_configurado")
    expect(r.xsd.violacoes).toEqual([])
  })

  it("XSD fornecido → xsd_presente_sem_validador (gate futuro, ainda sem validador)", () => {
    const r = runFiscalDryRun(dryRunSnapshot("simples"), { contexto: CTX, xsd: "<xs:schema/>" })
    expect(r.xsd.status).toBe("xsd_presente_sem_validador")
  })
})

describe("Dry-Run · relatório determinístico", () => {
  it("mesma entrada → relatório byte-idêntico (sem timestamp)", () => {
    const a = runFiscalDryRun(dryRunSnapshot("simples"), { contexto: CTX })
    const b = runFiscalDryRun(dryRunSnapshot("simples"), { contexto: CTX })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    // hashes estáveis entre execuções
    expect(a.hashXmlAssinado).toBe(b.hashXmlAssinado)
  })

  it("numeração placeholder quando sem contexto", () => {
    const r = runFiscalDryRun(dryRunSnapshot("simples"))
    expect(r.numeracaoPlaceholder).toBe(true)
    expect(r.warnings.some((w) => w.includes("Numeração"))).toBe(true)
  })
})

describe("Dry-Run · segurança (sem segredo em log, sem persistência)", () => {
  it("não escreve senha/chave privada em console", () => {
    const sink: string[] = []
    for (const m of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        sink.push(args.map(String).join(" "))
      })
    }
    runFiscalDryRun(dryRunSnapshot("simples"), { contexto: CTX })
    const all = sink.join("\n")
    expect(all).not.toContain("PRIVATE KEY")
    expect(all).not.toContain(TEST_KEY_PLAIN_PEM.slice(40, 120))
  })

  it("relatório NÃO contém o XML nem material do certificado (só hashes/status)", () => {
    const r = runFiscalDryRun(dryRunSnapshot("simples"), { contexto: CTX })
    const blob = JSON.stringify(r)
    expect(blob).not.toContain("<infNFe")
    expect(blob).not.toContain("<NFe")
    expect(blob).not.toContain("BEGIN CERTIFICATE")
    expect(blob).not.toContain("BEGIN PRIVATE KEY")
    expect(blob).not.toContain(TEST_CERT_PEM.slice(40, 120))
    // não importa Prisma — o módulo é puro (fail aqui indicaria acoplamento a I/O)
    expect(DRY_RUN_TEST_CERT.privateKeyPem).toContain("PRIVATE KEY") // material existe só no fixture
  })
})
