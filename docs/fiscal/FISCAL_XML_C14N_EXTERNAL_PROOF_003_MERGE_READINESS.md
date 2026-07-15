# FISCAL XML C14N EXTERNAL PROOF 003 — MERGE READINESS

| Campo | Valor |
|---|---|
| GOAL de auditoria | `FISCAL-XML-C14N-EXTERNAL-PROOF-003-MERGE-READINESS` |
| Data | 2026-07-15 |
| Natureza | Auditoria conservadora, **read-only** sobre a implementação; não corrige código |
| Branch auditada | `fiscal/goal-003-c14n-external-proof` @ `586c13526e940bed8f79df58b0b7886975db84bd` |
| Contra | `origin/main` @ `edc79deb447380a7432220a7f5e7267212984490` |
| Branch de auditoria | `audit/fiscal-c14n-external-proof-003-readiness` |
| Worktree | `C:\Projetos\wt-fiscal-c14n-003-readiness` (base `origin/main`) |
| **Classificação** | **A — PRONTO PARA INTEGRAÇÃO** (com ressalvas informativas, nenhuma bloqueante) |

> Este documento é o único artefato criado por esta auditoria. Nenhum arquivo de código, teste,
> workflow, Dockerfile, dependência ou documento da branch de implementação foi alterado.

---

## 1. Objetivo

Determinar se a branch `origin/fiscal/goal-003-c14n-external-proof` (HEAD `586c135`) pode ser
integrada com segurança à `origin/main` atual. **Não** integrar neste GOAL: sem merge, sem PR, sem
push para main. A auditoria valida canonicalização C14N 1.0, XMLDSig, resolução de `Reference`,
mitigação de wrapping, independência da prova externa Java, segurança do container/CI, ausência de
segredo/dado real, coerência de gate/nível N e integração com uma main que avançou.

## 2. Base

- Base mínima obrigatória declarada: `0b0d374521fca96f99f980bafabc226fa5784c56`.
- `git merge-base --is-ancestor 0b0d374… origin/fiscal/goal-003-c14n-external-proof` → **exit 0**
  (0b0d374 é ancestral da branch — base mínima satisfeita).
- **merge-base(origin/main, branch)** = `92a531fc53e0ecd61ee6fef0bc8431e7a60af20e` — exatamente a
  `origin/main` observada ao final da implementação. A branch foi construída sobre 92a531f.

## 3. main atual

- `origin/main` = `edc79deb447380a7432220a7f5e7267212984490`.
- A main **avançou** de `92a531f` para `edc79de`: **1 commit exclusivo**.
- Commit exclusivo da main:
  `edc79de feat(operacoes-v4): unificar projecao financeira da os`.
- Arquivos do commit da main (18): `components/operacoes-v4-preview/**`,
  `lib/operacoes-v3/delivery-financial-guard.ts`, `lib/operacoes-v4/financial-projection*`.
  **Nenhuma interseção** com `lib/fiscal/signing`, `package.json`, `package-lock.json`, workflows,
  documentos fiscais compartilhados ou Contador HUB. Risco textual e semântico sobre esta branch: **nulo**.

## 4. Branch

- HEAD `586c13526e940bed8f79df58b0b7886975db84bd` — confere com o HEAD esperado.
- `git cat-file -t 586c135…` → `commit`.
- Working tree do worktree de auditoria: **limpo** (`git status --short` vazio).
- ahead/behind (`--left-right --count origin/main...branch`) = **1  7** → main tem 1 commit que a
  branch não possui; a branch tem 7 commits exclusivos. Divergência mínima e disjunta.

> A branch estar 1 commit "atrás" da main **não** é bloqueio: o `merge-tree` confirma fusão limpa
> (Seção 8); a branch não precisa conter `edc79de` para integrar.

## 5. Commits

Sete commits exclusivos da branch (`origin/main..branch`), coincidindo com o contexto declarado:

