# A6 — revisão local da barreira CHECK opcional

GOAL: `ESTOQUE-KG-PRODUCTION-A6-GUARD-REVIEW-001`. Data: 2026-10-29.

Parecer técnico: **APPROVE para aplicação futura**, condicionado à autorização específica da janela e aos controles abaixo. Este parecer se refere exclusivamente ao arquivo corrigido identificado pelo SHA-256. Não autoriza SQL produtivo, migration, alteração de permissões ou Vercel. O corte de CONNECT e o encerramento de todas as sessões antigas continuam obrigatórios.

## Identidade e integridade

| Artefato | Identificação |
| --- | --- |
| Worktree examinada | `.worktrees/estoque-manual-kg-001`, branch `claude/estoque-manual-kg-001` |
| HEAD preservado | `104d768d7b7497fe34e2872f4253c4fd97feb5bb` |
| Script original, ainda no HEAD | `a407ff7f568df94e26129c1990cfe4b35f6384aa532d7da3450d70ae38db1b27` |
| Script 07 corrigido e testado | `dea40868a5458e1cceeeae90c9db5ff91a7e291432326269fca932fca5d51935`, 4996 bytes LF |
| Migration original preservada | `f07242c4604660008b645004d3dfafde4da1656e728f803d9009f2f02a06a47e`, 1041 bytes LF |
| Banco dos testes | PostgreSQL **17.10**, cluster criado exclusivamente para A6, `127.0.0.1:54045` |
| Clientes sintéticos Int / Float | Prisma CLI e client package **6.19.3**, engine local existente |

Fontes: [baseline](00-baseline.json), [identidade local](01-local-cluster.json), [diff exclusivo do 07](05-guard-diff.patch), [integridade](05-local-integrity.json), [revisão independente](06-independent-review.md), [decisão estruturada](07-decision.json).

O único arquivo previamente rastreado alterado pelo A6 é [07-guard-check-opcional.sql](../../../../padaria/pesagem/rollout/07-guard-check-opcional.sql). Os demais 6040 arquivos rastreados e as 164 evidências anteriores mantêm os bytes do baseline. O índice continua vazio; não houve commit. Os WIPs A5, o runbook, a remediação, o checklist e o código funcional permanecem preservados. A5 permanece como registro do seu corte; a decisão técnica posterior do A6 está neste diretório.

A referência local de main permanece `aaab275`. A reconciliação da PR #315 com a main atual e o CI do head final continuam pendentes. A aprovação deste hash local não aprova merge nem antecipa esses gates.

## Defeito encontrado e correção

O CHECK original comparava `round(v::numeric, 3) = v::numeric`. A conversão de `float8` para `numeric` pode perder dígitos antes da comparação. Foram aceitos indevidamente `0.30000000000000004`, `1.0000000000000002` e `999999999999998.5` nas cinco colunas: **15 contraexemplos físicos**, registrados em [02-original-counterexamples.json](02-original-counterexamples.json).

A expressão corrigida compara o resultado novamente ao **float8 original**:

```sql
v <> 'NaN'::float8
AND abs(v) <= 999999999999999
AND round(v::numeric, 3)::float8 = v
```

O `round` participa da validação; não altera a linha. O limite global mantém os inteiros canônicos de UN/G até `999999999999999` e os valores canônicos de KG em milésimos até `999999999999.999`, inclusive negativos. Valores intermediários de ponto flutuante que não são canônicos podem ser rejeitados. Não se trata de uma validação decimal genérica para qualquer magnitude de float8.

Foram acrescentados: precondição das cinco colunas `float8 NOT NULL`, qualificação `public`, `search_path` restrito, `lock_timeout=5s`, `statement_timeout=60s` e instruções explícitas de transação, falha, locks e limites de proteção. As três validações do livro foram agrupadas no mesmo `ALTER TABLE`. A migration original não foi editada.

## Resultado das provas

[03-proof-04.json](03-proof-04.json): **235 verificações PASS**. [04-scale-edge-proof-01.json](04-scale-edge-proof-01.json): **161 verificações PASS**. Os dois relatórios comprovam o mesmo hash corrigido. Harnesses: [sandbox](harness/sandbox.cjs), [schema antigo sintético](harness/fixture-old.sql), [contraexemplos do original](harness/probe-original.cjs), [suíte principal](harness/run-proof.cjs), [suplemento](harness/scale-edge-proof.cjs) e [integridade](harness/verify-artifacts.cjs).

