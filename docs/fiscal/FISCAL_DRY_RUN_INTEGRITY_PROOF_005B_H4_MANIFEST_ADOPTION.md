# FISCAL-DRY-RUN-INTEGRITY-PROOF-005B — Gate H4 · Adoção do manifesto (auditoria da evidência)

**Data:** 2026-07-21 · **Branch:** `work/fiscal-dry-run-005b-h4-manifest-adoption` (base `origin/main` = `76b000c4d62ec2fb3ac21025c418a074ff5048df`)
**Worktree:** `../wt-fiscal-dry-run-005b-h4-manifest-adoption`
**Run H4:** [`29849033752`](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/29849033752) · **Commit executado:** `76b000c4d62ec2fb3ac21025c418a074ff5048df` (PR #19) · **ref:** `refs/heads/main`
**Artifact:** `fiscal-dry-run-005b-h4-complete-manifest-29849033752`

> **Decisão do operador (revisão do pedido original):** *Report only, keep partial.*
> O comando de adoção que determinava alterar `evidence/manifest.json` está **revisado e cancelado**.
> O manifesto versionado **permanece `PARTIAL`**. Nenhum arquivo técnico foi alterado. `manifest.patch`
> **não foi aplicado** ao golden versionado. **Nenhum `workflow_dispatch`/rerun foi executado.**
> Esta tarefa produz **apenas** este relatório.

> **Achado que motivou a decisão:** adotar o manifesto COMPLETO em `evidence/manifest.json` quebraria a
> suíte do harness de forma incondicional (os testes fixam o golden em `partial`). Ver **§6**. O
> manifesto COMPLETO produzido pelo run H4 permanece como **evidência imutável**, fora da árvore
> versionada de golden.

---

## 1. Sumário

O Gate H4 (run `29849033752`, em `main@76b000c`) elevou, **dentro do contêiner conectado apenas à rede
`--internal` do worker real**, o manifesto do dry-run fiscal ao estado `proofState:"complete"` sob
`xmllint` real (libxml2 `2.15.3`), com a matriz **1 positivo + 8 negativos** verde, **zero egress**,
**zero escrita em banco** e **zero chamada SEFAZ**. O artifact do run foi **baixado diretamente do
run** e **integralmente verificado** (ver §3–§5).

A adoção **não** promove esse manifesto COMPLETO ao golden versionado. O golden (`evidence/manifest.json`)
representa o **modo padrão `composition-gate`** — o modo em que os testes locais e o CI rodam **sem worker
real** — e por isso é mantido `PARTIAL`. O manifesto COMPLETO fica registrado aqui como prova auditável
e permanece disponível como artifact do run.

## 2. Referências

| Item | Valor |
|---|---|
| `origin/main` (base) | `76b000c4d62ec2fb3ac21025c418a074ff5048df` |
| Branch de trabalho | `work/fiscal-dry-run-005b-h4-manifest-adoption` |
| Worktree | `../wt-fiscal-dry-run-005b-h4-manifest-adoption` |
| Run H4 | `29849033752` |
| Commit executado no run | `76b000c4d62ec2fb3ac21025c418a074ff5048df` |
| Artifact | `fiscal-dry-run-005b-h4-complete-manifest-29849033752` |
| Lock (schema/imagem/rede) | `5402dca9cf37cb1c0892cb4458be78fa9f360f69e9ad2440770d55ed340266e8` |

Pré-condições confirmadas antes de qualquer leitura do artifact:

- `76b000c` é ancestral-ou-igual de `origin/main` (é o próprio HEAD, merge do PR #19). ✅
- Manifesto versionado ainda `PARTIAL` (`proofState:"partial"`, `blockingReasons:["XSD_WORKER_REAL_UNAVAILABLE"]`). ✅
- Blob do golden idêntico em `origin/main` e em `76b000c`: `86ee00bc19eebd268a8507ba0be72189069eb79e` (intocado desde o H4). ✅

## 3. Verificação do artifact (integridade do download)

O ZIP foi baixado **diretamente do run** `29849033752` (sem cópia manual, sem token de credencial Git,
sem fonte externa), extraído em diretório temporário **fora da árvore versionada**.

| Verificação | Esperado | Obtido | OK |
|---|---|---|---|
| SHA-256 do ZIP | `707dff8f…6b420` (reportado) | `707dff8f684765234462f2895b01c8d897202eb8c4f59e1a0e732f074806b420` | ✅ |
| Tamanho do ZIP | ~4,92 KB | 5 039 bytes | ✅ |
| `h4/manifest.sha256` → `manifest.json` | `0306d34a…5bc39c` | `0306d34a68a3ff8ee00c2433a7e2bad93d4b909236169f14cdf8751e3d5bc39c` | ✅ |

**Conteúdo do ZIP (6 arquivos):** os **quatro** arquivos de payload exigidos estão sob `h4/` —
`manifest.json`, `manifest.sha256`, `manifest.patch`, `h4-evidence.json` — acompanhados de dois logs de
evidência na raiz (`h4-elevation.log`, `h4-verify.log`). Como o SHA-256 do ZIP **coincide byte-a-byte
com o valor oficialmente reportado**, o conjunto inteiro é autêntico e não sofreu adulteração.

Identidades de blob (Git):

- `git hash-object h4/manifest.json` = `915bf33e7fca91ba14102af3103f483d5f59245c` = lado **b** de `manifest.patch`. ✅
- Golden versionado (parcial) = `86ee00bc19eebd268a8507ba0be72189069eb79e` = lado **a** de `manifest.patch`. ✅

## 4. Evidência H4 (`h4/h4-evidence.json`)

| Campo | Valor | OK |
|---|---|---|
| `runId` | `29849033752` | ✅ |
| `commitSha` | `76b000c4d62ec2fb3ac21025c418a074ff5048df` | ✅ |
| `ref` | `refs/heads/main` | ✅ |
| `workerReal` | `true` | ✅ |
| `engine.name` / `version` / `libxml2Version` | `xmllint` / `2.15.3` / `2.15.3` | ✅ |
| `engine.binaryHash` | `b58a991a1da85c4a49b449d0f107ea265e0545f8e7c3cd4fadf5eb2f504bb900` | ✅ |
| `positive` | `xsd:true`, `status:"xsd_ok"` | ✅ |
| `negatives` | `count:8`, `expected:8` (matriz **1+8**) | ✅ |
| `zeroEgress` | `matrixEgressExternal:0`, `manifestExternalEgress:0` | ✅ |
| `databaseWrites` | `0` | ✅ |
| `sefazCalls` | `0` | ✅ |
| `lockSha256` | `5402dca9cf37cb1c0892cb4458be78fa9f360f69e9ad2440770d55ed340266e8` | ✅ |
| `dockerArchiveSha256` | `827e4b522b86ceeb242124e8477a4e12c23eeb4501988e0220abb88edd33af9c` | ✅ |
| `imageId` | `sha256:cc27c5d6a27c7f15d83fe2220075825b12711d77b6fcfde9744c42383cb485a6` | ✅ |
| `schemaManifestHash` | `fc42d03e1c4a676d5ea5fe813cd2941672caa18540856cac5208ccdff049cae1` | ✅ (coerente com o manifesto) |
| `java.runtime` / `externalJava17` | `openjdk 17.0.19` / `true` | ✅ |

**Matriz negativa 8/8** (todas classificadas, nenhuma passou):
`campo_obrigatorio_ausente`, `elemento_inesperado`, `ordem_invalida`, `tipo_invalido`,
`namespace_incorreto` → `XML_INVALIDO`; `xml_malformado` → `XML_MALFORMADO`;
`payload_acima_do_limite` → `FALHA_PERMANENTE`/`FALHA_TRANSPORTE`; `timeout` → `TIMEOUT`.

**Logs corroborantes:**
- `h4-elevation.log`: `run.ts --update-manifest` sob o worker real → `"manifest atualizado"`, `ok:true`,
  `exitCode:0`, `proofState:"complete"`, `egress.external:0`.
- `h4-verify.log`: reexecução **sem** `--update-manifest` → `"manifest":"byte-igual ao golden"`,
  `ok:true`, `exitCode:0` — prova que o manifesto elevado é **auto-consistente sob o worker real**.

## 5. Manifesto COMPLETO (`h4/manifest.json`) — estado registrado

```
proofState               = "complete"
blockingReasons          = []
verification.internal    = true
verification.externalJava17 = true
verification.xsd         = true
verification.xsdContract = true
verification.xsdStatus   = "approved-real"
verification.xsdEngineName    = "xmllint"
verification.xsdEngineVersion = "2.15.3"
verification.xsdWorkerReal    = true
verification.structural  = true
safety.databaseWrites    = 0
safety.sefazCalls        = 0
safety.externalEgress    = 0
```

### 5.1 Invariantes preservados (PARCIAL ≡ COMPLETO)

Os hashes determinísticos e a assinatura são **idênticos** entre o golden PARCIAL e o manifesto COMPLETO
— a elevação toca **apenas o eixo XSD**, nunca os hashes:

| Invariante | Valor (idêntico nos dois) |
|---|---|
| `hashes.snapshotSha256` | `efd6f54c362bddb781395514112ff3540418b868c854b1444b1122e8159bae2e` |
| `hashes.unsignedXmlSha256` | `ca8adf9772fde2723d7e173511ae48b43a60103ef1b80412ba2e40418e91533f` |
| `hashes.referencedNodeC14nSha256` | `5b2914270bb0363ad2ba61b3ac59af8f300bdac27d6faef2d40e0aa71b6cbe34` |
| `hashes.signedInfoSha256` | `aa1d73a8c58f9bb1b6da172984579652120230cbe0ebcf2e1548a12603ce97b4` |
| `hashes.signedXmlSha256` | `da650b7053e1c7462780c43d248890b6da6c45c4f077408975e9f91acf43ccb9` |
| `signature.digestValue` | `5U16o3plF2m+5in/+7nm4Zq9ZmM=` |
| `schemaManifestHash` | `fc42d03e1c4a676d5ea5fe813cd2941672caa18540856cac5208ccdff049cae1` |

### 5.2 Únicos 7 leaves que divergem (auditados em `manifest.patch`)

`manifest.patch` altera **somente** `tools/fiscal-dry-run-integrity-proof/evidence/manifest.json`
(sem XML, sem segredo, sem token, sem dado fiscal real), representando **exclusivamente a elevação do
eixo XSD**:

| Campo | PARCIAL (golden) | COMPLETO (evidência) |
|---|---|---|
| `proofState` | `"partial"` | `"complete"` |
| `blockingReasons` | `["XSD_WORKER_REAL_UNAVAILABLE"]` | `[]` |
| `verification.xsd` | `false` | `true` |
| `verification.xsdStatus` | `"composition-gate"` | `"approved-real"` |
| `verification.xsdEngineName` | `"composition-gate"` | `"xmllint"` |
| `verification.xsdEngineVersion` | `null` | `"2.15.3"` |
| `verification.xsdWorkerReal` | `false` | `true` |

## 6. Por que `evidence/manifest.json` permanece `PARTIAL`

O golden versionado é **contratualmente fixado em `partial`** pela suíte do harness
(`tools/fiscal-dry-run-integrity-proof/proof.test.ts`). `goldenManifest()` lê o arquivo versionado do
disco, e os testes abaixo **afirmam o estado parcial de forma incondicional** (não são gated por
`FISCAL_XSD_WORKER_URL`):

- **XSD-H05** — `goldenManifest().verification.xsd === false`
- **XSD-H07** — golden `xsdEngineName`/`xsdStatus` = `"composition-gate"`, `xsdEngineVersion === null`, `xsdWorkerReal === false`
- **XSD-H08** — `goldenManifest().proofState === "partial"`
- **XSD-H09** — `goldenManifest().blockingReasons` = `["XSD_WORKER_REAL_UNAVAILABLE"]`
- **P-10** — regenera o manifesto no modo `composition-gate` (padrão local/CI, **sem** worker real) → produz um manifesto **parcial** → compara byte-a-byte com o golden

Promover o golden a `complete` reprovaria os cinco testes acima em **qualquer ambiente** (eles leem o
arquivo e exigem `partial`) e só poderia ser "consertado" editando `proof.test.ts` — **fora dos arquivos
autorizados** e parte do **core fiscal** (proibido sem autorização explícita). Além disso, o próprio
`run.ts` documenta o guard: *"sem `--update-manifest`, o manifesto completo diverge do golden parcial
ainda vigente → exit ≠ 0"*. A linha `proof.test.ts` (~L821) reforça o desenho: o manifesto `complete` é
derivado **em memória** a partir de evidência de worker sintética e seus `hashes` **devem igualar** os do
golden `partial` — o **arquivo** golden é, por contrato, parcial.

Conclusão: o modo padrão do harness é `composition-gate` (fail-closed honesto, sem forjar validação
real). O manifesto COMPLETO só é auto-consistente **sob o worker `xmllint` real** (`FISCAL_XSD_WORKER_URL`
na allowlist interna), ambiente que **não** é o padrão local/CI. Logo o golden permanece `PARTIAL` e o
COMPLETO fica como **evidência imutável do Gate H4**.

## 7. Confirmação — nenhum arquivo técnico alterado

- `manifest.patch` **NÃO** foi aplicado ao golden versionado.
- `tools/fiscal-dry-run-integrity-proof/evidence/manifest.json` **inalterado** — blob permanece
  `86ee00bc19eebd268a8507ba0be72189069eb79e` (`PARTIAL`).
- `proof.test.ts`, workflow (`.github/workflows/*`) e qualquer arquivo do harness **inalterados**.
- Único arquivo criado por esta tarefa: **este relatório** (`docs/fiscal/…_H4_MANIFEST_ADOPTION.md`).
- `git diff origin/main` (excluindo `docs/`) = **vazio**.

## 8. Validações executadas

### 8.1 Resultados

Executadas na worktree `work/fiscal-dry-run-005b-h4-manifest-adoption` (deps via `npm ci`, modo padrão
`composition-gate`, **sem** worker real):

| Validação | Comando | Resultado |
|---|---|---|
| Testes focados do harness | `vitest run tools/fiscal-dry-run-integrity-proof/{proof,matrix}.test.ts` | **88 passed · 12 skipped** ✅ |
| Testes Fiscal XSD (unit) | `npm run test:fiscal-xsd:unit` | **41 passed · 1 skipped** ✅ |
| TypeScript | `npx tsc --noEmit` | **0 erros** ✅ |
| ESLint (arquivos fiscais aplicáveis) | `npx eslint tools/fiscal-dry-run-integrity-proof lib/fiscal` | **limpo (exit 0)** ✅ |
| `git diff --check` | `git diff --check` | **limpo** ✅ |
| Diferença técnica vs `origin/main` | `git diff --stat origin/main -- . ':(exclude)docs/**'` | **vazio** ✅ |

Os **12 testes pulados** do harness são a suíte opcional `realXsdSuite`, gated por
`FISCAL_XSD_WORKER_URL` (worker `xmllint` real) — pulados por padrão, como esperado no modo
`composition-gate`. Os testes que fixam o golden em `partial` (**XSD-H05/H07/H08/H09** e **P-10**)
passaram — confirmando que manter `evidence/manifest.json` em `PARTIAL` mantém a suíte verde.

### 8.2 `build`

`npm run build` **não** foi executado: a única mudança é um documento Markdown (`docs/`), que não afeta
config, rotas, layouts, Server Actions nem Prisma — logo, fora do gatilho de build do
`DELIVERY_CHECKLIST`. O `git diff origin/main` restrito a arquivos técnicos é **vazio**; o resultado do
build é, por construção, idêntico ao de `origin/main` (estado mergeado/verde do PR #19). Rodá-lo apenas
adicionaria o risco conhecido de OOM da máquina sem qualquer sinal novo.

## 9. Zero banco · Zero SEFAZ · Zero egress

Confirmado na evidência do run (§4) e nos invariantes de segurança do manifesto (`safety.*` = `0` em
ambos os estados): `databaseWrites = 0`, `sefazCalls = 0`, `externalEgress = 0`, `realCredentials = 0`,
`realData = 0`, `productiveCallers = 0`. Esta tarefa de adoção **não** tocou banco, **não** chamou SEFAZ
e **não** executou nenhum workflow.

## 10. Limitações e próximo gate

- **Limitação de escopo:** esta tarefa é **documental**. O estado real do dry-run em `main` continua
  `PARTIAL` (modo `composition-gate`). A prova COMPLETA existe apenas como **evidência do run H4**, não
  como golden versionado.
- **Pré-condição para eventual promoção do golden a `complete`:** exigiria (a) elevar a suíte do harness
  (`proof.test.ts`: XSD-H05/H07/H08/H09 e tornar P-10 sensível ao worker) e (b) o CI executar o worker
  `xmllint` real por padrão. Ambos estão **fora** do escopo autorizado aqui e demandariam autorização
  explícita para tocar o core fiscal.
- **Próximo gate:** decisão humana sobre manter o modelo atual (golden `PARTIAL` + evidência H4
  imutável) ou abrir um GOAL dedicado à elevação conjunta harness+CI. Até lá, o estado publicável e
  verde é o atual.

## 11. Anexos — comandos de verificação

```
# hash do ZIP (baixado direto do run 29849033752)
sha256sum fiscal-dry-run-005b-h4-complete-manifest-29849033752.zip
#  707dff8f684765234462f2895b01c8d897202eb8c4f59e1a0e732f074806b420

# manifest.json vs manifest.sha256
sha256sum h4/manifest.json
#  0306d34a68a3ff8ee00c2433a7e2bad93d4b909236169f14cdf8751e3d5bc39c

# identidades de blob (patch a/b)
git hash-object h4/manifest.json                                  # 915bf33 (lado b)
git hash-object tools/fiscal-dry-run-integrity-proof/evidence/manifest.json  # 86ee00b (lado a, golden PARCIAL — inalterado)
```