```
3451235 feat(fiscal): adicionar prova externa de C14N e XMLDSig
675f9ee test(fiscal): cobrir mutacoes e validacao independente
4c047cc docs(fiscal): documentar prova externa de assinatura
78d51a7 fix(ci): exigir evidencias da prova C14N
f2ed492 fix(ci): executar prova pelo entrypoint npm
fce5462 fix(ci): executar prova pelo runner Node
586c135 fix(ci): verificar hashes no diretorio de evidencias
```

## 6. Arquivos

`git diff --name-status origin/main...branch` retornou **exatamente os 19 arquivos esperados**, sem
extras:

| Status | Arquivo |
|---|---|
| A | `.github/workflows/fiscal-c14n-external-proof.yml` |
| M | `docs/ai/CURRENT_STATUS.md` |
| M | `docs/fiscal/FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md` |
| M | `docs/fiscal/FISCAL_RECONCILE_REPORT_001.md` |
| A | `docs/fiscal/FISCAL_XML_C14N_EXTERNAL_PROOF_003.md` |
| M | `docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md` |
| M | `docs/roadmaps/ROADMAP_FISCAL.md` |
| A | `lib/fiscal/signing/c14n-external-proof.test.ts` |
| M | `lib/fiscal/signing/c14n.test.ts` |
| M | `lib/fiscal/signing/c14n.ts` |
| M | `lib/fiscal/signing/nfce-signer.test.ts` |
| M | `lib/fiscal/signing/nfce-signer.ts` |
| M | `lib/fiscal/signing/signer.types.ts` |
| M | `lib/fiscal/signing/xmldsig-builder.ts` |
| M | `package-lock.json` |
| M | `package.json` |
| A | `scripts/fiscal/run-c14n-external-proof.mjs` |
| A | `tools/fiscal-c14n-proof/Dockerfile` |
| A | `tools/fiscal-c14n-proof/src/FiscalXmlDsigVerifier.java` |

Total: **19 arquivos, +1595 / −343**. Ausências confirmadas (nenhum presente no diff):
Prisma/`schema.prisma`, migration, banco, `app/api`, `app/actions`, componentes, provider SEFAZ,
certificado real, dado real, Contador HUB.

## 7. Interseções

- `main-files.txt` (diff `92a531f..origin/main`) ∩ `branch-files.txt` (diff `92a531f..branch`) =
  **conjunto vazio**. Zero arquivos alterados por ambos os lados.
- Consequência: nenhum conflito textual, nenhuma mudança concorrente de contrato, dependência,
  script npm, workflow ou documento compartilhado. Não há risco de perder alteração da main.
- Análise semântica (não confiando só no conjunto vazio): os dois conjuntos de mudança tratam de
  **domínios disjuntos** — main = projeção financeira de Operações V4; branch = assinatura fiscal
  dormente. Não há acoplamento por contrato, tipo, import ou dependência compartilhada.
- Arquivos temporários (`main-files.txt`, `branch-files.txt`) foram mantidos no scratchpad da
  sessão, **fora do repositório**.

## 8. Merge-tree

- `git merge-tree --write-tree origin/main origin/fiscal/goal-003-c14n-external-proof`
  → **exit 0**, árvore virtual `d4cfe3ef3cef55bd1dfda562f15281fa60fc51f5`, **sem linhas de
  conflito**. Fusão limpa.
- `git diff --check origin/main...branch` → **exit 0** (sem marcadores de conflito, sem erro de
  whitespace).
- Merge real **não** foi executado.

## 9. Auditoria C14N

Arquivos auditados integralmente: `c14n.ts`, `xmldsig-builder.ts`, `nfce-signer.ts`,
`signer.types.ts`. A canonicalização é **delegada** ao `C14nCanonicalization` do `xml-crypto@6.1.2`
(C14N 1.0 **inclusivo**, sem comentários), sobre DOM namespace-aware do `@xmldom/xmldom@0.8.13`.