| Prova | Resultado observado |
| --- | --- |
| Schema antigo → migration KG original | Cinco colunas `integer` tornam-se `double precision NOT NULL`; extremos int4 e dados sintéticos preservados |
| UN e KG válidos antes/depois do 07 | Inserts/movimentações sintéticos, valores negativos, zero, milésimos, limites KG/UN e inteiros além de int4 aceitos |
| Matriz física das cinco colunas | 16 valores válidos e 16 inválidos em cada coluna; inválidos exigem SQLSTATE `23514`, constraint exata e dados inalterados |
| Valores inválidos | NaN, ±Infinity, excesso de magnitude, quatro casas, frações de ULP e subnormais rejeitados |
| NULL | Rejeitado com `23502` pelo NOT NULL; schema nullable rejeitado pela precondição do 07 |
| Varredura de canônicos | 220003 valores KG e 20002 inteiros UN, sem rejeição |
| Escala sintética | 100000 linhas adicionais por tabela, total 300000; cinco CHECKs validados, dados inalterados, 627 ms neste ambiente |
| Vizinhos ULP | 136 vetores confrontados com o helper real `toStockUnits`; 8 fora do teto específico KG excluídos explicitamente; aceitações/rejeições coerentes |
| Formatação de float8 | `extra_float_digits` -15, 0, 1 e 3 não alteraram os resultados dos casos canônico/inválido |
| Transação KG representativa | Entradas 2500/750, saída -125 e estorno 125 milésimos; cada delta/antes/depois confere; saldo final 3250 e venda sintética de 125 milésimos |
| Erro posterior no livro | Rollback integral da venda sintética, produto, depósito e livro |
| Aplicação repetida | Falha por nomes duplicados, sem alteração; não há DROP automático |
| Schema antigo/nullable | Precondição falha com `P0001`; nenhuma instalação parcial |
| Corrupção preexistente em cada coluna | VALIDATE falha com `23514`, todos os DDLs revertidos; correção exclusivamente sintética permite reaplicação |
| Contenção de lock | Falha `55P03` em aproximadamente 5,24 s; constraints anteriores revertidas, dados preservados |
| Locks da transação | ACCESS EXCLUSIVE nas três tabelas até o rollback; role e timeouts locais restaurados |
| Falha/statement timeout | `57014` provoca rollback integral; nova tentativa local funciona |
| Remoção e recuperação local | Cinco CHECKs removidos/reaplicados; dados e cinco tipos físicos NOT NULL preservados |
| Compatibilidade Prisma | `migrate diff` no schema sintético equivalente não detecta diferença; catálogo comprova separadamente os cinco CHECKs validados |

Os 627 ms não estimam a duração produtiva. O teste de escala usou 50000 valores KG e 50000 UN estratificados, repetidos nas três tabelas. O schema descartável é um recorte sintético das três tabelas e das cinco colunas reais; `a6_sales` é uma tabela de prova, não o modelo produtivo de venda. A feature paralela de venda manual por KG não foi inspecionada nem certificada por este ensaio.

### Prisma antigo e novo: alcance real

No cliente Int antigo testado, SETs não zero em produto, depósito e livro foram bloqueados com `23514`. A transação de venda sintética foi revertida. **Zero foi aceito. Increment e decrement a partir de saldo 13 retornaram sucesso e deixaram o saldo 13.** Um incremento a partir de zero produziu um valor subnormal e foi bloqueado. Não se pode generalizar os SETs bloqueados para todas as operações/clientes antigos: um valor recebido canônico ou sem alteração perceptível pode passar.

O cliente Float aceitou os valores canônicos testados. O driver normalizou o input JavaScript `0.30000000000000004` para o valor recebido/armazenado `0.3` e `1.0000000000000002` para `1`. Os bits de `float8send` e do parâmetro recebido confirmam isso em [03-prisma-float-diagnostic.json](03-prisma-float-diagnostic.json). Literais SQL com os bits originais são bloqueados; `0.0005` também foi bloqueado pelo cliente Float. **O CHECK só vê o valor que chega ao banco.** O boundary real rejeita esses inputs JavaScript inválidos antes do driver e continua obrigatório.

O CHECK escalar não contém a unidade do produto: aceita uma fração canônica em um produto UN e um KG acima do teto específico KG, se dentro do teto global. Os dois bypasses foram reproduzidos e o helper real os rejeitou. O CHECK também não impõe invariantes entre tabelas nem regras de pagamento, venda ou saldo. Não adicionamos consultas a outras tabelas ou funções mutáveis ao CHECK.

