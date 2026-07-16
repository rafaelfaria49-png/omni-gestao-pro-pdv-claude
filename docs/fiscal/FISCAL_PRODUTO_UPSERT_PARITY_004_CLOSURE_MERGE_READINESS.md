# FISCAL — Merge readiness do fechamento documental GOAL-004

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-PRODUTO-UPSERT-PARITY-004-CLOSURE-MERGE-READINESS` |
| Tipo | Auditoria documental read-only (sem correção, sem merge) |
| Data | 2026-07-16 |
| Branch de auditoria | `audit/fiscal-produto-upsert-004-close-readiness` |
| Worktree | `C:/Projetos/wt-fiscal-produto-upsert-004-close-readiness` |
| Branch auditada | `origin/fiscal/goal-004-produto-upsert-close` |
| HEAD auditado (esperado) | `c49cce5a867125a2f5fec1ab697b28918e715a7a` |
| HEAD auditado (confirmado) | `c49cce5a867125a2f5fec1ab697b28918e715a7a` |
| `origin/main` | `b307337ce89535355d18cd9138e17f635f1c1bf5` |
| Merge-base | `b307337ce89535355d18cd9138e17f635f1c1bf5` |
| Ahead / behind | branch **1** ahead · main **0** ahead |
| Classificação | **A — PRONTO PARA INTEGRAÇÃO** |

> **Aviso.** Esta auditoria **não** integra, **não** corrige a branch de fechamento e **não**
> altera código. Somente avalia se o fechamento documental do GOAL-004 está pronto para merge
> na `main`.

---

## 1. Objetivo

Determinar se a branch documental `fiscal/goal-004-produto-upsert-close` (commit `c49cce5`)
está pronta para integração na `origin/main` atual, após o merge técnico do PR #8
(`b307337`).

Escopo: coerência dos sete documentos, avanço da main, interseção, merge-tree virtual, hashes,
gates, nível N, `metadata.fiscal` / `fiscalRegime`, ausência de afirmações fiscais indevidas.

---

## 2. `origin/main`

```text
b307337ce89535355d18cd9138e17f635f1c1bf5
Merge pull request #8 from rafaelfaria49-png/work/fiscal-produto-upsert-parity-004
```

A main **já contém** o merge técnico do GOAL-004 e **não avançou** após esse merge no momento
desta auditoria.

---

## 3. Branch

```text
origin/fiscal/goal-004-produto-upsert-close
c49cce5a867125a2f5fec1ab697b28918e715a7a
docs(fiscal): fechar paridade fiscal do upsertProduto
```

HEAD bate exatamente com o esperado no pedido de auditoria.

---

## 4. Commit

Exatamente **1** commit próprio da branch sobre a main:

| Hash | Mensagem |
|---|---|
| `c49cce5` | `docs(fiscal): fechar paridade fiscal do upsertProduto` |

Diffstat: **7 arquivos · +751 / −75**.

---

## 5. Merge-base

```text
merge-base(origin/main, origin/fiscal/goal-004-produto-upsert-close)
= b307337ce89535355d18cd9138e17f635f1c1bf5
```

A merge-base é **idêntica** à `origin/main` → a branch está exatamente **1 commit à frente e
0 atrás** (fast-forward puro em termos de topologia).

---

## 6. Ahead / behind

```text
git rev-list --left-right --count origin/main...origin/fiscal/goal-004-produto-upsert-close
0       1
```

| Lado | Contagem |
|---|---:|
| Commits só na main | 0 |
| Commits só na branch | 1 |

---

## 7. Commits novos da main

```text
git log --oneline "$BASE"..origin/main
(vazio)
```

**Nenhum** commit na main posterior à base. Não há avanço de docs compartilhados, Fiscal,
Cadastros V2, Contador HUB ou qualquer outro módulo a reconciliar.

---

## 8. Sete arquivos

```text
M  docs/ai/CURRENT_STATUS.md
M  docs/fiscal/FISCAL_CONTINUATION_COMMANDS_001.md
M  docs/fiscal/FISCAL_CONTINUATION_IMPLEMENTATION_GOALS_001.md
A  docs/fiscal/FISCAL_PRODUTO_UPSERT_PARITY_004_CLOSURE_REPORT.md
M  docs/fiscal/FISCAL_RECONCILE_REPORT_001.md
M  docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md
M  docs/roadmaps/ROADMAP_FISCAL.md
```

Confirmado:

- exatamente **7** arquivos documentais;
- **nenhum** código, teste, workflow, ferramenta, dependência, Prisma, migration, ADR;
- **nenhum** arquivo do Contador HUB;
- relatório de fechamento **novo** presente.

---

## 9. Interseção

| Conjunto | Qtde | Resultado |
|---|---:|---|
| `BASE..origin/main` | 0 | (vazio) |
| `BASE..branch` | 7 | os 7 docs |
| Interseção | **0** | **nenhuma** |

Sem arquivo comum → **sem conflito textual possível** e **sem conflito semântico por edição
concorrente**. A main não tocou os mesmos documentos após a base.

---

## 10. Merge-tree

```text
git merge-tree --write-tree origin/main origin/fiscal/goal-004-produto-upsert-close
→ tree b3ad4c4dbc403b5628390ce9975bc48a7f49d065
exit 0
```

Forma verbosa (`merge-tree $BASE main branch`): apenas hunks `merged` nos docs da allowlist;
**sem** `changed in both`, **sem** marcadores `<<<<<<<` / `=======` / `>>>>>>>`, **sem**
`CONFLICT`.

**Merge real não executado.**

Risco semântico residual por merge-tree: **baixo** — e, dado interseção vazia + zero commits
na main, o merge-tree limpo **confirma** (não sozinho, mas em conjunto com o inventário) a
ausência de colisão.

---

## 11. Validação semântica (checklist 1–45)

| # | Critério | Resultado |
|---:|---|---|
| 1 | GOAL-004 marcado como fechado | **OK** (todos os 7 docs coerentes) |
| 2 | PR técnico #8 | **OK** |
| 3 | Commit `3f8928c` | **OK** |
| 4 | Merge `b307337` | **OK** |
| 5 | Parents `5b96df7` + `3f8928c` | **OK** (conferidos no git) |
| 6 | Quatro arquivos técnicos citados | **OK** |
| 7 | `upsertProduto` canônico | **OK** |
| 8 | `fiscalInputFromBody` | **OK** |
| 9 | `canonicalizeProdutoFiscalMetadata` | **OK** |
| 10 | `metadata.fiscal` fonte canônica única | **OK** |
| 11 | Dez campos canônicos | **OK** |
| 12–14 | `fiscalRegime` não canônico / não formal / sem CFOP-CST-CSOSN | **OK** |
| 15–18 | create / update / parcial / metadata não fiscal | **OK** |
| 19–20 | Barcode/Cosmos revisão humana; sem auto-confirmação | **OK** |
| 21–23 | schema / migration / regras tributárias | **OK** (não alterados) |
| 24–26 | 61/61 + TS/ESLint/build reutilizados; sem falso “rodou no PR” | **OK** |
| 27 | Vercel como check do PR | **OK** |
| 28–31 | Gate global aberto; G-C1/G-C2/C14N e G-F5/7/12 inalterados | **OK** |
| 32–34 | N3; N6=0; N7=0 | **OK** |
| 35–40 | signer dormente; callers 0; emissão/SEFAZ/homologação/produção não | **OK** |
| 41 | GOAL-005 não iniciado | **OK** |
| 42 | Follow-ups R-1…R-5 só futuros | **OK** |
| 43–44 | Colisão histórica explicada; sem renumerar | **OK** |
| 45 | Sem contradição roadmap / masterplan / CURRENT_STATUS / closure | **OK** |

Varredura de contradições explícitas (`GOAL-004 não iniciado`, `emissão habilitada`,
`Fiscal pronto`, `checks rodaram no PR`, `N6=1`, `GOAL-005 iniciado`): **nenhum hit** nos sete
documentos.

---

## 12. Colisão histórica

| Sistema | ID | Papel | Documentação na branch |
|---|---|---|---|
| Sequência nomeada | XSD-002 | FECHADO | preservado |
| Sequência nomeada | C14N-003 | FECHADO | preservado |
| Sequência nomeada | upsert-004 | FECHADO agora | explícito |
| Tabela histórica | GOAL 002 / P-04 | paridade `upsertProduto` | marcado cumprido **no eixo V2** |
| Tabela histórica | GOAL 004 | ST / CSOSN 500 | **permanece distinto e não iniciado** |
| Código `04ce54d` | `GOAL_004` parcial | contrato + REST | reconhecido como parcial prévio |

**Parecer:** **correta** (não editorialmente confusa, não estruturalmente conflitante).

Não houve renumeração nem apagamento de GOALs históricos. A equivalência 004 nomeado ≡ 002/P-04
histórico está clara em goals, commands, reconcile e closure report.

---

## 13. `upsertProduto`

**Documental:** porta Cadastros V2 usa `fiscalInputFromBody` + canonização após merge de metadata.

**Técnico (main `b307337`, read-only):**

```text
app/actions/cadastros.ts:16  import { fiscalInputFromBody } from "@/lib/produto-fiscal"
app/actions/cadastros.ts:17  import { canonicalizeProdutoFiscalMetadata } from "…/produto-fiscal-upsert"
app/actions/cadastros.ts:1616  const fiscalInput = fiscalInputFromBody(…)
app/actions/cadastros.ts:1628  nextMetadata = canonicalizeProdutoFiscalMetadata(…)
```

Helper e teste existem:

- `lib/produtos/produto-fiscal-upsert.ts` — **True**
- `lib/produtos/produto-fiscal-upsert.test.ts` — **True**

**Parecer:** correto e alinhado à main.

---

## 14. `metadata.fiscal`

- Documentado como **única fonte canônica** persistida;
- dez campos do contrato `lib/produto-fiscal.ts` (inalterado pelo PR técnico e pelo fechamento);
- lido por `getProdutoFiscal`;
- usado pelo motor via o contrato (sem segundo namespace canônico).

**Parecer:** correto.

---

## 15. `metadata.fiscalRegime`

- Documentado como compatibilidade visual/textual (`tributacao`, `origem`, `atualizadoEm`);
- **não** canônico; **não** fonte de CFOP/CST/CSOSN; **não** autoriza emissão;
- **não** lido por `getProdutoFiscal` (zero hits em `lib/produto-fiscal.ts`);
- **não** lido por `lib/fiscal/**` (zero hits);
- confirmado no UI (`produto-ia.tsx`) separado de `metadata.fiscal`.

Documentos **não** apresentam os dois namespaces como equivalentes.

**Parecer:** correto.

---

## 16. Create

Documentado e coberto por testes do helper: CREATE com campos fiscais gera `metadata.fiscal`
canônico saneado.

**Parecer:** correto.

---

## 17. Update

Update sem sinal fiscal: helper não roda; merge de dois níveis preserva bloco existente.

**Parecer:** correto.

---

## 18. Update parcial

Campos canônicos não reenviados preservados (`if (incoming[key])`).

**Parecer:** correto.

---

## 19. Metadata não fiscal

Namespaces disjuntos preservados (spread + reescrita só de `fiscal`).

**Parecer:** correto.

---

## 20. Barcode / Cosmos

Código na main: toast “Revise e salve manualmente”; “Aplicar sugestões”;
`cosmosFiscalApplied` só após ação humana. Documentação alinhada. Sem auto-confirmação fiscal.

**Parecer:** correto.

---

## 21. Schema

Documentado e tecnicamente: **não alterado** (JSONB `metadata` pré-existente).

---

## 22. Migration

**Nenhuma.**

---

## 23. Testes

Referência **61/61** da auditoria de merge readiness técnica; helper com 10 casos.
Fechamento documental **não** repete a bateria — registra reutilização honestamente.

**Parecer:** correto.

---

## 24. TypeScript

Evidência reutilizada da auditoria — **não** afirmado como check do PR.

**Parecer:** correto.

---

## 25. ESLint

Idem.

**Parecer:** correto.

---

## 26. Build

Idem.

**Parecer:** correto.

---

## 27. Checks do PR

Vercel success documentado; ausência de checks independentes de TS/ESLint/testes/build
explicitada no closure report e em `CURRENT_STATUS`.

**Parecer:** correto e honesto.

---

## 28. Gates

| Gate | Estado documentado | Veredito |
|---|---|---|
| G-C1 | fechado (GOAL-001) | inalterado — **OK** |
| G-C2 | fechado (XSD) | inalterado — **OK** |
| Critério C14N/XMLDSig F4→F5 | fechado (GOAL-003) | inalterado — **OK** |
| Gate Fiscal **global** | **ABERTO** | **OK** |
| G-F5 / G-F7 / G-F12 | abertos | inalterados — **OK** |

Nenhum gate novo inventado. Paridade de cadastro **não** eleva F4→F5 global.

---

## 29. Nível N

| Eixo | N |
|---|---|
| Cadastro / GOAL-004 | **N3** |
| XSD | N4 (prévio) |
| C14N/XMLDSig | N4 (prévio) |
| Homologação | **N6 = 0** |
| Produção | **N7 = 0** |

Sem linguagem ambígua do tipo “Fiscal pronto”, “produto pronto para nota”, “emissão
habilitada” ou “produção concluída” nos sete documentos.

**Parecer:** correto.

---

## 30. Signer

Documentado **dormente**. Verificação técnica: zero callers de `emitirNotaFiscalVenda` /
`runFiscalPipeline` em `app`/`components` (fora testes).

**Parecer:** correto.

---

## 31. Callers produtivos

**0** — coerente entre docs e código.

---

## 32. Emissão

**Não** ativada.

---

## 33. SEFAZ

**Não** chamada.

---

## 34. Homologação

**Não** realizada (N6=0).

---

## 35. Produção Fiscal

**Não** ativada (N7=0).

---

## 36. GOAL-005

**Não iniciado** em todos os documentos-chave.

---

## 37. Follow-ups

R-1…R-5 presentes no closure report e espelhados em `CURRENT_STATUS` como **não implementados**.

**Parecer:** correto (somente futuros).

---

## 38. Contador HUB

**Não** aparece no diff; **não** há colisão. Inalterado.

---

## 39. Links

Links relativos do pacote fiscal apontam para documentos existentes ou criados nesta branch
(`FISCAL_PRODUTO_UPSERT_PARITY_004_CLOSURE_REPORT.md`, relatórios GOAL-002/003, roadmap,
masterplan). Sem link quebrado material no escopo auditado.

**Parecer:** OK.

---

## 40. Hashes

| Hash | Papel | Verificado |
|---|---|---|
| `c49cce5a867125a2f5fec1ab697b28918e715a7a` | commit documental | **sim** |
| `b307337ce89535355d18cd9138e17f635f1c1bf5` | merge PR #8 / main | **sim** |
| `3f8928c0d8dc7361b6282cbb2b225ae04ed8a501` | implementação | **sim** |
| `5b96df71a0b507c11785a043b49c6adb15ec26c8` | parent¹ main | **sim** (`b307337^1`) |
| `3f8928c…` | parent² | **sim** (`b307337^2`) |

**Parecer:** OK.

---

## 41. Segredos

`git diff --check` limpo. Varredura do diff por padrões de chave privada, certificado, tokens,
`DATABASE_URL`, etc.: **sem hits**. Sem XML real, sem CPF/CNPJ, sem dados pessoais de produção.

**Parecer:** limpo.

---

## 42. Classificação

# **A — PRONTO PARA INTEGRAÇÃO**

Justificativa:

1. Exatamente sete documentos; zero código/testes/CI/Prisma/ADR/Contador;
2. Main **não** avançou após a base; interseção **vazia**;
3. Merge-tree limpo (exit 0, tree virtual `b3ad4c4…`);
4. GOAL-004 corretamente fechado; hashes/PR/parents corretos;
5. `metadata.fiscal` canônica e `fiscalRegime` não canônico, sem ambiguidade;
6. Gates e N3/N6/N7 corretos; signer dormente; sem emissão/homologação/produção falsas;
7. Colisão histórica de numeração explicada corretamente;
8. Sem segredos; sem contradição entre os sete documentos;
9. Honestidade sobre checks ausentes no PR e evidências reutilizadas.

Não se aplica B (sem erro editorial material), C (sem contradição com main) nem D (sem escopo
indevido).

---

## 43. Estratégia

1. Abrir **PR documental** de `fiscal/goal-004-produto-upsert-close` → `main` (somente docs).
2. Integrar preferencialmente por **merge commit** (histórico linear de fechamentos fiscais).
3. **Não** iniciar GOAL-005 no mesmo PR.
4. Após merge, opcionalmente arquivar/preservar branches de auditoria (sem exclusão forçada).

---

## 44. Conclusão

O fechamento documental do GOAL-004 está **pronto para integração**. A `main` atual já tem a
implementação técnica (PR #8); esta branch apenas **reconcilia a governança** sem tocar código
nem gates. Classificação **A**.

---

## Anexo — pré-flight capturado

```text
branch: audit/fiscal-produto-upsert-004-close-readiness
HEAD:   b307337ce89535355d18cd9138e17f635f1c1bf5  (== origin/main)
close:  c49cce5a867125a2f5fec1ab697b28918e715a7a
BASE:   b307337ce89535355d18cd9138e17f635f1c1bf5
left-right: 0  1
working tree da auditoria: limpa antes do relatório
```