| # | Critério | Veredito |
|---|---|---|
| 1 | Algoritmo `http://www.w3.org/TR/2001/REC-xml-c14n-20010315` | ✔ `ALG_C14N` exato |
| 2 | C14N **inclusivo**, não exclusivo | ✔ (não é `xml-exc-c14n#`) |
| 3 | Comentários removidos | ✔ fixture com comentário → removido; digest confere |
| 4 | Ordenação de atributos por ns URI + nome local | ✔ delegado ao xml-crypto; validado por byte-igualdade externa |
| 5 | Namespaces visíveis e herdados | ✔ `collectAncestorNamespaces` injeta ns prefixados ancestrais; default vem de `node.namespaceURI` |
| 6 | Namespace `xml` | ✔ tratado pelo canonicalizador padrão (não exercitado por fixture — ver riscos) |
| 7 | Escaping de texto | ✔ `&`,`<`,`>` e `#xD`; validado por byte-igualdade (`&amp;`, `&#xD;`) |
| 8 | Escaping de atributos | ✔ `#x9` normalizado; validado por byte-igualdade |
| 9 | Normalização de line endings | ✔ `#xD` preservado como `&#xD;` no texto canônico |
| 10 | Whitespace significativo preservado | ✔ conteúdo textual mantido |
| 11 | Entidades resolvidas via DOM (não lexical) | ✔ `&amp;` resolvido pelo DOM antes da canonicalização |
| 12 | Nós vazios canônicos | ✔ SignedInfo/elementos vazios serializados via DOM |
| 13 | Processing instructions | ⚠ não exercitadas pela fixture (delegado ao xml-crypto) — ver riscos |
| 14 | DTD/document subset proibidos | ✔ `assertSafeXmlPolicy` rejeita `<!DOCTYPE`/`<!ENTITY` antes do DOM |
| 15 | SignedInfo usa o mesmo algoritmo | ✔ `canonicalizeSignedInfo` C14N 1.0 no contexto inclusivo da NFe/Signature |
| 16 | Reference: enveloped-signature + C14N | ✔ dois transforms na ordem `enveloped` → `C14N` |
| 17 | DigestMethod = SHA-1 | ✔ `ALG_DIGEST_SHA1` (imposto pelo XSD, ADR-0011) |
| 18 | SignatureMethod = RSA-SHA1 | ✔ `ALG_SIGNATURE_RSA_SHA1` |
| 19 | SHA-256 não removido de usos internos não-fiscais | ✔ SHA-1 confinado ao digest/assinatura fiscal; SHA-256 permanece nas evidências e demais usos |
| 20 | Sem regressão no worker XSD | ✔ `workers/fiscal-xsd/**` fora do diff; suíte unitária 41 passed |

**Comparação com a implementação Java externa:** os bytes canônicos de `infNFe` e de `SignedInfo`
produzidos internamente foram comparados **byte a byte** com os produzidos pela JSR 105 e batem
(Seção 22). O ponto delicado — SignedInfo canonicalizado no contexto inclusivo com namespaces
ancestrais — é validado por uma implementação totalmente independente.

## 10. Auditoria XMLDSig (`nfce-signer.ts`)

- Estrutura estrita via `hasExactChildren`: `Signature` = `[SignedInfo, SignatureValue, KeyInfo]`;
  `SignedInfo` = `[CanonicalizationMethod, SignatureMethod, Reference]`;
  `Reference` = `[Transforms, DigestMethod, DigestValue]`; `Transforms` = `[Transform, Transform]`;
  `KeyInfo` = `[X509Data]`; `X509Data` = `[X509Certificate]`.
- Allowlist exata dos quatro URIs (C14N, enveloped, rsa-sha1, sha1); qualquer divergência →
  `algoritmo_nao_permitido`.
- Assinatura RSA PKCS#1 v1.5 sobre `SignedInfo` canonicalizado; verificação recanoniza e confere
  digest **e** `SignatureValue` independentemente com o X509 embutido.
- Chave/cert RSA **≥ 2048 bits** exigidos tanto na assinatura quanto na verificação; chave não-RSA
  ou abaixo do mínimo → falha.
- Validade temporal do certificado (`assertValidade`) e `checkPrivateKey` (chave ↔ certificado).

## 11. Reference URI

