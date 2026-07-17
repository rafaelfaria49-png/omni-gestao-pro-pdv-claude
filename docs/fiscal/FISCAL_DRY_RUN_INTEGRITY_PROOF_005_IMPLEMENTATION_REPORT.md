# FISCAL — Prova de Integridade do Dry-Run (GOAL-005)

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-DRY-RUN-INTEGRITY-PROOF-005` |
| Nome humano | Prova de Integridade do Dry-Run Fiscal |
| **Estado** | **PARCIAL** — harness offline na branch; **egress intercept (FASE 7-8) e matriz de exit codes 0-4 (FASE 12) FECHADOS** na continuação de 17/07/2026; **bloqueio ambiental PERSISTE no eixo XSD worker real** (Docker ausente neste host — FASE 15) |
| Tipo | Harness técnico **não produtivo** — composição offline de componentes dormentes |
| Data | 2026-07-17 (harness) · 2026-07-17 (continuação: egress + exit codes) |
| Branch | `work/fiscal-dry-run-integrity-proof-005` |
| Commit | técnico `d5dc7ad…` + honestidade `4a15310…` + **commit aditivo desta continuação** (`fix(fiscal): fechar egress e exit codes do dry-run`) — sem amend/force-push |
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
- o harness usa adapter de **composição de contrato** (pacote `PL_010e_v1.02` +
  `OFFICIAL_XSD_MANIFEST_SHA256` + exigência de `<Signature>`) — **não** substitui o worker;
- a suite opcional `FISCAL_XSD_WORKER_URL` permanece **skipped**;
- o manifesto golden registra `verification.xsd: true` apenas no sentido de **gate de contrato**
  do dry-run adapter — **não** deve ser lido como validação schema `xmllint` real.

### Lacunas menores vs prompt integral

| Item | Status |
|---|---|
| Intercept runtime de `fetch`/`http`/`https`/`net`/`tls`/DNS externo (FASE 7-8) | **FECHADO (17/07/2026)** — `net-guard.ts`: monkey-patch de `fetch`/`http(s).request`+`get`/`net.connect`+`createConnection`/`tls.connect`/`dns.lookup`+`resolve`+`resolve4`+`resolve6`+`resolveAny`+`reverse`; allowlist loopback + IPC local + `.internal`; install antes / restore no `finally`; recorder de tentativas. NET-P01/02 + NET-N01..N10 + prova completa sob o guard = **0 egress** |
| Códigos de saída 0–4 completos no CLI (FASE 12) | **FECHADO (17/07/2026)** — `classifyProofExit` puro (0 sucesso · 1 integridade · 2 dependência Java/golden · 3 egress/persistência/SEFAZ · 4 manifesto divergente) + wiring no `run.ts` + 9 testes unitários |
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
| Adapter de composição (contrato + Signature) | executado no harness |
| Worker B2 `xmllint` real (Docker / `FISCAL_XSD_WORKER_URL`) | **BLOQUEIO AMBIENTAL** — Docker CLI ausente; suite skipped |
| Classificação FASE 15 | **XSD real NÃO aprovado** neste ambiente |

- **Composição offline (default CI):** adapter injeta o **mesmo contrato** do pacote oficial
  (`XSD_SCHEMA_PACKAGE` + `OFFICIAL_XSD_MANIFEST_SHA256`) e exige `<Signature>` no XML.
  **Não** substitui o worker `xmllint`.
- **Worker real:** obrigatório para fechar o eixo XSD do GOAL; indisponível aqui → estado **PARCIAL**.

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
| `npx tsx tools/fiscal-dry-run-integrity-proof/run.ts` | ✅ manifest OK byte-igual · `ok: true` · Java 17 + XSD contrato + safety zero |
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
| 2 | dependência técnica obrigatória indisponível (Java 17 / golden) — XSD/Java indisponível **nunca** retorna 0 |
| 4 | manifesto divergente do golden |
| 1 | falha de integridade (interno/Java/estrutura/contrato XSD/determinismo/idempotência/adulteração/isolamento) |
| 0 | todas as provas obrigatórias passaram |

9 testes unitários cobrem os cinco códigos + precedência.

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
