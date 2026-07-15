# FISCAL XML C14N EXTERNAL PROOF 003

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-XML-C14N-EXTERNAL-PROOF-003` |
| Data | 2026-07-15 |
| Base | `origin/main` em `92a531fc53e0ecd61ee6fef0bc8431e7a60af20e`; contém `0b0d374521fca96f99f980bafabc226fa5784c56` |
| Branch | `fiscal/goal-003-c14n-external-proof` |
| Escopo | prova técnica externa de C14N/XMLDSig; sem SEFAZ, banco, Prisma, produção ou dado real |
| Nível | **N4 no eixo C14N/XMLDSig**; N6=0; N7=0 |
| Gate | critério C14N/XMLDSig do gate técnico F4→F5 **fechado**; gate global permanece aberto para lacunas não tratadas neste GOAL |

## 1. Objetivo

Provar com uma implementação independente que o signer fiscal produz Canonical XML 1.0 e XMLDSig
interoperáveis: mesmos bytes canonicalizados, mesmo `DigestValue` e `SignatureValue` verificável.
A prova é automatizada, determinística, offline durante a execução e usa somente material sintético.

## 2. Ameaça tratada

O signer anterior usava um parser e serializador próprios, descritos no código como “C14N-lite”. Ele
descartava whitespace entre elementos, preservava entidades lexicalmente, ordenava atributos apenas
por nome e tratava namespaces de forma parcial. Como o signer e o verifier chamavam o mesmo código,
um round-trip verde demonstrava apenas autoconsistência. Também havia risco de signature wrapping:
o verifier lia o primeiro `infNFe`, sem resolver rigorosamente a `Reference URI` nem rejeitar Id
duplicado.

## 3. Prova interna versus externa

- **Interna:** TypeScript + `node:crypto` + canonicalizador `xml-crypto` confirmam regressões locais.
- **Externa:** Java JSR 105 parseia novamente o XML, resolve a referência, executa transforms, calcula
  o digest, canonicaliza `SignedInfo` e verifica RSA-SHA1 com o provider `XMLDSig` do JDK.
- O helper Java não importa o signer, o verifier, o parser DOM, o canonicalizador, o helper de hash
  nem qualquer biblioteca npm da implementação interna.

## 4. Implementação interna auditada e corrigida

| Item | Estado após o GOAL |
|---|---|
| Parser | `@xmldom/xmldom@0.8.13`, namespace-aware; DTD/ENTITY bloqueados antes do DOM |
| C14N | `xml-crypto@6.1.2`, C14N 1.0 inclusivo sem comentários |
| Digest | SHA-1/base64 dos bytes UTF-8 canonicalizados do único `infNFe` referenciado |
| SignedInfo | canonicalizado no contexto inclusivo da NFe/Signature antes de RSA-SHA1 |
| Reference | somente `#Id` local; exatamente um alvo `infNFe` no namespace fiscal |
| Estrutura | uma `Signature` filha direta; ordem e cardinalidade XMLDSig estritas |
| Algoritmos | allowlist exata dos quatro URIs impostos pelo XSD oficial |
| Id duplicado | rejeitado no signer e no verifier |
| XXE/DTD | rejeitado antes de canonicalizar, assinar ou verificar |

As versões são exatas no `package.json`/`package-lock.json`. `node:crypto` continua responsável por
SHA-1 e RSA PKCS#1 v1.5; SHA-1 permanece confinado ao XMLDSig fiscal conforme ADR-0011.

## 5. Ferramenta externa escolhida

**Java JSR 105**, incluído no módulo `java.xml.crypto` do **Eclipse Temurin JDK 17.0.13+11**.

Justificativa:

1. implementação e runtime distintos de Node/TypeScript;
2. API padrão para XMLDSig, com `Reference.getDigestInputStream()` e
   `SignedInfo.getCanonicalizedData()` para expor os bytes efetivamente usados;
3. nenhuma dependência Java adicional ou download durante a prova;
4. parser JAXP configurável para bloquear DTD, entidades e acesso externo;
5. execução local no JDK 17 e CI em container fixado por digest.