- URI aceita somente na forma `#Id` local (`/^#[^#\s]+$/`); vazia, externa, absoluta ou com `#`
  duplo é rejeitada (`referencia_invalida`).
- `Id` deve casar `^[A-Za-z_][A-Za-z0-9._:-]*$` e ser **único** no documento
  (`findAllById(...).length === 1`), senão `referencia_ambigua`.
- Alvo resolvido deve ser **identicamente** o `infNFe` fiscal (`target !== fiscalInfNFe[0]` →
  rejeita), no namespace `http://www.portalfiscal.inf.br/nfe`.
- Fail-closed confirmado para: Id inexistente, Id duplicado, URI externa, algoritmo inesperado,
  estrutura ambígua, namespace incorreto, DTD/XXE, chave RSA < 2048, chave não-RSA.

## 12. Wrapping

Mitigações contra signature wrapping:

- Exatamente **uma** `Signature` no namespace DSIG e **filha direta** de `NFe`
  (`allSignatures.length === 1 && directSignatures.length === 1`).
- Exatamente **um** `infNFe` fiscal, filho direto, e a `Reference` deve apontá-lo por identidade de
  nó (não por posição/primeiro-encontrado).
- Cardinalidade e ordem estritas em cada nível → `SignedInfo`/`Reference`/`DigestValue`/
  `SignatureValue` duplicados ou fora de ordem são rejeitados.
- O verifier anterior ("C14N-lite") lia o primeiro `infNFe` sem resolver rigorosamente a Reference;
  esta versão fecha exatamente essa lacuna. Confirmado pela mutação negativa `referencia-ambigua`.

## 13. Verifier Java (`FiscalXmlDsigVerifier.java`)

- Usa **JSR 105** (`javax.xml.crypto.dsig`) — provider `XMLDSig 17` do JDK.
- Parser JAXP endurecido: `disallow-doctype-decl=true`, entidades gerais/parâmetro e DTD externo
  desligados, `ACCESS_EXTERNAL_DTD/SCHEMA=""`, `EntityResolver` que sempre falha, `ErrorHandler`
  que promove warning/error a exceção.
- Estrutura, algoritmos, URI e alvo revalidados manualmente (allowlist) **antes** de
  `signature.validate`; `URIDereferencer` bloqueia qualquer URI ≠ prevalidada; `KeySelector`
  aceita **somente** cert cujo subject contém `NFCE-TESTE-NAO-FISCAL` e RSA ≥ 2048.
- Expõe e grava os bytes canônicos reais (`reference.c14n`, `signed-info.c14n`) via
  `Reference.getDigestInputStream()` e `SignedInfo.getCanonicalizedData()`.
- `secureValidation=false` é usado **apenas** porque o Java 17 bloqueia RSA-SHA1 (imposto pelo XSD
  fiscal); compensado pela allowlist manual, única Reference local, RSA mínimo e estrutura exata.
  Documentado no relatório (`secureValidationDisabledOnlyForSchemaRequiredSha1: true`).

## 14. Independência

Confirmada. O verifier Java **não** importa nem executa TypeScript, **não** importa `xml-crypto`,
**não** usa o canonicalizador interno e **não** recebe `DigestValue` pronto como única prova:
recalcula o digest (`getCalculatedDigestValue()`), recanoniza alvo e `SignedInfo`, resolve a
`Reference` e valida `SignatureValue` de forma autônoma. `valid = coreValid && referenceValid &&
signatureValueValid` — **sucesso parcial não é aceito como total**. O runner Node
(`run-c14n-external-proof.mjs`) apenas orquestra (spawn de vitest com `FISCAL_C14N_EXTERNAL_PROOF=1`);
não substitui a prova Java. O teste vitest compara os bytes externos com os internos **byte a byte**
e falha se divergirem.

## 15. Container

`tools/fiscal-c14n-proof/Dockerfile`:

- `JAVA_IMAGE=eclipse-temurin:17.0.13_11-jdk-jammy@sha256:292214e…` — **fixado por digest**.
- `NODE_IMAGE=node:20.20.2-bookworm-slim@sha256:2cf067…` — **fixado por digest**.
- **Nenhum `latest`**, **nenhum `apt install`** (sem pacote não-pinado); JDK copiado da imagem
  Temurin; `USER node` (não-root); `WORKDIR /workspace`.

