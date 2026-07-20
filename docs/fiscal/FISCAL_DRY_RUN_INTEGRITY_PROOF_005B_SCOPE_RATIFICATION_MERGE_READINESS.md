# Merge-Readiness — Ratificação do Escopo do GOAL-005B

**GOAL desta auditoria:** `FISCAL-DRY-RUN-INTEGRITY-PROOF-005B-SCOPE-RATIFICATION-MERGE-READINESS`

**Data:** 20/07/2026 · **Natureza:** exclusivamente documental · **Código alterado:** nenhum ·
**Branch auditada NÃO foi tocada.**

> Auditoria da branch documental do 005B contra a `origin/main` atual, que avançou (PR #14 —
> Contador HUB) depois que a ratificação foi criada. Objetivo: decidir a estratégia segura de
> integração **sem perder o conteúdo do PR #14** em `CURRENT_STATUS.md`.

---

## 1. Classificação

**A2 — REAPLICAÇÃO LIMPA SOBRE A MAIN ATUAL.**

A branch é integrável sem revisão material. Há **um único conflito**, puramente **mecânico e
aditivo** (adjacência de seções em `CURRENT_STATUS.md`), com resolução determinística e **zero
perda** comprovada dos dois lados. Não é classe **A** (PR direto) apenas porque um merge direto
exige resolver esse hunk; não é **B** porque não há defeito documental a corrigir; não é **C/D**
porque nada de material está em disputa e todas as premissas do 005B sobrevivem ao avanço da main.

## 2. `main`, branch e merge-base

| Campo | Valor |
|---|---|
| `origin/main` (atual) | `0a8d366861e1d7b59c742590c2f7b5f9f7e699d3` |
| Branch auditada | `docs/fiscal-dry-run-005b-scope-ratification` |
| HEAD da branch | `8a03b39819cd80a78b520f486b30ea91bdbff353` |
| Merge-base | `a40ff5cbbed9eb3bf8f0764ba3b63e75f78bdcd6` |
| Branch de auditoria | `audit/fiscal-dry-run-005b-scope-ratification-readiness` (a partir de `0a8d366`) |

O merge-base `a40ff5c` é exatamente a `origin/main` que a ratificação usou como base. A main
avançou **depois** da ratificação; a branch **não** ficou obsoleta em conteúdo, apenas
desatualizada em base.

## 3. ahead / behind

| Direção | Contagem |
|---|---|
| branch à frente da main (branch-only) | **1** |
| branch atrás da main (main-only) | **2** |

## 4. Commits exclusivos

**Branch (1):**

| Commit | Mensagem |
|---|---|
| `8a03b39` | `docs(fiscal): ratificar escopo do GOAL-005B` |

**Main desde a base (2):**

| Commit | Mensagem |
|---|---|
| `0a8d366` | `Merge pull request #14 from …/publish/contador-hub-g2-closure-001` |
| `03e7488` | `docs(contador): fechar Gate G2 — publicar serie 001 e aprovar ADRs 001/003/004/005/006` |

## 5. Interseção de arquivos

| Arquivo | Base→Branch | Base→Main | Interseção |
|---|---|---|---|
| `docs/ai/CURRENT_STATUS.md` | M | M | **SIM (único)** |
| `docs/fiscal/FISCAL_DRY_RUN_INTEGRITY_PROOF_005B_SCOPE_RATIFICATION.md` | A | — | não |
| `docs/fiscal/FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md` | M | — | não |
| `docs/fiscal/FISCAL_CONTINUATION_COMMANDS_001.md` | M | — | não |
| `docs/roadmaps/ROADMAP_FISCAL.md` | M | — | não |
| `docs/contador/CONTADOR_HUB_*` (4) | — | A | não |
| `docs/status/MOCKS_TRACKING.md` | — | M | não |

