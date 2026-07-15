# FISCAL — Fechamento GOAL-002 · XSD oficial B2

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-XSD-OFFICIAL-VALIDATION-002` |
| Data de fechamento documental | 2026-07-15 |
| Branch documental | `fiscal/goal-002-xsd-close` |
| Base | `origin/main` @ `82c219c4e241b145109a697aa3eb0e5d26a24d93` |
| PR de implementação | [#4](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/4) |
| Merge commit | `82c219c4e241b145109a697aa3eb0e5d26a24d93` |
| Parent main | `50c1db823215a36622b05fad759ea80357130f24` |
| Parent fiscal / HEAD integrado | `d497775e9dd1021d9a54ba6cf8f7b8c0b739f436` |
| Gate | **G-C2 = FECHADO** |
| Nível N | **N4 no eixo de validação XSD** (não N6, não N7) |
| Homologação SEFAZ | **não** |
| Produção | **não** |
| Emissão ativada | **não** |

---

## 1. Objetivo

Fechar documentalmente o GOAL nomeado `FISCAL-XSD-OFFICIAL-VALIDATION-002` após a integração do
worker XSD B2 na `main`, e confirmar formalmente o gate **G-C2**.

Esta entrega é **somente documentação**. Não implementa código, não inicia o GOAL-003, não altera
política Trivy, não toca Contador HUB e não presume homologação ou produção.

Escopo histórico correspondente: GOALs de sequência **005** (pacote/proveniência XSD) e **006**
(validador real/fail-closed) de
[`FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md`](./FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md).

---

## 2. Merge commit verificado

```text
82c219c Merge pull request #4 from rafaelfaria49-png/fiscal/goal-002-xsd-worker-implementation
├─ parent¹ 50c1db8  (main imediatamente anterior)
└─ parent² d497775  (HEAD fiscal integrado)
```

Método: **merge commit** (não squash, não rebase). Branch de implementação preservada. Contador
HUB e audit branch não foram integrados separadamente.

---

## 3. Componentes e arquivos entregues (já na main)

| Área | Caminhos principais |
|---|---|
| Worker | `workers/fiscal-xsd/**` (Dockerfile, server, validator, healthcheck, testes) |
| Adapter | `lib/fiscal/xsd-worker/**` |
| Pacote XSD | `lib/fiscal/xsd/**` (`PL_010e_v1.02`, manifesto, hashes, fixtures) |
| `validarXsd` | `lib/fiscal/dry-run/dry-run-validation.ts` (real, fail-closed) |
| Pipeline | `lib/fiscal/dry-run/*`, `lib/fiscal/pipeline/*` (exige `xsd_ok`) |
| Assinatura | `lib/fiscal/signing/*` (RSA-SHA1/SHA-1 conforme schema) |
| CI | `.github/workflows/fiscal-xsd-worker.yml` |
| Compose | `docker-compose.fiscal-xsd.yml` |
| Scripts | `scripts/fiscal/verify-xsd-artifacts.mjs` |
| ADRs | ADR-0010, ADR-0011 |
| Docs de implementação | `FISCAL_XSD_*` (manifesto, processo regulatório, readiness, report) |

**53 arquivos** no PR #4 · **+12.907 / −362** · **11 commits** fiscais preservados.

---

## 4. ADR-0010 · worker containerizado B2

**Status:** aceita e **implementada**.

- Opção A `xmllint-wasm`: rejeitada na versão avaliada.
- B1 host/PATH: rejeitada.
- **B2** `xmllint` provisionado em worker fiscal containerizado: **aprovada e integrada**.
- Java/Xerces: contingência arquitetural, não selecionada.

---

## 5. ADR-0011 · assinatura RSA-SHA1 / SHA-1

**Status:** aceita e **implementada**.

O schema oficial fixa:

- `SignatureMethod` = `http://www.w3.org/2000/09/xmldsig#rsa-sha1`
- `DigestMethod` = `http://www.w3.org/2000/09/xmldsig#sha1`

O signer em `lib/fiscal/signing` emite esses algoritmos. Uso de SHA-1 **fora** da assinatura XML
fiscal permanece proibido (escopo da ADR).

---

## 6. XSD oficial e manifesto

| Item | Valor |
|---|---|
| Pacote | `PL_010e_v1.02` |
| Leiaute / modelo | 4.00 / NFC-e 65 |
| Entrypoint | `nfe_v4.00.xsd` + grafo fechado de 5 XSDs |
| Manifesto | `lib/fiscal/xsd/manifest.json` |
| SHA-256 do manifesto | `fc42d03e1c4a676d5ea5fe813cd2941672caa18540856cac5208ccdff049cae1` |
| Motor | libxml2 / xmllint **2.15.3** |
| Atualização regulatória | processo controlado em `FISCAL_XSD_REGULATORY_UPDATE_PROCESS_001.md` |

Proveniência: Portal Nacional da NF-e (captura e hashes documentados no manifesto).

---

## 7. `validarXsd` · worker · fail-closed

- **No-op removido.** `validarXsd` invoca o adapter/worker real
  (`createConfiguredXsdWorkerClient` / adapter injetável).
- Sucesso exige `outcome === "VALIDACAO_APROVADA"`, zero issues e engine com
  `binaryHash` / `schemaManifestHash` em `^[a-f0-9]{64}$`.
- Qualquer falha de infraestrutura (`infrastructureFailure`) retorna **`valid: false`**
  (fail-closed). Timeout, worker ausente, resposta inválida, política rejeitada e hash divergente
  **não** aprovam.
- Dry-run e pipeline só avançam com status mapeado de aprovação XSD (`xsd_ok`).

---

## 8. Segurança do container e supply chain

| Controle | Estado |
|---|---|
| non-root | `10001:10001` |
| filesystem | read-only |
| tmpfs | `/tmp` com limites |
| zero-egress | rede Docker internal + prova negativa de rede |
| spawn | sem shell; args fixos; `--noout --nonet --nocatalogs --schema`; XML só em stdin |
| payload / timeout | 2 MiB / 3 s; backpressure local |
| SBOM | SPDX (`syft` → `fiscal-xsd-worker.spdx.json`) |
| Trivy | bloqueia **CRITICAL** · **0 CRITICAL** na CI do PR #4 |
| Trivy HIGH | **não é gate** nesta política · follow-up separado (sem VEX, sem mudança nesta tarefa) |

---

## 9. CI e testes (evidências do PR #4 — não reexecutados aqui)

HEAD fiscal: `d497775e…` · checks:

| Check | Conclusion |
|---|---|
| Unit and contract (ubuntu-24.04) | success |
| Unit and contract (windows-2022) | success |
| Container, offline integration and supply chain | success |
| Vercel Preview Comments | success |

Provas do job Container (run Actions do PR #4):

- 11 testes de integração (container real);
- 6 testes de segurança;
- suíte completa verde no container;
- TypeScript e ESLint fiscal verdes nos jobs unit;
- build Next verde no job container;
- hash do binário `xmllint` reportável;
- Trivy CRITICAL = 0;
- SBOM SPDX arquivado.

Corpus sintético cobre, entre outros: XML válido; campo obrigatório ausente; fora de ordem; tipo
inválido; namespace inválido; malformado; `verProc` 20/21; imports offline; XML assinado pelo builder
real; worker indisponível (fail-closed).

---

## 10. Checklist G-C2 (20/20)

| # | Critério | Evidência | OK |
|---|---|---|---|
| 1 | `validarXsd` deixou de ser no-op | `dry-run-validation.ts` + adapter worker | ✅ |
| 2 | XML válido passa | fixture `VALID_NFCE_XML` + integração | ✅ |
| 3 | XML inválido falha | corpus negativo + `it.each` integração | ✅ |
| 4 | Campo obrigatório ausente falha | `NFCE_XML_MISSING_REQUIRED` | ✅ |
| 5 | Campo fora de ordem falha | `NFCE_XML_OUT_OF_ORDER` | ✅ |
| 6 | Tipo inválido falha | `NFCE_XML_INVALID_TYPE` | ✅ |
| 7 | Namespace inválido falha | `NFCE_XML_WRONG_NAMESPACE` | ✅ |
| 8 | XML malformado falha | `NFCE_XML_MALFORMED` | ✅ |
| 9 | Imports/includes offline | `--nonet` + grafo local de 5 XSDs | ✅ |
| 10 | `verProc` 20 passa | `VERPROC_20` em fixture válida | ✅ |
| 11 | `verProc` 21 falha | `NFCE_XML_VERPROC_21` | ✅ |
| 12 | XML assinado passa | integração: builder + signer → `valid:true` | ✅ |
| 13 | Algoritmo coerente com schema | ADR-0011 + RSA-SHA1/SHA-1 no signer | ✅ |
| 14 | Nenhuma rede necessária | `--nonet`, zero-egress, schemas locais | ✅ |
| 15 | Falha de worker é fail-closed | `infrastructureFailure` / adapter | ✅ |
| 16 | Versão e hash do motor reportáveis | `libxml2Version`, `binaryHash`, `schemaManifestHash` | ✅ |
| 17 | XSD e manifesto versionados | `PL_010e_v1.02` + `manifest.json`/`.sha256` | ✅ |
| 18 | Atualização regulatória controlada | `FISCAL_XSD_REGULATORY_UPDATE_PROCESS_001.md` | ✅ |
| 19 | CI do mesmo HEAD verde | 4/4 checks no `d497775e…` | ✅ |
| 20 | Sem homologação/produção presumidas | N6=0 · N7=0 · emissão dormente | ✅ |

**G-C2: FECHADO.**

---

## 11. Nível N — classificação honesta

Vocabulário vigente (`FISCAL_RECONCILE_REPORT_001`): N0…N7.

| Classe de evidência | Presente? |
|---|---|
| Código integrado | sim |
| Runtime técnico interno (worker) | sim, sob demanda / dry-run |
| Teste interno | sim |
| CI | sim |
| Prova de container | sim |
| Schema oficial (pacote SEFAZ versionado) | sim |
| Homologação SEFAZ (transmissão) | **não** |
| Produção | **não** |

**Nível atribuído ao GOAL-002 (eixo XSD): N4** — validação XSD real e auferível (pacote oficial +
worker + CI + container), **sem** elevar para N5 de emissão, **sem** N6 (homologação SEFAZ) e
**sem** N7 (produção).

O dry-run **completo** (F4→F5) **ainda não** é N4 pleno: C14N interoperável permanece aberto
(GOAL-003 / trilha C14N). F2–F4 no motor de emissão continuam **sem caller de venda**.

---

## 12. Itens deliberadamente não realizados

- Homologação SEFAZ / transmissão / cStat.
- Ativação de emissão ou `fiscalEnabled`.
- GOAL-003 (prova C14N externa).
- Paridade `upsertProduto`, ST/CSOSN 500, provider real, fila, DANFCE, QR-Code.
- Contador HUB.
- Mudança de política Trivy para HIGH.
- VEX / `.trivyignore` / rebaixar severidade.
- Qualquer alteração de código nesta tarefa documental.

---

## 13. Homologação e produção

| Item | Estado |
|---|---|
| Homologação SEFAZ | **não** · N6 = 0 |
| Produção | **não** · N7 = 0 |
| Emissão | **dormente** · provider `STUB_HOMOLOGACAO` |
| SEFAZ chamada | **não** |

---

## 14. Riscos remanescentes

1. **C14N irregular** — próximo bloqueio técnico (GOAL-003).
2. **Dry-run ainda não é gate F4→F5 completo** até C14N e endurecimento de assinatura.
3. **Trivy HIGH** fora do gate atual — follow-up de política separado.
4. Transporte interno do worker: autenticação/autorização e fila persistente ainda são riscos de
   hospedagem futura (não de validade do schema).
5. SHA-1 na assinatura fiscal é imposição do schema (ADR-0011); contaminação para outros domínios
   permanece risco de disciplina de código.

---

## 15. Follow-up: política Trivy HIGH

| Item | Registro |
|---|---|
| Política atual | bloqueia **CRITICAL** |
| HIGH | **não é gate** |
| Nesta tarefa | **não** alterar workflow, **não** criar VEX, **não** silenciar CVE |
| Decisão futura | avaliar impacto, baseline, exceções e estratégia em GOAL/ADR próprios |
| Relação com GOAL-002 | **não misturar** com este fechamento |

---

## 16. Próximo GOAL

`FISCAL-XML-C14N-EXTERNAL-PROOF-003`

Não iniciado nesta tarefa. Checkpoint: aguardar merge readiness documental desta branch de
fechamento antes de qualquer trabalho de implementação do GOAL-003.

---

## 17. Conclusão

O worker XSD B2 está **integrado na `main`**, `validarXsd` é **real e fail-closed**, o pacote
**PL_010e_v1.02** está versionado com manifesto e hashes, a CI do HEAD fiscal está verde e o
gate **G-C2 está FECHADO** com evidência N4 no eixo XSD.

**GOAL-002 (`FISCAL-XSD-OFFICIAL-VALIDATION-002`): FECHADO documentalmente.**

Nenhuma homologação, produção, emissão ou chamada SEFAZ foi realizada ou declarada.