`.github/workflows/fiscal-c14n-external-proof.yml` — execução:

- `docker run --network none --read-only --tmpfs /tmp:…,noexec,nosuid,nodev
  --memory 1g --cpus 2 --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges:true
  --user $(id -u):$(id -g) --volume $PWD:/workspace:ro --volume …/$EVIDENCE_DIR:/evidence:rw`.
- **Sem rede** na prova, filesystem read-only, capabilities removidas, usuário não-root, diretório
  de evidência controlado, `timeout-minutes: 20`, `permissions: contents: read`.

## 16. Supply chain

- `package.json` adiciona `@xmldom/xmldom@0.8.13` e `xml-crypto@6.1.2` (**versões exatas**, sem
  caret). Scripts novos: `test:fiscal-c14n:external` = `node scripts/fiscal/run-c14n-external-proof.mjs`
  e `fiscal:c14n:proof` = `npm run test:fiscal-c14n:external`.
- `package-lock.json` adiciona `@xmldom/xmldom@0.8.13`, `xml-crypto@6.1.2` e as transitivas
  `@xmldom/is-dom-node@1.0.1`, `xpath@0.0.33` — todas com `integrity` SHA-512 e licença MIT.
  Lockfile **coerente** com o `package.json`.
- Postura de segurança: o código usa apenas `C14nCanonicalization` do `xml-crypto` (canonicalização),
  **não** a API `SignedXml`/`checkSignature` (alvo histórico de CVEs de signature-wrapping do
  xml-crypto). A verificação de assinatura é feita pelo verifier próprio fail-closed. 6.1.2 é a
  linha corrigida.
- Actions do workflow fixadas por commit SHA (`checkout`, `setup-node`, `upload-artifact`).

## 17. Material sintético

Fixture `lib/fiscal/signing/__fixtures__/test-cert.ts` — `CN=NFCE-TESTE-NAO-FISCAL`, auto-assinado,
RSA **2048**, validade 2026-06-25→2036-06-22:

- Claramente sintética ("SEM VALOR FISCAL"); sem CNPJ/CPF real; sem validade operacional; sem
  certificado de produção; sem chave de cliente; não resolvida pelo vault; uso restrito a teste.
- **Não adicionada nesta branch**: o arquivo **não** aparece no diff; foi introduzido por
  `ba0cc12` (Fiscal Fases 0–2), **ancestral do merge-base** `92a531f`. A alegação "nenhuma nova
  chave privada foi commitada" **procede**.
- Tamanho RSA (2048) compatível com a política (mínimo 2048 no signer e no verifier Java).

**Sete alertas produtivos preexistentes** (registro separado, `npm audit --omit=dev` conforme doc):
Next.js/Playwright/PostCSS/React Router/XLSX — **preexistentes, fora do escopo desta branch**.
Nenhum alerta reportado para `xml-crypto`, `@xmldom/xmldom` ou `xpath`; nenhum alerta **novo**
introduzido pelas dependências desta branch (auditoria de advisories destas versões: sem CVE aberto
no caminho de código usado).

## 18. Provas positivas

Reproduzidas **localmente** com Temurin **17.0.13+11** (idêntico ao pin da CI):

| Prova | Resultado |
|---|---|
| XML interno validado por Java JSR 105 (`valid`) | ✔ true |
| `coreValid` / `referenceValid` / `signatureValueValid` | ✔ true / true / true |
| Digest externo idêntico ao interno (`digestMatches`) | ✔ true |
| C14N externo do `infNFe` byte-idêntico ao interno | ✔ (teste passou) |
| C14N externo de `SignedInfo` byte-idêntico ao interno | ✔ (teste passou) |
| Segunda assinatura da mesma entrada byte-idêntica (determinismo) | ✔ (teste passou) |
| provider / runtime | `XMLDSig 17` / `17.0.13+11` (Eclipse Adoptium) |

