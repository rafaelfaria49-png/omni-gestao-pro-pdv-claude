/** Validações estruturais e XSD do dry-run fiscal. */
import { createHash, randomUUID } from "node:crypto"
import { findFirst, parseXml, attrOf, type C14nElement } from "../signing"
import { createConfiguredXsdWorkerClient } from "../xsd-worker"
import {
  XSD_CONTRACT_VERSION,
  XSD_DEFAULT_TIMEOUT_MS,
  XSD_MAX_PAYLOAD_BYTES,
  XSD_SCHEMA_PACKAGE,
  type XsdValidationAdapter,
  type XsdValidationOutcome,
  type XsdValidationRequest,
  type XsdValidationResult,
} from "../xsd"
import { OFFICIAL_XSD_MANIFEST_SHA256 } from "../xsd/official-package"
import type { DryRunValidacaoEstrutural, DryRunXsd } from "./dry-run.types"

const GRUPOS_OBRIGATORIOS = ["ide", "emit", "det", "total", "transp", "pag"] as const

export type ValidarXsdOptions = {
  adapter?: XsdValidationAdapter
  storeId?: string
  correlationId?: string
  jobId?: string
  timeoutMs?: number
}

export function validarEstruturaNfce(xmlAssinado: string | null): DryRunValidacaoEstrutural {
  const erros: string[] = []
  const pendencias: string[] = []
  if (!xmlAssinado?.trim()) return { ok: false, erros: ["XML ausente para validação estrutural."], pendencias }
  let root: C14nElement
  try {
    root = parseXml(xmlAssinado)
  } catch {
    return { ok: false, erros: ["XML malformado (não parseável)."], pendencias }
  }
  if (root.name !== "NFe" && !findFirst(root, "NFe")) erros.push("Elemento <NFe> ausente.")
  const infNFe = findFirst(root, "infNFe")
  if (!infNFe) {
    erros.push("Elemento <infNFe> ausente.")
  } else {
    if (!attrOf(infNFe, "Id")) erros.push("<infNFe> sem atributo Id.")
    if (attrOf(infNFe, "versao") !== "4.00") pendencias.push("Versão do layout diferente de 4.00.")
    for (const group of GRUPOS_OBRIGATORIOS) {
      if (!findFirst(infNFe, group)) erros.push(`Grupo obrigatório <${group}> ausente no infNFe.`)
    }
    if (!findFirst(infNFe, "detPag")) erros.push("Grupo <pag> sem <detPag>.")
  }
  const signature = findFirst(root, "Signature")
  if (!signature) {
    erros.push("Assinatura <Signature> ausente.")
  } else {
    if (!findFirst(signature, "SignedInfo")) erros.push("<SignedInfo> ausente.")
    if (!findFirst(signature, "SignatureValue")) erros.push("<SignatureValue> ausente.")
    if (!findFirst(signature, "X509Certificate")) erros.push("<X509Certificate> ausente.")
  }
  return { ok: erros.length === 0, erros, pendencias }
}

function statusFor(outcome: XsdValidationOutcome): DryRunXsd["status"] {
  if (outcome === "VALIDACAO_APROVADA") return "xsd_ok"
  if (outcome === "XML_INVALIDO" || outcome === "XML_MALFORMADO") return "xsd_invalido"
  if (outcome === "POLITICA_REJEITADA") return "xsd_politica_rejeitada"
  return "xsd_falha_infraestrutura"
}

function summaryFor(result: XsdValidationResult): string {
  if (result.valid) return "XML aprovado pelo pacote XSD oficial PL_010e_v1.02."
  if (result.outcome === "XML_INVALIDO" || result.outcome === "XML_MALFORMADO") {
    return "XML rejeitado pelo pacote XSD oficial PL_010e_v1.02."
  }
  if (result.outcome === "POLITICA_REJEITADA") return "XML rejeitado pela política segura do worker XSD."
  return `Validação XSD falhou fechada (${result.outcome}).`
}

function sanitizeIssue(message: string): string {
  return String(message)
    .replace(/[A-Za-z]:[\\/][^\s:]+/g, "[caminho-local]")
    .replace(/\/(?:[^\s/:]+\/){2,}[^\s:]+/g, "[caminho-local]")
    .replace(/<[^>]{0,500}>/g, "[xml-omitido]")
    .replace(/\b\d{11,44}\b/g, "[identificador-omitido]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 500)
}

/** Invoca o worker B2 real. Worker ausente, timeout ou resposta incerta sempre falham fechados. */
export async function validarXsd(xml: string | null, options: ValidarXsdOptions = {}): Promise<DryRunXsd> {
  const payload = xml ?? ""
  const now = new Date()
  const timeoutMs = Math.min(Math.max(100, options.timeoutMs ?? XSD_DEFAULT_TIMEOUT_MS), XSD_DEFAULT_TIMEOUT_MS)
  const xmlSha256 = createHash("sha256").update(payload, "utf8").digest("hex")
  const request: XsdValidationRequest = {
    jobId: options.jobId ?? `dry-run-${xmlSha256.slice(0, 32)}`,
    storeId: options.storeId ?? "dry-run-local",
    correlationId: options.correlationId ?? randomUUID(),
    contractVersion: XSD_CONTRACT_VERSION,
    schemaVersion: XSD_SCHEMA_PACKAGE,
    schemaManifestHash: OFFICIAL_XSD_MANIFEST_SHA256,
    xmlSha256,
    xmlPayload: payload,
    payloadBytes: Buffer.byteLength(payload, "utf8"),
    maxPayloadBytes: XSD_MAX_PAYLOAD_BYTES,
    attempt: 1,
    requestedAt: now.toISOString(),
    deadline: new Date(now.getTime() + timeoutMs).toISOString(),
  }
  const result = await (options.adapter ?? createConfiguredXsdWorkerClient()).validate(request)
  return {
    status: statusFor(result.outcome),
    outcome: result.outcome,
    engine: result.engine,
    mensagem: summaryFor(result),
    violacoes: result.issues.map((issue) => sanitizeIssue(issue.message)),
  }
}
