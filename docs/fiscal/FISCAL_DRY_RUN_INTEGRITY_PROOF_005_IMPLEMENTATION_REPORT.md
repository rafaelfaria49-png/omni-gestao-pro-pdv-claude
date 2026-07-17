# FISCAL — Prova de Integridade do Dry-Run (GOAL-005)

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-DRY-RUN-INTEGRITY-PROOF-005` |
| Nome humano | Prova de Integridade do Dry-Run Fiscal |
| **Estado** | **PARCIAL** — harness offline na branch; **egress intercept (FASE 7-8) e matriz de exit codes 0-4 (FASE 12) FECHADOS** na continuação de 17/07/2026; **evidência XSD tornada explicitamente parcial** (manifest honesty, 17/07/2026); **bloqueio ambiental PERSISTE no eixo XSD worker real** (Docker ausente neste host — FASE 15) |
| Tipo | Harness técnico **não produtivo** — composição offline de componentes dormentes |
| Data | 2026-07-17 (harness) · 2026-07-17 (continuação: egress + exit codes) · 2026-07-17 (honestidade do manifesto) |
| Branch | `work/fiscal-dry-run-integrity-proof-005` |
| Commit | técnico `d5dc7ad…` + honestidade `4a15310…` + egress/exit codes `f452bc1…` + **commit aditivo desta correção** (`fix(fiscal): tornar evidência XSD explicitamente parcial`) — sem amend/force-push |
| Base documental | PR #10 · merge `ccb8b0f0bb19c4a1e201e78b3c290fa65fabe959` |
| `origin/main` | `ccb8b0f0bb19c4a1e201e78b3c290fa65fabe959` (inalterada; ancestor do PR #10) |
| Documento de escopo | [`FISCAL_GOAL_005_SCOPE_RECONCILIATION.md`](./FISCAL_GOAL_005_SCOPE_RECONCILIATION.md) |
| Nível N | **N3** (oficial); **não** N4; candidato a N4 no eixo dry-run **somente após** XSD real + auditoria + merge |
| N6 / N7 | **0** / **0** |
| Emissão / SEFAZ / homologação / produção | **não** |
| Callers produtivos | **0** |
| Gates alterados | **nenhum** |
| GOAL-005 fechado | **não** |

### Bloqueio ambiental (FASE 15 — XSD oficial)

No host de execução desta branch, **Docker CLI está ausente**. O worker B2 (`workers/fiscal-xsd`)
**não** foi executado. Conforme o prompt oficial do GOAL:

> Se Docker ou o worker não estiver disponível: **parar**; **não marcar XSD como aprovado**;
> registrar bloqueio ambiental.

Portanto:

- **XSD worker real (`xmllint` no container B2):** **NÃO APROVADO** neste ambiente;
- o harness usa **gate de composição de contrato** (pacote `PL_010e_v1.02` +
  `OFFICIAL_XSD_MANIFEST_SHA256` + exigência de `<Signature>`) — **não** substitui o worker;
- a suite opcional `FISCAL_XSD_WORKER_URL` permanece **skipped**;
- o manifesto golden registra `verification.xsd: **false**`, `xsdContract: true`,
  `xsdEngineName: "composition-gate"`, `xsdWorkerReal: false`, `proofState: "partial"` e
  `blockingReasons: ["XSD_WORKER_REAL_UNAVAILABLE"]` — o artefato, lido isolado, **afirma** que
  não houve validação XSD real (ver §2.1).

### 2.1 Correção de honestidade da evidência XSD (17/07/2026)

**Descoberta.** Até `f452bc1`, o manifesto versionado registrava `verification.xsd: true` e o
gate de composição se apresentava com `engine.name: "xmllint"` / versão `"composition-gate"`.
O texto deste relatório ressalvava que aquilo era "apenas gate de contrato", mas **a ressalva
vivia na prosa e a afirmação vivia no artefato**. Lido isolado — em auditoria, PR ou decisão de
integração — o JSON dizia que o XML passou no XSD. Não passou: nenhum `xmllint` jamais processou
o XML nesta branch.

**Causa-raiz (não é descuido de nomenclatura).** O contrato compartilhado
`lib/fiscal/xsd/types.ts` modela **apenas validação XSD real**: em `XsdValidationResult`,
`valid: true` **exige** um `XsdValidationEngine` não nulo, cujo campo `name` é o **tipo literal**
`"xmllint"`. Ou seja: qualquer adapter que quisesse *aprovar* através desse contrato era
**estruturalmente obrigado** a se declarar `xmllint`. O gate de composição aprovava → era forçado
a forjar o motor. O defeito não estava no nome escolhido, e sim em **aprovar através de um
contrato que só sabe representar validação real**.

**Correção aplicada** (sem tocar `lib/fiscal/**`, fora do allowlist deste GOAL):

| Antes | Depois |
|---|---|
| `createCompositionXsdAdapter()` → `VALIDACAO_APROVADA` + `engine.name: "xmllint"` | → **nunca** aprova: contrato conferido → `WORKER_INDISPONIVEL` (fail-closed, `engine: null`); contrato rejeitado → `XML_INVALIDO` |
| `verification.xsd = (status === "xsd_ok")` com adapter mentindo | `verification.xsd = xsdRealValidationPassed(evidence)` — só evidência `kind: "xmllint-worker"` a torna `true` |
| manifesto: só `xsd: true` | manifesto: `xsd` · `xsdContract` · `xsdStatus` · `xsdEngineName` · `xsdEngineVersion` · `xsdWorkerReal` · `proofState` · `blockingReasons` |
| exit 0 possível só com composition-gate | `classifyProofExit` ganha `xsdWorkerReal`; worker real ausente → **exit 2** (dependência obrigatória) |

**Novo contrato de evidência** (`XsdEvidence`, união discriminada em `proof.ts`):

- `kind: "composition-gate"` ⇒ `realValidationPassed: false`, `workerReal: false`,
  `engineName: "composition-gate"`, `engineVersion: null` — **impossível por tipagem** afirmar
  validação real;
- `kind: "xmllint-worker"` ⇒ `workerReal: true`, `engineName: "xmllint"`, versão real do binário;
- `assertXsdEvidence()` barra, em runtime, combinações desonestas antes da serialização;
- worker configurado porém mudo (`engine: null`) **degrada** para gate sem contrato — a prova
  prefere subdeclarar a superdeclarar.

**A prova de composição não foi apagada nem virou mock.** Ela continua rodando e testada
(`xsdContract: true`): o que mudou é a **classificação** — CONTRACT/COMPOSITION GATE, não
REAL XSD VALIDATION.

**Invariantes preservadas:** os 5 hashes criptográficos do XML e o `DigestValue` permanecem
**byte-idênticos** (fixados agora em teste — XSD-H16); nenhum comportamento produtivo criado;
worker real segue bloqueado; supply chain offline segue pendente; **GOAL-005 permanece PARCIAL**;
**sem merge-readiness**.

### Lacunas menores vs prompt integral

| Item | Status |
|---|---|
| Intercept runtime de `fetch`/`http`/`https`/`net`/`tls`/DNS externo (FASE 7-8) | **FECHADO (17/07/2026)** — `net-guard.ts`: monkey-patch de `fetch`/`http(s).request`+`get`/`net.connect`+`createConnection`/`tls.connect`/`dns.lookup`+`resolve`+`resolve4`+`resolve6`+`resolveAny`+`reverse`; allowlist loopback + IPC local + `.internal`; install antes / restore no `finally`; recorder de tentativas. NET-P01/02 + NET-N01..N10 + prova completa sob o guard = **0 egress** |
| Códigos de saída 0–4 completos no CLI (FASE 12) | **FECHADO (17/07/2026)** — `classifyProofExit` puro (0 sucesso · 1 integridade · 2 dependência Java/golden/**worker XSD real** · 3 egress/persistência/SEFAZ · 4 manifesto divergente) + wiring no `run.ts` + testes unitários |
| Ambiguidade da evidência XSD no manifesto | **CORRIGIDO (17/07/2026)** — ver §2.1. `verification.xsd: false` + `xsdContract: true` + `proofState: "partial"` + blocker explícito; 16 testes XSD-H01..H16 |
| Worker XSD B2/`xmllint` real (FASE 4-5) | **PERSISTE BLOQUEADO** — Docker ausente neste host; adicionalmente o `Dockerfile` do worker baixa `libxml2` de URLs externas na build (contradiz a premissa offline). XSD schema real **não** aprovado |
| Mensagem de commit prescrita | commit técnico usou `test(fiscal): prove offline dry-run integrity (GOAL-005)` (≠ `feat(fiscal): provar integridade offline do dry-run`); commit aditivo desta continuação usa `fix(fiscal): fechar egress e exit codes do dry-run` (≠ prescrito `fix(fiscal): fechar prova XSD e egress do dry-run`, pois o XSD real seguiu bloqueado — mensagem ajustada por honestidade). **Sem amend/force-push** (proibidos) |

---

## 1. Objetivo (o que a prova cobre)

Provar, de forma **determinística, reproduzível e exclusivamente offline**, a cadeia:

fixture sintética → snapshot → XML → C14N → DigestValue → SignedInfo → XMLDSig →
verificação interna → verificação Java 17 (JSR 105) → **contrato** XSD oficial →
manifesto de hashes → adulteração → idempotência → isolamento multi-loja →
zero persistência / zero egress / zero SEFAZ.

**Fora do atingido neste host:** validação schema XSD real via worker B2/`xmllint`.

---

## 2. Inventário de componentes reutilizados (sem duplicação)

| Componente | Caminho | Classificação | Uso no GOAL-005 |
|---|---|---|---|
| Snapshot Fiscal | `lib/fiscal/venda-fiscal-snapshot.ts` | real, puro, dormente | entrada canônica |
| Tax engine (congelado no snapshot) | `lib/fiscal/tax-engine/*` | real, puro | via snapshot |
| XML NFC-e 4.00 | `lib/fiscal/xml/nfce-xml-builder.ts` | real, puro, dormente | montagem |
| C14N 1.0 | `lib/fiscal/signing/c14n.ts` | real, puro | canônico |
| Signer XMLDSig RSA-SHA1 | `lib/fiscal/signing/nfce-signer.ts` | real, puro, dormente | assinar/verificar |
| Cert sintético GOAL-003 | `lib/fiscal/signing/__fixtures__/test-cert.ts` | teste sintético | material cripto |
| Dry-run validação | `lib/fiscal/dry-run/dry-run-validation.ts` | real, dormente | estrutura + XSD adapter |
| Pacote XSD oficial | `lib/fiscal/xsd/*` (`PL_010e_v1.02`) | real, versionado | contrato/manifest hash |
| Worker XSD client | `lib/fiscal/xsd-worker/client.ts` | real, adapter | suite opcional com URL |
| Verificador Java | `tools/fiscal-c14n-proof/src/FiscalXmlDsigVerifier.java` | prova GOAL-003 | verificação externa |
| Emission / provider / numbering Prisma | `lib/fiscal/emission/*`, `provider/*`, `numbering/*` | **inadequado** | **não usados** |

**Gate de continuidade:** todos os componentes essenciais existiam e foram **compostos**, não reimplementados.

---

## 3. Arquivos entregues (allowlist)

| Arquivo | Tipo |
|---|---|
| `tools/fiscal-dry-run-integrity-proof/fixtures.ts` | fixture sintética |
| `tools/fiscal-dry-run-integrity-proof/proof.ts` | orquestrador (+ `classifyProofExit` FASE 12) |
| `tools/fiscal-dry-run-integrity-proof/java-external.ts` | wrapper Java 17 |
| `tools/fiscal-dry-run-integrity-proof/net-guard.ts` | **intercept de egress (FASE 7-8) — NOVO na continuação** |
| `tools/fiscal-dry-run-integrity-proof/proof.test.ts` | P-01..P-15 + N-01..N-14 + **NET-P/N + exit codes** |
| `tools/fiscal-dry-run-integrity-proof/run.ts` | CLI verify (+ guard de egress + exit codes 0-4) |
| `tools/fiscal-dry-run-integrity-proof/evidence/manifest.json` | golden determinístico (**inalterado** na continuação) |
| `docs/fiscal/FISCAL_DRY_RUN_INTEGRITY_PROOF_005_IMPLEMENTATION_REPORT.md` | este relatório |
| `docs/ai/CURRENT_STATUS.md` | status |
| `docs/fiscal/FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md` | goals |
| `docs/roadmaps/ROADMAP_FISCAL.md` | roadmap |

**Total do GOAL: 11 arquivos** (10 originais + `net-guard.ts`; ≤ 12). **Zero alteração** em módulos
produtivos de runtime (signer, XML, snapshot, Prisma, PDV, emission) — a continuação toca apenas
o harness `tools/` e a documentação do GOAL.

---

## 4. Fixture sintética

- Stores: `store-fiscal-proof-a` / `store-fiscal-proof-b` (nunca `loja-1`)
- Empresa: `EMPRESA SINTETICA TESTE` · textos `SEM VALOR FISCAL`
- CNPJ estrutural: `00.000.000/0001-91` (DV válido; **não** empresa real)
- Clock: `2026-01-15T12:00:00.000Z`
- Seed: `FISCAL-DRY-RUN-INTEGRITY-PROOF-005/v1`
- Material cripto: **somente** certificado de teste do GOAL-003
- Algoritmos (ADR-0011, inalterados): C14N 1.0 · RSA-SHA1 · SHA-1 digest

---

## 5. Determinismo e normalização

| Campo | Comportamento |
|---|---|
| XML não assinado / assinado | **byte-determinístico** com clock/seed/store fixos |
| DigestValue / C14N / SignedInfo | **reproduzíveis** (interno ≡ Java) |
| `snapshot.geradoEm` | builder produtivo usa `new Date()` (wall-clock); a prova **normaliza** para o clock injetado **apenas no fingerprint** — sem mudar o builder |
| Manifesto golden | comparado byte a byte |

---

## 6. Provas

### Positivas (P-01..P-15)

Todas cobertas em `proof.test.ts` (31 passed; 1 skipped = XSD worker real sem URL).

### Negativas (N-01..N-14)

Adulteração de total/item/NCM/Digest/Signature/URI/Id/algoritmo/XXE; storeId inválido;
manifesto adulterado; SEFAZ impossível; write produtivo abortado.

### Java

Verificador `FiscalXmlDsigVerifier` (GOAL-003) em Java 17 — digest e validade alinhados ao signer.

### XSD

| Camada | Resultado neste host |
|---|---|
| Pacote oficial `PL_010e_v1.02` versionado + hash de manifesto | presente e conferido |
| Gate de composição (contrato + Signature) | executado no harness → `xsdContract: true` |
| Worker B2 `xmllint` real (Docker / `FISCAL_XSD_WORKER_URL`) | **BLOQUEIO AMBIENTAL** — Docker CLI ausente; suite skipped |
| Validações XSD reais / negativos XSD reais | **0** / **0** |
| Classificação FASE 15 | **XSD real NÃO aprovado** neste ambiente → `verification.xsd: false` |

- **Composição offline (default CI):** o gate injeta o **mesmo contrato** do pacote oficial
  (`XSD_SCHEMA_PACKAGE` + `OFFICIAL_XSD_MANIFEST_SHA256`) e exige `<Signature>` no XML.
  **Não** substitui o worker `xmllint` e — desde a correção de §2.1 — **não** se declara `xmllint`
  nem aprova: responde `WORKER_INDISPONIVEL` (fail-closed, `engine: null`).
- **Worker real:** obrigatório para fechar o eixo XSD do GOAL; indisponível aqui → estado
  **PARCIAL**, serializado no manifesto como `proofState: "partial"` +
  `blockingReasons: ["XSD_WORKER_REAL_UNAVAILABLE"]`, e **exit code 2** no runner integral.

---

## 7. Segurança

| Controle | Resultado |
|---|---|
| Callers produtivos | 0 |
| Database writes | 0 (probe; aborta se ≠ 0) |
| SEFAZ / egress | 0 |
| Credencial real / A1 / CSC / idToken | 0 |
| Dado RafaCell / loja-1 / XML real | 0 |
| Chave privada no manifesto | ausente |
| Provider emission | não importado |

---

## 8. Como rodar

```bash
# suíte da prova (gera/compara golden; Java 17 no PATH)
npx vitest run tools/fiscal-dry-run-integrity-proof/proof.test.ts

# regenerar manifesto (somente quando hashes legítimos mudarem)
# FISCAL_005_UPDATE_MANIFEST=1 npx vitest run tools/fiscal-dry-run-integrity-proof/proof.test.ts

# runner CLI
npx tsx tools/fiscal-dry-run-integrity-proof/run.ts
# npx tsx tools/fiscal-dry-run-integrity-proof/run.ts --update-manifest

# XSD worker real (opcional)
# FISCAL_XSD_WORKER_URL=http://127.0.0.1:18080 npx vitest run tools/fiscal-dry-run-integrity-proof/proof.test.ts
```

---

## 9. Estado de gates e maturidade

| Item | Valor |
|---|---|
| Gate Fiscal global F4→F5 | **aberto** |
| G-F5 / G-F7 / G-F12 | **abertos** |
| G-C1 / G-C2 / C14N F4→F5 técnico | fechados (herdados) |
| Nível atual | **N3** |
| Nível máximo futuro deste eixo | **N4** somente após auditoria + merge controlado |
| N6 / N7 | 0 / 0 |
| Signer | dormente |
| Emissão | não ativada |

---

## 10. Fora de escopo (confirmado)

- Caller PDV/venda/Caixa/API/UI
- Emissão, transmissão, homologação, produção
- Schema/migration/Prisma
- Regra tributária nova
- Contador HUB
- Modernização de algoritmos (ADR-0011 intacto)
- PR / merge / push para main (nesta tarefa: apenas branch)

---

## 11. Validações executadas nesta branch (2026-07-17)

| Comando | Resultado |
|---|---|
| `npx vitest run tools/fiscal-dry-run-integrity-proof/proof.test.ts` | ✅ **31 passed** · 1 skipped (XSD worker real sem `FISCAL_XSD_WORKER_URL` / Docker ausente no host) |
| `npx tsx tools/fiscal-dry-run-integrity-proof/run.ts` | ~~✅ manifest OK byte-igual · `ok: true` · Java 17 + XSD contrato + safety zero~~ — **SUPERADO / RETIRADO (17/07/2026)**. Este `ok: true` era exatamente a leitura enganosa corrigida em §2.1: vinha do gate de composição, não de `xmllint`. Sob a matriz corrigida o runner integral retorna **exit 2** (worker XSD real ausente). Além disso, §13.4 registra que `tsx` **não** está instalado neste host — a linha não é reproduzível aqui e **não** deve ser citada como evidência |
| `npx vitest run lib/fiscal` | ✅ **262 passed** · 16 skipped (c14n-external-proof condicional) |
| `npx tsc --noEmit` | ✅ EXIT=0 |
| `npx eslint tools/fiscal-dry-run-integrity-proof --max-warnings 0` | ✅ EXIT=0 |
| `npm run build` | ✅ EXIT=0 (Next.js 16.2 · 103 rotas; harness fora do bundle de produção) |
| Worker XSD Docker local | ⚠️ Docker CLI **não instalado** neste host — suite real permanece opcional/skip |
| Java 17 / `javac` | ✅ Temurin 17.0.13 |

## 12. Próximo passo

1. Auditoria de merge readiness desta branch.
2. PR documental+técnico do harness (sem auto-merge).
3. Aprovação humana.
4. Merge controlado (merge commit).
5. Só então considerar elevação a **N4 no eixo dry-run** — sem abrir G-F5.

**Reconciliação documental ≠ implementação ≠ emissão ≠ SEFAZ.**

---

## 13. Continuação — fechamento de egress + exit codes (17/07/2026)

Continuação **aditiva** na mesma branch (sem amend/force-push/reset/rebase). Fecha os dois
gaps menores que estavam `parcial`; o eixo XSD worker real **permanece bloqueado**.

### 13.1 Diagnóstico ambiental (reconfirmado neste host)

| Recurso | Resultado |
|---|---|
| Docker CLI / daemon | **ausente** (`docker: command not found`; sem Docker Desktop, sem podman) |
| Java 17 (`java`/`javac`) | ✅ Temurin **17.0.13** |
| Worker XSD B2 (`workers/fiscal-xsd`) | Dockerfile presente, mas **build baixa `libxml2` de `download.gnome.org`/`github.com`** (egress externo) — indisponível offline |
| Porta 18080 (`FISCAL_XSD_WORKER_URL`) | nada escutando |

**Conclusão FASE 4-5 (GATE XSD):** worker XSD real **não** pôde ser iniciado nem construído
neste host (bloqueio duplo: Docker ausente **e** build exige download externo). Conforme o
prompt: **não** improvisar validador, **não** marcar XSD como aprovado, registrar bloqueio,
prosseguir apenas com a blindagem de rede. **Estado permanece PARCIAL.**

### 13.2 FASE 7-8 — intercept de egress (`net-guard.ts`)

- Monkey-patch, instalado **antes** da prova e restaurado no `finally`, de:
  `globalThis.fetch` · `http.request`/`http.get` · `https.request`/`https.get` ·
  `net.connect`/`net.createConnection` · `tls.connect` ·
  `dns.lookup`/`resolve`/`resolve4`/`resolve6`/`resolveAny`/`reverse`.
- **Allowlist mínima/explícita:** loopback (`127.0.0.1`/`::1`/`localhost`), socket unix / named
  pipe local e rede Docker interna (`*.internal`) — mesma allowlist de
  `lib/fiscal/xsd-worker/client.ts`. Todo host público é **barrado antes** de resolver DNS /
  abrir socket (nenhuma conexão externa real é feita para provar o bloqueio) e registrado em
  `attempts`.
- Reinstalar enquanto ativo é **rejeitado** (não acumula wrappers); `restore()` idempotente.
- `undici` externo é coberto via `globalThis.fetch`; `child_process` (javac/java) **não** é rede
  e **não** é interceptado. Sem dependência nova.
- **Testes:** NET-P01 (loopback DNS) · NET-P02 (transporte loopback TCP do worker) ·
  NET-N01 fetch · N02 http · N03 https · N04 net · N05 tls · N06 DNS · N07 SEFAZ · N08 restauração ·
  N09 restaura mesmo com falha · N10 sem acúmulo · **prova completa sob o guard = 0 tentativas**.

### 13.3 FASE 12 — matriz de exit codes 0-4

`classifyProofExit` (puro, em `proof.ts`), avaliada por prioridade e ligada ao `run.ts`:

| Código | Significado |
|---|---|
| 3 | violação de segurança (egress/persistência/SEFAZ) — nunca mascarada |
| 2 | dependência técnica obrigatória indisponível (Java 17 / golden / **worker XSD real**) — **nunca** retorna 0 |
| 4 | manifesto divergente do golden |
| 1 | falha de integridade (interno/Java/estrutura/contrato XSD/determinismo/idempotência/adulteração/isolamento) |
| 0 | todas as provas obrigatórias passaram |

Testes unitários cobrem os cinco códigos + precedência.

> **Atualização de 17/07/2026 (§2.1):** `xsdWorkerReal` entrou como sinal obrigatório. Enquanto só
> o gate de composição responder, **a prova integral retorna 2** — antes ela podia chegar a 0.
> Consequência deliberada: **`verify golden` verde ≠ GOAL concluído**. A consistência do artefato
> é verificada pela suíte (P-10 · XSD-H15) e é **separada** da conclusão da prova, que é o exit
> code do runner integral.

### 13.4 Evidência (FASE 9-11)

- **Zero persistência reconfirmada:** scan do harness — nenhum `PrismaClient`/`prisma.`/
  `.create(`/`.update(`/`.upsert(`/`$transaction`/`reserve`/`persist`/`transmit`; ocorrências de
  `sefaz`/`provider` são probes, comentários, adapter proibido (que lança) ou alvo de teste negativo.
- **Manifesto golden NÃO regenerado** (correto: XSD real não aprovado e nenhum hash mudou). A
  cadeia snapshot/XML/C14N/assinatura ficou **intacta** → `verify` 3× byte-igual ao golden;
  working tree do `evidence/` estável após verify.

### 13.5 Validações da continuação (17/07/2026)

| Comando | Resultado |
|---|---|
| `vitest run tools/fiscal-dry-run-integrity-proof/proof.test.ts` | ✅ **53 passed** · 1 skipped (worker XSD real sem URL) — era 31; +22 (NET + exit codes) |
| `vitest` verify (golden) 3× | ✅ 53 passed em cada; golden **byte-igual**; `evidence/` inalterado |
| `vitest run lib/fiscal` | ✅ **262 passed** · 16 skipped (baseline preservado; 1ª execução flakou por pressão de RAM/worker — reexecução limpa) |
| `tsc --noEmit --incremental false` | ✅ EXIT=0 (projeto inteiro) |
| `eslint tools/fiscal-dry-run-integrity-proof --max-warnings 0` | ✅ EXIT=0 |
| `run.ts` via `tsx` | **não executado** — `tsx` ausente no host (instalar = fora de escopo); lógica (`classifyProofExit`/`withNetGuard`) 100% coberta por testes unitários |
| Worker XSD Docker | ⚠️ **bloqueado** (Docker ausente + build com download externo) |

> Nota Windows: a suíte `lib/fiscal` reescreveu `__snapshots__/calculator.test.ts.snap` apenas em
> **fim de linha (LF→CRLF)**, sem diff de conteúdo. Arquivo **fora do escopo** — não incluído no
> commit (preservado, não restaurado).

**Estado final honesto:** **PARCIAL**. Egress + exit codes fechados e testados; XSD worker real
**segue bloqueado** ambientalmente. GOAL **não** migra para “ENTREGUE NA BRANCH” (critério nº 1 —
worker XSD real disponível — não satisfeito). Nível **N3**; N6=0; N7=0; nenhum gate fechado.

---

## 14. Correção — honestidade da evidência XSD (17/07/2026)

Escopo fechado: **representação** da evidência XSD. Não fecha o XSD, não instala Docker, não
inicia supply chain, não toca `workers/fiscal-xsd`, não cria arquivo novo. Detalhe técnico e
causa-raiz em **§2.1**.

### 14.1 Manifesto — antes × depois

| Campo | Antes (`f452bc1`) | Depois |
|---|---|---|
| `verification.xsd` | `true` ❌ | **`false`** ✅ |
| `verification.xsdContract` | ausente | `true` |
| `verification.xsdStatus` | ausente | `"composition-gate"` |
| `verification.xsdEngineName` | ausente (motor forjado como `"xmllint"` no código) | `"composition-gate"` |
| `verification.xsdEngineVersion` | ausente | `null` |
| `verification.xsdWorkerReal` | ausente | `false` |
| `proofState` | ausente | `"partial"` |
| `blockingReasons` | ausente | `["XSD_WORKER_REAL_UNAVAILABLE"]` |
| 5 hashes do XML + `DigestValue` | — | **inalterados** (byte-idênticos) |

### 14.2 Testes de honestidade (XSD-H01..H16)

Adicionados em `proof.test.ts` (sem arquivo novo): kind do gate · ausência de motor `xmllint` ·
sem validação real · sem worker real · `xsd: false` no golden · `xsdContract: true` · motor
identificado · `proofState: partial` · blocker presente · **exit 2 com só composition-gate** ·
rejeição de combinação inválida · só `xmllint-worker` produz `xsd: true` · manifesto isolado não
afirma `xmllint` · serialização determinística · regenerar mantém bytes · **hashes do XML fixados**.

Nenhum teste finge execução de `xmllint`. O objeto sintético `kind: "xmllint-worker"` é
**unitário** (prova o mapeamento da serialização), **não** vira golden e **não** é evidência real.

### 14.3 Validações desta correção

| Comando | Resultado |
|---|---|
| `vitest run tools/fiscal-dry-run-integrity-proof/proof.test.ts` | ✅ **69 passed** · 1 skipped (worker XSD real sem URL) — era 53; +16 (XSD-H01..H16) |
| Regeneração do manifesto parcial (`FISCAL_005_UPDATE_MANIFEST=1`, modo de update do próprio harness) | ✅ golden reescrito pelo runner — **sem edição manual do JSON** |
| `vitest` verify (golden) 3× | ✅ 69 passed em cada; manifesto **byte-igual** nas 3 (`sha256` 40b042aa…); nenhum outro arquivo tocado |
| `vitest run lib/fiscal` | ✅ **262 passed** · 16 skipped (baseline preservado) |
| `tsc --noEmit --incremental false` | ✅ EXIT=0 (projeto inteiro) |
| `eslint` (3 arquivos alterados) `--max-warnings 0` | ✅ EXIT=0 |
| `npm run build` | ✅ EXIT=0 (harness fora do bundle de produção) |
| Runner integral (`run.ts`) — exit 2 | ✅ **por classificação** (XSD-H10 reproduz os sinais que `run.ts` monta) · ⚠️ **CLI não executado**: `tsx` ausente no host e instalar dependência é proibido neste GOAL. Mesma limitação já registrada em §13.5 |
| Worker XSD real / `xmllint` | ⚠️ **não executado** — validações XSD reais **0**; negativos XSD reais **0** |
| Docker | não instalado · não executado · nada baixado |

### 14.4 Estado

**PARCIAL.** A correção torna código, runner, manifesto e documentação inequivocamente honestos —
**não** avança o eixo XSD. Permanecem: worker real bloqueado, supply chain offline pendente,
**0 validações XSD reais**, gate Fiscal global **aberto**, **N3**, N6=0, N7=0, callers produtivos
0, emissão não, SEFAZ não chamada, **sem merge-readiness**.

### 14.5 Próximo passo (documental — não iniciado aqui)

**`FISCAL-XSD-WORKER-OFFLINE-SUPPLY-CHAIN-005A`** — em host apropriado, com Docker e rede
controlada: adquirir fontes aprovados com hashes; construir imagem imutável; rodar SBOM + scan;
exportar/publicar **bundle OCI aprovado**; registrar digest; provar execução offline posterior.
Sem alterar schemas e **sem** chamar SEFAZ. Este GOAL **não** cria esse comando nem toca o worker.
