# FISCAL — Fechamento GOAL-003 · C14N / XMLDSig prova externa

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-XML-C14N-EXTERNAL-PROOF-003` |
| Data de fechamento documental | 2026-07-15 |
| Branch documental | `fiscal/goal-003-c14n-close` |
| Base | `origin/main` @ `e52d16b1ad62b5aa82dbd00e734e45af7e17f94c` |
| PR de implementação | [#6](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/6) |
| Merge commit | `e52d16b1ad62b5aa82dbd00e734e45af7e17f94c` |
| Parent main | `edc79deb447380a7432220a7f5e7267212984490` |
| Parent fiscal / HEAD integrado | `586c13526e940bed8f79df58b0b7886975db84bd` |
| Run do PR | `29450960130` |
| Artefato | `8357457694` (retenção 30 dias) |
| Critério técnico C14N/XMLDSig do F4→F5 | **FECHADO** |
| Gate Fiscal global | **ABERTO** |
| Nível N | **N4 somente no eixo C14N/XMLDSig** (não N6, não N7) |
| Homologação SEFAZ | **não** |
| Produção | **não** |
| Emissão ativada | **não** |
| Signer | **dormente** |

---

## 1. Objetivo

Fechar documentalmente o GOAL nomeado `FISCAL-XML-C14N-EXTERNAL-PROOF-003` após a integração do
PR #6 na `main`, e registrar formalmente:

- prova externa independente de C14N 1.0 e XMLDSig;
- critério técnico C14N/XMLDSig do gate F4→F5 **fechado**;
- gate Fiscal **global ainda aberto**;
- N4 limitado ao eixo técnico; N6=0; N7=0;
- signer dormente; sem emissão, sem SEFAZ, sem homologação, sem produção fiscal;
- GOAL-004 **não** iniciado.

Esta entrega é **somente documentação**. Não implementa código, não altera workflow, Docker,
Java, dependências, Prisma ou Contador HUB.

Escopo histórico correspondente: GOALs de sequência **007** (C14N conforme) e **008** (XMLDSig
endurecido com material de teste) de
[`FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md`](./FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md).

---

## 2. Merge commit verificado

```text
e52d16b Merge pull request #6 from rafaelfaria49-png/fiscal/goal-003-c14n-external-proof
├─ parent¹ edc79de  (main imediatamente anterior)
└─ parent² 586c135  (HEAD fiscal integrado)
```

Método: **merge commit** (não squash, não rebase). Branch de implementação preservada.

Commits próprios da branch fiscal (7):

| Hash | Mensagem |
|---|---|
| `3451235` | feat(fiscal): adicionar prova externa de C14N e XMLDSig |
| `675f9ee` | test(fiscal): cobrir mutacoes e validacao independente |
| `4c047cc` | docs(fiscal): documentar prova externa de assinatura |
| `78d51a7` | fix(ci): exigir evidencias da prova C14N |
| `f2ed492` | fix(ci): executar prova pelo entrypoint npm |
| `fce5462` | fix(ci): executar prova pelo runner Node |
| `586c135` | fix(ci): verificar hashes no diretorio de evidencias |

---

## 3. Arquivos integrados (já na main)

| Área | Caminhos principais |
|---|---|
| C14N / parser | `lib/fiscal/signing/c14n.ts`, `c14n.test.ts` |
| XMLDSig | `lib/fiscal/signing/nfce-signer.ts`, `xmldsig-builder.ts`, `signer.types.ts` |
| Prova externa (testes) | `lib/fiscal/signing/c14n-external-proof.test.ts` |
| Runner | `scripts/fiscal/run-c14n-external-proof.mjs` |
| Verifier Java | `tools/fiscal-c14n-proof/src/FiscalXmlDsigVerifier.java` |
| Container | `tools/fiscal-c14n-proof/Dockerfile` |
| CI | `.github/workflows/fiscal-c14n-external-proof.yml` |
| Dependências | `package.json` / `package-lock.json` (`xml-crypto@6.1.2`, `@xmldom/xmldom@0.8.13`) |
| Docs de implementação | `docs/fiscal/FISCAL_XML_C14N_EXTERNAL_PROOF_003.md` + status/roadmap/continuação |

**19 arquivos** no diff do PR #6 · **+1.595 / −343**.

**Ausente do escopo (confirmado):** Prisma, migration, banco, `app/api`, `app/actions` de emissão,
componentes de UI, provider SEFAZ, Contador HUB, certificados reais, dados reais.

---

## 4. C14N

| Item | Estado integrado |
|---|---|
| Algoritmo | Canonical XML 1.0 **inclusivo**, sem comentários |
| URI | `http://www.w3.org/TR/2001/REC-xml-c14n-20010315` |
| Implementação interna | `xml-crypto` `C14nCanonicalization` sobre DOM `@xmldom/xmldom` |
| Namespaces ancestrais | coletados e repassados ao canonicalizador |
| DTD / ENTITY | recusados antes do parser (`assertSafeXmlPolicy`) |
| Substitui | serializador “C14N-lite” autoconsistente anterior |

