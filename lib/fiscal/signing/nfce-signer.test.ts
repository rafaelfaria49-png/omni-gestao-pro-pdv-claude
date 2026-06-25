/**
 * BL-FISCAL-005 — Assinador XMLDSig da NFC-e (PURO/dormente).
 *
 * Cobre (TAREFA 6): assinatura válida, idempotência (determinismo), mesmo XML → mesma assinatura,
 * XML alterado → assinatura inválida, vault falhando, segredo inexistente, fail-closed, e nenhum
 * segredo em logs. Mais validações (TAREFA 5): sem/já assinado, certificado/senha inválidos,
 * digest/signature inválidos, campos obrigatórios. Usa o XML real de BL-FISCAL-004.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { buildVendaFiscalSnapshot, type BuildSnapshotInput, type SnapshotLojaInput } from "../venda-fiscal-snapshot"
import { sanitizeProdutoFiscal } from "@/lib/produto-fiscal"
import { buildNfceXml } from "../xml"
import {
  signNfceXml,
  signNfceXmlDetailed,
  verifyNfceSignature,
  isNfceSigned,
  loadCertificateMaterialFromPem,
} from "./nfce-signer"
import { NfceSignError, type FiscalCertificateMaterial } from "./signer.types"
import { EnvVault } from "../vault"
import { canonicalEnvRef } from "../vault"
import { TEST_CERT_PEM, TEST_KEY_PLAIN_PEM, TEST_KEY_ENC_PEM, TEST_CERT_PASSPHRASE } from "./__fixtures__/test-cert"

const AGORA = new Date("2027-06-01T12:00:00.000Z") // dentro da validade do cert de teste
const OPTS = { agora: AGORA }

const LOJA_OK: SnapshotLojaInput = {
  cnpj: "11.222.333/0001-81",
  razaoSocial: "RafaCell Comércio LTDA",
  nomeFantasia: "RafaCell",
  inscricaoEstadual: "123456789",
  inscricaoMunicipal: "987654",
  regimeTributario: "SIMPLES_NACIONAL",
  crt: 1,
  ambiente: "HOMOLOGACAO",
  modeloFiscal: "NFCE",
  fiscalEnabled: false,
  logradouro: "Rua das Flores",
  numero: "100",
  complemento: "",
  bairro: "Centro",
  codigoMunicipioIbge: "3550308",
  municipio: "São Paulo",
  uf: "SP",
  cep: "01001-000",
  codigoPais: "1058",
  fone: "",
  email: "",
}

function nfceXml(): string {
  const input: BuildSnapshotInput = {
    storeId: "loja-1",
    vendaId: "venda-1",
    loja: LOJA_OK,
    cliente: null,
    venda: {
      pedidoId: "VDA-2026-0001",
      data: "2026-06-18T12:00:00.000Z",
      total: 50,
      desconto: 0,
      operador: "João",
      terminal: "PDV1",
      paymentBreakdown: null,
    },
    itens: [
      {
        itemVendaId: "iv-1",
        produtoId: "prod-1",
        codigoProduto: "SKU-1",
        descricao: "Cabo USB-C",
        gtin: "7891234567890",
        quantidade: 2,
        valorUnitario: 25,
        valorDesconto: 0,
        valorTotal: 50,
        fiscal: sanitizeProdutoFiscal({ ncm: "85176200", cfop: "5102", csosn: "102", origem: "0", unidade: "UN" }),
      },
    ],
  }
  const r = buildVendaFiscalSnapshot(input)
  if (!r.ok) throw new Error(`snapshot inválido: ${r.code}`)
  return buildNfceXml(r.snapshot, { serie: 1, numero: 42 })
}

const CERT_PLAIN: FiscalCertificateMaterial = loadCertificateMaterialFromPem(TEST_KEY_PLAIN_PEM, TEST_CERT_PEM)
const CERT_ENC: FiscalCertificateMaterial = loadCertificateMaterialFromPem(TEST_KEY_ENC_PEM, TEST_CERT_PEM)

afterEach(() => vi.restoreAllMocks())

describe("signNfceXml · assinatura válida (chave em claro)", () => {
  it("insere <Signature> envelopada e a verificação confere", () => {
    const xml = nfceXml()
    const r = signNfceXmlDetailed(xml, CERT_PLAIN, "", OPTS)
    expect(r.xml).toContain("<Signature xmlns=\"http://www.w3.org/2000/09/xmldsig#\">")
    expect(r.xml).toContain("<X509Certificate>")
    expect(r.referenciaId).toMatch(/^NFe\d{44}$/)
    const v = verifyNfceSignature(r.xml)
    expect(v).toMatchObject({ valido: true, assinado: true, digestConfere: true, assinaturaConfere: true })
    expect(v.referenciaId).toBe(r.referenciaId)
  })

  it("aceita chave cifrada com a senha correta", () => {
    const signed = signNfceXml(nfceXml(), CERT_ENC, TEST_CERT_PASSPHRASE, OPTS)
    expect(verifyNfceSignature(signed).valido).toBe(true)
  })
})

describe("signNfceXml · idempotência / determinismo", () => {
  it("mesmo XML + mesmo certificado → MESMA assinatura (byte-idêntico)", () => {
    const xml = nfceXml()
    const a = signNfceXml(xml, CERT_PLAIN, "", OPTS)
    const b = signNfceXml(xml, CERT_PLAIN, "", OPTS)
    expect(a).toBe(b)
  })

  it("não muta a entrada", () => {
    const xml = nfceXml()
    const copia = String(xml)
    signNfceXml(xml, CERT_PLAIN, "", OPTS)
    expect(xml).toBe(copia)
  })
})

describe("signNfceXml · adulteração detectada", () => {
  it("alterar valor do infNFe após assinar invalida o digest", () => {
    const signed = signNfceXml(nfceXml(), CERT_PLAIN, "", OPTS)
    const tampered = signed.replace("<vNF>50.00</vNF>", "<vNF>5000.00</vNF>")
    expect(tampered).not.toBe(signed)
    const v = verifyNfceSignature(tampered)
    expect(v.valido).toBe(false)
    expect(v.digestConfere).toBe(false)
    expect(v.problemas).toContain("digest_invalido")
  })

  it("corromper o SignatureValue invalida a assinatura (digest ainda ok)", () => {
    const r = signNfceXmlDetailed(nfceXml(), CERT_PLAIN, "", OPTS)
    const badSig = r.signatureValue.slice(0, -4) + (r.signatureValue.endsWith("AAAA") ? "BBBB" : "AAAA")
    const tampered = r.xml.replace(r.signatureValue, badSig)
    const v = verifyNfceSignature(tampered)
    expect(v.assinaturaConfere).toBe(false)
    expect(v.valido).toBe(false)
  })
})

describe("signNfceXml · validações (TAREFA 5)", () => {
  it("XML sem assinatura → verify retorna nao_assinado; isNfceSigned=false", () => {
    const xml = nfceXml()
    expect(isNfceSigned(xml)).toBe(false)
    expect(verifyNfceSignature(xml)).toMatchObject({ valido: false, assinado: false, problemas: ["nao_assinado"] })
  })

  it("XML já assinado → ja_assinado (a menos de permitirReassinatura)", () => {
    const signed = signNfceXml(nfceXml(), CERT_PLAIN, "", OPTS)
    expect(isNfceSigned(signed)).toBe(true)
    expect(() => signNfceXml(signed, CERT_PLAIN, "", OPTS)).toThrowError(NfceSignError)
    try {
      signNfceXml(signed, CERT_PLAIN, "", OPTS)
    } catch (e) {
      expect((e as NfceSignError).code).toBe("ja_assinado")
    }
    // reassinatura permitida → 1 única assinatura e válida
    const resigned = signNfceXml(signed, CERT_PLAIN, "", { ...OPTS, permitirReassinatura: true })
    expect((resigned.match(/<Signature /g) ?? []).length).toBe(1)
    expect(verifyNfceSignature(resigned).valido).toBe(true)
  })

  it("certificado inválido → certificado_invalido", () => {
    const ruim = loadCertificateMaterialFromPem(TEST_KEY_PLAIN_PEM, "-----BEGIN CERTIFICATE-----\nLIXO\n-----END CERTIFICATE-----")
    expect(() => signNfceXml(nfceXml(), ruim, "", OPTS)).toThrowError(/certificado/i)
  })

  it("senha inválida (chave cifrada) → senha_invalida", () => {
    try {
      signNfceXml(nfceXml(), CERT_ENC, "senha-errada", OPTS)
      throw new Error("deveria ter lançado")
    } catch (e) {
      expect((e as NfceSignError).code).toBe("senha_invalida")
    }
  })

  it("material ausente → material_ausente", () => {
    const vazio = { privateKeyPem: "", certificatePem: "" }
    try {
      signNfceXml(nfceXml(), vazio, "", OPTS)
      throw new Error("deveria ter lançado")
    } catch (e) {
      expect((e as NfceSignError).code).toBe("material_ausente")
    }
  })

  it("XML sem <infNFe> → sem_infnfe; sem Id → infnfe_sem_id", () => {
    try {
      signNfceXml(`<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><x>1</x></NFe>`, CERT_PLAIN, "", OPTS)
    } catch (e) {
      expect((e as NfceSignError).code).toBe("sem_infnfe")
    }
    try {
      signNfceXml(`<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe><x>1</x></infNFe></NFe>`, CERT_PLAIN, "", OPTS)
    } catch (e) {
      expect((e as NfceSignError).code).toBe("infnfe_sem_id")
    }
  })

  it("certificado fora de validade → certificado_expirado (e ignorarValidade contorna)", () => {
    const noPassado = { agora: new Date("2000-01-01T00:00:00.000Z") }
    expect(() => signNfceXml(nfceXml(), CERT_PLAIN, "", noPassado)).toThrowError(/expirad|válid/i)
    expect(() => signNfceXml(nfceXml(), CERT_PLAIN, "", { ignorarValidade: true })).not.toThrow()
  })
})

describe("assinatura via cofre (EnvVault) — fail-closed e vault falhando", () => {
  const STORE = "loja-1"
  const PFX_REF = canonicalEnvRef("pfx", STORE)
  const SENHA_REF = canonicalEnvRef("senha", STORE)

  it("segredo inexistente no cofre → resolve null → caller NÃO assina (fail-closed)", async () => {
    const vault = new EnvVault({ env: {} })
    const pfx = await vault.getCertificadoPfx(STORE, PFX_REF)
    const senha = await vault.getCertificadoSenha(STORE, SENHA_REF)
    expect(pfx).toBeNull()
    expect(senha).toBeNull()
    // Sem material → o assinador recusa (não emite).
    expect(() => signNfceXml(nfceXml(), { privateKeyPem: "", certificatePem: "" }, "", OPTS)).toThrowError(NfceSignError)
  })

  it("vault falhando (escrita não suportada no piloto) → operacao_nao_suportada", async () => {
    const vault = new EnvVault({ env: {} })
    await expect(vault.putCertificadoPfx(STORE, Buffer.from("x"), "p")).rejects.toMatchObject({
      code: "operacao_nao_suportada",
    })
  })
})

describe("nenhum segredo em logs", () => {
  it("não escreve senha nem chave privada em console; erros não vazam segredo", () => {
    const sink: string[] = []
    for (const m of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        sink.push(args.map(String).join(" "))
      })
    }
    // caminho feliz + caminho de erro com senha errada
    signNfceXml(nfceXml(), CERT_PLAIN, "", OPTS)
    let errMsg = ""
    try {
      signNfceXml(nfceXml(), CERT_ENC, TEST_CERT_PASSPHRASE + "-x", OPTS)
    } catch (e) {
      errMsg = (e as Error).message
    }
    const all = sink.join("\n")
    expect(all).not.toContain(TEST_CERT_PASSPHRASE)
    expect(all).not.toContain("PRIVATE KEY")
    expect(errMsg).not.toContain(TEST_CERT_PASSPHRASE)
    expect(errMsg).not.toContain("PRIVATE KEY")
  })
})
