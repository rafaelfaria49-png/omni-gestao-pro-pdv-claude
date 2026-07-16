# FISCAL — Fechamento GOAL-004 · Paridade fiscal do `upsertProduto`

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-PRODUTO-UPSERT-PARITY-004` |
| GOAL de fechamento | `FISCAL-PRODUTO-UPSERT-PARITY-004-CLOSE` |
| Data de fechamento documental | 2026-07-16 |
| Branch documental | `fiscal/goal-004-produto-upsert-close` |
| Base / `origin/main` verificada | `b307337ce89535355d18cd9138e17f635f1c1bf5` |
| PR de implementação | [#8](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/8) |
| Commit de implementação | `3f8928c0d8dc7361b6282cbb2b225ae04ed8a501` |
| Merge commit | `b307337ce89535355d18cd9138e17f635f1c1bf5` |
| Parent main | `5b96df71a0b507c11785a043b49c6adb15ec26c8` |
| Parent / HEAD fiscal | `3f8928c0d8dc7361b6282cbb2b225ae04ed8a501` |
| Arquivos integrados | **4** · **+206 / −20** |
| Nível N (eixo cadastro/produto) | **N3** (não N4, não N6, não N7) |
| N6 | **0** |
| N7 | **0** |
| Gate Fiscal global | **ABERTO** (inalterado) |
| Homologação SEFAZ | **não** |
| Produção Fiscal | **não** |
| Emissão ativada | **não** |
| Signer | **dormente** |
| Callers produtivos | **0** |
| GOAL-005 | **não iniciado** |

---

## 1. Objetivo

Fechar documentalmente o GOAL nomeado `FISCAL-PRODUTO-UPSERT-PARITY-004` após a integração do
PR #8 na `main`, e registrar formalmente:

- paridade fiscal do `upsertProduto` (Cadastros V2) **concluída**;
- `metadata.fiscal` como **única fonte fiscal canônica** persistida no Produto;
- Cadastros V2 conectado ao contrato existente (`lib/produto-fiscal.ts`);
- create / update / update parcial **não destrutivos**;
- metadata não fiscal **preservada**;
- `metadata.fiscalRegime` como **compatibilidade visual não canônica**;
- Barcode/Cosmos sob **revisão humana**;
- schema **não** alterado; migration **inexistente**; nenhuma regra tributária nova;
- signer **dormente**; callers produtivos **0**; emissão **não** ativada; SEFAZ **não** chamada;
- homologação **não** realizada; produção fiscal **não** ativada;
- nível **N3** neste eixo; **N6=0**; **N7=0**;
- gates Fiscais globais **inalterados**;
- GOAL-005 **não** iniciado.

Esta entrega é **somente documentação**. Não implementa código, não altera testes, workflows,
dependências, Prisma, motor Fiscal, PDV, Caixa, Estoque, Inventário ou Contador HUB.

---

## 2. Colisão histórica da numeração

| Sistema | Identificador | Significado | Estado pós PR #8 |
|---|---|---|---|
| Sequência **nomeada** de execução | `FISCAL-PRODUTO-UPSERT-PARITY-004` | Slot após XSD-002 e C14N-003 | **FECHADO** |
| Tabela histórica reconciliada | GOAL **002** / **P-04** | Paridade fiscal do `upsertProduto` | **cumprido** no eixo Cadastros V2 |
| Tabela histórica reconciliada | GOAL **004** | ST mínima do mix piloto (CSOSN 500) | **não iniciado** (outro eixo) |
| Rótulo em código | `GOAL_004` no commit `04ce54d` | Contrato `lib/produto-fiscal.ts` + REST/importadores | **parcial prévio**; porta V2 fechada pelo PR #8 |

**Por que o número 004 na sequência oficial:**

1. GOAL-002 nomeado = validação XSD oficial (FECHADO);
2. GOAL-003 nomeado = prova externa C14N/XMLDSig (FECHADO);
3. GOAL-004 nomeado = fechamento da paridade fiscal do `upsertProduto` (FECHADO neste relatório).

**Não renumerar** documentos históricos. **Não apagar** referências anteriores. Apenas documentar
a equivalência para evitar ambiguidade futura.

---

## 3. Base

| Item | Valor |
|---|---|
| `origin/main` no fechamento | `b307337ce89535355d18cd9138e17f635f1c1bf5` |
| Merge é ancestral de `origin/main` | **sim** (`git merge-base --is-ancestor` exit 0) |
| Implementação preservada no histórico | **sim** (`3f8928c` ancestral de `main`) |
| PR #8 | `closed` · `merged=true` |
| Worktree de fechamento | `../wt-fiscal-produto-upsert-004-close` |
| Branch documental | `fiscal/goal-004-produto-upsert-close` |

---

## 4. PR

| Campo | Valor |
|---|---|
| Número | **#8** |
| URL | https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/8 |
| Título | `fix(cadastros-v2): canonizar dados fiscais no upsertProduto` |
| Base | `main` |
| Head | `work/fiscal-produto-upsert-parity-004` |
| Método de merge | **merge commit** (não squash, não rebase) |
| Auto-merge | desativado |
| Branch excluída | **não** |

---

## 5. Commit da implementação

```text
3f8928c0d8dc7361b6282cbb2b225ae04ed8a501
fix(cadastros-v2): canonizar dados fiscais no upsertProduto
```

Exatamente **1** commit próprio na branch de implementação.

---

## 6. Merge commit

```text
b307337ce89535355d18cd9138e17f635f1c1bf5
Merge pull request #8 from rafaelfaria49-png/work/fiscal-produto-upsert-parity-004
```

Committer: GitHub. Método: merge commit.

---

## 7. Parents

```text
b307337 Merge pull request #8 …
├─ parent¹ 5b96df71a0b507c11785a043b49c6adb15ec26c8  (main imediatamente anterior)
└─ parent² 3f8928c0d8dc7361b6282cbb2b225ae04ed8a501  (implementação)
```

---

## 8. Arquivos

| Status | Caminho |
|---|---|
| M | `app/actions/cadastros.ts` |
| M | `components/cadastros/lovable/components/cadastros/produto-ia.tsx` |
| A | `lib/produtos/produto-fiscal-upsert.ts` |
| A | `lib/produtos/produto-fiscal-upsert.test.ts` |

Diffstat: **4 arquivos · +206 / −20**.

**Ausente do escopo (confirmado no diff do merge):** Prisma, migrations, `app/api`, `lib/fiscal`,
`lib/produto-fiscal.ts`, PDV, Caixa, Estoque, Inventário, Barcode providers, `package.json`,
lockfile, workflows, Contador HUB.

---

## 9. `upsertProduto` antes

Antes do PR #8 (achado D4 / P-04 do GOAL-001 e auditoria pré-implementação):

- `upsertProduto` em `app/actions/cadastros.ts` mesclava `metadata` genérica (dois níveis);
- **não** importava `lib/produto-fiscal.ts`;
- **não** chamava `fiscalInputFromBody` nem `mergeProdutoFiscalIntoMetadata`;
- Cadastros V2 podia criar/atualizar produto **sem** identidade fiscal canônica;
- REST e importadores já usavam o contrato canônico (parcial `04ce54d`).

---

## 10. `upsertProduto` depois

Comportamento integrado na `main` (linhas relevantes de `app/actions/cadastros.ts`):

1. `fiscalInput = fiscalInputFromBody(input)`;
2. merge de dois níveis de metadata (update) ou spread (create);
3. merge de acessórios quando aplicável;
4. se `fiscalInput != null` → `canonicalizeProdutoFiscalMetadata(nextMetadata, fiscalInput)`;
5. persistência Prisma store-scoped inalterada.

Ordem: genérico → acessórios → **fiscal canônico** → gravação. Sem caller do signer; sem emissão.

---

## 11. Contrato canônico

Reutilizado **sem alteração** de `lib/produto-fiscal.ts` (10 campos):

| Campo | Descrição |
|---|---|
| `ncm` | 8 dígitos |
| `cest` | 7 dígitos |
| `cfop` | 4 dígitos |
| `cst` | regime normal |
| `csosn` | Simples Nacional |
| `origemMercadoria` | `"0"`…`"8"` |
| `unidadeComercial` | uCom |
| `unidadeTributavel` | uTrib |
| `codigoAnp` | combustíveis |
| `exTipi` | EX TIPI |

Helper novo apenas orquestra: `getProdutoFiscal` + `sanitizeProdutoFiscal` +
`mergeProdutoFiscalIntoMetadata`. **Nenhum contrato fiscal paralelo.**

---

## 12. `metadata.fiscal`

- **Única fonte fiscal canônica** persistida no Produto;
- forma compacta (só campos não vazios dos 10 canônicos);
- escrita pela porta Cadastros V2 com a mesma identidade das portas REST/importadores;
- motor Fiscal e `getProdutoFiscal` leem este bloco (com fallback legado de topo `ncm`/`cest`).

---

## 13. `metadata.fiscalRegime`

Namespace de **compatibilidade visual/textual** do Cadastros V2. Campos confirmados no código
(`produto-ia.tsx`):

| Campo | Uso |
|---|---|
| `tributacao` | texto do operador (Simples / Lucro Presumido / Lucro Real) |
| `origem` | ex.: `"operador"` |
| `atualizadoEm` | ISO timestamp |

Classificação:

- **não** é fonte fiscal canônica;
- **não** é lido pelo motor Fiscal;
- **não** é lido por `getProdutoFiscal`;
- **não** é lido pelas APIs fiscais nem importadores (contrato canônico não inclui o namespace);
- **não** contém os dez campos canônicos;
- **não** autoriza emissão;
- **não** deriva CFOP/CST/CSOSN;
- pode ser migrado ou removido futuramente sem alterar o documento Fiscal.

---

## 14. Create

CREATE com NCM/CEST (ou demais campos do contrato) gera `metadata.fiscal` canônico saneado.
Provado pelos testes do helper (`CREATE` canônico e saneamento).

---

## 15. Update

UPDATE **sem** sinal fiscal: `fiscalInputFromBody` retorna `null` → helper **não** roda → merge de
dois níveis **preserva** o bloco `metadata.fiscal` existente.

---

## 16. Update parcial

UPDATE com subconjunto de campos fiscais: só sobrescreve chaves preenchidas; campos canônicos
não reenviados **permanecem**. Provado pelo teste de update parcial não-destrutivo.

---

## 17. Metadata não fiscal

Namespaces fora de `fiscal` (ex.: `acessorios`, `catalogo`, `barcodeLookup`, tags, etc.) são
preservados pelo spread de `mergedMetadata` antes de reescrever apenas `fiscal`.

---

## 18. Compatibilidade legada

- Fallback de leitura: `getProdutoFiscal` ainda aceita `metadata.ncm` / `metadata.cest` no topo
  (legado de importadores);
- Prefill de UI: `fiscalRegime.tributacao` com fallback a `fiscal.tributacao` legado (somente
  estado local de formulário; não regrava o legado no bloco canônico como regime);
- dados legados no topo **não** substituem a forma canônica e **não** são apagados pelo helper.

---

## 19. Barcode / Cosmos

- Sugestões externas de NCM/CEST exigem **ação humana** (“Aplicar sugestões”);
- toast de revisão manual preservado;
- proveniência auditável em `metadata.barcodeLookup`;
- **não** há auto-confirmação fiscal silenciosa.

---

## 20. Cadastros V2

Porta UI `produto-ia.tsx` alinhada:

- payload fiscal canônico `{ ncm?, cest? }` em `metadata.fiscal` quando há sugestão aplicada;
- regime em `metadata.fiscalRegime`;
- NCM manual permanece read-only na UI atual (“edição fiscal — em breve”);
- create e edit compartilham o mesmo `upsertProduto`.

---

## 21. Schema

`Produto.metadata` JSONB **inalterado**. Nenhuma coluna fiscal dedicada criada. Contrato documenta
explicitamente “sem alteração de schema”.

---

## 22. Migration

**Nenhuma** migration criada ou necessária.

---

## 23. Regras tributárias

**Nenhuma** regra tributária nova. Não calcula imposto. Não deriva CFOP/CST/CSOSN de texto livre.
ST/CSOSN 500 permanece backlog (GOAL histórico 003–004 da tabela).

---

## 24. Testes

| Escopo | Resultado de referência |
|---|---|
| Helper `produto-fiscal-upsert.test.ts` | 10 casos (create, update, parcial, namespaces, legado, inválido, payload V2) |
| Suíte da auditoria de merge readiness | **61/61** |
| Testes **repetidos neste fechamento** | **não** — evidências reutilizadas |

---

## 25. TypeScript

Verde na auditoria de merge readiness. **Não** reexecutado neste GOAL documental.

---

## 26. ESLint

Verde na auditoria de merge readiness. **Não** reexecutado neste GOAL documental.

---

## 27. Build

Build Next verde na auditoria de merge readiness. **Não** reexecutado neste GOAL documental.

---

## 28. Checks do PR

| Check | Estado |
|---|---|
| Vercel Preview Comments | success |
| Vercel - omni-gestao | success |
| Vercel - omni-gestao-pro | success |

---

## 29. Ausência de checks independentes no PR

O PR #8 **não** possuía checks independentes de GitHub para:

- TypeScript (`tsc`);
- ESLint;
- testes unitários;
- build de aplicação.

**Não se declara** que esses checks “rodaram no PR”. Eles foram **reproduzidos e aprovados na
auditoria de merge readiness** (`audit/fiscal-produto-upsert-parity-004-readiness`, commit
`fb219c4…`). Risco residual aceito pela política de integração (classificação A).

---

## 30. Auditoria reutilizada

| Branch | Commit | Relatório | Uso |
|---|---|---|---|
| `audit/fiscal-produto-upsert-parity-004` | `61b736f…` | `FISCAL_PRODUTO_UPSERT_PARITY_004_AUDIT.md` | evidência pré-implementação |
| `audit/fiscal-produto-upsert-parity-004-readiness` | `fb219c4…` | `FISCAL_PRODUTO_UPSERT_PARITY_004_MERGE_READINESS.md` | evidência pré-merge |

Branches de auditoria **preservadas** e **não integradas** na `main`.

---

## 31. Multi-loja

`upsertProduto(storeId, input)` e queries Prisma permanecem **store-scoped**.
`metadata.fiscal` vive no produto da loja; sem linha compartilhada entre lojas.

---

## 32. Motor Fiscal

`lib/fiscal/**` **não** alterado pelo PR #8. Motor continua dormente no fluxo de venda.
`getProdutoFiscal` **não** lê `fiscalRegime` (confirmado por ausência no contrato e no código).

---

## 33. Signer

Signer A1 / XMLDSig permanece **dormente** (uso em dry-run/testes/prova). PR #8 **não** cria
import nem chamada de assinatura.

---

## 34. Callers produtivos

Callers produtivos de emissão/assinatura no fluxo de venda: **0** (inalterado).
`emitirNotaFiscalVenda` / `runFiscalPipeline` permanecem sem caller de venda.

---

## 35. Emissão

**Não** ativada. `fiscalEnabled` permanece inalcançável pelo escopo deste GOAL.

---

## 36. SEFAZ

**Nenhuma** chamada.

---

## 37. Homologação

**Não** realizada. N6 = 0.

---

## 38. Produção Fiscal

**Não** ativada. N7 = 0.

---

## 39. Gates

| Gate | Estado pós GOAL-004 |
|---|---|
| G-C1 | fechado anteriormente (GOAL-001) — **inalterado** |
| G-C2 | fechado anteriormente (GOAL-002 XSD) — **inalterado** |
| Critério técnico C14N/XMLDSig F4→F5 | fechado anteriormente (GOAL-003) — **inalterado** |
| F4→F5 Fiscal global | **aberto** — **não** avançado |
| G-F5 | **aberto** — **inalterado** |
| G-F7 | **aberto** — **inalterado** |
| G-F12 | **aberto** — **inalterado** |

**Nenhum gate novo criado.** Paridade de produto **não** autoriza emissão.

---

## 40. Nível N

| Eixo | Nível |
|---|---|
| Cadastro / paridade `upsertProduto` (GOAL-004) | **N3** |
| XSD (GOAL-002) | N4 (inalterado) |
| C14N/XMLDSig (GOAL-003) | N4 (inalterado) |
| Homologação SEFAZ | **N6 = 0** |
| Produção Fiscal | **N7 = 0** |

Justificativa N3: implementação integrada + testes/validações automatizadas; **sem** operação
real, **sem** SEFAZ, **sem** homologação, **sem** produção. **Não** elevar a N4/N6/N7 por este GOAL.

---

## 41. Contador HUB

**Não** alterado.

---

## 42. Riscos residuais

1. PR sem checks CI independentes de TS/ESLint/testes/build (mitigado por auditoria);
2. resíduos legados `metadata.fiscal.tributacao` em produtos antigos;
3. UI ainda não expõe os 10 campos fiscais canônicos (só NCM/CEST + regime textual);
4. ausência de status de “completude fiscal” antes de qualquer emissão futura;
5. dry-run global e ST/CSOSN 500 ainda abertos (fora do escopo).

---

## 43. Follow-ups (não implementados)

| ID | Descrição |
|---|---|
| **R-1** | Migrar futuramente resíduos legados de `metadata.fiscal.tributacao` (ou forma histórica equivalente) para `metadata.fiscalRegime`, somente após auditoria de dados e GOAL próprio. |
| **R-2** | Alinhar a exibição de NCM/CEST no Cadastros V2 diretamente a `getProdutoFiscal` em GOAL próprio. |
| **R-3** | Ampliar a UI para os demais campos fiscais somente com definição clara de responsabilidade contábil, origem dos valores, validação, permissões e completude Fiscal. |
| **R-4** | Criar status de completude fiscal antes de qualquer emissão real. |
| **R-5** | Não criar caller produtivo nem transmissão sem GOAL específico. |

---

## 44. Próximo passo

1. Auditoria documental de merge readiness deste fechamento do GOAL-004 (branch/docs).
2. **Não** iniciar GOAL-005 automaticamente.
3. Qualquer nova frente Fiscal exige GOAL próprio e gate humano.

---

## 45. Conclusão

O GOAL `FISCAL-PRODUTO-UPSERT-PARITY-004` está **FECHADO** no plano documental:

- implementação integrada na `main` via PR #8 (merge commit `b307337`);
- `upsertProduto` grava `metadata.fiscal` canônica com o contrato existente;
- `fiscalRegime` classificado e isolado como compatibilidade visual;
- create/update/parcial não destrutivos; Barcode/Cosmos com revisão humana;
- N3 no eixo; N6=0; N7=0; gates globais inalterados; signer dormente; emissão/SEFAZ/homologação/
  produção **não** abertas;
- GOAL-005 **não** iniciado.

**Cadastro fiscal canônico ≠ regra tributária ≠ montagem de XML ≠ assinatura ≠ transmissão ≠
homologação ≠ produção.**
