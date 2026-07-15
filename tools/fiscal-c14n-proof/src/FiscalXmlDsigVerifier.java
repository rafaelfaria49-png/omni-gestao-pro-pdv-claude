import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAKey;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.xml.XMLConstants;
import javax.xml.crypto.AlgorithmMethod;
import javax.xml.crypto.KeySelector;
import javax.xml.crypto.KeySelectorException;
import javax.xml.crypto.KeySelectorResult;
import javax.xml.crypto.MarshalException;
import javax.xml.crypto.URIReferenceException;
import javax.xml.crypto.URIDereferencer;
import javax.xml.crypto.XMLCryptoContext;
import javax.xml.crypto.XMLStructure;
import javax.xml.crypto.dsig.Reference;
import javax.xml.crypto.dsig.XMLSignature;
import javax.xml.crypto.dsig.XMLSignatureException;
import javax.xml.crypto.dsig.XMLSignatureFactory;
import javax.xml.crypto.dsig.dom.DOMValidateContext;
import javax.xml.crypto.dsig.keyinfo.KeyInfo;
import javax.xml.crypto.dsig.keyinfo.X509Data;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;

/** Prova externa XMLDSig/C14N. Nao importa nem executa codigo TypeScript do signer. */
public final class FiscalXmlDsigVerifier {
  private static final String NFE_NS = "http://www.portalfiscal.inf.br/nfe";
  private static final String DSIG_NS = XMLSignature.XMLNS;
  private static final String C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
  private static final String ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
  private static final String RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
  private static final String SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1";

  private FiscalXmlDsigVerifier() {}

  public static void main(String[] args) throws Exception {
    if (args.length != 2) throw new IllegalArgumentException("uso: FiscalXmlDsigVerifier <xml> <output-dir>");
    Path xmlPath = Path.of(args[0]).toAbsolutePath().normalize();
    Path outputDir = Path.of(args[1]).toAbsolutePath().normalize();
    Files.createDirectories(outputDir);
    Map<String, Object> report;
    try {
      report = verify(xmlPath, outputDir);
    } catch (ProofRejection rejection) {
      report = baseReport();
      report.put("valid", false);
      report.put("failureCode", rejection.code);
      report.put("failureMessage", rejection.getMessage());
    } catch (Exception unexpected) {
      report = baseReport();
      report.put("valid", false);
      report.put("failureCode", "HARNESS_ERROR");
      report.put("failureMessage", unexpected.getClass().getSimpleName() + ": " + unexpected.getMessage());
      writeReport(outputDir.resolve("report.json"), report);
      throw unexpected;
    }
    writeReport(outputDir.resolve("report.json"), report);
  }