## 19. Provas negativas

**11/11 mutações rejeitadas** com o `failureCode` esperado (evidência `mutations.json` reproduzida
localmente, `expected === actual` em todos):

`conteudo`→DIGEST_INVALID · `atributo`→DIGEST_INVALID · `ordem-semantica`→DIGEST_INVALID ·
`namespace`→DIGEST_INVALID · `digest-value`→DIGEST_INVALID · `signature-value`→SIGNATURE_INVALID ·
`algoritmo`→ALGORITHM_REJECTED · `referencia-ausente`→REFERENCE_NOT_FOUND ·
`referencia-ambigua`→REFERENCE_AMBIGUOUS · `referencia-externa`→REFERENCE_URI_REJECTED ·
`xxe-dtd`→XML_POLICY_REJECTED.

## 20. CI

- Run declarada: `29443102979`, HEAD `586c135`, workflow *Fiscal C14N External Proof*, resultado
  **success**; artefato `8354274697`, retenção 30 dias.
- **Limitação do ambiente de auditoria:** `gh` CLI ausente e sem acesso autenticado ao GitHub neste
  worktree; **não foi possível inspecionar diretamente** o log da run nem baixar o artefato
  `8354274697`. Em vez disso, a prova foi **reproduzida localmente com o runtime Java idêntico ao
  pin da CI**, batendo os quatro hashes e a matriz positiva+negativa completa — evidência mais forte
  que a leitura do log para o conteúdo criptográfico.
- Fail-closed do workflow verificado por leitura: shell `bash -eo pipefail`, exit do runner
  propagado (`process.exit(result.status)`), `test -s` sobre `report.json`/`mutations.json`/
  `hashes.sha256`, validação `p.valid && p.digestMatches && p.signatureValueValid`, exigência de
  `m.length===11 && expected===actual`, `sha256sum --check hashes.sha256` e
  `if-no-files-found: error`. Nenhuma assert silenciosa; nenhum comando com sucesso falso plausível.
  A correção final `586c135` (verificar hashes no diretório de evidências) é coerente e reforça o
  gate. Nenhuma etapa obrigatória marcada como skipped.

## 21. Artefato

Conteúdo esperado do artefato (por reprodução local): `input.xml`, `report.json`, `hashes.sha256`,
`reference.c14n`, `signed-info.c14n`, `mutations.json`. Sem chave privada copiada; sem segredo. O
`report.json` reproduzido não contém material sensível. Inspeção direta do artefato remoto
`8354274697` não realizada (ver limitação na Seção 20).

## 22. Hashes

**Todos os quatro hashes reproduzidos localmente e conferem exatamente** com os declarados:

| Hash | Declarado | Reproduzido |
|---|---|---|
| DigestValue (SHA-1/base64) | `7FWU5UtPHiZypCWOmueZ+7mgmq0=` | ✔ igual (declared **e** calculated) |
| SignedInfo C14N SHA-256 | `9e9451b5dce5c6c775de1d12a36aff5a395bf8915d01f22bdf67a008b0cca16e` | ✔ igual |
| XML assinado SHA-256 | `06b4bf15603894c113723f7e911f79318d0d8dc72579b92591c636aeb09a9f98` | ✔ igual |
| Reference C14N SHA-256 | `e3e67530a0223eeb82dd70f875ccd1d89fbf82f14e11bcb9c3a1526e8eb9f604` | ✔ igual |

## 23. Testes

Executados **na worktree de implementação** (HEAD `586c135`, que contém o código da branch), sem
alterar código ou configuração:

| Suíte | Comando real | Resultado |
|---|---|---|
| Prova externa | `node scripts/fiscal/run-c14n-external-proof.mjs` (= `fiscal:c14n:proof`) | **16/16 passed** |
| Signer/C14N focal | `vitest run lib/fiscal/signing/c14n.test.ts lib/fiscal/signing/nfce-signer.test.ts` | **35/35 passed** |
| Suíte fiscal (`lib/fiscal`) | `vitest run lib/fiscal` | **262 passed, 16 skipped** |
| Worker XSD unitário | `npm run test:fiscal-xsd:unit` | **41 passed, 1 skipped** |