---

## 5. XMLDSig

| Item | Estado integrado |
|---|---|
| DigestMethod | `http://www.w3.org/2000/09/xmldsig#sha1` (schema fixo; ADR-0011) |
| SignatureMethod | `http://www.w3.org/2000/09/xmldsig#rsa-sha1` (schema fixo; ADR-0011) |
| Transforms | enveloped-signature + C14N 1.0 (ordem e cardinalidade estritas) |
| Estrutura | uma `Signature` filha direta de `NFe`; filhos exatos e ordenados |
| RSA mínimo | 2048 bits (signer e verifier) |
| SHA-256 internos | preservados fora do XMLDSig fiscal |

---

## 6. Reference URI

- Somente URI local `#Id` simples;
- exatamente um elemento com o `Id` referenciado;
- alvo obrigatoriamente `infNFe` no namespace fiscal
  `http://www.portalfiscal.inf.br/nfe`;
- Id inexistente, duplicado, externo, absoluto ou fragmentário inválido → **fail-closed**.

---

## 7. Wrapping

Mitigações integradas no signer/verifier TypeScript e no verifier Java:

- uma única `Signature` no documento, filha direta de `NFe`;
- um único `infNFe` fiscal, filho direto;
- Reference resolve por varredura de `Id` (não “primeiro `infNFe`”);
- ambiguidade de Id / alvo fora do namespace / estrutura XMLDSig extra → rejeição.

---

## 8. Ferramenta externa e independência

| Critério | Resultado |
|---|---|
| Runtime | Eclipse Temurin JDK **17.0.13+11** |
| API | Java **JSR 105** / `javax.xml.crypto.dsig` (provider XMLDSig do JDK) |
| Parser | JAXP com DTD/XXE/entidades externas bloqueados |
| Importa TypeScript / xml-crypto / C14N interno? | **não** |
| Recebe DigestValue pronto como única prova? | **não** — recalcula via Reference |
| Canonicaliza alvo e SignedInfo? | **sim**, independentemente |
| Valida SignatureValue? | **sim**, com chave do X509 embutido (subject sintético allowlisted) |
| Runner Node | apenas orquestra Vitest / exit code; **não** substitui a prova Java |

---

## 9. Container e supply chain

| Controle | Estado |
|---|---|
| Imagem Java | `eclipse-temurin:17.0.13_11-jdk-jammy@sha256:292214e3…` |
| Imagem Node | `node:20.20.2-bookworm-slim@sha256:2cf067cf…` |
| Actions | pinadas por commit SHA |
| Rede na prova | `--network none` |
| Filesystem | `--read-only` + tmpfs limitado; workspace ro; evidência rw controlada |
| Capabilities | `--cap-drop ALL` · `no-new-privileges` |
| Usuário | não-root (`id -u`/`id -g` do runner) |
| Secrets | **zero** no workflow |
| Hash check | `sha256sum --check` no diretório de evidências (commit `586c135`) |
| Ausência de evidência | `test -s` + `if-no-files-found: error` no upload |

---

## 10. Workflow, run e artefato

