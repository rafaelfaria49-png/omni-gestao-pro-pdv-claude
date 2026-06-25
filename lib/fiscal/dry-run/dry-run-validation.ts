/**
 * Validações do Dry-Run (BL-FISCAL-006 · TAREFA 3) — PURAS, sem rede/fs por padrão.
 *
 *  - `validarEstruturaNfce`: confere a presença/ordem mínima dos grupos obrigatórios do `infNFe`
 *    4.00 no XML ASSINADO (ide/emit/det/total/transp/pag + Signature). Não substitui o XSD.
 *  - `validarXsd`: placeholder SEGURO. NÃO baixa nada, NÃO usa rede. Sem XSD oficial fornecido,
 *    retorna `xsd_nao_configurado` (deixando claro que a validação XSD real é gate futuro).
 */

import { findFirst, parseXml, attrOf, type C14nElement } from "../signing"
import type { DryRunValidacaoEstrutural, DryRunXsd } from "./dry-run.types"

/** Grupos obrigatórios mínimos do `infNFe` 4.00 (NFC-e) que devem existir no XML. */
const GRUPOS_OBRIGATORIOS = ["ide", "emit", "det", "total", "transp", "pag"] as const

export type ValidarXsdOptions = {
  /**
   * Conteúdo do XSD oficial (quando o operador o fornecer no futuro). NÃO é lido de disco/rede
   * aqui — injeção explícita mantém o Dry-Run puro e offline.
   */
  xsd?: string | null
}

/** Validação estrutural do XML assinado (presença dos grupos e da assinatura). */
export function validarEstruturaNfce(xmlAssinado: string | null): DryRunValidacaoEstrutural {
  const erros: string[] = []
  const pendencias: string[] = []

  if (!xmlAssinado || xmlAssinado.trim() === "") {
    return { ok: false, erros: ["XML ausente para validação estrutural."], pendencias }
  }

  let root: C14nElement
  try {
    root = parseXml(xmlAssinado)
  } catch {
    return { ok: false, erros: ["XML mal-formado (não parseável)."], pendencias }
  }

  if (root.name !== "NFe" && !findFirst(root, "NFe")) erros.push("Elemento <NFe> ausente.")

  const infNFe = findFirst(root, "infNFe")
  if (!infNFe) {
    erros.push("Elemento <infNFe> ausente.")
  } else {
    if (!attrOf(infNFe, "Id")) erros.push("<infNFe> sem atributo Id.")
    if (attrOf(infNFe, "versao") !== "4.00") pendencias.push("Versão do layout diferente de 4.00.")
    for (const g of GRUPOS_OBRIGATORIOS) {
      if (!findFirst(infNFe, g)) erros.push(`Grupo obrigatório <${g}> ausente no infNFe.`)
    }
    if (!findFirst(infNFe, "detPag")) erros.push("Grupo <pag> sem <detPag>.")
  }

  // Assinatura presente e completa.
  const sig = findFirst(root, "Signature")
  if (!sig) {
    erros.push("Assinatura <Signature> ausente.")
  } else {
    if (!findFirst(sig, "SignedInfo")) erros.push("<SignedInfo> ausente.")
    if (!findFirst(sig, "SignatureValue")) erros.push("<SignatureValue> ausente.")
    if (!findFirst(sig, "X509Certificate")) erros.push("<X509Certificate> ausente.")
  }

  return { ok: erros.length === 0, erros, pendencias }
}

/**
 * Validação XSD — placeholder seguro (TAREFA 3). Sem XSD oficial no repo, NÃO valida e NÃO acessa
 * rede/disco: retorna `xsd_nao_configurado`. A validação XSD real (com XSD oficial + validador) é
 * um GATE FUTURO antes da transmissão à SEFAZ (FISCAL_DRY_RUN §3.5 / NFCE_ARCHITECTURE Etapa 5).
 */
export function validarXsd(_xmlAssinado: string | null, options: ValidarXsdOptions = {}): DryRunXsd {
  const xsd = (options.xsd ?? "").trim()
  if (!xsd) {
    return {
      status: "xsd_nao_configurado",
      mensagem:
        "XSD oficial não configurado no repositório. Validação XSD é gate futuro (sem rede/sem download).",
      violacoes: [],
    }
  }
  // XSD fornecido, mas o validador real (libxml/XSD) não é implementado nesta fase — sem rede.
  return {
    status: "xsd_presente_sem_validador",
    mensagem:
      "XSD fornecido, porém o validador XSD ainda não está implementado (gate futuro). Nenhuma rede foi usada.",
    violacoes: [],
  }
}
