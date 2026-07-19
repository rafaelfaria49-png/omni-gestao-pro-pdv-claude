# FISCAL — Registro do Bundle Offline Aprovado do Worker XSD (GOAL-005A)

| Campo | Valor |
|---|---|
| GOAL de registro | `FISCAL-XSD-WORKER-GHA-SUPPLY-CHAIN-005A-REGISTER-APPROVED-BUNDLE` |
| GOAL técnico de supply chain | `FISCAL-XSD-WORKER-GITHUB-ACTIONS-SUPPLY-CHAIN-005A` |
| Nome humano | Registro do Bundle Offline Aprovado do Worker XSD |
| Data de registro documental | 2026-07-19 |
| Branch | `work/fiscal-xsd-worker-gha-supply-chain-005a` |
| Commit do run (imagem/bundle) | `c0d4b00e2f3aa93c7715d430a0f1c4d141abdb91` |
| Workflow | Fiscal XSD Worker Supply Chain |
| Run ID | `29669361609` (run #5) |
| Conclusão do run | `success` |
| Estado deste fechamento | **SUPPLY CHAIN GITHUB ACTIONS ENTREGUE NA BRANCH** |
| GOAL-005 técnico (`FISCAL-DRY-RUN-INTEGRITY-PROOF-005`) | **continua PARCIAL / não entregue por este GOAL** |
| Gate Fiscal global | **aberto** (inalterado) |
| N6 / N7 | **0 / 0** |
| Contador HUB | **não alterado** |

---

## 1. Objetivo

Validar o artifact final **aprovado** da supply chain GitHub Actions do worker XSD Fiscal,
materializar no repositório **somente** o lock textual byte-idêntico e fechar documentalmente o
GOAL-005A na branch.

Esta tarefa **não**:

- reconstrói a imagem;
- reexecuta o workflow;
- altera Dockerfile, schemas, scripts ou Actions;
- publica em registry;
- emite documento fiscal;
- chama SEFAZ;
- eleva nível de maturidade global;
- declara o GOAL-005 técnico (`FISCAL-DRY-RUN-INTEGRITY-PROOF-005`) como entregue.

---

## 2. GOAL

| Identificador | Papel |
|---|---|
| `FISCAL-XSD-WORKER-GITHUB-ACTIONS-SUPPLY-CHAIN-005A` | GOAL técnico de supply chain (build offline, SBOM, Trivy, runtime, testes XSD) |
| `FISCAL-XSD-WORKER-GHA-SUPPLY-CHAIN-005A-REGISTER-APPROVED-BUNDLE` | GOAL de **registro** do bundle já aprovado (este documento) |
| `FISCAL-DRY-RUN-INTEGRITY-PROOF-005` | GOAL-005 técnico de prova de dry-run — **fora do escopo** deste fechamento |

---

## 3. Estado

**SUPPLY CHAIN GITHUB ACTIONS ENTREGUE NA BRANCH.**

- Run `29669361609` concluiu `success` (2/2 jobs).
- Artifact final aprovado baixado, inventariado e validado (checksums, lock, SBOM, Trivy, OCI,
  runtime, testes XSD).
- Lock materializado em `workers/fiscal-xsd/supply-chain.lock.json` (byte-idêntico ao gerado).
- Nenhum binário, archive, SBOM bruto ou Trivy bruto versionado no Git.
- Nenhum gate Fiscal global fechado.
- GOAL-005 técnico permanece **PARCIAL** (não iniciado como prova de dry-run end-to-end).

---

## 4. Branch

`work/fiscal-xsd-worker-gha-supply-chain-005a`

HEAD de referência do run e do pré-flight de registro:

`c0d4b00e2f3aa93c7715d430a0f1c4d141abdb91`

---

## 5. Commit do run

```text
c0d4b00e2f3aa93c7715d430a0f1c4d141abdb91
fix(fiscal): usar builder container na exportação OCI
```

O artifact final e o lock referenciam **exclusivamente** este commit (`repositoryCommit` no lock).

---

## 6. Workflow

| Campo | Valor |
|---|---|
| Nome | Fiscal XSD Worker Supply Chain |
| Ref | `refs/heads/work/fiscal-xsd-worker-gha-supply-chain-005a` |
| Runner declarado no lock | `ubuntu-24.04` |
| Actions pinadas | `actions/checkout@9c091bb…` (v7.0.0), `actions/setup-node@8207627…` (v7.0.0), `actions/download-artifact@37930b1…` (v7.0.0), `actions/upload-artifact@043fb46…` (v7.0.1), `anchore/sbom-action@e22c389…` (v0.24.0), `aquasecurity/trivy-action@ed142fd…` (v0.36.0) |

---

## 7. Run

| Campo | Valor |
|---|---|
| Run ID | `29669361609` |
| Run # | 5 |
| Status | `completed` |
| Conclusion | `success` |
| Head branch | `work/fiscal-xsd-worker-gha-supply-chain-005a` |
| Head SHA | `c0d4b00e2f3aa93c7715d430a0f1c4d141abdb91` |
| Criado | `2026-07-19T01:55:46Z` |
| Atualizado | `2026-07-19T01:59:18Z` |
| URL | https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/29669361609 |

---

## 8. Jobs

| # | Job | Conclusion |
|---|---|---|
| 1 | Build conectado, SBOM, scan e bundles | `success` |
| 2 | Verificação offline em runner novo | `success` |

**2/2 success.**

---

## 9. Runner

`ubuntu-24.04` (serializado no lock gerado).

Job 2 (verificação offline) executou em runner novo, sem rede externa para o container
(`externalEgress: blocked-enforced`).

---

## 10. Artifact intermediário

| Campo | Valor |
|---|---|
| Nome | `fiscal-xsd-worker-supply-chain-intermediate-c0d4b00e2f3aa93c7715d430a0f1c4d141abdb91` |
| ID | `8436814143` |
| Digest | `sha256:9e4ec7a9fd4c2cc3c6f3b4f6330e7da56865e225c123fa8f1ce4ee4f27fdea86` |
| Uso neste registro | **NÃO usado** como fonte do lock final |

---

## 11. Artifact final

| Campo | Valor |
|---|---|
| Nome | `fiscal-xsd-worker-offline-approved-c0d4b00e2f3aa93c7715d430a0f1c4d141abdb91` |
| ID | `8436826125` |
| Tamanho (API GitHub) | `150047107` bytes |
| Digest GitHub | `sha256:aa60526d6a57845305600424bc13b992015d510c636a0f7c9b99c70fa3e6291e` |
| Criado | `2026-07-19T01:59:09Z` |
| Expira | `2026-07-26T01:59:00Z` |
| Expirado | `false` |
| Run ID | `29669361609` |
| Head branch | `work/fiscal-xsd-worker-gha-supply-chain-005a` |
| Head SHA | `c0d4b00e2f3aa93c7715d430a0f1c4d141abdb91` |

---

## 12–14. Artifact ID, digest e expiração

- **Artifact ID:** `8436826125`
- **Digest:** `sha256:aa60526d6a57845305600424bc13b992015d510c636a0f7c9b99c70fa3e6291e`
- **Expiração:** `2026-07-26T01:59:00Z` (ainda válido no momento do registro)

---

## 15–16. Arquivos e tamanhos

Inventário do artifact final extraído **fora do repositório** (8 arquivos):

| Arquivo | Tamanho (bytes) |
|---|---:|
| `fiscal-xsd-worker-goal005a.docker.tar` | 212923392 |
| `fiscal-xsd-worker-goal005a.oci.tar` | 74775040 |
| `fiscal-xsd-worker-goal005a.cyclonedx.json` | 1017492 |
| `fiscal-xsd-worker-goal005a.trivy.json` | 374864 |
| `SHA256SUMS` | 624 |
| `supply-chain.lock.generated.json` | 3427 |
| `runtime-report.json` | 495 |
| `xsd-test-results.json` | 455 |

Nenhum destes arquivos entrou no Git, **exceto** a cópia textual do lock (renomeada para
`workers/fiscal-xsd/supply-chain.lock.json`).

---

## 17–18. Docker archive

| Campo | Valor |
|---|---|
| Nome | `fiscal-xsd-worker-goal005a.docker.tar` |
| SHA-256 | `827e4b522b86ceeb242124e8477a4e12c23eeb4501988e0220abb88edd33af9c` |
| Validação | **match** (arquivo extraído × valor esperado × SHA256SUMS × lock) |
| Versionado no Git | **não** |

---

## 19–23. OCI archive, layout, manifest e plataforma

| Campo | Valor |
|---|---|
| Nome | `fiscal-xsd-worker-goal005a.oci.tar` |
| SHA-256 | `fef17c43204267b14c51443494f5daab233802cd2c73c2756b31b1b517be6d91` |
| `oci-layout.imageLayoutVersion` | `1.0.0` |
| `index.json.schemaVersion` | `2` |
| `index.json.mediaType` | `application/vnd.oci.image.index.v1+json` |
| Manifest mediaType | `application/vnd.oci.image.manifest.v1+json` |
| Manifest digest | `sha256:40c28fd14c57a7d1ea35bd3b23683049345873cf0e65dc48143572e30536333c` |
| Plataforma | `linux/amd64` (`os=linux`, `architecture=amd64`) |
| Blobs `sha256` | presentes e referenciados (config + layers) |
| Versionado no Git | **não** |
| Imagem executada neste registro | **não** |

---

## 24–26. Imagem, image ID e base image

| Campo | Valor |
|---|---|
| Image tag | `fiscal-xsd-worker:pl010e-v1.02-libxml2-2.15.3-goal005a` |
| Image ID | `sha256:cc27c5d6a27c7f15d83fe2220075825b12711d77b6fcfde9744c42383cb485a6` |
| Base image | `node:20.20.2-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0` |

---

## 27–28. libxml2 e patch

| Campo | Valor |
|---|---|
| libxml2 | `2.15.3` |
| libxml2 SHA-256 | `78262a6e7ac170d6528ebfe2efccdf220191a5af6a6cd61ea4a9a9a5042c7a07` |
| Patch commit | `d3352554e4c1f052b914cda7b415d06b7eab5dfa` |
| Patch SHA-256 | `ab319bb46b2aeb5f4311a12676b6b3eed1d18fb47721ae6274a849d31b96fb7c` |

---

## 29–30. Schemas e schema manifest

| Campo | Valor |
|---|---|
| Pacote XSD | `PL_010e_v1.02` |
| Layout | `4.00` |
| Modelo | `65` |
| Root schema | `nfe_v4.00.xsd` |
| Schema manifest SHA-256 | `fc42d03e1c4a676d5ea5fe813cd2941672caa18540856cac5208ccdff049cae1` |
| Dockerfile SHA-256 (blob git @ `c0d4b00`) | `c70e6261e834f961fefc1147805da71eab2fdcdd27480cc167e61ac301c007b1` |

---

## 31–32. libgnutls e libcap2

| Pacote | Versão comprovada | Onde |
|---|---|---|
| `libgnutls` / `libgnutls30` | `3.7.9-2+deb12u7` | lock + SBOM CycloneDX |
| `libcap2` | `1:2.66-4+deb12u3+b1` | **SBOM** (e pin no Dockerfile imutável) |

### Observação documental — campo `libcap2` no lock v1.0.0

O formato do lock **v1.0.0 não possui campo próprio** para `libcap2`. Isso **não invalida** o lock:

- `libcap2 1:2.66-4+deb12u3+b1` está comprovado no SBOM CycloneDX;
- o Dockerfile SHA-256 imutável vincula o pin no build;
- o runtime gate validou a versão exata no job offline;
- uma futura versão do formato de lock poderá serializar o pacote nominalmente.

**O lock não foi editado** para acrescentar o campo.

---

## 33. Package managers removidos

Análise dos **componentes efetivos** do SBOM CycloneDX:

- componentes `pkg:npm/*`: **0**
- pacotes nominais `npm`, `yarn`, `pnpm`, `pip`, `python3`: **ausentes** como application/library
- `curl`, `wget`, `git`: **ausentes** como pacotes de ferramenta no inventário efetivo analisado

Não se exige ausência de qualquer string `npm` em metadata histórica do SBOM; a análise foi por
componentes efetivos.

---

## 34. SBOM

| Campo | Valor |
|---|---|
| Arquivo | `fiscal-xsd-worker-goal005a.cyclonedx.json` |
| SHA-256 | `1b64a87b39351bb28e6ef8f1afb4932dd0aafb59002293f4fead40f94962c868` |
| Confirmações | `libcap2 1:2.66-4+deb12u3+b1`, `libgnutls30 3.7.9-2+deb12u7`, `node 20.20.2` |
| Versionado no Git | **não** (bruto fora do repositório) |

---

## 35–37. Trivy (HIGH / CRITICAL)

| Campo | Valor |
|---|---|
| Arquivo | `fiscal-xsd-worker-goal005a.trivy.json` |
| SHA-256 | `ad532841d23e043624ce4ef695418e62781a1dc8168d208dd8eea3d49840fdb5` |
| SchemaVersion | `2` |
| Vulnerabilidades listadas | **0** |
| **CRITICAL** | **0** |
| **HIGH** | **0** |
| Validação | JSON real (não apenas exit code do workflow) |
| Versionado no Git | **não** |

---

## 38–51. Runtime (segurança e limites)

Fonte: `runtime-report.json` (SHA-256
`f950042f6f31f53adfe442149e60b6e081a817b1ee3192dd56ee734be28ae4f3`).

| Controle | Valor |
|---|---|
| user (non-root) | `10001:10001` |
| readOnlyRootfs | `true` |
| tmpfs | `/tmp 32m noexec,nosuid,nodev` |
| memoryBytes | `805306368` (768 MiB) |
| cpus | `1` |
| pidsLimit | `64` |
| capDrop | `ALL` |
| noNewPrivileges | `true` |
| network | `internal` |
| externalEgress | **`blocked-enforced`** (zero egress externo comprovado) |
| healthcheck | `ok` |
| readiness | `ok` |
| timeoutMs | `3000` |
| concurrency | `1` |
| queue | `32` |
| maxPayloadBytes | `2097152` |
| maxOutputBytes | `65536` |

---

## 52–56. Testes XSD

Fonte: `xsd-test-results.json` (SHA-256
`fddc5e074026ac229248cb213d61357b714b0a90d5b79311f94e7b8f968d2d17`).

| Item | Resultado |
|---|---|
| positive | **passed** |
| missing_required | rejected |
| unexpected_element | rejected |
| invalid_order | rejected |
| invalid_type | rejected |
| wrong_namespace | rejected |
| payload_over_limit | rejected |
| timeout_fail_closed | enforced-unit |
| negativesPassed | **7** |
| negativesTotal | **7** |
| integration | **passed** |
| security | **passed** |
| unitTimeout | **enforced** |

---

## 57–58. Lock

| Campo | Valor |
|---|---|
| Gerado no artifact | `supply-chain.lock.generated.json` |
| Materializado no Git | `workers/fiscal-xsd/supply-chain.lock.json` |
| SHA-256 | `5402dca9cf37cb1c0892cb4458be78fa9f360f69e9ad2440770d55ed340266e8` |
| Byte-idêntico ao gerado | **sim** |
| Edição manual | **nenhuma** |
| Reformat JSON / EOL alterado | **não** |

Campos-chave confirmados (amostra):

- `goal` = `FISCAL-XSD-WORKER-GITHUB-ACTIONS-SUPPLY-CHAIN-005A`
- `version` = `1.0.0`
- `repositoryCommit` = `c0d4b00e2f3aa93c7715d430a0f1c4d141abdb91`
- `workflowRef` = `refs/heads/work/fiscal-xsd-worker-gha-supply-chain-005a`
- `runId` = `29669361609`
- `vulnerabilities.critical` = `0` · `vulnerabilities.high` = `0`
- `runtimeExternalEgress` = `blocked-enforced`
- `realSecrets` = `0` · `realData` = `0`
- `positiveResult` = `passed` · `negativesPassed` = `7` · `negativesTotal` = `7`

---

## 59. Actions pinadas

Todas as Actions do lock usam pin por SHA (não floating tags sem digest). Ver §6.

---

## 60–61. Secrets e dados reais

| Campo | Valor |
|---|---|
| realSecrets (lock) | **0** |
| realData (lock) | **0** |
| Busca no material versionado deste registro | sem segredos ou dados reais detectados |

---

## 62. Registry

**Não utilizado.** Nenhuma publicação de imagem em registry. Bundle offline apenas.

---

## 63. Artefatos no Git

| Tipo | No Git? |
|---|---|
| Lock textual | **sim** — `workers/fiscal-xsd/supply-chain.lock.json` |
| Docker archive | **não** |
| OCI archive | **não** |
| SBOM bruto | **não** |
| Trivy JSON bruto | **não** |
| runtime-report bruto | **não** |
| xsd-test-results bruto | **não** |
| Relatório documental | **sim** — este arquivo |
| Continuação / roadmap / status | **sim** — 3 docs de continuidade |

---

## 64. Limitações

1. Bundle e imagem **não** estão na `main` — apenas na branch do GOAL-005A.
2. Artifact GitHub expira em `2026-07-26T01:59:00Z`; o lock versionado é a âncora imutável no repo.
3. Registry não foi usado; consumo futuro exige re-download ou reexportação controlada.
4. GOAL-005 técnico (dry-run integrity proof) **não** foi executado nem fechado.
5. Contador HUB **intocado**.
6. Emissão, homologação e produção Fiscal **não** abertas.
7. Lock v1.0.0 não serializa `libcap2` nominalmente (comprovação via SBOM + Dockerfile + runtime).

---

## 65. Campo libcap2 no formato do lock

Ver §31–32. **Não** se alterou o lock para incluir o campo. Futura versão do formato poderá
serializá-lo.

---

## 66. Gates

| Gate | Estado após este registro |
|---|---|
| G-C1 / G-C2 | inalterados (já fechados historicamente no eixo XSD) |
| Critério C14N/XMLDSig F4→F5 | inalterado (já fechado no GOAL-003) |
| Gate Fiscal **global** F4→F5 | **aberto** |
| G-F5 / G-F7 / G-F12 | **abertos** |
| Gates alterados por 005A | **nenhum** |

---

## 67. Nível

- Nível **não elevado** globalmente por este GOAL.
- N6 = **0** · N7 = **0**.
- Evidência de supply chain offline do worker XSD disponível na branch (suporte a N4 no eixo XSD
  já existente; não reclassifica o stack Fiscal inteiro).

---

## 68. GOAL-005

O GOAL-005 técnico oficial permanece:

**`FISCAL-DRY-RUN-INTEGRITY-PROOF-005`** — Prova de Integridade do Dry-Run Fiscal.

Estado: **continua PARCIAL** (definido; supply chain 005A é pré-requisito/infra de evidência do
worker, **não** a prova de dry-run end-to-end).

Este documento **não** declara GOAL-005 técnico entregue.

---

## 69. Contador HUB

**Não alterado.** Trilho distinto do Fiscal XSD / GOAL-005A.

---

## 70. Próximos passos

1. **Auditoria de merge-readiness** do range completo da branch
   `work/fiscal-xsd-worker-gha-supply-chain-005a` contra a `origin/main` atual.
2. Somente depois: **PR** e integração controlada do 005A (humano).
3. **Não** iniciar emissão, homologação, produção ou Contador HUB a partir deste fechamento.
4. 005B (se definido) **ainda não iniciado**.
5. GOAL-005 técnico (`FISCAL-DRY-RUN-INTEGRITY-PROOF-005`) exige GOAL/PR próprios.

---

## 71. Conclusão

**SUPPLY CHAIN GITHUB ACTIONS ENTREGUE NA BRANCH.**

O run `29669361609` (#5) produziu o artifact offline aprovado
`fiscal-xsd-worker-offline-approved-c0d4b00e2f3aa93c7715d430a0f1c4d141abdb91` (ID `8436826125`,
digest `sha256:aa60526d6a57845305600424bc13b992015d510c636a0f7c9b99c70fa3e6291e`), com:

- Docker + OCI archives íntegros;
- SBOM CycloneDX;
- Trivy **CRITICAL=0 / HIGH=0**;
- runtime offline com **egress blocked-enforced**;
- teste positivo **passed** e **7/7** negativos;
- lock v1.0.0 materializado byte-idêntico em
  `workers/fiscal-xsd/supply-chain.lock.json`.

**GOAL-005 técnico não entregue. Gate Fiscal global aberto. N6=0. N7=0. Contador HUB intocado.
Registry não utilizado. Binários no Git: 0.**

---

## Adendo pós-merge

> **Nota temporal:** o corpo deste relatório permanece como registro **histórico** do
> fechamento na branch (`SUPPLY CHAIN GITHUB ACTIONS ENTREGUE NA BRANCH` na data do
> registro). O estado **corrente** pós-integração é o deste adendo e do relatório
> [`FISCAL_XSD_WORKER_GHA_SUPPLY_CHAIN_005A_POST_MERGE_CLOSURE.md`](./FISCAL_XSD_WORKER_GHA_SUPPLY_CHAIN_005A_POST_MERGE_CLOSURE.md).

| Campo | Valor |
|---|---|
| PR | **#12** |
| Título | `build(fiscal): integrar supply chain offline aprovada do worker XSD` |
| State | `closed` · `merged=true` |
| merged_at | `2026-07-19T15:08:52Z` |
| Base | `main` |
| Head | `work/fiscal-xsd-worker-gha-supply-chain-005a` |
| Head SHA | `d51279461718508d94c534e9afe27232c73f0d6b` |
| Merge commit | `2a7f102ce7bb22b363cd6d24b17920d483182640` |
| Pais | `98e05dfe9aec224e5a7ea31f85bada19bed2913b` + `d51279461718508d94c534e9afe27232c73f0d6b` |
| Método | merge commit (sem squash / sem rebase) |
| Branch de origem | **preservada** (`origin/work/fiscal-xsd-worker-gha-supply-chain-005a` @ `d512794…`) |

**Estado corrente:** **GOAL-005A INTEGRADO E FECHADO NA MAIN.**

- Evidência técnica continua vinculada ao run `29669361609` e ao commit `c0d4b00…`.
- Fechamento documental na branch continua vinculado a `d512794…`.
- Integração na main = merge commit `2a7f102…`.
- **GOAL-005 técnico continua PARCIAL.**
- **005B não iniciado.**
- **Gates Fiscais globais inalterados** (F4→F5 / G-F5 / G-F7 / G-F12 abertos).
- **N6=0 · N7=0 · Contador HUB intocado.**

Relatório pós-merge:
[`FISCAL_XSD_WORKER_GHA_SUPPLY_CHAIN_005A_POST_MERGE_CLOSURE.md`](./FISCAL_XSD_WORKER_GHA_SUPPLY_CHAIN_005A_POST_MERGE_CLOSURE.md).
