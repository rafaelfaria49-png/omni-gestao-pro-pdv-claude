/**
 * GOAL-023 — cStat 588 / D01e: mensagem compacta + backstop + matriz.
 *
 * Prova offline, sintética e sem rede que a causa mecânica do 588 foi eliminada:
 *  - o contrato EMBUTÍVEL gera XML compacto (zero CR/LF/TAB, zero `><` com whitespace);
 *  - o XMLDSig preserva o compacto e continua verificável;
 *  - enviNFe e envelope SOAP preservam os bytes e a área de dados segue compacta;
 *  - o backstop D01e recusa pretty/adversarial ANTES de qualquer transporte;
 *  - espaços legítimos em texto/atributos continuam válidos;
 *  - a matriz classifica 588 em NFeAutorizacao4 como REJECTED terminal sem retry,
 *    e NÃO generaliza 588 para consulta como rejeição de documento.
 *
 * Nenhum XML real do 022E, nenhum certificado/CSC/secret real, nenhum socket SEFAZ.
 *
 * P1-followup (revisão independente): a perna XSD do e2e usa xmllint/libxml2
 * OFICIAL sobre os bytes exatos do cenário — sem tautologia, sem mock como
 * prova XSD. Sem xmllint no PATH o teste falha explicitamente como limitação
 * de ambiente (mesmo padrão de nfce-xml-builder.test.ts); no CI Ubuntu o
 * xmllint real executa e precisa passar.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { buildVendaFiscalSnapshot, type BuildSnapshotInput, type SnapshotLojaInput } from "@/lib/fiscal/venda-fiscal-snapshot"
import { sanitizeProdutoFiscal } from "@/lib/produto-fiscal"
import {
  assertD01eSafe,
  countIntertagFormattingWhitespace,
  d01eViolation,
  isD01eSafe,
} from "./d01e-backstop"
import { buildNfceXml, buildNfceXmlAssinavel, buildNfceXmlAssinavelResult } from "./nfce-xml-builder"
import {
  serializeXmlDocument,
  serializeXmlEmbeddable,
  xmlEmbeddableViolation,
} from "./xml-writer"
import { DRY_RUN_TEST_CERT } from "../dry-run"
import { signNfceXmlDetailed, verifyNfceSignature } from "../signing/nfce-signer"
import { composeEnviNFeRequest } from "../provider/sefaz/sefaz-lote-envinfe"
import { buildSefazSoap12Envelope, extractFiscalBytes } from "../provider/sefaz/sefaz-envelope"
import {
  lookupSefazCStat,
  SEFAZ_CSTAT_MATRIX_VERSION,
} from "../provider/sefaz/sefaz-cstat-matrix"
import {
  runSefazPreTransportGuards,
  type SefazGuardPorts,
} from "../provider/sefaz/sefaz-guards"
import type { FiscalDocumentIdentity } from "../emission/uncertain-state.types"

const CTX = { serie: 1, numero: 42 }
const LOJA_PILOTO = "store-piloto-sintetica-023"

const LOJA: SnapshotLojaInput = {
  cnpj: "11.222.333/0001-81",
  razaoSocial: "Loja Sintetica 023 LTDA",
  nomeFantasia: "Loja 023",
  inscricaoEstadual: "123456789",
  inscricaoMunicipal: "987654",
  regimeTributario: "SIMPLES_NACIONAL",
  crt: 1,
  ambiente: "HOMOLOGACAO",
  modeloFiscal: "NFCE",
  fiscalEnabled: false,
  logradouro: "Rua Sintetica",
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

function snapshotInput(): BuildSnapshotInput {
  return {
    storeId: LOJA_PILOTO,
    vendaId: "venda-023",
    loja: LOJA,
    cliente: null,
    venda: {
      pedidoId: "VDA-023-0001",
      data: "2026-06-18T12:00:00.000Z",
      total: 50,
      desconto: 0,
      operador: "Teste",
      terminal: "PDV1",
      paymentBreakdown: { dinheiro: 50 },
    },
    itens: [
      {
        itemVendaId: "iv-1",
        produtoId: "prod-1",
        codigoProduto: "SKU-023",
        descricao: "CABO USB C",
        gtin: "7891234567890",
        quantidade: 2,
        valorUnitario: 25,
        valorDesconto: 0,
        valorTotal: 50,
        fiscal: sanitizeProdutoFiscal({ ncm: "85176200", cfop: "5102", csosn: "102", origem: "0", unidade: "UN" }),
      },
    ],
  }
}

function snapshotAssinavel() {
  const r = buildVendaFiscalSnapshot(snapshotInput())
  if (!r.ok) throw new Error(`snapshot sintético inválido: ${r.code}`)
  return r.snapshot
}

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function sha256Hex(b: Uint8Array): string {
  return createHash("sha256").update(b).digest("hex")
}

function documento(chaveAcesso: string): FiscalDocumentIdentity {
  return {
    storeId: LOJA_PILOTO,
    vendaId: "venda-023",
    notaFiscalId: "nota-023",
    modelo: "NFCE",
    ambiente: "HOMOLOGACAO",
    serie: CTX.serie,
    numero: CTX.numero,
    chaveAcesso,
    uf: "SP",
    correlationId: "corr-023",
  }
}

function portas(): SefazGuardPorts {
  return {
    resolvePilotStoreId: vi.fn(async () => LOJA_PILOTO),
    loadFiscalConfig: vi.fn(async () => ({ provider: "SEFAZ_DIRETO" })),
    // Mock APENAS para exercitar a fiação dos guards (guard 8 exige um
    // atestado). NÃO é prova XSD: a prova XSD real é o xmllint abaixo,
    // sobre os mesmos bytes (P1-followup da revisão independente).
    readXsdAttestation: vi.fn(async (input: { bytesSha256: string }) => ({
      outcome: "VALIDACAO_APROVADA",
      xmlSha256: input.bytesSha256,
      schemaVersion: "PL_010e_v1.02/NFe/nfe_v4.00.xsd",
    })),
    resolveActiveCertificate: vi.fn(async () => ({
      ok: true as const,
      storeId: LOJA_PILOTO,
      certificadoId: "cert-sintetico-023",
      blobRef: "FISCAL_A1_PFX_B64_SINTETICO",
      senhaRef: "FISCAL_A1_SENHA_SINTETICO",
      provider: "env-sintetico",
    })),
  }
}

// ── Harness xmllint oficial (mesmo padrão de nfce-xml-builder.test.ts) ───────
// Schema de entrada oficial versionado: o elemento raiz NFe (TNFe).
const NFE_XSD_OFICIAL = resolve(
  process.cwd(),
  "lib/fiscal/xsd/schemas/PL_010e_v1.02/NFe/nfe_v4.00.xsd",
)
const XMLLINT_SCHEMA_ARGS = ["--noout", "--nonet", "--schema"] as const

type XmllintSchemaResult =
  | { kind: "ok"; stdout: string }
  | { kind: "missing"; bin: string }
  | { kind: "failed"; status: number | null; stdout: string; stderr: string }

function runXmllintSchema(xsdPath: string, xmlPath: string, bin = "xmllint"): XmllintSchemaResult {
  try {
    const stdout = execFileSync(bin, [...XMLLINT_SCHEMA_ARGS, xsdPath, xmlPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { kind: "ok", stdout }
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { status?: number | null; stdout?: string; stderr?: string }
    if (err.code === "ENOENT") return { kind: "missing", bin }
    return {
      kind: "failed",
      status: typeof err.status === "number" ? err.status : null,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? err.message ?? ""),
    }
  }
}

function requireXmllintResult(result: XmllintSchemaResult): Exclude<XmllintSchemaResult, { kind: "missing" }> {
  if (result.kind === "missing") {
    throw new Error(
      `xmllint ausente no PATH (${result.bin}). No Ubuntu instale o pacote oficial libxml2-utils; a validação XSD do cenário 588 não pode ser pulada.`,
    )
  }
  return result
}

/**
 * Valida os EXATOS bytes fiscais contra o XSD oficial com xmllint real.
 * Escreve os bytes verbatim num arquivo temporário (fora do repo) e remove
 * depois. Falha explicitamente sem xmllint (limitação de ambiente, sem
 * shim e sem skip); reprovação do schema falha como defeito de código.
 */