  private static Map<String, Object> verify(Path xmlPath, Path outputDir) throws Exception {
    byte[] xmlBytes = Files.readAllBytes(xmlPath);
    Document document = parseSecure(xmlPath);
    Element root = document.getDocumentElement();
    require("NFe".equals(root.getLocalName()) && NFE_NS.equals(root.getNamespaceURI()),
        "ROOT_REJECTED", "raiz NFe/namespace fiscal ausente");
    List<Element> allSignatureNames = allByLocalName(document, "Signature");
    List<Element> signatures = directChildren(root, DSIG_NS, "Signature");
    require(allSignatureNames.size() == 1 && signatures.size() == 1,
        "SIGNATURE_STRUCTURE_REJECTED", "Signature deve ser unica e filha direta de NFe");
    Element signatureElement = signatures.get(0);
    requireExactChildren(signatureElement, List.of("SignedInfo", "SignatureValue", "KeyInfo"));

    Element signedInfoElement = onlyDirect(signatureElement, DSIG_NS, "SignedInfo");
    requireExactChildren(signedInfoElement, List.of("CanonicalizationMethod", "SignatureMethod", "Reference"));
    Element canonicalizationMethod = onlyDirect(signedInfoElement, DSIG_NS, "CanonicalizationMethod");
    Element signatureMethod = onlyDirect(signedInfoElement, DSIG_NS, "SignatureMethod");
    Element referenceElement = onlyDirect(signedInfoElement, DSIG_NS, "Reference");
    requireExactChildren(referenceElement, List.of("Transforms", "DigestMethod", "DigestValue"));
    Element transformsElement = onlyDirect(referenceElement, DSIG_NS, "Transforms");
    requireExactChildren(transformsElement, List.of("Transform", "Transform"));
    Element digestMethod = onlyDirect(referenceElement, DSIG_NS, "DigestMethod");
    List<Element> transforms = directChildren(transformsElement, DSIG_NS, "Transform");
    require(C14N.equals(canonicalizationMethod.getAttribute("Algorithm"))
            && RSA_SHA1.equals(signatureMethod.getAttribute("Algorithm"))
            && SHA1.equals(digestMethod.getAttribute("Algorithm"))
            && transforms.size() == 2
            && ENVELOPED.equals(transforms.get(0).getAttribute("Algorithm"))
            && C14N.equals(transforms.get(1).getAttribute("Algorithm")),
        "ALGORITHM_REJECTED", "algoritmos ou transforms divergem do schema fiscal allowlisted");

    String uri = referenceElement.getAttribute("URI");
    require(uri.startsWith("#") && uri.length() > 1 && uri.indexOf('#', 1) < 0
            && !uri.substring(1).matches(".*\\s+.*"),
        "REFERENCE_URI_REJECTED", "somente Reference local simples e permitida");
    String referenceId = uri.substring(1);
    List<Element> targets = elementsById(document, referenceId);
    require(targets.size() == 1, targets.isEmpty() ? "REFERENCE_NOT_FOUND" : "REFERENCE_AMBIGUOUS",
        "Reference deve resolver para exatamente um Id");
    Element target = targets.get(0);
    require("infNFe".equals(target.getLocalName()) && NFE_NS.equals(target.getNamespaceURI()),
        "REFERENCE_TARGET_REJECTED", "Reference deve apontar para infNFe fiscal");
    List<Element> fiscalInfNFe = allByNamespace(document, NFE_NS, "infNFe");
    List<Element> directFiscalInfNFe = directChildren(root, NFE_NS, "infNFe");
    require(fiscalInfNFe.size() == 1 && directFiscalInfNFe.size() == 1
            && fiscalInfNFe.get(0) == target && directFiscalInfNFe.get(0) == target,
        fiscalInfNFe.size() > 1 ? "REFERENCE_AMBIGUOUS" : "REFERENCE_TARGET_REJECTED",
        "documento deve conter exatamente um infNFe fiscal e a Reference deve aponta-lo");

    Element keyInfoElement = onlyDirect(signatureElement, DSIG_NS, "KeyInfo");
    requireExactChildren(keyInfoElement, List.of("X509Data"));
    Element x509DataElement = onlyDirect(keyInfoElement, DSIG_NS, "X509Data");
    requireExactChildren(x509DataElement, List.of("X509Certificate"));
    Element x509CertificateElement = onlyDirect(x509DataElement, DSIG_NS, "X509Certificate");
    require(directElements(x509CertificateElement).isEmpty(),
        "SIGNATURE_STRUCTURE_REJECTED", "X509Certificate nao pode conter elementos filhos");

    XMLSignatureFactory factory = XMLSignatureFactory.getInstance("DOM");
    DOMValidateContext context = new DOMValidateContext(new SyntheticCertificateKeySelector(), signatureElement);
    // Java 17 rejeita RSA-SHA1 em secureValidation. O XSD fiscal o impoe; a allowlist acima
    // substitui somente essa politica generica, mantendo estrutura e URI fail-closed.
    context.setProperty("org.jcp.xml.dsig.secureValidation", Boolean.FALSE);
    context.setProperty("javax.xml.crypto.dsig.cacheReference", Boolean.TRUE);
    context.setIdAttributeNS(target, null, "Id");
    URIDereferencer builtIn = factory.getURIDereferencer();
    context.setURIDereferencer((uriReference, cryptoContext) -> {
      if (!uri.equals(uriReference.getURI())) {
        throw new URIReferenceException("URI externa ou diferente da Reference prevalidada foi bloqueada");
      }
      return builtIn.dereference(uriReference, cryptoContext);
    });

    XMLSignature signature;
    try {
      signature = factory.unmarshalXMLSignature(context);
    } catch (MarshalException exception) {
      throw new ProofRejection("SIGNATURE_STRUCTURE_REJECTED", exception.getMessage());
    }
    require(signature.getSignedInfo().getReferences().size() == 1,
        "REFERENCE_COUNT_REJECTED", "SignedInfo deve conter uma unica Reference");
    try {
      boolean coreValid = signature.validate(context);
      Reference reference = (Reference) signature.getSignedInfo().getReferences().get(0);
      boolean referenceValid = reference.validate(context);
      boolean signatureValueValid = signature.getSignatureValue().validate(context);
      byte[] referenceCanonical = readRequired(reference.getDigestInputStream(), "Reference canonicalizada");
      byte[] signedInfoCanonical = readRequired(signature.getSignedInfo().getCanonicalizedData(), "SignedInfo canonicalizado");
      Files.write(outputDir.resolve("reference.c14n"), referenceCanonical);
      Files.write(outputDir.resolve("signed-info.c14n"), signedInfoCanonical);

      String declaredDigest = Base64.getEncoder().encodeToString(reference.getDigestValue());
      String calculatedDigest = Base64.getEncoder().encodeToString(reference.getCalculatedDigestValue());
      String referenceSha256 = digestHex("SHA-256", referenceCanonical);
      String signedInfoSha256 = digestHex("SHA-256", signedInfoCanonical);
      String xmlSha256 = digestHex("SHA-256", xmlBytes);
      Files.writeString(outputDir.resolve("hashes.sha256"),
          xmlSha256 + "  input.xml\n" + referenceSha256 + "  reference.c14n\n"
              + signedInfoSha256 + "  signed-info.c14n\n", StandardCharsets.UTF_8);

      Map<String, Object> report = baseReport();
      report.put("provider", factory.getProvider().getName() + " " + factory.getProvider().getVersionStr());
      report.put("referenceUri", uri);
      report.put("referenceTargetCount", targets.size());
      report.put("declaredDigestValue", declaredDigest);
      report.put("calculatedDigestValue", calculatedDigest);
      report.put("digestMatches", referenceValid && declaredDigest.equals(calculatedDigest));
      report.put("referenceCanonicalSha256", referenceSha256);
      report.put("signedInfoCanonicalSha256", signedInfoSha256);
      report.put("inputXmlSha256", xmlSha256);
      report.put("referenceValid", referenceValid);
      report.put("signatureValueValid", signatureValueValid);
      report.put("coreValid", coreValid);
      report.put("valid", coreValid && referenceValid && signatureValueValid);
      report.put("failureCode", coreValid ? null : referenceValid ? "SIGNATURE_INVALID" : "DIGEST_INVALID");
      report.put("failureMessage", coreValid ? null : "validacao XMLDSig independente recusou a fixture");
      return report;
    } catch (XMLSignatureException exception) {
      throw new ProofRejection("XMLDSIG_VALIDATION_ERROR", exception.getMessage());
    }
  }

