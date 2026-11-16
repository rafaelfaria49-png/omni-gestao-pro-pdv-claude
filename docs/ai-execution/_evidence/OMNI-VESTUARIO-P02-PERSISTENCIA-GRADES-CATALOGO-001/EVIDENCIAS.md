# OMNI-VESTUARIO-P02-PERSISTENCIA-GRADES-CATALOGO-001 — evidências

Base `cdce14a3d049e1977ecd295a4b0d15c501dc995e` (main com P01/#357). Execução 15/11/2026, Windows, PostgreSQL 17
descartável local (data_directory no scratchpad da sessão, porta própria). Dados 100% sintéticos.
`PRODUCTION_WRITES=0` · `PRODUCTION_MIGRATIONS=0` · nenhum banco remoto (Neon/Supabase) foi acessado.

## Migration (`ensaio-migration.sh` → `ENSAIO_MIGRATION.txt`) — PASS

1. Banco vazio com schema da main + 27 migrations registradas → P02 aplicada pelo `prisma migrate deploy`.
2. Banco com legado (2.001 produtos, 400 com `metadata` livre/`gradePlanejada`) → checksum de id/sku/barcode/nome/
   saldo/preço/metadata **igual** antes e depois; 0 produtos com grade e 0 variantes criados (sem backfill).
3. Reaplicação: `migrate deploy` = "No pending migrations"; seção fora do Prisma reexecuta sem erro (idempotente).
4. Drift banco × `schema.prisma`: zero.
5. 20 recusas no banco (combinação duplicada, SKU duplicado, SKU × produto legado com caixa/espaço diferentes,
   código interno × SKU de outra variante, produto legado novo/editado com código de variante, SKU não normalizado,
   cor/tamanho/grade/produto de outra loja, trocar cor da variante, trocar grade do produto, excluir variante, excluir
   cor/tamanho usados, renomear tamanho usado, excluir pai com grade, HEX inválido, preço negativo) e 4 aceites
   (tamanho não usado editável, cor usada renomeável, edição legada comum, mesmo SKU em outra loja).
6. Rollback operacional: recusado com dados; sem dados remove tudo e preserva produtos; reaplicação posterior OK.

## Testes

| Suíte | Resultado |
|---|---|
| Integração PG real `lib/vestuario/catalog-service.integration.test.ts` | 19/19 — 2× isolada e 6× junto das demais suítes (5 verdes; 1 falha única no teste de `lock_timeout`, na primeira execução após a mudança, não reproduzida nas 7 seguintes — registrada como observação de timing a acompanhar no CI) |
| Unitários + regressões (vestuario, writer de produto, create-tx, ledger de estoque, writers de venda V1/V2, acesso de cadastros) | 397/397 |
| E2E autenticado (`scripts/vestuario/run-vestuario-p02-e2e.mjs`: `next start` do build de produção, NextAuth real, PG descartável) | 3/3 — `e2e/isolation.json` |
| `npm run typecheck` | 0 erros |
| `npm run build` | Compiled successfully; `MIGRATION_SKIPPED` |
| ESLint do escopo | 0 problemas |

Cenários da integração: grades adulto/jeans/calçados 33–45/infantil e cores por loja; duplicidade normalizada sem
bloquear nomes distintos; camiseta P/M/G/GG × Preto/Branco/Azul só com as combinações escolhidas (rascunho, sem
código fabricado, estoque 0, auditoria); grade numérica; cor editada preservando identidade; tamanho usado não
renomeável e desativado bloqueando variação nova; SKU/código interno duplicados nos três sentidos (inclusive
writer canônico legado → `DUPLICATE`); duas lojas e todas as tentativas cross-store; variante inexistente; payload
com `storeId`; exclusões barradas; legado com metadata livre/`gradePlanejada` intacto; P01 (venda com variante,
estoque do pai e da variante e editor legado recusados; nenhum ledger/saldo/depósito); edição do pai com concorrência
otimista; concorrência real (mesmo SKU em dois cadastros simultâneos, variação × produto simples, versão da variante);
lock compartilhado (legado × legado em paralelo, variação espera e enxerga colisão); `lock_timeout` → CONFLICT em ~3 s;
SKU do pai (trigger real na mesma sessão) e colisões; limite INT4 do preço; campo longo; grade desativada.

E2E: grades e reordenação, cores (criar/renomear/duplicidade), matriz com 10 de 12 combinações, SKU de variação,
colisão com SKU legado recusada sem gravar, desativação sem apagar, tamanho em uso bloqueado, modalidade simples ×
grade no Cadastro de Produtos, P01 na UI legada (estoque recusado), troca de loja sem vazamento, loja fora da
allowlist sem aba, usuário só da loja B, mobile 390 px sem rolagem horizontal. Capturas em `e2e/`.

## Finalização do CI (GOAL OMNI-VESTUARIO-P02-CI-FINALIZACAO-002)

- **Causa raiz** dos 3 workflows vermelhos (Ramos e Cadastros, Cliente Assistido, Plataforma Piloto): todos rodam
  `lib/cadastros/business-catalog.component.test.ts`, que renderiza o `CadastrosHub` mockando cada Server Action
  usada por ele. A P02 adicionou `@/app/actions/vestuario-catalogo` ao HUB sem mock no teste; o Vitest executou o
  módulo real → `auth` → `next-auth/lib/env.js` → `import "next/server"` (não resolvível em ESM puro no Node).
  Não afeta o app: no Next o `"use server"` vira referência (E2E de build passou).
- **Baseline**: na main `cdce14a` o mesmo arquivo passa 42/42; na P02 antes da correção, falha ao carregar.
  Reproduzido localmente com a mesma mensagem.
- **Correção**: mock da nova action no padrão das demais + 2 casos novos (aba ausente com catálogo off; aba presente
  e status pedido para a loja ativa quando on) → 44/44. Nenhum teste desativado, nenhuma regra de auth alterada.
  No servidor, a flag é avaliada antes de sessão/assinatura/banco: com catálogo off o status não faz nenhuma consulta.
- **Listas completas dos 3 workflows** (Node 22, o mais próximo do Node 24 do CI disponível; Node 26 local quebra
  `localStorage` do jsdom em testes alheios à P02): 825/825, 1435/1435 (+43 skipped do próprio workflow), 181/181.
  `eslint .` do workflow de Cliente Assistido: 0 erros.
- **Benchmark** (`bench-indice-trigger.sh`, 300 mil produtos sintéticos, fsync ligado): índice `(id, storeId)` em
  0,27–0,52 s, SELECT concorrente não bloqueia, UPDATE espera o índice; 2.000 inserts legados com SKU 122–213 ms antes
  × 148–234 ms depois (loja sem variações) e 305–368 ms em loja com 500 variações; UPDATE de preço não aciona trigger.
  Achado e corrigido: o trigger de colisão do lado da variação era por linha e varria a loja a cada linha
  (500 variações = 2,1 s numa loja de 6 mil produtos); agora é **por instrução**: 0,21 s (6 mil) e 0,24 s (50 mil).
  Uma primeira versão por instrução com JOIN ficou 22 s (laço aninhado no plano do PL/pgSQL) e foi descartada.
- **Concorrência**: integração 10/10 seguidas com CPU disputada (total histórico: 1 falha única em 25 execuções,
  não reproduzida — flake de timing do teste de `lock_timeout`, sem defeito identificado).

## Revisão independente

R1 via Codex (OpenAI) interrompida por limite de uso da conta, sem veredito. Plano B: revisor Claude de contexto
limpo, somente leitura → `APPROVE_WITH_CHANGES`, sem P0/P1. Todos os achados tratados: P2 `lock_timeout` + doc;
reformatação do schema revertida (diff só aditivo, 152 linhas); P3 mensagem do update legado, limite INT4, reload
na UI, `FOR SHARE` contra TOCTOU e grade desativada, campo longo, teste do SKU do pai, limitação dos writers legados
documentada. O E2E encontrou e a branch corrigiu ainda: `instanceof` de erro Prisma falhando no bundle do Next e
"em uso" desatualizado na seção de grades.

## Revalidação da PR #358 — main atual e regressões comprovadas

Base original `cdce14a3d049e1977ecd295a4b0d15c501dc995e`; head recebido
`5a90f0e053c3e70ae331e8a270012ed911eb3fe5`. Main revalidada
`4dec9bb3a477baaf60823aaba7adab1c836debe2` incorporada à mesma branch por
`e3b75a9213243dfce62d36001e4012ec9760adc1`, sem conflito, rebase ou force push.
As mudanças de sessão, troca de loja e desktop da main foram preservadas.

### Três falhas de CI históricas

As falhas eram do head `012f76b2d8d2434361080da7d075a231a1335954`, nos runs
[Plataforma](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/43731332497),
[Ramos](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/43731332589) e
[Cliente assistido](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/43731332635).
Todas falhavam ao carregar o mesmo teste do HUB, via action não mockada → auth → next-auth/lib/env.js →
next/server. Classificação: **regressão de isolamento do teste introduzida pela P02**, já corrigida no head
recebido. Não foi corrigida substituindo auth/Next em runtime, alterando dependências ou apagando testes.

Reprodução nova em três worktrees, mesmas dependências e Node **24.22.3** (major do CI): base exata **42/42**;
head com falha **0 testes coletados, erro de importação idêntico**; head corrigido **44/44**. Os seis workflows
do head recebido já estavam verdes; isso não substitui a validação do novo head integrado/corrigido.

### Achados adicionais reproduzidos e corrigidos nesta revalidação

| Achado | Antes da correção | Proteção nova |
|---|---|---|
| Exclusão de produto simples V1 | `deleteProduto` recusava metadata válida `mode:SIMPLES` como se fosse grade. | Usa o guard P01 `productVariantIssue`; simples/free metadata continuam excluíveis conforme permissões/vínculos. |
| Desativação concorrente da grade | Com a outra transação desativando a grade, criação confirmava produto sobre leitura MVCC antiga. | `FOR SHARE` na grade em criação/adição, timeout 3 s, CONFLICT e rollback sem produto parcial. |
| Troca de ID da variante por SQL | UPDATE simultâneo de `id` e `sku` passava, inclusive usando SKU de produto simples. | Trigger de identidade também compara ID, antes do check de colisão por instrução. |
| Preparador de banco destrutivo | Aceitava outro nome/protocolo/schema só por ter host loopback. | URL restrita, identidade/papel/servidor recente, banco vazio e scratchpad fora de CI; CLI sem shell. |

As regressões foram executadas antes das correções: **1 falha de exclusão**, **2 falhas PG reais** e
**4 recusas de URL ausentes**. Dados eram inteiramente sintéticos e o PostgreSQL foi iniciado em diretório
scratchpad próprio, porta 55469; nenhum banco existente foi reutilizado. O erro inicial de conexão no sandbox
padrão foi de acesso ao loopback, não de domínio; a execução autorizada no PG descartável confirmou os defeitos.

Após correção: **22/22 integrações PG**, **8/8 guards sem conexão**, **1.790/1.790 regressões em 106 arquivos**,
typecheck completo sem erros e lint completo em **3.686 arquivos, 0 erros e 68 avisos**. Testes PG também
comprovam que o preparador recusa banco populado sem apagar seus registros. A migration P02 revisada foi
ensaiada em banco novo, com baseline da main atual e **drift zero**; nenhuma migration histórica foi alterada.

Build local, E2E autenticado e CI do head final são gates adicionais da decisão de prontidão, com resultados
no relatório final da execução e nos [checks da própria PR #358](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/358/checks).
A revisão independente desta revalidação encontrou os quatro P2 acima; suas correções foram revisadas novamente.
Contratos P01 (`contracts`, `guard-contract`, `money`, `sale-policy`) permanecem idênticos à base P01;
estoque/venda de variantes continuam false. A P03 foi preparada apenas em
`docs/vestuario/P03_PROPOSTA_CODIGOS_ETIQUETAS.md`, sem implementação.

Limitação P3 documentada: atalhos/topo do HUB ainda abrem o editor simples legado; a escolha de modalidade
fica no Novo da lista e a criação com grade na aba dedicada. Não altera venda/estoque nem bloqueia o QA do
catálogo; uniformizar esses caminhos requer uma decisão de UX própria. O benchmark anterior é histórico,
não uma medição nova desta revalidação. O novo lock de grade adiciona duas consultas curtas por criação/adição
de catálogo, sem consulta adicional no writer de produto simples ou no PDV.

**PRODUCTION_WRITES=0 · PRODUCTION_MIGRATIONS=0 · PR_MERGE_EXECUTED=NO · DEPLOYMENT_EXECUTED=NO.**
