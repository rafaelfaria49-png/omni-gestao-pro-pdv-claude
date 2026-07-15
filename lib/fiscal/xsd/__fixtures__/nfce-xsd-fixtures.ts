/** Corpus definitivo, totalmente sintético e sem documento, pessoa ou certificado real. */
const SYNTHETIC_KEY = "0".repeat(44)
export const VERPROC_20 = "OMNI-XSD-WORKER-01.0"
export const VERPROC_21 = `${VERPROC_20}X`

export const VALID_NFCE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe versao="4.00" Id="NFe${SYNTHETIC_KEY}">
    <ide>
      <cUF>35</cUF><cNF>00000000</cNF><natOp>OPERACAO DE TESTE</natOp><mod>65</mod>
      <serie>1</serie><nNF>1</nNF><dhEmi>2026-07-14T12:00:00-03:00</dhEmi>
      <tpNF>1</tpNF><idDest>1</idDest><cMunFG>3550308</cMunFG><tpImp>4</tpImp>
      <tpEmis>1</tpEmis><cDV>0</cDV><tpAmb>2</tpAmb><finNFe>1</finNFe>
      <indFinal>1</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>${VERPROC_20}</verProc>
    </ide>
    <emit>
      <CNPJ>00000000000000</CNPJ><xNome>EMITENTE SINTETICO</xNome><xFant>TESTE</xFant>
      <enderEmit><xLgr>RUA SINTETICA</xLgr><nro>0</nro><xBairro>BAIRRO SINTETICO</xBairro>
        <cMun>3550308</cMun><xMun>MUNICIPIO SINTETICO</xMun><UF>SP</UF>
        <CEP>00000000</CEP><cPais>1058</cPais><xPais>BRASIL</xPais></enderEmit>
      <IE>00</IE><CRT>1</CRT>
    </emit>
    <det nItem="1"><prod>
      <cProd>ITEM-TESTE</cProd><cEAN>SEM GTIN</cEAN><xProd>PRODUTO SINTETICO</xProd>
      <NCM>00000000</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>1.0000</qCom>
      <vUnCom>1.00</vUnCom><vProd>1.00</vProd><cEANTrib>SEM GTIN</cEANTrib>
      <uTrib>UN</uTrib><qTrib>1.0000</qTrib><vUnTrib>1.00</vUnTrib><indTot>1</indTot>
    </prod><imposto>
      <ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS>
      <PIS><PISOutr><CST>49</CST><vBC>0.00</vBC><pPIS>0.0000</pPIS><vPIS>0.00</vPIS></PISOutr></PIS>
      <COFINS><COFINSOutr><CST>49</CST><vBC>0.00</vBC><pCOFINS>0.0000</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS>
    </imposto></det>
    <total><ICMSTot>
      <vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP>
      <vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet>
      <vProd>1.00</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc>
      <vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS>
      <vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>1.00</vNF><vTotTrib>0.00</vTotTrib>
    </ICMSTot></total>
    <transp><modFrete>9</modFrete></transp>
    <pag><detPag><tPag>01</tPag><vPag>1.00</vPag></detPag></pag>
    <infAdic><infCpl>DOCUMENTO SINTETICO SEM VALOR FISCAL</infCpl></infAdic>
  </infNFe>
  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo>
    <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
    <SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
    <Reference URI="#NFe${SYNTHETIC_KEY}"><Transforms>
      <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
      <Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
    </Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>AA==</DigestValue></Reference>
  </SignedInfo><SignatureValue>AA==</SignatureValue><KeyInfo><X509Data><X509Certificate>AA==</X509Certificate></X509Data></KeyInfo></Signature>
</NFe>`

const replace = (from: string, to: string) => VALID_NFCE_XML.replace(from, to)
export const NFCE_XML_MISSING_REQUIRED = replace("<natOp>OPERACAO DE TESTE</natOp>", "")
export const NFCE_XML_OUT_OF_ORDER = replace("<cUF>35</cUF><cNF>00000000</cNF>", "<cNF>00000000</cNF><cUF>35</cUF>")
export const NFCE_XML_INVALID_TYPE = replace("<tpNF>1</tpNF>", "<tpNF>X</tpNF>")
export const NFCE_XML_FIELD_TOO_LONG = replace("<xProd>PRODUTO SINTETICO</xProd>", `<xProd>${"A".repeat(121)}</xProd>`)
export const NFCE_XML_WRONG_NAMESPACE = replace("http://www.portalfiscal.inf.br/nfe", "urn:invalid:nfce")
export const NFCE_XML_MALFORMED = replace("</NFe>", "")
export const NFCE_XML_VERPROC_21 = replace(`<verProc>${VERPROC_20}</verProc>`, `<verProc>${VERPROC_21}</verProc>`)
export const NFCE_XML_HTTP_REFERENCE = replace("<NFe ", '<NFe xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="https://invalid.example/probe" ')
export const NFCE_XML_FILE_REFERENCE = replace("<NFe ", '<NFe xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="file:///etc/passwd" ')
export const NFCE_XML_DTD_XXE = replace("<NFe ", '<!DOCTYPE NFe [<!ENTITY probe SYSTEM "file:///etc/passwd">]>\n<NFe ')
export const NFCE_XML_TRAVERSAL = replace("<NFe ", '<NFe xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="../../etc/passwd" ')
export const NFCE_XML_COMMAND_INJECTION = replace("PRODUTO SINTETICO", "$(touch /tmp/xsd-injection-probe)")
export function oversizedNfceXml(): string {
  return VALID_NFCE_XML.replace("</NFe>", `<!--${"A".repeat(2 * 1024 * 1024)}--></NFe>`)
}

/** Os 24 cenários obrigatórios; alguns são falhas operacionais simuladas pelos testes. */
export const XSD_FIXTURE_SCENARIOS = [
  "xml_valido", "campo_obrigatorio_ausente", "campo_fora_de_ordem", "tipo_invalido",
  "tamanho_campo_excedido", "namespace_incorreto", "xml_malformado", "imports_offline",
  "verproc_20", "verproc_21", "referencia_http", "referencia_file", "dtd_xxe",
  "payload_excedido", "timeout", "worker_indisponivel", "binario_ausente", "versao_bloqueada",
  "hash_divergente", "xsd_ausente", "path_traversal", "execucao_repetida",
  "concorrencia_controlada", "erro_sanitizado",
] as const