  private static Document parseSecure(Path xmlPath) throws Exception {
    DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
    factory.setNamespaceAware(true);
    factory.setXIncludeAware(false);
    factory.setExpandEntityReferences(false);
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
    factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
    factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
    DocumentBuilder builder = factory.newDocumentBuilder();
    builder.setEntityResolver((publicId, systemId) -> { throw new SAXException("resolucao externa bloqueada"); });
    builder.setErrorHandler(new org.xml.sax.ErrorHandler() {
      public void warning(org.xml.sax.SAXParseException exception) throws SAXException { throw exception; }
      public void error(org.xml.sax.SAXParseException exception) throws SAXException { throw exception; }
      public void fatalError(org.xml.sax.SAXParseException exception) throws SAXException { throw exception; }
    });
    try (InputStream input = Files.newInputStream(xmlPath)) {
      return builder.parse(new InputSource(input));
    } catch (SAXException exception) {
      throw new ProofRejection("XML_POLICY_REJECTED", exception.getMessage());
    }
  }

  private static Map<String, Object> baseReport() {
    Map<String, Object> report = new LinkedHashMap<>();
    report.put("proof", "FISCAL-XML-C14N-EXTERNAL-PROOF-003");
    report.put("implementation", "Java JSR 105");
    report.put("javaRuntime", System.getProperty("java.runtime.version"));
    report.put("javaVendor", System.getProperty("java.vendor"));
    report.put("canonicalizationAlgorithm", C14N);
    report.put("digestAlgorithm", SHA1);
    report.put("signatureAlgorithm", RSA_SHA1);
    report.put("secureValidationDisabledOnlyForSchemaRequiredSha1", true);
    report.put("manualAlgorithmAllowlist", true);
    report.put("networkPolicy", "same-document URI only; DTD, external entities and external schema access blocked");
    report.put("certificateTrustScope", "integrity only; no ICP-Brasil chain or SEFAZ homologation");
    return report;
  }

  private static byte[] readRequired(InputStream input, String label) throws Exception {
    if (input == null) throw new ProofRejection("CACHE_MISSING", label + " nao foi exposto pelo provider");
    try (input) { return input.readAllBytes(); }
  }

  private static String digestHex(String algorithm, byte[] data) throws Exception {
    byte[] digest = MessageDigest.getInstance(algorithm).digest(data);
    StringBuilder result = new StringBuilder(digest.length * 2);
    for (byte value : digest) result.append(String.format("%02x", value));
    return result.toString();
  }

  private static void require(boolean condition, String code, String message) throws ProofRejection {
    if (!condition) throw new ProofRejection(code, message);
  }

