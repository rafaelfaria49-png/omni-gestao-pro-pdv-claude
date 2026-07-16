# FISCAL — Reconciliação de escopo do GOAL-005

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-GOAL-005-SCOPE-RECONCILIATION` |
| Tipo | Reconciliação documental de numeração/escopo — **somente documentação** |
| Data | 2026-07-16 |
| Branch | `fiscal/goal-005-scope-reconciliation` |
| Worktree | `../wt-fiscal-goal-005-reconciliation` (`C:/Projetos/wt-fiscal-goal-005-reconciliation`) |
| `origin/main` (inicial e final) | `ba65cd0c8c7d8f5588282fb6c430beab555bd15e` (não avançou) |
| Auditoria formal (evidência) | branch `audit/fiscal-goal-005-formal-evaluation` · commit `f6d6f2ac9a24dff2fabc09051e2558f810bdad33` |
| Relatório de auditoria | `docs/fiscal/FISCAL_GOAL_005_FORMAL_EVALUATION.md` (na branch de auditoria; **não** integrado à main) |
| Classificação de entrada | **G — ESCOPO AMBÍGUO; RECONCILIAÇÃO DOCUMENTAL NECESSÁRIA** |
| Decisão desta reconciliação | slot nomeado 005 = **`FISCAL-DRY-RUN-INTEGRITY-PROOF-005`** (definido documentalmente, **não iniciado**) |
| Nível N | atual **N3**; máximo futuro **N4** só no eixo integridade do dry-run; **N6=0**, **N7=0** |
| Emissão / SEFAZ / homologação / produção | **não** |
| Gates fechados por esta reconciliação | **nenhum** |

> **Escopo desta entrega.** Resolver a ambiguidade do número GOAL-005 e fixar a sequência Fiscal
> canônica **sem apagar nem renumerar** o histórico, **sem** misturar o Contador HUB e **sem**
> iniciar implementação. Não altera código, testes, Prisma, schema, migrations, workflows,
> `package.json`/lockfile, APIs, motor Fiscal, signer, provider, PDV, Caixa, Estoque, Cadastros nem
> Contador HUB. Não cria caller produtivo, não chama SEFAZ, não ativa emissão. Nenhum PR, merge,
> rebase, cherry-pick, reset, stash, force-push ou push para `main`.

---

## 1. Objetivo

Converter o resultado da auditoria formal (classe G) em uma **decisão canônica de nomenclatura e
escopo** para o slot “GOAL-005” da frente Fiscal, preservando integralmente as referências
históricas e mantendo o trilho read-only do Contador HUB separado. A reconciliação:

1. mapeia os quatro usos concorrentes do número/conceito “005”;
2. separa identificador atual de referência histórica;
3. separa o trilho Fiscal do trilho read-only do Contador HUB;
4. preserva o blueprint de snapshot dormente como **componente/pré-requisito**, não como GOAL
   automaticamente iniciado;
5. define o próximo GOAL técnico Fiscal (**`FISCAL-DRY-RUN-INTEGRITY-PROOF-005`**);
6. registra limites, gates e nível máximo permitido;
7. **não implementa** nenhuma parte técnica.

---

## 2. Base

| Item | Valor |
|---|---|
| `origin/main` no início | `ba65cd0c8c7d8f5588282fb6c430beab555bd15e` |
| `origin/main` ao final | `ba65cd0c8c7d8f5588282fb6c430beab555bd15e` (inalterado; nenhum commit posterior a analisar) |
| Estado anterior | GOAL-003 e GOAL-004 fechados; `metadata.fiscal` canônica; signer dormente; callers produtivos 0; emissão desativada; SEFAZ não chamada; homologação/produção não; gate global aberto; N6=0; N7=0 |

---

## 3. Auditoria formal

`FISCAL-GOAL-005-FORMAL-EVALUATION` (branch `audit/fiscal-goal-005-formal-evaluation`, commit
`f6d6f2ac9a24dff2fabc09051e2558f810bdad33`, relatório
`docs/fiscal/FISCAL_GOAL_005_FORMAL_EVALUATION.md`, 47 seções) — **não integrada à main**; usada
apenas como evidência. Ela concluiu:

- quatro sistemas de numeração/referência concorrentes para “005”;
- o número **nomeado 005 está oficialmente vago**;
- referência histórica de XSD já **cumprida** (via GOAL nomeado 002);
- blueprint de **snapshot dormente** na main;
- referência do **Contador HUB por competência** (trilho distinto);
- classificação **G**;
- recomendação de **reconciliação documental** antes de qualquer código;
- menor escopo técnico seguro = **prova interna de integridade do dry-run/snapshot** (Candidato A);
- **nenhuma** implementação foi feita na auditoria.

---

## 4. Classificação G

A auditoria classificou o slot como **G — escopo ambíguo; reconciliação documental necessária**,
porque o slot nomeado 005 não tinha escopo atribuído em documento canônico e o número colidia entre
quatro sistemas. **Esta reconciliação é exatamente o passo que a classe G exigia.** Ela **resolve**
a ambiguidade documentalmente (G → “definido, não iniciado”), sem iniciar implementação e sem
avançar gate.

---

## 5. Problema de numeração

O número “005” estava simultaneamente **vago** (na sequência nomeada de execução) e **sobrecarregado**
(em três outros sistemas), mais uma pendência homônima “P-05”. Sem uma decisão canônica, qualquer
trabalho novo rotulado “005” reintroduziria ambiguidade e arriscaria (a) reusar um objetivo já
cumprido (XSD), (b) “reiniciar” um componente dormente (snapshot) ou (c) confundir-se com o Contador
HUB (competência).

---

## 6. Mapa dos quatro sistemas

### A. GOAL nomeado atual (sequência de execução)

| Campo | Valor |
|---|---|
| Identificador | `FISCAL-…-005` (slot nomeado) |
| Documento | `FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md`, `…_COMMANDS_001.md`, `ROADMAP_FISCAL.md`, `MASTER_FISCAL_EXECUTION_PLAN.md` |
| Estado antes desta reconciliação | **oficialmente vago** (nenhum escopo atribuído) |
| Conclusão | é este slot que a reconciliação define como `FISCAL-DRY-RUN-INTEGRITY-PROOF-005` |

### B. Referência histórica de XSD

| Campo | Valor |
|---|---|
| Identificador histórico | Tabela histórica GOAL **005** (“Versionar o pacote XSD oficial e sua proveniência”) |
| Documento de origem | `FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md` (tabela 001–022) |
| Estado real | **CUMPRIDO** no eixo XSD |
| Relação com o GOAL-002 atual | realizado pelo GOAL **nomeado 002** (`FISCAL-XSD-OFFICIAL-VALIDATION-002`, PR #4, `PL_010e_v1.02`, G-C2) |
| Conclusão | objetivo **já cumprido e fechado**; **não reutilizar** como trabalho novo; **não renumerar** a tabela histórica |

### C. Blueprint / snapshot Fiscal

| Campo | Valor |
|---|---|
| Nome histórico | Rótulo de código **`GOAL_005`** = “Snapshot Fiscal da Venda” |
| Componentes existentes | `lib/fiscal/venda-fiscal-snapshot.ts`, `…-service.ts` (persistência **DORMENTE**), `…-tax.ts`, `dry-run/**`, `xml/**`, `signing/**`, `xsd/**`, `provider/stub-homologacao.ts` |
| Estado real | **dormente** (0 callers de venda) e exercitado apenas em **dry-run/testes** |
| Commit | `b5177cf` (dentro da fundação `ba0cc12`) |
| Relação com o próximo trabalho | é **base técnica / pré-requisito** da prova de integridade — **não** um GOAL a “reiniciar” |
| Conclusão | **componente/pré-requisito**, não um GOAL automaticamente iniciado |

### D. Contador HUB por competência

| Campo | Valor |
|---|---|
| Trilho | **Contador HUB** (`goal/contador-005-competencia`; commits `9472e8d` / `50c1db8`) |
| Escopo | **read-only** — contrato de competência mensal (`lib/contador/competencia`), `?c=AAAA-MM` na rota |
| Documentos/readers | `components/dashboard/contador/contador-hub-preview.tsx` (comentário “Competência (GOAL 005)”) |
| Proibições | não emite, não assina, não transmite, não cancela, não edita XML, não recalcula tributo, não altera status Fiscal |
| Conclusão | **trilho externo** ao sequenciamento de implementação Fiscal; **não** define nem ocupa o GOAL-005 Fiscal |

### Pendência homônima (registro)

“**P-05**” (relatório reconciliado) = “C14N interoperável” → **FECHADA** via GOAL nomeado 003. Não é
um GOAL; é uma pendência já resolvida. Registrada aqui apenas para evitar confusão com “005”.

**Nenhuma referência histórica é apagada; nenhum documento antigo é renumerado.**

---

## 7. Sequência histórica

A **tabela histórica reconciliada** (001–022, em `FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md`)
é um blueprint de longo prazo. Os itens já realizados no eixo respectivo: 002 (paridade produto →
GOAL nomeado 004), 005/006 (XSD → GOAL nomeado 002), 007/008 (C14N/XMLDSig → GOAL nomeado 003). A
tabela **permanece intacta**; a sequência **nomeada** de execução mapeia-se a ela por objetivo, não
por posição.

---

## 8. Sequência atual

Sequência **nomeada** de execução (a que este documento governa):

| GOAL nomeado | Identificador | Objetivo | Estado |
|---|---|---|---|
| 001 | `FISCAL-STATUS-RECONCILE-001` | reconciliação factual | FECHADO (G-C1) |
| 002 | `FISCAL-XSD-OFFICIAL-VALIDATION-002` | validação XSD oficial | FECHADO (G-C2) |
| 003 | `FISCAL-XML-C14N-EXTERNAL-PROOF-003` | C14N/XMLDSig + prova externa | FECHADO (critério F4→F5) |
| 004 | `FISCAL-PRODUTO-UPSERT-PARITY-004` | paridade fiscal do `upsertProduto` | FECHADO (N3 cadastro) |
| **005** | **`FISCAL-DRY-RUN-INTEGRITY-PROOF-005`** | **Prova de Integridade do Dry-Run Fiscal** | **DEFINIDO documentalmente · NÃO INICIADO** |

> **Nota de equivalência (evitar nova ambiguidade):** o relatório de auditoria (§6) usou o rótulo
> **provisório** `FISCAL-DRY-RUN-INTEGRITY-005` para o mesmo escopo (Candidato A). O nome
> **canônico ratificado** é **`FISCAL-DRY-RUN-INTEGRITY-PROOF-005`**. Mesmo escopo; o sufixo
> `-PROOF-` é a forma oficial. Não há dois GOALs — há um identificador provisório e um canônico
> para o **mesmo** slot.

---

## 9. XSD histórico

O item histórico “005/006 — pacote/validador XSD oficial” está **cumprido e fechado** no eixo XSD
pelo GOAL nomeado 002 (worker B2 containerizado, `validarXsd` fail-closed, pacote `PL_010e_v1.02`,
G-C2). **Não** é o GOAL-005 nomeado e **não** deve ser reaberto como trabalho novo.

---

## 10. Snapshot dormente

`buildVendaFiscalSnapshot` congela emitente/destinatário/itens/tributação (`deepFreeze`);
`createVendaFiscalSnapshot` persiste **1 NotaFiscal RASCUNHO idempotente** — tudo **dormente** (0
callers de venda). É **pré-requisito/base** da prova de integridade, **não** um GOAL a iniciar.

---

## 11. Contador HUB competência

O “GOAL 005” do Contador HUB (competência mensal, read-only) é **trilho distinto**. Não emite, não
assina, não transmite, não recalcula tributo, não altera status Fiscal, não executa o dry-run como
ação produtiva. Sua referência “competência” **não** define nem ocupa o GOAL-005 Fiscal.

---

## 12. Decisão canônica

Ratifica-se, como decisão documental (compatível com a auditoria formal e sem contradizer a main):

- o slot **nomeado 005** da sequência de execução Fiscal passa a ser
  **`FISCAL-DRY-RUN-INTEGRITY-PROOF-005`**;
- estado: **definido documentalmente, NÃO iniciado**;
- a auditoria formal (classe G) **sustenta** exatamente esta definição (Candidato A — prova de
  integridade do dry-run/snapshot); portanto a reconciliação **não** está bloqueada;
- histórico preservado; nenhuma renumeração destrutiva; Contador HUB separado.

---

## 13. Nome oficial

- **Identificador:** `FISCAL-DRY-RUN-INTEGRITY-PROOF-005`
- **Nome humano:** **Prova de Integridade do Dry-Run Fiscal**
- **Rótulo provisório equivalente (auditoria):** `FISCAL-DRY-RUN-INTEGRITY-005` (mesmo escopo)

---

## 14. Objetivo do futuro GOAL

Provar, de forma **determinística, local, offline, sem transmissão e sem caller produtivo**, que o
fluxo Fiscal **dormente** preserva integridade entre: dados canônicos de entrada → snapshot Fiscal →
montagem do XML → identificação/referências → canonicalização (C14N) → assinatura (material
sintético de teste) → validação XSD → relatório de evidência. O dry-run **descarta** o XML e **não**
persiste, **não** transmite e **não** toca banco/SEFAZ.

---

## 15. Escopo permitido (PODE)

- usar **fixtures sintéticas** explicitamente marcadas para teste;
- usar o **dry-run** existente; montar **snapshot**; montar **XML**;
- **assinar com material sintético de teste** (`DRY_RUN_TEST_CERT`), nunca A1 real;
- validar **C14N/XMLDSig**; validar **XSD**; gerar **hashes**;
- gerar **relatório e artefatos em memória**;
- provar **determinismo**; provar **detecção de adulteração**;
- testar **isolamento store-scoped**; testar **idempotência** da geração;
- permanecer **inteiramente offline**.

---

## 16. Blocklist (NÃO PODE)

- criar **caller produtivo**; ser acionado pelo **PDV** ou por **venda real**;
- **persistir emissão real**; **reservar numeração Fiscal real**; alterar **status Fiscal produtivo**;
- chamar **provider SEFAZ**, **homologação** ou **produção**;
- usar **certificado operacional**, **CSC real**, **idToken real**, **XML real de cliente**,
  **CNPJ/CPF real**;
- **definir regra tributária**; criar **default Fiscal falso**;
- alterar **schema**; criar **migration**; **tocar Contador HUB**.

---

## 17. Fixtures

Fixtures devem usar **valores sintéticos** explicitamente definidos para teste, **sem** apresentá-los
como orientação Fiscal real e **sem** virar default de produção. Nenhum dado real (certificado, CSC,
idToken, CNPJ/CPF, XML de cliente) em fixture.

---

## 18. Dry-run

Reusa `lib/fiscal/dry-run/**` (esteira a seco, fail-closed, descarta XML). A prova estende a
cobertura de integridade; **não** altera o motor nem cria caller produtivo.

---

## 19. Snapshot

Reusa `venda-fiscal-snapshot*`. Prova **imutabilidade** (`deepFreeze`) e **idempotência** (1 venda →
1 snapshot vigente). **Não** ativa persistência produtiva.

---

## 20. XML

Reusa `lib/fiscal/xml/**`. XML **determinístico**, exceto campos explicitamente temporais, que
devem ser **normalizados** de forma controlada na prova. XML **descartado**; nunca persistido nem
transmitido.

---

## 21. C14N

Reusa `lib/fiscal/signing/c14n.ts` (C14N 1.0 inclusiva oficial). Prova **reprodutibilidade** da
canonicalização.

---

## 22. XMLDSig

Reusa `lib/fiscal/signing/**` (RSA-SHA1/SHA-1, allowlist de algoritmos). Assina com **material
sintético**; prova **DigestValue** e **SignatureValue** reproduzíveis e assinatura **válida**.

---

## 23. XSD

Reusa o worker B2 / `validarXsd` fail-closed. Valida o **XML assinado** (o schema exige
`<Signature>`); XML não assinado reprova **por definição**.

---

## 24. Hashes

Hashes SHA-256 de XML e XML assinado geram evidência **reproduzível** (sem timestamps no corpo do
relatório). Determinismo verificável por repetição.

---

## 25. Determinismo

Mesma entrada sintética → mesmos hashes de XML/relatório. Campos temporais/identificadores
normalizados de forma controlada e documentada.

---

## 26. Adulteração

Mutação de qualquer campo crítico (conteúdo, namespace, algoritmo, referência) deve ser **detectada**
(reprovação da verificação de assinatura e/ou XSD). Fail-closed comprovado.

---

## 27. Idempotência

Geração repetida não duplica snapshot (contrato já codificado no serviço dormente); numeração em
**placeholder** não é consumida. Prova por teste dedicado.

---

## 28. Multi-loja

Isolamento **store-scoped** provado por fixture: dados de uma loja não vazam para outra; `storeId`
presente na esteira e no `correlationId` do dry-run.

---

## 29. Offline

Execução **inteiramente offline**. Qualquer dependência de rede é **stop condition**.

---

## 30. Schema

**Não previsto.** As 8 entidades fiscais já existem, sem drift. Qualquer necessidade de schema
descoberta durante a implementação é **stop condition** e exige nova avaliação/autorização.

---

## 31. Migration

**Nenhuma** prevista. Proibida sem autorização separada.

---

## 32. ADR

**Não necessária** se o trabalho apenas compuser contratos já aceitos. **Necessária** se surgir nova
decisão arquitetural, de persistência, de estado, de transporte ou de **formato de evidência
operacional** (nesse caso, recalcular o próximo número ADR livre contra `origin/main` e branches).

---

## 33. Credenciais

**Não necessárias.** Proibido solicitar/usar certificado A1 real, CSC, idToken ou qualquer segredo
SEFAZ. Segredo **nunca** em log/bundle/coluna em claro.

---

## 34. Autoridade contábil

**Não necessária** para provar integridade **estrutural** (a prova usa apenas CSOSN já suportados —
102/101/103/300/400 — e valores sintéticos). Será **obrigatória** antes de implementar **regra
tributária** (ex.: ST/CSOSN 500 — `CSOSN_COM_ST`) ou cenário real. Nenhum valor de fixture vira
default de produção. A prova **não** decide CFOP/CST/CSOSN/alíquotas/ICMS/PIS/COFINS/IPI/FCP/regime.

---

## 35. Gates

| Gate | Estado |
|---|---|
| G-C1 | **fechado** (GOAL-001) |
| G-C2 | **fechado** (GOAL-002 XSD) |
| Critério técnico C14N/XMLDSig do F4→F5 | **fechado** (GOAL-003) |
| Gate Fiscal **global** F4→F5 | **ABERTO** |
| G-F5 | **ABERTO** |
| G-F7 | **ABERTO** |
| G-F12 | **ABERTO** |

Esta reconciliação **não fecha gate algum**. O futuro GOAL-005 **não** autoriza transmissão,
homologação ou produção, **não** fecha o gate global e apenas **produz evidência técnica** para
avaliação futura. Qualquer fechamento de gate exigirá **auditoria própria**. Não se cria novo gate.

---

## 36. Nível N

- Reconciliação documental: **não eleva nível N**.
- Futuro GOAL-005: nível inicial **N3**; máximo permitido após implementação **e** prova = **N4
  apenas no eixo de integridade do dry-run**. Não declarar N4 antes da implementação e da auditoria.

---

## 37. N6

**0.** Nenhuma homologação SEFAZ. Não pode avançar sem GOAL próprio, credenciais, homologação e
aprovação humana.

---

## 38. N7

**0.** Nenhuma produção. Não pode avançar sem G-F12 e aprovação humana registrada.

---

## 39. Contador HUB

Permanece em **trilho separado e read-only**. PODE: ler documentos fiscais, cancelamentos,
rejeições, pacote por competência, exibir dados existentes. NÃO PODE: emitir, assinar, transmitir,
cancelar, editar XML, recalcular tributos, alterar status Fiscal, executar o dry-run como ação
produtiva, duplicar implementação. A referência “competência” **não** define nem ocupa o GOAL-005
Fiscal. Se o Contador HUB precisar futuramente de reader novo: documentar dependência, aguardar o
GOAL Fiscal responsável, **não** criar contrato paralelo.

---

## 40. Stop conditions (para a implementação futura)

A implementação do GOAL-005 deverá **parar** ao encontrar: (1) necessidade de schema; (2) migration;
(3) novo estado Fiscal; (4) regra tributária; (5) autoridade contábil; (6) certificado real; (7) CSC
ou idToken; (8) chamada SEFAZ; (9) caller produtivo; (10) acionamento por PDV; (11) risco de
persistência real; (12) conflito com Contador HUB; (13) dado real em fixture; (14) segredo em log;
(15) divergência entre snapshot e XML sem contrato definido; (16) necessidade de alterar arquivos
fora da futura allowlist.

---

## 41. Riscos

- **P0:** rotular como “005” um trabalho que crie caller produtivo/emissão; reabrir o XSD histórico;
  “reiniciar” o snapshot dormente; confundir com o Contador HUB.
- **P1:** implementar regra tributária sem autoridade contábil (passivo fiscal); declarar “dry-run
  verde de ponta a ponta” sem golden cases (gate falso).
- **P2:** fixtures sintéticas tratadas como orientação fiscal; lacuna de teste de integridade.
- **P3:** deriva de nomenclatura entre o rótulo provisório e o canônico (mitigado pela nota de
  equivalência do §8/§13).

Mitigação transversal: esta reconciliação fixa nome, escopo, limites e stop conditions **antes** de
qualquer código.

---

## 42. Estado

**GOAL-005 = `FISCAL-DRY-RUN-INTEGRITY-PROOF-005`: DEFINIDO documentalmente, NÃO INICIADO.** Nenhum
código/teste/schema tocado. Gate global aberto. N6=0, N7=0. Auditoria formal preservada fora da main.

---

## 43. Próximos passos

1. **Auditoria documental de merge readiness** desta reconciliação (branch/docs).
2. **PR** + **aprovação humana** + **merge controlado** da reconciliação.
3. **Só então**, em GOAL próprio e sob gate: implementação técnica de
   `FISCAL-DRY-RUN-INTEGRITY-PROOF-005` (classe C, N4-interno máximo), respeitando a blocklist e as
   stop conditions deste documento.
4. ST/matriz tributária (com autoridade contábil), provider (G-F5) e homologação permanecem em
   GOALs próprios, gated — **fora** deste slot.

---

## 44. Conclusão

A ambiguidade do número “005” está **resolvida documentalmente**: o slot **nomeado** 005 da sequência
Fiscal passa a ser **`FISCAL-DRY-RUN-INTEGRITY-PROOF-005` — Prova de Integridade do Dry-Run Fiscal**,
**definido e não iniciado**. As três outras referências “005” permanecem intactas e separadas: o XSD
histórico (cumprido), o snapshot dormente (componente/pré-requisito) e o Contador HUB (trilho
read-only). Nenhum documento histórico foi renumerado ou apagado; nenhum gate foi fechado; N6=0 e
N7=0; nenhuma implementação técnica foi iniciada.

**Reconciliação de escopo ≠ implementação ≠ regra tributária ≠ emissão ≠ assinatura produtiva ≠
transmissão ≠ homologação ≠ produção.**