A branch tocou **exatamente os 5 documentos** da ratificação (1 novo + 4 modificados). A **única
sobreposição** com a main é `docs/ai/CURRENT_STATUS.md`. Os outros 4 documentos da ratificação e os
5 arquivos do PR #14 são **disjuntos** e não geram conflito.

## 6. Análise do hunk de `CURRENT_STATUS.md`

**Um único hunk de conflito.** Contagem de linhas prova que é aditivo em ambos os lados:

| Versão | Linhas | Delta vs base |
|---|---|---|
| base (`a40ff5c`) | 3 380 | — |
| main (`0a8d366`, PR #14) | 3 410 | **+30** (seção Contador HUB) |
| branch (`8a03b39`, ratificação) | 3 410 | **+30** (bloco PR #13 + seção 005B na área Fiscal) |
| resolução candidata (base + ambos) | **3 440** | **+60** = +30 +30 (aritmética exata) |

**Causa raiz — adjacência, não colisão semântica.** O PR #14 **inseriu** a nova seção
`## Contador HUB — Gate G2 …` imediatamente **acima** do heading `## Fiscal — …`. A ratificação
**editou** esse heading Fiscal (e o conteúdo abaixo dele). O merge de três vias marca conflito
apenas porque as duas inserções encostam na mesma fronteira de linha — não porque disputem o mesmo
texto.

**Natureza das mudanças:**

- **PR #14 em `CURRENT_STATUS.md`:** aditivo puro — **+22 / −0** (uma seção nova no topo).
- **Ratificação em `CURRENT_STATUS.md`:** **+33 / −3**. As 3 remoções são **todas** dentro da
  seção Fiscal (o heading Fiscal antigo, uma linha de resumo e o heading "Base prévia"); **nenhuma**
  toca a seção Contador HUB.

## 7. Coexistência sem perda — comprovada

Resolução candidata construída **em scratchpad** (nenhuma branch tocada): manter a seção Contador
HUB + `---` do lado `main`, seguida do heading Fiscal novo e do restante do lado `ratificacao`.
Resultado (3 440 linhas, **zero marcadores de conflito**) diferenciado contra os dois lados:

| Comparação | Resultado |
|---|---|
| resolução **vs main** | difere **somente** pelas mudanças Fiscais da ratificação (heading, bloco PR #13, seção 005B) |
| resolução **vs branch** | difere **somente** pelas 30 linhas da seção Contador HUB do PR #14 |
| linhas **removidas** da branch na resolução | **0** — nenhuma perda do lado da ratificação |
| linhas **removidas** do PR #14 na resolução | **0** — seção Contador HUB integralmente preservada |

Confirmação estrutural na resolução: `## Contador HUB` presente (1×), `### GOAL-005B` presente (1×),
frase-âncora do PR #14 ("Gate G2 aprovado por Rafael") presente (1×). **Coexistência sem perda:
COMPROVADA.**

## 8. merge-tree e árvore virtual

`git merge-tree --write-tree --name-only 0a8d366 8a03b39` → exit **1** (conflito), árvore virtual
**`6b595ad975be5ee7c552919b2b2c81f1a8c7b256`**, com **1** arquivo conflitante
(`docs/ai/CURRENT_STATUS.md`).

Verificação do conteúdo da árvore virtual (blobs):

| Arquivo | Estado na árvore virtual |
|---|---|
| 4 docs Fiscais da ratificação (relatório 005B, GOALS, COMMANDS, ROADMAP) | **byte-idênticos à branch** ✅ |
| 5 arquivos do PR #14 (4 Contador + MOCKS_TRACKING) | **byte-idênticos à main** ✅ |
| `docs/ai/CURRENT_STATUS.md` | único conflito — resolução determinística da §7 |

Todos os arquivos, exceto o único hunk, fundem-se limpo. O conflito é o **mesmo** já observado no
push original — não surgiu nenhum conflito novo com o avanço da main.

## 9. Validações de conteúdo (temporalidade, links, hashes, consistência)

### 9.1 Links (validados **contra a árvore virtual** `6b595ad`)

| Origem | Alvos | Resultado |
|---|---|---|
| Relatório 005B | 4 links relativos `./…` | **todos resolvem** ✅ |
| GOALS + COMMANDS | link para o relatório 005B | **resolvem** ✅ |
| ROADMAP | `../fiscal/…005B…` | **resolve** ✅ |
| PR #14 (`CURRENT_STATUS`) | `../contador/…DADOS_REAIS_READONLY_006.md` | alvo existe ✅ |

### 9.2 Hashes Git citados

Reconferidos como existentes: 11 commits + 7 blobs do harness (validados na tarefa de ratificação).
As premissas de contenção continuam verdadeiras contra a **nova** main:

| Premissa | Resultado vs `0a8d366` |
|---|---|
| `a40ff5c` (005A doc) ancestral da main | **SIM** — "main contém o 005A" segue verdadeiro |
| `2a7f102` (PR #12) ancestral da main | **SIM** — 005A segue fechado |
| `d4dfcf1` (harness) **fora** da main | **SIM** — premissa central do 005B intacta |
| lock `workers/fiscal-xsd/supply-chain.lock.json` | SHA-256 `5402dca9…` **inalterado** |
| `lib/fiscal/**`, `lib/produto-fiscal.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `tools/**`, `.github/**`, `prisma/**` | **nenhuma** mudança entre `a40ff5c` e `0a8d366` → prova de compatibilidade byte-idêntica do 005B **permanece válida** |

### 9.3 Consistência entre os 5 documentos (na árvore virtual)

| Item | Resultado |
|---|---|
| Contagem de negativos por escopo | 005A = **7/7**; 005B = **1 + 8**; reconciliação "não confundir camadas" presente ✅ |
| Nenhuma afirmação de implementação 005B iniciada | ✅ |
| Caminho 2 · 005B definido, não iniciado · GOAL-005 PARCIAL · 005A fechado · gate global aberto · N6=0 · N7=0 · Contador HUB intocado | ✅ (todas presentes) |

### 9.4 Temporalidade — 3 afirmações em tempo presente que envelheceram

O avanço da main tornou **desatualizadas** (não incorretas em premissa) três frases da branch, todas
sobre a **posição** da main — nenhuma sobre a substância do 005B:

| # | Documento | Frase | Estado |
|---|---|---|---|
| T-1 | `CURRENT_STATUS.md` (bloco PR #13) | "…`a40ff5c…` — **é a `origin/main` corrente**" | a main corrente agora é `0a8d366`; `a40ff5c` deixou de ser o tip (segue ancestral) |
| T-2 | `CURRENT_STATUS.md` (seção 005B) | "`origin/main` = `a40ff5c…`" | idem — descreve a main da data da ratificação |
| T-3 | Relatório 005B §6 | "A `main` **não avançou** além do estado esperado" | verdadeiro **na data da ratificação**; a main avançou depois (PR #14) |

**Severidade: baixa (cosmética).** São instantâneos datados ("em 20/07/2026"), não premissas de
compatibilidade. Todas as premissas materiais (005A fechado, harness fora da main, contratos
byte-idênticos, lock intacto) **sobrevivem**. Não bloqueiam integração e **não** exigem edição da
branch nesta tarefa — ficam registradas como observação para o momento da integração/PR.

## 10. Confirmações obrigatórias

| Item | Estado na branch / árvore virtual |
|---|---|
| Caminho 2 ratificado | ✅ ("RATIFICADO PELO CAMINHO 2") |
| 005B definido, **não iniciado** | ✅ ("DEFINIDO DOCUMENTALMENTE — NÃO INICIADO") |
| GOAL-005 continua **PARCIAL** | ✅ |
| 005A **fechado** na main | ✅ (PR #12 + PR #13 ancestrais) |
| Gate Fiscal global **aberto** | ✅ |
| N6 = 0 · N7 = 0 | ✅ |
| Contador HUB **preservado** | ✅ (seção do PR #14 intacta na resolução; ratificação declara "Contador HUB intocado") |

## 11. Riscos

| Dimensão | Nível | Detalhe |
|---|---|---|
| **Textual** | **Baixo** | 1 hunk de adjacência em `CURRENT_STATUS.md`; resolução determinística; 3 440 = 3 380 + 30 + 30 (aditivo exato); zero perda dos dois lados. |
| **Semântico** | **Muito baixo** | Nada material em disputa. Contador HUB (main) e Fiscal 005B (branch) são seções distintas do mesmo índice. As 3 frases temporais são cosméticas e datadas; premissas do 005B intactas. |
| **Operacional** | **Baixo** | Só `CURRENT_STATUS.md` precisa de resolução manual do editor; os outros 4 docs e todo o PR #14 fundem sem intervenção. Nenhum código/workflow/harness/lock/schema envolvido. |

## 12. Estratégia recomendada

**A2 — reaplicação limpa sobre a `main` atual, integrando por PR.** Passos (para a tarefa de
integração autorizada — **não** executados aqui):

1. Criar branch de integração a partir de `origin/main` (`0a8d366`).
2. Reaplicar os **4 documentos disjuntos** da ratificação byte-idênticos (relatório 005B novo +
   GOALS + COMMANDS + ROADMAP) — sem conflito.
3. Em `CURRENT_STATUS.md`, aplicar a resolução determinística da §7: **preservar integralmente** a
   seção Contador HUB do PR #14 (topo) e, **abaixo**, o heading Fiscal novo + bloco PR #13 + seção
   005B da ratificação.
4. **Opcional, na integração:** atualizar as 3 frases temporais T-1/T-2/T-3 para refletir que a
   `origin/main` corrente passou a ser `0a8d366` (PR #14). Cosmético; não altera nenhuma premissa.
5. Abrir PR e submeter ao **Gate H1** (aprovação humana). Só após a integração na main iniciar a
   implementação técnica do 005B.

> **Alternativa equivalente:** um PR direto da branch `8a03b39` também é viável — o GitHub marcará o
> mesmo hunk de `CURRENT_STATUS.md` como conflito a resolver na interface, com a mesma resolução da
> §7. A2 (reaplicação sobre a main atual) é preferível por deixar a base já atualizada e permitir a
> correção temporal opcional no mesmo passo.

## 13. Conclusão

**BRANCH DO 005B APTA À INTEGRAÇÃO — CLASSIFICAÇÃO A2.**

O único conflito é mecânico, com resolução determinística e **coexistência sem perda comprovada**
entre o PR #14 (Contador HUB) e a ratificação Fiscal. Todas as premissas materiais do 005B
sobrevivem ao avanço da main; as únicas defasagens são 3 frases temporais cosméticas. Nenhuma
correção da branch original é necessária para integrar.

**Estado:** ratificação **pendente de integração** (Gate H1) · GOAL-005 **PARCIAL** · 005B
**definido, não iniciado**.

**Próximo passo:** tarefa de integração (reaplicação A2 + PR + Gate H1). A implementação técnica do
005B só começa **após** a integração na main.

---

**Referências**

- Ratificação: `docs/fiscal/FISCAL_DRY_RUN_INTEGRITY_PROOF_005B_SCOPE_RATIFICATION.md`
  — **ainda não presente na `main`**; existe na branch `docs/fiscal-dry-run-005b-scope-ratification`
  @ `8a03b39`. Por isso é citada por branch + commit (link relativo resolveria apenas após a
  integração desta ratificação na main).
- Merge-base: `a40ff5cbbed9eb3bf8f0764ba3b63e75f78bdcd6`
- Árvore virtual (merge-tree): `6b595ad975be5ee7c552919b2b2c81f1a8c7b256`
- Main atual: `0a8d366861e1d7b59c742590c2f7b5f9f7e699d3` (PR #14 — Contador HUB G2)