- Os 16 "skipped" da suíte fiscal são exatamente os casos da prova externa (opt-in por env),
  verdes no comando dedicado.
- **Discrepância de nomenclatura (informativa):** os scripts citados no roteiro
  (`test:fiscal-signing`, `test:fiscal-c14n-proof`) **não existem** no `package.json`; os reais são
  `test:fiscal-c14n:external`/`fiscal:c14n:proof` e, para signer/C14N, execução direta via vitest.
  Não é defeito.
- **Suíte completa (2544 testes / 184 arquivos / 2 expected / 34 skipped) e `npm run build`
  (104/104 páginas): não re-executados localmente.** Justificativa: (a) a governança só exige build
  quando a mudança afeta config/rotas/layouts/Server Actions/Prisma — **nenhum** desses é tocado;
  (b) o signer é **dormente** (0 callers em `app/`), então as novas dependências não entram na
  geração de páginas; (c) restrição conhecida de RAM da máquina faz o build falhar mesmo na main
  limpa (não atribuível a esta branch). O subconjunto fiscal relevante foi verificado diretamente e
  está verde; a suíte completa e o build 104/104 constam da CI e da doc.

## 24. Timeout

- Timeout padrão do vitest do projeto (5 s) e o "timeout de auditoria de 30 s" citados aplicam-se à
  **suíte completa** com scanners legados de árvore inteira. A prova externa usa `beforeAll` com
  30 000 ms próprio (compilação Java + assinatura + execuções).
- Os **13 testes de scanners legados** rodam verdes isoladamente conforme a doc; não foram
  re-executados nesta auditoria (fora do escopo do diff, não tocados). Risco residual: contenção de
  timeout na suíte global sob timeout padrão — **não** é falha de asserção e **não** afeta o
  conteúdo fiscal, que roda opt-in.

## 25. TypeScript

`npx tsc --noEmit --incremental false` na worktree de implementação → **exit 0, zero erros**
(cliente Prisma gerado presente no worktree).

## 26. ESLint

`npx eslint` sobre os arquivos alterados (`c14n.ts`, `xmldsig-builder.ts`, `nfce-signer.ts`,
`signer.types.ts`, os três testes e o runner `.mjs`) → **exit 0, sem warning/erro**.

## 27. Build

`npm run build` **não** re-executado localmente — ver justificativa na Seção 23. Change surface
(funções puras, sem rota/config/Prisma; signer dormente) torna regressão de build implausível; CI e
doc reportam **104/104 páginas estáticas**.

## 28. Gate

Coerente com os documentos. O GOAL-003 fecha **somente o critério técnico C14N/XMLDSig do gate
F4→F5**; o **gate global F4→F5 permanece aberto** por lacunas fora do GOAL (ST/CSOSN, casos-alvo do
dry-run, provider real, fila/eventos, G-F5/G-F7/G-F12). **Nenhum gate nomeado novo foi inventado**
(`FISCAL_RECONCILE_REPORT_001.md` §17: "G-C1/G-C2 permanecem como registrados"; **sem G-C3**).
P-05 registrado como fechado no eixo C14N/XMLDSig; GOALs históricos 007–008 cumpridos.

## 29. Nível N

**N4 exclusivamente no eixo técnico C14N/XMLDSig.** N6 = 0, N7 = 0. Consistente em todos os seis
documentos. A existência de ferramenta externa Java **não** é classificada como homologação.

## 30. Homologação

**Não.** Nenhuma homologação SEFAZ. N6 = 0. Certificado sintético auto-assinado não valida cadeia
ICP-Brasil.

## 31. Produção

**Não.** N7 = 0. `fiscalEnabled` intocado; nenhuma ativação de emissão; signer sem caller produtivo.

## 32. SEFAZ

**Não chamada.** Sem provider real, sem protocolo, sem cStat/QR-Code/CSC/DANFCE, sem rede na prova.

## 33. Contador HUB