  private static void requireExactChildren(Element parent, List<String> expected) throws ProofRejection {
    List<Element> children = directElements(parent);
    boolean matches = children.size() == expected.size();
    for (int index = 0; matches && index < expected.size(); index++) {
      Element child = children.get(index);
      matches = expected.get(index).equals(child.getLocalName()) && DSIG_NS.equals(child.getNamespaceURI());
    }
    require(matches, "SIGNATURE_STRUCTURE_REJECTED", "ordem, quantidade ou namespace XMLDSig invalido");
  }

  private static Element onlyDirect(Element parent, String namespace, String localName) throws ProofRejection {
    List<Element> matches = directChildren(parent, namespace, localName);
    require(matches.size() == 1, "SIGNATURE_STRUCTURE_REJECTED", localName + " deve ocorrer exatamente uma vez");
    return matches.get(0);
  }

  private static List<Element> directElements(Element parent) {
    List<Element> result = new ArrayList<>();
    for (Node child = parent.getFirstChild(); child != null; child = child.getNextSibling()) {
      if (child.getNodeType() == Node.ELEMENT_NODE) result.add((Element) child);
    }
    return result;
  }

  private static List<Element> directChildren(Element parent, String namespace, String localName) {
    List<Element> result = new ArrayList<>();
    for (Element child : directElements(parent)) {
      if (localName.equals(child.getLocalName()) && namespace.equals(child.getNamespaceURI())) result.add(child);
    }
    return result;
  }

  private static List<Element> allByLocalName(Document document, String localName) {
    List<Element> result = new ArrayList<>();
    NodeList all = document.getElementsByTagNameNS("*", localName);
    for (int index = 0; index < all.getLength(); index++) result.add((Element) all.item(index));
    return result;
  }

  private static List<Element> allByNamespace(Document document, String namespace, String localName) {
    List<Element> result = new ArrayList<>();
    NodeList all = document.getElementsByTagNameNS(namespace, localName);
    for (int index = 0; index < all.getLength(); index++) result.add((Element) all.item(index));
    return result;
  }

  private static List<Element> elementsById(Document document, String id) {
    List<Element> result = new ArrayList<>();
    NodeList all = document.getElementsByTagName("*");
    for (int index = 0; index < all.getLength(); index++) {
      Element element = (Element) all.item(index);
      if (element.hasAttribute("Id") && id.equals(element.getAttribute("Id"))) result.add(element);
    }
    return result;
  }

  private static void writeReport(Path path, Map<String, Object> report) throws Exception {
    StringBuilder json = new StringBuilder("{\n");
    int index = 0;
    for (Map.Entry<String, Object> entry : report.entrySet()) {
      if (index++ > 0) json.append(",\n");
      json.append("  \"").append(jsonEscape(entry.getKey())).append("\": ");
      Object value = entry.getValue();
      if (value == null) json.append("null");
      else if (value instanceof Boolean || value instanceof Number) json.append(value);
      else json.append("\"").append(jsonEscape(String.valueOf(value))).append("\"");
    }
    json.append("\n}\n");
    Files.writeString(path, json.toString(), StandardCharsets.UTF_8);
  }

  private static String jsonEscape(String value) {
    return value.replace("\\", "\\\\").replace("\"", "\\\"")
        .replace("\r", "\\r").replace("\n", "\\n").replace("\t", "\\t");
  }

  private static final class ProofRejection extends Exception {
    final String code;
    ProofRejection(String code, String message) { super(message == null ? code : message); this.code = code; }
  }

  private static final class SyntheticCertificateKeySelector extends KeySelector {
    @Override
    public KeySelectorResult select(KeyInfo keyInfo, Purpose purpose, AlgorithmMethod method,
        XMLCryptoContext context) throws KeySelectorException {
      if (keyInfo == null) throw new KeySelectorException("KeyInfo ausente");
      for (Object content : keyInfo.getContent()) {
        XMLStructure structure = (XMLStructure) content;
        if (!(structure instanceof X509Data)) continue;
        for (Object item : ((X509Data) structure).getContent()) {
          if (!(item instanceof X509Certificate)) continue;
          X509Certificate certificate = (X509Certificate) item;
          String subject = certificate.getSubjectX500Principal().getName();
          if (!subject.contains("NFCE-TESTE-NAO-FISCAL")) {
            throw new KeySelectorException("somente o certificado sintetico allowlisted e aceito na prova");
          }
          PublicKey publicKey = certificate.getPublicKey();
          if (!(publicKey instanceof RSAKey) || ((RSAKey) publicKey).getModulus().bitLength() < 2048) {
            throw new KeySelectorException("chave RSA de teste abaixo de 2048 bits");
          }
          return () -> publicKey;
        }
      }
      throw new KeySelectorException("X509Certificate sintetico ausente");
    }
  }
}