## Condições da decisão e recuperação

1. Aplicação produtiva exige autorização específica da janela. Os cinco campos ainda precisam estar em Float pela migration original, com NOT NULL e a transferência de posse concluída. Acesso de proprietário do migrator em produção não foi exercitado por este A6; o role `omni_owner` dos testes existe apenas no cluster descartável.
2. O freeze, o corte de CONNECT e o encerramento das sessões antigas são obrigatórios. Após a migration, jamais liberar um cliente Prisma Int para escrever nas colunas Float, mesmo com os CHECKs presentes.
3. Conferir a identidade do banco na mesma sessão e executar com **`psql -X -v ON_ERROR_STOP=1 -1`**. A transação única é condição da aprovação. Sem ela os `SET LOCAL` não oferecem o procedimento testado e pode ocorrer instalação parcial.
4. ADD CHECK adquire ACCESS EXCLUSIVE. A transação mantém esses locks até COMMIT, inclusive durante VALIDATE; NOT VALID não encurta essa retenção neste procedimento. São três tabelas bloqueadas. `statement_timeout=60s` vale por comando, não como limite total da janela. Tempo e impacto precisam ser avaliados na janela autorizada.
5. Falha de validação, precondição, nome duplicado, lock ou comando exige parada e diagnóstico. Os testes com a transação exigida comprovaram rollback de todos os DDLs, sem correção automática de dados. Nomes duplicados não podem ser contornados por DROP automático.
6. Remover os cinco CHECKs exige decisão própria. Isso não reverte a migration, não restaura tipos Int e não libera CONNECT. O ponto de não retorno operacional da migration e o procedimento de recuperação A5 permanecem válidos.
7. A aprovação é desta barreira adicional e deste hash local, com as limitações declaradas. Não substitui boundary canônico, aritmética em unidades mínimas e transação atômica. A integração completa da futura venda manual por KG continua sob os testes próprios daquela entrega.

### Rastreabilidade e limites do ensaio

As tentativas [01](03-proof-01.json), [02](03-proof-02.json) e [03](03-proof-03.json) foram preservadas. Foram corrigidas expectativas/instrumentação do harness: endereço inet com CIDR, SQLSTATE contido na mensagem de erro Prisma e a hipótese excessiva de que todo input JS de precisão inválida chegaria intacto ao banco. O script SQL corrigido manteve o mesmo hash nas quatro rodadas. O campo `direct_sql_state` incompleto do diagnóstico de float não serve como prova de SQLSTATE; a matriz completa da rodada 04 contém os `23514` efetivos. A rodada 04 e o suplemento são as provas conclusivas.

Cada conexão é fixada em loopback, com database `a6_*`, usuário sintético, porta, versão 17, diretório do cluster e ausência de `neon.project_id` conferidos. O harness elimina variáveis PG/Prisma/URLs herdadas dos processos filhos e não lê `.env` da aplicação. Os dois clientes gerados ficaram no `.scratch` ignorado deste A6. Nenhum client padrão da aplicação foi gerado. O cluster próprio foi parado ao fim das provas; não há serviço de teste deixado em execução por este GOAL.

Comandos finais efetivamente executados localmente:

```text
node .../harness/run-proof.cjs 04
node .../harness/scale-edge-proof.cjs 04 01
node .../harness/verify-artifacts.cjs
git diff --check
```

Os `...` representam este diretório de evidências. Os comandos descrevem a execução já realizada; as proteções de nomes recusam sobrescrever bancos/relatórios da mesma rodada.

### Referências técnicas primárias

As regras de NULL em CHECK e a necessidade de NOT NULL constam da [documentação PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-constraints.html). Locks, ADD/VALIDATE e agrupamento de alterações estão descritos em [ALTER TABLE](https://www.postgresql.org/docs/17/sql-altertable.html) e [explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html). A conversão float8→numeric pode ser conferida no [código do PostgreSQL 17](https://raw.githubusercontent.com/postgres/postgres/REL_17_STABLE/src/backend/utils/adt/numeric.c); a correção é sustentada também pelos contraexemplos físicos. As condições `-1`/`ON_ERROR_STOP` seguem o [manual psql](https://www.postgresql.org/docs/17/app-psql.html).

PRODUCTION_CHANGES=0; SCHEMA_MIGRATIONS_PRODUCTION=0; VERCEL_CHANGES=0; MERGE=NO; PUSH=NO. Nenhuma consulta a `cron.job`. Sem commit. Próximo gate: **A7, mediante autorização separada**.