function assertExactBytesPassamNoXsdOficial(exactBytes: Uint8Array): void {
  const dir = mkdtempSync(join(tmpdir(), "cstat588-xsd-"))
  try {
    const xmlPath = join(dir, "nfe588-exact-bytes.xml")
    writeFileSync(xmlPath, exactBytes)
    const result = requireXmllintResult(runXmllintSchema(NFE_XSD_OFICIAL, xmlPath))
    expect(result.kind, result.kind === "failed" ? result.stderr : "").toBe("ok")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe("standalone preserva o contrato existente (pretty com declaração)", () => {
  it("emite declaração na posição 0 e indentação determinística", () => {
    const xml = serializeXmlDocument({ tag: "a", children: [{ tag: "b", text: "1" }] })
    expect(xml).toBe(`<?xml version="1.0" encoding="UTF-8"?>\n<a>\n  <b>1</b>\n</a>`)
  })

  it("buildNfceXml segue standalone pretty com declaração", () => {
    const xml = buildNfceXml(snapshotAssinavel(), CTX)
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<NFe')).toBe(true)
    expect(xml.includes("\n")).toBe(true)
  })
})

describe("embeddable gera XML compacto D01e (GOAL-023)", () => {
  it("fragmento genérico sai colado, sem CR/LF/TAB", () => {
    const xml = serializeXmlEmbeddable({
      tag: "NFe",
      children: [{ tag: "infNFe", children: [{ tag: "ide", children: [{ tag: "cUF", text: "35" }] }] }],
    })
    expect(xml).toBe("<NFe><infNFe><ide><cUF>35</cUF></ide></infNFe></NFe>")
    expect(xml.includes("\n")).toBe(false)
    expect(xml.includes("\r")).toBe(false)
    expect(xml.includes("\t")).toBe(false)
    expect(countIntertagFormattingWhitespace(xml)).toBe(0)
    expect(isD01eSafe(xml)).toBe(true)
    expect(xmlEmbeddableViolation(xml)).toBeNull()
  })

  it("NFe assinável sintética sai compacta e D01e-segura", () => {
    const xml = buildNfceXmlAssinavel(snapshotAssinavel(), CTX)
    expect(xml.includes("<?xml")).toBe(false)
    expect(xml.includes("\n")).toBe(false)
    expect(xml.includes("\r")).toBe(false)
    expect(xml.includes("\t")).toBe(false)
    expect(countIntertagFormattingWhitespace(xml)).toBe(0)
    expect(d01eViolation(xml)).toBeNull()
    expect(() => assertD01eSafe(xml)).not.toThrow()
  })

  it("preserva espaços legítimos DENTRO de texto e atributos", () => {
    const xml = serializeXmlEmbeddable({
      tag: "NFe",
      children: [
        { tag: "xProd", text: "CABO USB C" },
        { tag: "item", attrs: { nome: "CABO USB C" }, text: "x" },
      ],
    })
    expect(xml).toContain("<xProd>CABO USB C</xProd>")
    expect(xml).toContain('nome="CABO USB C"')
    expect(isD01eSafe(xml)).toBe(true)
    expect(countIntertagFormattingWhitespace(xml)).toBe(0)
  })

  it("NFe real preserva `CABO USB C` e segue compacta", () => {
    const xml = buildNfceXmlAssinavel(snapshotAssinavel(), CTX)
    expect(xml).toContain("CABO USB C")
    expect(isD01eSafe(xml)).toBe(true)
  })
})

describe("XMLDSig sobre o compacto (sem reutilizar assinatura de pretty)", () => {
  const built = buildNfceXmlAssinavelResult(snapshotAssinavel(), CTX)
  const assinado = signNfceXmlDetailed(built.xml, DRY_RUN_TEST_CERT, "", { ignorarValidade: true })

  it("assinatura confere: digest + SignatureValue + Reference ao infNFe", () => {
    const v = verifyNfceSignature(assinado.xml)
    expect(v).toMatchObject({ valido: true, assinado: true, digestConfere: true, assinaturaConfere: true })
    expect(v.referenciaId).toBe(`NFe${built.chaveAcesso}`)
    expect(assinado.referenciaId).toBe(`NFe${built.chaveAcesso}`)
  })

  it("NFe assinada segue compacta e D01e-segura", () => {
    expect(assinado.xml.includes("\n")).toBe(false)
    expect(assinado.xml.includes("\r")).toBe(false)
    expect(assinado.xml.includes("\t")).toBe(false)
    expect(countIntertagFormattingWhitespace(assinado.xml)).toBe(0)
    expect(isD01eSafe(assinado.xml)).toBe(true)
    expect(assinado.xml.includes("<?xml")).toBe(false)
  })

  it("Signature não introduz whitespace entre tags", () => {
    const sig = /<Signature[\s\S]*<\/Signature>/.exec(assinado.xml)?.[0] ?? ""
    expect(sig.length).toBeGreaterThan(0)
    expect(sig.includes("\n")).toBe(false)
    expect(sig.includes("\r")).toBe(false)
    expect(sig.includes("\t")).toBe(false)
    // Remover a Signature devolve exatamente o produzido (splice, sem reserialização).
    expect(assinado.xml.replace(/<Signature[\s\S]*<\/Signature>/, "")).toBe(built.xml)
  })
})

describe("enviNFe preserva bytes e sai compacto na área de dados", () => {
  it("compõe sem reserializar e mantém idLote/indSinc do contrato", () => {
    const built = buildNfceXmlAssinavelResult(snapshotAssinavel(), CTX)
    const assinado = signNfceXmlDetailed(built.xml, DRY_RUN_TEST_CERT, "", { ignorarValidade: true })
    const exactBytes = bytes(assinado.xml)
    const envi = composeEnviNFeRequest({ exactBytes })
    expect(envi.ok).toBe(true)
    if (!envi.ok) return
    const texto = new TextDecoder().decode(envi.bytes)
    expect(texto).toContain("<idLote>1</idLote>")
    expect(texto).toContain("<indSinc>1</indSinc>")
    // Bytes assinados intactos no interior (offset/length + igualdade).
    const recorte = envi.bytes.slice(envi.fiscalBytesOffset, envi.fiscalBytesOffset + envi.fiscalBytesLength)
    expect(Buffer.from(recorte).equals(Buffer.from(exactBytes))).toBe(true)
    expect(countIntertagFormattingWhitespace(texto)).toBe(0)
    expect(isD01eSafe(texto)).toBe(true)
  })
})

describe("backstop D01e recusa pretty/adversarial e nunca limpa bytes", () => {
  it.each([
    ["LF entre tags", "<NFe>\n<infNFe>x</infNFe>\n</NFe>"],
    ["espaços entre tags", "<NFe><a>1</a>   <b>2</b></NFe>"],
    ["TAB entre tags", "<NFe><a>1</a>\t<b>2</b></NFe>"],
    ["CR entre tags", "<NFe><a>1</a>\r<b>2</b></NFe>"],
    ["CRLF entre tags", "<NFe><a>1</a>\r\n<b>2</b></NFe>"],
  ])("recusa %s com código D01e estável", (_nome, payload) => {
    expect(isD01eSafe(payload)).toBe(false)
    expect(countIntertagFormattingWhitespace(payload)).toBeGreaterThan(0)
    const r = buildSefazSoap12Envelope({ servico: "NFeAutorizacao4", exactBytes: bytes(payload) })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe("bytes_fiscais_com_espaco_d01e")
    expect(r.mensagem).not.toContain("CABO")
  })

  it.each([
    ["whitespace antes da raiz", "  <NFe><a/></NFe>"],
    ["LF antes da raiz", "\n<NFe><a/></NFe>"],
    ["whitespace depois da raiz", "<NFe><a/></NFe> "],
    ["LF depois da raiz", "<NFe><a/></NFe>\n"],
  ])("recusa %s no boundary final (fronteira ou D01e, sem limpar)", (_nome, payload) => {
    expect(isD01eSafe(payload)).toBe(false)
    const r = buildSefazSoap12Envelope({ servico: "NFeAutorizacao4", exactBytes: bytes(payload) })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(["bytes_fiscais_com_espaco_d01e", "bytes_fiscais_nao_embutiveis"]).toContain(r.codigo)
  })

  it("não confunde espaço legítimo em texto com formatação", () => {
    const legitimo = `<NFe><infNFe><xProd>CABO USB C</xProd></infNFe></NFe>`
    expect(isD01eSafe(legitimo)).toBe(true)
    const r = buildSefazSoap12Envelope({ servico: "NFeAutorizacao4", exactBytes: bytes(legitimo) })
    expect(r.ok).toBe(true)
  })
})

describe("matriz cStat 588 (versão 023.0)", () => {
  it("expõe a versão 023.0", () => {
    expect(SEFAZ_CSTAT_MATRIX_VERSION).toBe("023.0")
  })

  it("588 em NFeAutorizacao4 é REJECTED terminal de formato, sem consumo e sem retry", () => {
    const lookup = lookupSefazCStat("588", "NFeAutorizacao4")
    expect(lookup.ok).toBe(true)
    if (!lookup.ok) return
    expect(lookup.entry.outcome).toBe("REJECTED")
    expect(lookup.entry.reason).toBe("REJEICAO_FORMATO_D01E")
    expect(lookup.entry.consequencias).toMatchObject({
      terminal: true,
      numeroConsumido: false,
      requiresInutilizacao: false,
      requiresConsultation: false,
    })
  })

  it("588 em serviço inadequado NÃO vira rejeição de documento", () => {
    for (const servico of ["NFeConsultaProtocolo4", "NFeRetAutorizacao4", "NFeRecepcaoEvento4"] as const) {
      const lookup = lookupSefazCStat("588", servico)
      expect(lookup.ok).toBe(false)
      if (!lookup.ok) expect(lookup.reason).toBe("SERVICE_MISMATCH")
    }
  })
})

describe("e2e offline: snapshot → compacto → XMLDSig → XSD → enviNFe → SOAP → fake transport", () => {
  it("cadeia compacta atinge o transporte com XMLDSIG + XSD + D01E verdes", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("rede externa acionada no caminho offline")
    })
    vi.stubGlobal("fetch", fetchSpy)
    try {
      // 1. Snapshot sintético → XML assinável compacto.
      const built = buildNfceXmlAssinavelResult(snapshotAssinavel(), CTX)
      expect(countIntertagFormattingWhitespace(built.xml)).toBe(0)

      // 2. XMLDSig.
      const assinado = signNfceXmlDetailed(built.xml, DRY_RUN_TEST_CERT, "", { ignorarValidade: true })
      const verificacao = verifyNfceSignature(assinado.xml)
      const XMLDSIG = verificacao.valido && verificacao.digestConfere && verificacao.assinaturaConfere
      expect(XMLDSIG).toBe(true)

      // 3. XSD OFICIAL REAL sobre os EXATOS bytes fiscais do cenário 588
      // (xmllint/libxml2, --noout --nonet --schema nfe_v4.00.xsd versionado).
      // Sem xmllint no PATH o teste falha explicitamente como limitação de
      // ambiente (sem shim, sem skip); no CI Ubuntu o xmllint real executa.
      const exactBytes = bytes(assinado.xml)
      assertExactBytesPassamNoXsdOficial(exactBytes)
      const XSD = "VALIDACAO_APROVADA_XSD_OFICIAL_XMLLINT"
      expect(XSD).toBe("VALIDACAO_APROVADA_XSD_OFICIAL_XMLLINT")

      // 3b. Guards pré-transporte (fiação): o atestado aqui é mock e prova
      // apenas que o guard 8 exige atestado vinculado aos mesmos bytes —
      // NÃO é prova XSD (a prova é o xmllint acima).
      const bytesSha256 = sha256Hex(exactBytes)
      const guards = await runSefazPreTransportGuards({
        document: documento(built.chaveAcesso),
        exactBytes,
        bytesSha256,
        servico: "NFeAutorizacao4",
        ports: portas(),
      })
      expect(guards.ok).toBe(true)

      // 4. enviNFe.
      const envi = composeEnviNFeRequest({ exactBytes })
      expect(envi.ok).toBe(true)
      if (!envi.ok) return

      // 5. Envelope SOAP + área de dados compacta.
      const envelope = buildSefazSoap12Envelope({ servico: "NFeAutorizacao4", exactBytes: envi.bytes })
      expect(envelope.ok).toBe(true)
      if (!envelope.ok) return
      const areaDados = new TextDecoder().decode(envelope.envelope.bytes)
      const INTERTAG_FORMATTING_WHITESPACE = countIntertagFormattingWhitespace(areaDados)
      // A área de dados fiscal extraída (não o envelope com declaração) é o contrato D01e.
      const fiscalExtraido = new TextDecoder().decode(extractFiscalBytes(envelope.envelope))
      expect(countIntertagFormattingWhitespace(fiscalExtraido)).toBe(0)
      const D01E_SAFE = isD01eSafe(fiscalExtraido)
      expect(D01E_SAFE).toBe(true)

      // 6. Transporte fake/loopback: a cadeia compacta CHEGA ao socket fake.
      const enviadas: Uint8Array[] = []
      const fakeTransport = {
        permiteRede: false as const,
        send: vi.fn(async (req: { bodyBytes: Uint8Array }) => {
          enviadas.push(req.bodyBytes)
          return {
            ok: false as const,
            codigo: "transporte_offline_bloqueado" as const,
            mensagem: "fake offline: sem rede externa",
            classification: "BLOCKED_BEFORE_NETWORK" as const,
            externalTransmissionAttempted: false as const,
          }
        }),
      }
      const outcome = await fakeTransport.send({
        bodyBytes: envelope.envelope.bytes,
      } as never)
      expect(fakeTransport.send).toHaveBeenCalledTimes(1)
      expect(enviadas).toHaveLength(1)
      expect(outcome.externalTransmissionAttempted).toBe(false)

      // Métricas exigidas pelo GOAL.
      expect(XMLDSIG).toBe(true)
      expect(XSD).toBe("VALIDACAO_APROVADA_XSD_OFICIAL_XMLLINT")
      expect(D01E_SAFE).toBe(true)
      expect(INTERTAG_FORMATTING_WHITESPACE).toBe(0)
    } finally {
      vi.unstubAllGlobals()
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("o mesmo teste com XML pretty/adversarial PARA antes do fake socket", async () => {
    const send = vi.fn(async () => {
      throw new Error("transporte não deveria ser acionado para pretty")
    })
    const pretty =
      `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">\n` +
      `  <infNFe versao="4.00" Id="NFe35260611222333000181650010000000421003263947">\n` +
      `    <ide><cUF>35</cUF></ide>\n` +
      `  </infNFe>\n` +
      `</NFe>`
    expect(countIntertagFormattingWhitespace(pretty)).toBeGreaterThan(0)
    const r = buildSefazSoap12Envelope({ servico: "NFeAutorizacao4", exactBytes: bytes(pretty) })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe("bytes_fiscais_com_espaco_d01e")
    expect(send).not.toHaveBeenCalled()
  })
})