**Intocado.** Nenhum arquivo do Contador HUB no diff (o conjunto é fiscal-signing + docs fiscais/
governança/roadmap/status + workflow + Dockerfile + Java + deps). Sem conflito.

## 34. Riscos

Nenhum bloqueante. Residuais (informativos):

1. **Cobertura da prova C14N por 1 vetor + 11 mutações.** A prova externa é decisiva para a fixture
   coberta (ns prefixado herdado, comentário, `#x9` em atributo, `#xD` em texto, entidade `&amp;`),
   mas **não** é uma suíte de conformância W3C C14N completa: não exercita processing instructions,
   atributos `xml:` (`xml:lang`/`xml:space`), redeclaração/undeclaração de namespaces em múltiplas
   profundidades, nem múltiplos prefixos concorrentes. Aceitável dado o signer dormente e o escopo
   de eixo técnico; recomenda-se ampliar vetores antes de qualquer caller produtivo.
2. **CI não inspecionada diretamente** (sem `gh` no ambiente de auditoria) — mitigado por
   reprodução local com Java idêntico ao pin (Seções 20/22).
3. **Suíte completa e build 104/104 não re-executados localmente** — mitigado por change surface
   inerte e verificação direta do subconjunto fiscal (Seção 23).
4. **SHA-1/RSA-SHA1** permanecem dívida imposta pelo schema oficial (ADR-0011), confinados ao
   XMLDSig fiscal — corretamente sinalizado.
5. Atualização futura da versão Java allowlisted exige rebuild do container e nova prova.

## 35. Classificação

**A — PRONTO PARA INTEGRAÇÃO.**

Todos os critérios de A satisfeitos: merge-tree limpo (exit 0); nenhuma colisão semântica
(interseção vazia, domínios disjuntos); prova externa genuinamente independente (JSR 105, recomputa
digest, compara byte a byte); **quatro hashes reproduzidos e conferidos localmente**; prova
16/16 + 11/11 verde localmente com Java idêntico ao pin da CI (CI declarada success; log direto não
inspecionado por limitação de ambiente, corroborado por reprodução); C14N correto para os vetores
provados; URI/Id fail-closed; wrapping mitigado; workflow fail-closed; sem segredo; sem dado real;
gate e nível N corretos (N4 só no eixo C14N/XMLDSig, N6=N7=0, sem G-C3, sem homologação);
TypeScript/ESLint/testes fiscais verdes; **sem regressão no worker XSD**; **sem conflito com
Contador HUB**. As ressalvas da Seção 34 são informativas e já divulgadas nas limitações da própria
doc do GOAL — não invalidam a arquitetura, logo não rebaixam para B/C.

## 36. Estratégia

Próximo passo autorizado: **abrir o PR do GOAL-003** de `fiscal/goal-003-c14n-external-proof` para
`main`. O merge é limpo (merge-tree exit 0); a main avançou apenas em Operações V4, disjunto. O PR
disparará o workflow *Fiscal C14N External Proof* (paths casam) — exigir a run verde no HEAD do PR
como gate humano final. Recomenda-se, como follow-up **fora deste GOAL**, ampliar os vetores de
conformância C14N (Seção 34.1) antes de habilitar qualquer caller produtivo. GOAL-004 **não**
iniciado nem autorizado por esta auditoria.

## 37. Conclusão

A branch `fiscal/goal-003-c14n-external-proof` @ `586c135` implementa uma prova externa Java JSR 105
genuinamente independente da canonicalização C14N 1.0 e do XMLDSig do signer fiscal, com hashes
reprodutíveis (todos conferidos localmente), matriz negativa completa, verifier fail-closed,
container/CI endurecidos e sem rede, material somente sintético e sem segredo/dado real. A
integração com a main atual é limpa e disjunta, sem regressão no worker XSD e sem tocar o Contador
HUB. Gate e nível N estão corretamente escopados (N4 técnico em C14N/XMLDSig; N6=N7=0; sem
homologação/produção/SEFAZ). **Classificação A — PRONTO PARA INTEGRAÇÃO.** Não integrar neste GOAL.