Fontes primárias: [Oracle JSR 105 / XML Digital Signature API](https://docs.oracle.com/en/java/javase/17/security/java-xml-digital-signature-api-overview-and-tutorial.html),
[API `Reference`](https://docs.oracle.com/en/java/javase/17/docs/api/java.xml.crypto/javax/xml/crypto/dsig/Reference.html)
e [W3C Canonical XML 1.0](https://www.w3.org/TR/2001/REC-xml-c14n-20010315).

## 6. Versão, origem e fixação

| Componente | Versão / identidade |
|---|---|
| Java local comprovado | Eclipse Temurin `17.0.13+11` |
| Provider JSR 105 medido | `XMLDSig 17` |
| Imagem Java CI | `eclipse-temurin:17.0.13_11-jdk-jammy@sha256:292214e32a0a3032e7f1af0e22491e02452c1f5473ec1d96486958dd4b3a772a` |
| Imagem Node CI | `node:20.20.2-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0` |
| Runner | `ubuntu-24.04`; actions fixadas por commit SHA |

O digest Java é o manifesto multi-arquitetura publicado para a tag oficial do Eclipse Temurin. O
workflow exige exatamente `java.runtime.version=17.0.13+11`.

## 7. Isolamento e execução offline

O helper aceita somente uma `Reference URI` local, igual à URI prevalidada. JAXP usa
`disallow-doctype-decl`, desliga entidades gerais/parâmetro e `load-external-dtd`, define
`ACCESS_EXTERNAL_DTD/SCHEMA` como vazio e instala `EntityResolver` que sempre falha.

No CI, a prova roda sem cache Vitest, com `--network none`, root filesystem read-only, `/tmp` limitado, usuário sem
privilégio, `cap-drop ALL`, `no-new-privileges`, limites de memória/CPU/PIDs e workspace read-only.
Rede é usada antes somente para `npm ci` e pull das imagens fixadas; a prova em si não possui rede.

## 8. Fixtures e material criptográfico

- XML fiscal mínimo, sintético e deliberadamente não emitível;
- Id determinístico `NFeSINTETICO-C14N-EXTERNAL-PROOF-003`;
- sem CPF, CNPJ, inscrição, chave de acesso de 44 dígitos ou dado de cliente;
- certificado autoassinado `CN=NFCE-TESTE-NAO-FISCAL`, RSA 2048;
- chave existente em `lib/fiscal/signing/__fixtures__/test-cert.ts`, marcada como descartável e sem
  valor fiscal; nenhuma nova chave privada foi commitada;
- o helper externo rejeita qualquer certificado cujo subject não contenha o marcador sintético.

Manter a chave fixa é intencional: RSA PKCS#1 v1.5 é determinístico e permite hashes de evidência
reprodutíveis. O material nunca é resolvido pelo vault nem usado fora dos testes.

## 9. Algoritmos e transforms

| Papel | URI exata |
|---|---|
| C14N | `http://www.w3.org/TR/2001/REC-xml-c14n-20010315` |
| Transform 1 | `http://www.w3.org/2000/09/xmldsig#enveloped-signature` |
| Transform 2 | `http://www.w3.org/TR/2001/REC-xml-c14n-20010315` |
| Digest | `http://www.w3.org/2000/09/xmldsig#sha1` |
| Signature | `http://www.w3.org/2000/09/xmldsig#rsa-sha1` |

Java 17 habilita `secureValidation` por default e bloqueia SHA-1. A prova desliga essa política
genérica somente depois de validar manualmente a allowlist acima, uma única referência local, RSA
de no mínimo 2048 bits e a estrutura exata. Isso não torna SHA-1 aceitável fora deste XMLDSig.

## 10. DigestValue

Resultado local externo:

```text
interno/declarado : 7FWU5UtPHiZypCWOmueZ+7mgmq0=
externo/calculado : 7FWU5UtPHiZypCWOmueZ+7mgmq0=
reference C14N SHA-256: e3e67530a0223eeb82dd70f875ccd1d89fbf82f14e11bcb9c3a1526e8eb9f604
```

## 11. SignedInfo e SignatureValue

```text
SignedInfo C14N SHA-256: 9e9451b5dce5c6c775de1d12a36aff5a395bf8915d01f22bdf67a008b0cca16e
SignatureValue JSR 105: true
core XMLDSig JSR 105: true
XML assinado SHA-256: 06b4bf15603894c113723f7e911f79318d0d8dc72579b92591c636aeb09a9f98
```

Os arquivos `reference.c14n` e `signed-info.c14n` externos são comparados byte a byte com o resultado
interno. O XML assinado sintético, o relatório e os hashes são artifacts do workflow por 30 dias;
nenhuma chave privada é copiada. Assim, `sha256sum --check` valida o conjunto completo sem ignorar
arquivos ausentes.

## 12. Provas positivas

| Prova | Resultado |
|---|---|
| XML interno validado por Java JSR 105 | verde |
| Digest externo idêntico ao interno | verde |
| C14N externo do `infNFe` byte-idêntico | verde |
| C14N externo de `SignedInfo` byte-idêntico | verde |
| `SignatureValue` validado externamente | verde |
| Segunda assinatura da mesma entrada byte-idêntica | verde |

## 13. Provas negativas

| Mutação | Rejeição externa esperada/medida |
|---|---|
| conteúdo (`vNF`) | `DIGEST_INVALID` |
| atributo (`versao`) | `DIGEST_INVALID` |
| ordem de filhos semanticamente relevante | `DIGEST_INVALID` |
| namespace prefixado herdado da raiz por alvo e `SignedInfo` | `DIGEST_INVALID` |
| `DigestValue` | `DIGEST_INVALID` |
| `SignatureValue` | `SIGNATURE_INVALID` |
| algoritmo diferente do schema | `ALGORITHM_REJECTED` |
| `Reference` para Id inexistente | `REFERENCE_NOT_FOUND` |
| Id duplicado/ambíguo | `REFERENCE_AMBIGUOUS` |
| `Reference` externa | `REFERENCE_URI_REJECTED` |
| DTD/XXE | `XML_POLICY_REJECTED` |

Resultado local: **11/11 rejeições corretas**; suíte total da prova: **16/16 testes verdes**.

## 14. CI e determinismo

O workflow `.github/workflows/fiscal-c14n-external-proof.yml` possui paths restritos, timeout de 20
minutos, permissões `contents: read`, zero secrets, versões/digests fixos, container offline e upload
de relatório/hashes. `FISCAL_C14N_EXPECT_JAVA_VERSION` falha se o runtime divergir.

Por envolver compilação Java e múltiplos processos de validação, a prova é opt-in no comando
dedicado `npm run fiscal:c14n:proof`; a suíte Vitest genérica registra o arquivo como skipped. Essa
separação evita contenção com testes legados de varredura que possuem timeout fixo, sem retirar a
prova do workflow fiscal obrigatório.

Validação local do fechamento:

- prova dedicada: **16/16**;
- suíte focal signer/C14N: **35/35**;
- suíte fiscal: **262 passed**, 16 provas externas skipped no job genérico e verdes no job dedicado;
- suíte global com timeout de infraestrutura de 30 s: **2544 passed**, 2 expected-fail, 34 skipped;
- TypeScript e ESLint focal: verdes;
- build Next/Prisma: verde, 104/104 páginas estáticas;
- `npm audit --omit=dev`: 7 achados preexistentes em Next.js/Playwright/PostCSS/React Router/XLSX;
  nenhuma vulnerabilidade reportada para `xml-crypto`, `@xmldom/xmldom` ou `xpath`.

O comando global com timeout padrão de 5 s foi executado duas vezes e falhou somente por timeout em
2–3 scanners legados de árvore inteira; os 13 testes desses scanners passaram isoladamente. Nenhuma
asserção de conteúdo falhou e os arquivos legados não foram alterados fora da allowlist deste GOAL.

Determinismo: fixture, chave/certificado, serialização, PKCS#1 v1.5 e versões do runner são fixos. Os
três hashes da seção 10/11 devem permanecer iguais; mudança exige revisão explícita da fixture ou da
implementação.

## 15. Gate, nível N e estado fiscal

- **P-05 / GOALs históricos 007–008:** fechados no eixo C14N/XMLDSig pela prova externa.
- **F4:** N4 técnico no eixo assinatura/C14N.
- **Gate técnico Dry-Run F4→F5:** o bloqueio C14N está fechado; o gate global não autoriza F5 enquanto
  regras tributárias/casos-alvo e gates humanos restantes não estiverem verdes.
- **N6:** 0 — nenhuma homologação SEFAZ.
- **N7:** 0 — nenhuma produção.
- `fiscalEnabled` permanece intocado e sem ativação.

## 16. Limitações

1. prova de integridade/interoperabilidade, não de confiança ICP-Brasil;
2. certificado autoassinado não valida cadeia, revogação ou política de certificado A1;
3. fixture mínima não declara validade XSD nem representa documento emitível;
4. SHA-1/RSA-SHA1 permanecem dívida imposta pelo schema e devem ser substituídos quando o XSD mudar;
5. não há resposta, protocolo, cStat, QR-Code, CSC, DANFCE ou comunicação SEFAZ;
6. o container CI precisa ser reconstruído quando a versão Java allowlisted for atualizada.

## 17. Riscos remanescentes

- vulnerabilidades futuras em parser/canonicalizador interno exigem atualização do lockfile e nova
  execução da prova externa;
- C14N inclusivo incorpora namespaces ancestrais; qualquer mudança de contexto do XML deve manter
  esta suíte;
- a validade fiscal completa ainda depende de tributos, XSD, provider, fila, eventos e gates humanos;
- o uso excepcional de SHA-1 deve continuar confinado e claramente sinalizado.

## 18. Homologação, produção e próximo passo

Esta prova **não é homologação SEFAZ**, **não emite documento**, **não usa dado real** e **não autoriza
produção**. Nenhuma chamada SEFAZ ocorreu.

Próximo passo permitido: **auditoria de merge readiness do GOAL-003**. O GOAL-004 não foi iniciado.