| Item | Valor |
|---|---|
| Workflow | `.github/workflows/fiscal-c14n-external-proof.yml` |
| Run do PR | `29450960130` |
| HEAD da run | `586c13526e940bed8f79df58b0b7886975db84bd` |
| Resultado | success (evidência do PR #6 reutilizada neste fechamento) |
| Artefato | `8357457694` · nome `fiscal-c14n-external-proof-<sha>` · retenção 30 dias |
| Conteúdo esperado | `report.json`, `mutations.json`, `hashes.sha256`, `reference.c14n`, `signed-info.c14n`, `input.xml` sintético |

---

## 11. Hashes conferidos

| Evidência | Valor |
|---|---|
| DigestValue (SHA-1 base64) | `7FWU5UtPHiZypCWOmueZ+7mgmq0=` |
| SignedInfo C14N SHA-256 | `9e9451b5dce5c6c775de1d12a36aff5a395bf8915d01f22bdf67a008b0cca16e` |
| XML assinado SHA-256 | `06b4bf15603894c113723f7e911f79318d0d8dc72579b92591c636aeb09a9f98` |
| Reference C14N SHA-256 | `e3e67530a0223eeb82dd70f875ccd1d89fbf82f14e11bcb9c3a1526e8eb9f604` |

---

## 12. Provas positivas e negativas

### Positivas (6/6)

1. XML assinado internamente validado por Java JSR 105 (`coreValid` / `valid`);
2. DigestValue externo = interno;
3. bytes C14N do `infNFe` idênticos;
4. bytes C14N de `SignedInfo` idênticos;
5. `SignatureValue` validado externamente;
6. segunda assinatura da mesma entrada byte-idêntica (determinismo).

### Negativas (11/11 fail-closed)

conteúdo · atributo · ordem semântica · namespace · DigestValue · SignatureValue · algoritmo ·
referência ausente · referência ambígua · referência externa · DTD/XXE.

Suíte dedicada da prova: **16/16**.

---

## 13. Testes e qualidade (evidências do PR #6 — não reexecutados neste fechamento)

| Validação | Resultado declarado no PR / relatório técnico |
|---|---|
| Prova externa dedicada | 16/16 |
| Signer / C14N focados | 35/35 |
| Suíte fiscal | 262 passed (prova externa skipped no job genérico; verde no dedicado) |
| TypeScript | verde |
| ESLint focal | verde |
| Build Next | verde (104/104 páginas na esteira do PR) |
| Worker XSD | sem regressão reportada |

Este GOAL de fechamento **não** repetiu testes, TypeScript nem build — reutiliza as evidências do
PR #6 e do relatório técnico.

---

## 14. Material sintético e segredos

- Certificado de teste pré-existente `CN=NFCE-TESTE-NAO-FISCAL` (RSA 2048), em
  `lib/fiscal/signing/__fixtures__/test-cert.ts` — **não** operacional;
- XML sintético `NFeSINTETICO-C14N-EXTERNAL-PROOF-003`; sem CPF/CNPJ/chave de 44 dígitos;
- nenhuma chave de produção, token, senha de cliente ou secret de workflow;
- Java rejeita certificado cujo subject não contenha o marcador sintético.

---

## 15. Gate e nível N

| Item | Estado |
|---|---|
| Critério técnico C14N/XMLDSig do F4→F5 | **FECHADO** |
| Gate Fiscal global (dry-run completo / F5) | **ABERTO** |
| G-C1 / G-C2 | fechados (GOAL-001 / GOAL-002) — inalterados |
| G-C3 | **não criado** |
| G-F5 / G-F7 / G-F12 | abertos |
| N4 | **somente** no eixo C14N/XMLDSig (e XSD já N4 no eixo próprio) |
| N6 | **0** |
| N7 | **0** |

**Prova externa técnica ≠ homologação SEFAZ ≠ produção.**

---

## 16. Signer dormente, callers, emissão, SEFAZ

| Item | Estado |
|---|---|
| Signer | **dormente** |
| Callers de venda / PDV / produção | **0** |
| Usos legítimos | dry-run interno, testes unitários, prova externa, teste de integração do worker XSD |
| Emissão ativada | **não** |
| `fiscalEnabled` | inalcançável / default-off |
| SEFAZ | **não** chamada |
| Homologação | **não** |
| Produção fiscal | **não** |

---

## 17. Riscos remanescentes e follow-ups (sem implementar)

1. Ampliar vetores de conformância C14N (mais fixtures de namespace/atributo/whitespace).
2. Avaliar mais casos de namespace herdado no subset assinado.
3. Avaliar processing instructions, se relevantes ao subset fiscal.
4. Avaliar comentários somente se o algoritmo futuro os exigir (hoje C14N sem comentários).
5. Manter o workflow externo como gate obrigatório para alterações em `lib/fiscal/signing/**`.
6. Revisar assinatura antes de qualquer **caller produtivo**.
7. Não iniciar transmissão SEFAZ sem GOAL próprio + gates G-F5/G-F7.
8. Dry-run global auferível (casos-alvo, ST, paridade de produto) permanece aberto.
9. Trivy HIGH continua follow-up de supply chain separado (gate atual = CRITICAL).

---

## 18. Próximo passo

- **GOAL-003:** **FECHADO** (implementação + merge + este fechamento documental).
- **GOAL-004:** **não iniciado**.
- Próximo passo operacional sugerido: **auditoria de merge readiness documental** desta branch de
  fechamento (`fiscal/goal-003-c14n-close`), e somente depois avaliação humana do próximo GOAL
  técnico (dry-run auferível / backlog), **sem** presumir F5, homologação ou produção.

---

## 19. Conclusão

O GOAL `FISCAL-XML-C14N-EXTERNAL-PROOF-003` está **documentalmente fechado** após integração na
`main` via PR #6 (`e52d16b`). A prova externa Java JSR 105 confirma interoperabilidade de C14N 1.0
inclusivo e XMLDSig fiscal endurecido, com CI e artefato no HEAD `586c135`. O **critério técnico
C14N/XMLDSig do gate F4→F5 está FECHADO**. O **gate Fiscal global permanece ABERTO**. Níveis:
**N4 no eixo C14N/XMLDSig; N6=0; N7=0**. Signer **dormente**. Nenhuma emissão, SEFAZ, homologação
ou produção fiscal.

Fontes técnicas:
[`FISCAL_XML_C14N_EXTERNAL_PROOF_003.md`](./FISCAL_XML_C14N_EXTERNAL_PROOF_003.md) ·
ADR-0011 · workflow `fiscal-c14n-external-proof.yml`.
