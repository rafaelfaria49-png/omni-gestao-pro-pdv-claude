# Runbook — rollout da migration de estoque fracionado (KG)

**Rollout: NO-GO operacional. A1, A1.1, A2, A3 e A4: PASS.** Os papéis e GRANTs do A3 já foram
alterados em produção; a migration KG e a transferência de posse não foram executadas.
As cinco colunas continuam `integer`, segundo a última evidência direta do A4.

**A5 é a preparação documental desta revisão** (`ESTOQUE-KG-PRODUCTION-A5-RUNBOOK-001`): consolidar e
validar localmente o texto. A conclusão documental consta do relatório A5; não libera a janela.
**A6–A8, J0–J13 e os passos pós-janela não estão autorizados por este GOAL.** Os comandos abaixo são
procedimentos futuros, condicionados a autorização específica e aos respectivos gates.
Nenhuma conexão ao Neon ou à Vercel, inclusive só leitura, integra este A5.

Esta é a sequência canônica; a [remediação](ESTOQUE_MANUAL_KG_ROLLOUT_REMEDIACAO.md) explica a estratégia B,
e o [checklist das lojas](ESTOQUE_MANUAL_KG_CHECKLIST_LOJAS.md) registra o gate operacional do J0.
`MIGRATION_AUTHORITY_ENABLED=false` é requisito do rollout: os builds Vercel não devem aplicar migrations.
As evidências históricas de build registram `MIGRATION_SKIPPED`; o valor Production é `sensitive` e não foi
relido no A4 nem neste A5. Não presumir leitura direta desse valor a partir dos logs.

| Item | Valor |
| --- | --- |
| Migration | `prisma/migrations/20261025120000_estoque_quantidade_fracionada/migration.sql` |
| sha256 (LF, 1041 bytes) | `f07242c4604660008b645004d3dfafde4da1656e728f803d9009f2f02a06a47e` |
| Efeito | `estoque_produtos.stock`, `produto_depositos.quantidade`, `movimentacoes_estoque.quantidade/estoqueAntes/estoqueDepois`: `integer` → `double precision`. Sem UPDATE/backfill. |
| Lock | `ALTER COLUMN TYPE` reescreve as 3 tabelas sob `ACCESS EXCLUSIVE` |
| Trava de escrita | `STOCK_WRITES_FROZEN=true` (env): o boundary lança antes de travar a linha; venda responde 5xx e fica na fila do PDV com reenvio automático. **Só existe no código desta PR** — não protege deployment, preview ou script antigo |
| Isolamento dos escritores antigos | **Estratégia B**: Production passa a usar o papel `omni_runtime_v2`; na janela o papel antigo (`neondb_owner`) perde `CONNECT` em `omnigestao_prod` e tem as sessões encerradas. Scripts em `rollout/` |
| Ponto de não-retorno | **COMMIT de `estoque-kg-migration-apply.sql` (J8)** — ver §5 |

## 0. Estado reconciliado e limites das evidências

Retrato documental de **2026-10-29**, baseado nos registros locais abaixo, sem nova leitura dos serviços.
Os diretórios de evidência, inclusive os não commitados, são históricos e devem ser preservados.

| Etapa | Resultado registrado | Evidência local |
| --- | --- | --- |
| A1 | PASS: identidade Production, cinco colunas `integer`, KG ausente, 23 migrations finalizadas; drift conhecido da 0019, sem drift novo naquele retrato | [baseline A1](../../ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/a1-production-baseline-006/README.md) |
| A1.1 | PASS: conferência do fechamento da sessão antiga da `loja-5`, realizado pelo proprietário; lojas comerciais identificadas por `storeId` | [A1.1](../../ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/a1-1-loja5-fechamento-007/README.md) |
| A2 | PASS: credenciais geradas offline fora do repositório, validação 30/30; não regenerar nem rotacionar | [A2, fase 1](../../ai-execution/_evidence/PADARIA-GO-LIVE-FASTTRACK-002/README.md#fase-1--a2-credenciais-offline) |
| A3 | PASS: `01-papeis.sql` e `02-grants-runtime.sql` executados; `KG_PAPEIS_OK`, `KG_RUNTIME_GRANTS_OK`, DML em 110/110 tabelas | [A3](../../ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/a3-production-roles-grants-008/README.md) |
| A4 | PASS: runtime direto e pooled; migrator direto; isolamento por catálogo; sete transações READ ONLY terminadas em ROLLBACK | [A4 consolidado](../../ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/a4-production-login-readonly-009/12-final-summary.json), [método e limites](../../ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/a4-production-login-readonly-009/README.md) |
| A5 | Preparação documental desta revisão, com validação e encerramento exclusivamente locais | [registro A5](../../ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/a5-runbook-consolidation-010/README.md) |

**Identidade obrigatória nas futuras conexões autorizadas:**

| Item | Valor |
| --- | --- |
| Projeto Neon | `dry-mouse-36002471` |
| Branch Production | `br-muddy-meadow-ac7ah2wl` |
| Database | `omnigestao_prod` |
| Endpoint | `ep-summer-tooth-acltc6wi` |
| Host direto | `ep-summer-tooth-acltc6wi.sa-east-1.aws.neon.tech` |
| Host pooled | `ep-summer-tooth-acltc6wi-pooler.sa-east-1.aws.neon.tech` |

As consultas do A4 confirmaram os identificadores no servidor, os usuários autenticados e o modo READ ONLY.
`omni_owner` existe e é NOLOGIN; `omni_runtime_v2` e `omni_migrator` existem e autenticam. Runtime tem somente
os privilégios planejados nas tabelas e nenhum alcance a papéis privilegiados. O migrator herda e pode assumir
`omni_owner`, sem ADMIN OPTION, mas **ainda não possui acesso de proprietário aos objetos**: `omni_owner`
possui zero relações em `public`, e o migrator ainda não tem SELECT/UPDATE na tabela de estoque. Isso é esperado
antes do `03` no J6. **Nenhuma capacidade de migration foi efetivamente exercitada em Production no A4.**

O A3 alterou papéis e ACLs, não tabelas, colunas, saldos ou vendas. O A4 confirmou por leitura a preservação
da estrutura e das linhas verificadas de estoque, vendas, caixa e histórico Prisma. As cinco colunas continuam
`integer` e a migration KG continua ausente. Não confundir esses fatos com a afirmação incorreta de que
"nada foi executado em produção": os scripts 01 e 02 já foram executados no A3.

**Evidência direta versus continuidade da configuração Vercel:** o login do papel antigo, direto e pooled,
e seus privilégios no banco foram comprovados diretamente no A4. Já a continuidade de Production com
`neondb_owner` é **inferência de continuidade**, apoiada no estado confirmado/A3, nas datas de 27 de julho
das duas variáveis Production e no deployment preservado no A4 (`7UqN8Rrkz9Vi7ezB3ArkL6TDcvvW`, `ba010ac`).
A API CLI retornou 403 (`invalidToken=true`); a sessão autenticada do navegador permitiu comparar 18 metadados
observados antes/depois. Os valores `sensitive` não foram relidos, e esse recorte não é um inventário integral.
Este A5 não atualiza esse retrato nem autoriza renovar o token.

**Caixas:** A1/A1.1 registraram a `loja-2` aberta naquele momento. O relato específico mais recente é o A3
(2026-10-29 09:39Z): **`loja-1` RafaCell aberta; `loja-2` Rafa Brinquedos fechada**. Isso não é estado atual
reconfirmado. Reconsultar todas as sessões por `storeId` somente no preflight da janela expressamente autorizada;
nenhuma sessão ABERTA pode permanecer antes da abertura do J0.

**Git e CI:** head de referência da #315 = `104d768`, CI verde informado, sem merge. A referência local
`origin/main` já está em **`aaab275`**, merge da #321; não foi feito fetch neste A5. Antes de J3/J4 será necessária
reconciliação da #315 com a main então atual, revisão do resultado e **nova CI verde do head final exato**,
incluindo a documentação que vier a ser commitada. A aprovação/CI dos heads anteriores não substitui esse gate.
`MAIN_RECONCILIATION=PENDING`; este A5 não faz merge, rebase, push ou alteração funcional.

**Pendência de escritores auxiliares:** o A1 identificou o scheduler pg_cron no database auxiliar `postgres`.
A leitura de `cron.job` continua pendente de **autorização específica para esse database**. Não foi feita no A4
nem neste A5; autorização de outro passo não amplia automaticamente o alvo. Identificar papel, destino e alcance
dos jobs antes de liberar a janela, pois podem representar escritores fora do inventário HTTP.

### 0.1 Atualização 2026-11-08 — main `ce9228c`, migrations de outras frentes e V1 (somente leitura)

GOAL `PADARIA-KG-STACK-MAIN-RECONCILIATION-V1-CLOSURE-001`. Leitura RO autorizada (`BEGIN READ ONLY` +
`default_transaction_read_only=on`, identidade travada no host direto). Registro:
`docs/ai-execution/_evidence/PADARIA-KG-STACK-MAIN-RECONCILIATION-V1-CLOSURE-001/` (na #337).

| Item | Retrato 2026-11-08 ~06:07Z |
| --- | --- |
| Production servida | `omni-gestao-pro.vercel.app` → `dpl_GhyK8LebaGHAUjVBB5F4aT89gf8L` = main **`ce9228c`**, build `MIGRATION_SKIPPED` + `PROXY_PRISMA_ARTIFACT_VERIFIED` |
| `_prisma_migrations` | **24** finalizadas, 0 falhas; última = `20261107120000_catalogo_aparelhos_loja` (checksum `57b39143…`), aplicada **fora do build** às 05:46:22Z pela frente do catálogo (#339/#340), não pelo KG |
| Migrations KG | `20261025`, `20261029`, `20261106`: **ausentes**; 5 colunas `integer`; 0 funções/gatilhos `manual_kg_*`; 0 CHECKs do `07` |
| Caixa | **1** sessão `ABERTA` (desde 2026-11-07 20:57Z); não identificada por loja nesta leitura — o J0 continua exigindo zero |
| A7b | `pg_cron` está em `shared_preload_libraries` (plataforma Neon), mas a extensão **não está criada** em nenhum dos 4 databases (`neondb`, `omnigestao_prod`, `omnigestao_prod_candidate`, `postgres`): `cron.job` inexistente → nenhum escritor agendado. Reconfirmar no J0 |

**Gate MIG-X (dependência de migrations de outras frentes) — obrigatório antes do J4, do J8 e do 9b:**

1. Do checkout do head exato da #315 a mergear, `prisma migrate status` contra Production (credencial RO ou
   migrator, sem aplicar nada) deve listar como pendente **exatamente** `20261025120000_estoque_quantidade_fracionada`.
   Do checkout do topo (#337), antes do 9b, **exatamente** `20261029120000` e `20261106120000`.
2. Qualquer outra pendente (migration nova de outra frente que chegou à `main`, ou a `20261107` revertida pelo
   rollback do catálogo) = **NO-GO da janela KG**. A migration de outra frente só entra por rollout próprio,
   autorizado pela frente dona, **antes** da janela — nunca por um `migrate deploy` do KG.
3. O J8 nunca usa `migrate deploy` (script com retrato + `migrate resolve --applied` da `20261025`); o 9b usa
   `migrate deploy` só depois do item 1 confirmar as duas pendentes exatas.
4. Hoje (2026-11-08) o gate está **satisfeito**: a `20261107` já consta em Production, e no checkout reconciliado
   as únicas pendentes contra o retrato são as três KG. A ordem KG × catálogo foi provada indiferente em PG 17
   (KG antes ou depois da `20261107`: `migrate status` em dia, `migrate diff` vazio, objetos disjuntos).
5. `MIGRATION_AUTHORITY_ENABLED` (Production, `sensitive`, atualizada pela última vez em 2026-10-16) não é legível;
   o build de `ce9228c` registrou `MIGRATION_SKIPPED`. O gate do J4 continua: conferir `MIGRATION_SKIPPED` no log
   do build do merge.

## 1. Por que a ordem importa (provado em PG 17 descartável)

| Cliente Prisma × colunas | Leitura | Escrita |
| --- | --- | --- |
| **novo (`Float`) × `integer`** (código antes da migration) | correta | **falha fechada**: erro `22P03 incorrect binary data format`, nada gravado |
| **antigo (`Int`) × `double precision`** (migration antes do código, deployment antigo, preview de outra branch, script da `main`) | inteiros corretos; fração **truncada** (3,96 → 3) | **corrupção silenciosa**: 13 vira `6e-323`, −1 vira `NaN` (`docs/ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/old-client-WRITE-after-migration.txt`); o backfill da `main` zerou todos os depósitos assim (`backfill-main-vs-branch.txt`) |

Logo: **depois da migration, nenhum código anterior a esta PR pode alcançar o banco**. Controle de
acesso (Deployment Protection) não basta: usuário autenticado em URL antiga, aba aberta com
fila de vendas, preview de outra branch ou script local continuariam gravando.

Na topologia legada inventariada, Production, previews antigos/candidate e o admin de migração compartilhavam
**`neondb_owner` e a mesma senha** (só o database mudava); esse papel herda `pg_write_all_data` via `neon_superuser`.
Os previews novos foram isolados em outro projeto/papel; os retratos dos deployments legados mantêm o risco.
Os papéis novos já existem, mas a troca da configuração Production só pertence ao futuro J3. Por isso
nem excluir deployments nem trocar a senha nem tirar posse/GRANT de tabela resolvem; o que corta é
`CONNECT` no database + encerrar as sessões, conferido no catálogo (provado em PG 17 com a mesma
topologia: `docs/ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/rollout-remediation/`).

## 2. Escritores legados e o que os fecha

**Inventário histórico de 2026-10-28 09:37Z**, não contagem atual (`rollout-readiness-004` §2).
Refazer o inventário integral no início da janela autorizada, com horário, IDs, alvo, SHA, URLs e classificação
de credencial/destino, indicando se a evidência é direta ou inferida. A API/token deve estar disponível por meio
previamente autorizado; o recorte UI do A4 não substitui esse inventário.

| Origem | Quantidade | Credencial no retrato | Alcança `omnigestao_prod` |
| --- | ---: | --- | --- |
| Production do `omni-gestao-pro`, READY (2026-10-23 → 2026-10-27, todos `Int`) | **15** | `neondb_owner@omnigestao_prod` | **sim, pelo código** |
| Previews do `omni-gestao-pro` criados antes da P3 (2026-10-27 22:05Z) | **56** | `neondb_owner@omnigestao_prod_candidate`, mesmo endpoint e mesma senha | o código vai ao candidate; **a credencial abre produção** |
| Previews criados depois da P3 | 3 | `preview_runtime@omnigestao_preview` (outro projeto Neon) | não |
| `neon-production.env` (`NEON_PROD_*`), `neon-migration.env`, `.env` da raiz, `NEON_PREVIEW_*` | — | `neondb_owner` em `omnigestao_prod`, `neondb`, candidate | sim, pela credencial |
| `omni-gestao` (3 Production Supabase, 57 previews sem banco) | — | fora do Neon | não |

**Não contar com expiração automática como proteção ou gate.** No retrato de 2026-10-28 a política declarada era
`expirationDays=30`, mas o deployment READY mais antigo do `omni-gestao-pro` é de 2026-08-16 (73 dias em
2026-10-28); a leitura contrária em `rollout-remediation/50-vercel-inventario.md` foi refutada pela auditoria 004.
Os escritores legados que o inventário da janela identificar **só deixam de alcançar `omnigestao_prod` pelo corte efetivo de
conexão** — `04` (REVOKE CONNECT de PUBLIC e do papel antigo) seguido **imediatamente** do `05` (encerrar
sessões), conferido pelo `06` e pela sonda de URL antiga no J7. Exclusão de deployment, Deployment Protection
ou espera não substituem o corte. O acesso dos previews legados ao candidate só termina com a troca de senha (P3).

Caminhos humanos que o corte **não** distingue de código estão no §3 (congelamento).

## 3. Congelamento

Declarado no A8, conferido no J0 e mantido até o fim indicado. Quebra de congelamento durante a janela =
parar no passo em que está e seguir a recuperação da fase (§7).

| O que fica congelado | De | Até | Por quê |
| --- | --- | --- | --- |
| Merge ou push na `main` (qualquer PR, inclusive #318), exceto o merge da #315 no J4, a correção para frente do J4 e o revert do F1 | J0 | J13 | build entre J3 e J4 sai com código `Int` e credencial `omni_runtime_v2`, que **sobrevive ao corte** e corrompe depois do J8 |
| Push em qualquer outra branch (cria preview; havia 4 branches com override de destino ilegível no inventário histórico) | J0 | P2 PASS | preview novo cairia no banco Preview ainda `integer` com cliente `Float` (§6.2) ou num destino desconhecido; atualizar os overrides no inventário autorizado |
| `vercel --prod`, `vercel deploy`/`redeploy` de checkout local, "Redeploy", "Promote", "Instant Rollback" no painel | J0 | J13 (depois do J8, proibição permanente para código anterior à #315 — §5) | rebuild usa as envs atuais: código `Int` + `omni_runtime_v2` |
| Qualquer env da Vercel além de J2, J3 e J11 (inclusive `SALE_SERVER_NUMBERING_ENABLED`, `MIGRATION_AUTHORITY_ENABLED`, overrides de branch) | J0 | J13 | troca de writer duplica venda (`30-fila-pdv.txt`); migration pela Vercel fora do controle |
| Outras sessões de IA (Claude Code/Desktop e worktrees, Codex, Cursor, Antigravity, ChatGPT) e tarefas agendadas | A8 (aviso) / J0 (encerradas) | J13 | qualquer uma com `neon-production.env`, `neon-migration.env`, `.env` da raiz, token da Vercel ou conector age como o operador e o corte não a distingue |
| Conectores com alcance a Neon, Vercel ou GitHub (conector Neon do ChatGPT usado na P1/P2.0; MCPs de qualquer cliente) | J0 | J13 | mesmo motivo; o do ChatGPT pode alcançar a org de produção (`org-spring-butterfly-51302013`) — A7 |
| Scripts locais contra produção: `npm run db:*`, `prisma migrate`/`db push`/`studio`, `scripts/backfill-deposito*.mjs`, `merge-produtos-duplicados.mjs`, `caixa-test.mjs` | J0 | J13 (depois, só desta versão e com credencial nova) | escrevem nas 5 colunas ou no schema; antes do corte com o papel antigo, depois com o código errado |
| Console Neon do projeto de produção (SQL Editor, papéis, reset de senha, dono de database, restore) | J0 | J13 | caminho humano que desfaz o corte (`ADMIN OPTION` do papel antigo); únicas exceções: J1 e a recuperação do §7 |

Durante a janela, o único caminho de escrita autorizado no banco é o operador rodando os scripts deste
runbook. Evidência do congelamento (A8/J0): lista das sessões de IA encerradas, estado dos conectores, horário
do aviso, `vercel ls`/API sem deployment novo desde o J0.

## 4. Sequência com gates

Cada passo só começa com o gate anterior cumprido e registrado (saída integral do script, marcador `KG_*`,
horário). "Se falhar" aponta a fase de recuperação do §7.

### Já cumprido (não repetir)

Registros históricos: R4 APPROVE `cdb1d19`, R5 APPROVE da resolução do merge e CI 11/11 em `2731097`;
ensaio completo num branch Neon de produção (002: 01→05, suspend/start e restart do compute, pooler, `99`,
migration, `07`); Preview fora do cluster de produção (P1–P3 do isolamento) e prova de destino do runtime (P5).
A1–A4 também estão cumpridos (§0). Revisões/CI históricas não aprovam o head que resultar da reconciliação
com `aaab275` ou com a main então atual. O ensaio do `07` não aprova sua aplicação em Production.

### Preflight equivalente ao 06 antes do 01 — referência histórica, não repetir em Production

O `06-verificacao.sql` chama `pg_has_role(..., 'omni_owner', ...)` e falha se o papel ainda não existe.
**Antes do 01, usar a consulta equivalente abaixo, no database `omnigestao_prod`, com o papel antigo**, em
uma execução separada do 01 e somente se houver autorização para esse preflight. Ela procura `omni_owner`
como texto no catálogo; só chama `pg_has_role` por OID quando o papel existe. Não usa cast nem resolução
do nome de um papel ausente. Conferir o marcador de identidade e as demais saídas, não apenas o exit code.

```sql
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SELECT 'KG_PREFLIGHT_IDENTIDADE_OK'
WHERE 1 / CASE WHEN current_setting('neon.project_id', true) = 'dry-mouse-36002471'
  AND current_setting('neon.branch_id', true) = 'br-muddy-meadow-ac7ah2wl'
  AND current_setting('neon.endpoint_id', true) = 'ep-summer-tooth-acltc6wi'
  AND current_database() = 'omnigestao_prod' AND current_user = 'neondb_owner'
  AND current_setting('transaction_read_only') = 'on' AND NOT pg_is_in_recovery()
  THEN 1 ELSE 0 END = 1;
SELECT 'database=' || current_database() || ' dono=' || pg_get_userbyid(datdba)
  || ' acl=' || coalesce(datacl::text, 'NULL')
FROM pg_database WHERE datname = current_database();
SELECT 'papel ' || r.rolname
  || ' connect=' || has_database_privilege(r.oid, current_database(), 'CONNECT')
  || ' escreve_estoque=' || has_table_privilege(r.oid, 'public.estoque_produtos', 'UPDATE')
  || ' pg_write_all_data=' || pg_has_role(r.oid, 'pg_write_all_data', 'USAGE')
  || ' dono_por_heranca=' || CASE WHEN owner_role.oid IS NULL THEN 'PAPEL_AUSENTE'
       ELSE pg_has_role(r.oid, owner_role.oid, 'USAGE')::text END
FROM pg_roles r LEFT JOIN pg_roles owner_role ON owner_role.rolname = 'omni_owner'
WHERE r.rolcanlogin AND NOT r.rolsuper ORDER BY r.rolname;
SELECT 'sessoes papel=' || coalesce(usename, '-') || ' n=' || count(*)
FROM pg_stat_activity WHERE datname = current_database() GROUP BY usename ORDER BY 1;
SELECT 'objetos do papel antigo=' || (
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND pg_get_userbyid(c.relowner) = 'neondb_owner')
  + (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd', 'c') AND t.typrelid = 0
       AND pg_get_userbyid(t.typowner) = 'neondb_owner'));
SELECT 'colunas ' || string_agg(table_name || '.' || column_name || ':' || data_type,
  ' ' ORDER BY table_name, column_name)
FROM information_schema.columns WHERE table_schema = 'public'
  AND (table_name, column_name) IN (('estoque_produtos', 'stock'),
    ('produto_depositos', 'quantidade'), ('movimentacoes_estoque', 'quantidade'),
    ('movimentacoes_estoque', 'estoqueAntes'), ('movimentacoes_estoque', 'estoqueDepois'));
ROLLBACK;
```

Esse caso foi tratado no preflight do A3 por `a3-pre.sql`, sem alterar o 06 oficial. **Na produção atual os
três papéis já existem**: não executar o 01 novamente; sua reexecução não é idempotente. Depois da criação,
o 06 normal volta a ser aplicável. Antes da posse, usar o papel antigo para conferir também as colunas;
o migrator ainda não é proprietário e `information_schema` pode ocultar objetos aos quais ele não tem acesso.
O 06 não contém a trava completa de identidade: o operador deve estabelecê-la na sessão antes das consultas,
como feito no A4. Nenhum SQL deste trecho foi executado no A5.

### Pré-janela (dias antes)

- **A1 — PASS registrado; procedimento de referência para nova leitura autorizada.** Sessão forçada read-only (`BEGIN READ ONLY` /
  `default_transaction_read_only=on`). Confirma o banco canônico (fingerprint do Neon de produção, não o
  candidate), dimensiona o lock, acha dependências e grava a **linha de base do drift** (§6.1):
  ```sql
  SELECT current_setting('neon.project_id'), current_setting('neon.branch_id'),
         current_setting('neon.endpoint_id'), current_database();
  SELECT count(*), sum(stock)::text FROM estoque_produtos;
  SELECT count(*), sum(quantidade)::text FROM produto_depositos;
  SELECT count(*), sum(quantidade)::text, sum("estoqueDepois")::text FROM movimentacoes_estoque;
  SELECT DISTINCT c.relname FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid JOIN pg_class c ON c.oid = r.ev_class
   WHERE d.refobjid IN ('estoque_produtos'::regclass, 'produto_depositos'::regclass, 'movimentacoes_estoque'::regclass);
  SELECT pg_size_pretty(pg_total_relation_size('movimentacoes_estoque'));
  SELECT datacl FROM pg_database WHERE datname = current_database();
  SELECT "storeId", count(*), min("abertaEm") FROM sessoes_caixa WHERE status = 'ABERTA' GROUP BY 1;
  SELECT usename, application_name, state, count(*) FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1, 2, 3;
  ```
  mais `prisma migrate status` e `prisma migrate diff --from-url … --to-schema-datamodel prisma/schema.prisma`
  (schema da #315). **Gate:** fingerprint = projeto de produção; nenhuma view/regra dependente; diff = as 5
  alterações de tipo nas 3 tabelas **+ só** a renomeação do índice da 0019 (§6.1). Qualquer outra linha = drift
  novo → NO-GO até explicar. No A1, as mudanças de default Int(0) → Float(0) de `stock` e de
  `produto_depositos.quantidade` são parte dos mesmos ALTERs de tipo. A1.1 confirmou o fechamento pelo
  proprietário da sessão antiga da `loja-5`; isso não dispensa conferir todas as sessões no J0.
- **A2 — PASS, não regenerar.** Reutilizar as credenciais existentes em
  `C:\Projetos\secrets\neon-production-kg\.env`, fora do repositório. A validação offline foi 30/30:
  `DATABASE_URL` futura = runtime pooled com `pgbouncer=true`; `DIRECT_URL` futura = runtime direto;
  `MIGRATOR_DIRECT_URL` = migrator direto, só local. Endpoint/database/usuário e `sslmode=require`
  conferidos. A aplicação das URLs na Vercel continua pertencendo somente ao J3 autorizado.
- **A3 — PASS, já executado em produção.** `rollout/01-papeis.sql` no `neondb` e
  `rollout/02-grants-runtime.sql` no `omnigestao_prod`; marcadores `KG_PAPEIS_OK` e
  `KG_RUNTIME_GRANTS_OK`; DML em 110/110 tabelas. O preflight anterior ao 01 usou a consulta equivalente
  segura para papel ausente, não o 06 que o resolveria por nome. Após a criação, o 06 foi executado.
  **Não repetir o 01.** Uma eventual reaplicação do 02 por drift de tabelas exige nova autorização.
- **A4 — PASS, sem escrita.** Runtime direto e pooled e migrator direto autenticaram com as credenciais A2;
  sete transações READ ONLY encerradas em ROLLBACK. DML e isolamento comprovados por catálogo, sem tentativas
  de INSERT/UPDATE/DELETE/TRUNCATE. Migrator ainda sem acesso de proprietário aos objetos (§0).
- **A5 — preparação documental deste GOAL.** Consolidar A1–A4 e o hardening 005, revisar comandos,
  dependências, checksum e checklist; validar localmente. A conclusão documental não decide o 07 nem aprova
  J0. A versão adotada na janela e seu SHA devem constar da autorização operacional futura.
- **A6 — PENDENTE, NÃO AUTORIZADO.** Decidir o `07` (CHECK "finito em milésimos") mediante revisão independente
  própria e decisão expressa de aplicar ou de deixar fora. É candidato a barreira adicional contra os casos
  de cliente Int ensaiados; sua existência no repositório e o A5 não aprovam execução nem tornam Int seguro.
- **A7 — PENDENTE, NÃO AUTORIZADO.** Confirmar o alcance de conectores Neon/Vercel/GitHub e sua indisponibilidade
  para outras sessões durante a janela. A leitura pendente de `cron.job` em `postgres` requer autorização
  específica, para mapear também os escritores agendados; não a executar sob autorização implícita do A7.
- **A8 — PENDENTE, NÃO AUTORIZADO.** Marcar a janela e declarar o congelamento do §3, com aviso às pessoas
  e sessões de IA. **Gate do A:** evidências A1–A5 registradas, A6 decidido, A7 confirmado, pendência de cron
  resolvida por autorização própria e reconciliação/CI do head final concluídas antes de J3/J4.

### Janela (lojas fechadas) — J0–J13 NÃO AUTORIZADOS neste A5

- **J0. Abertura.** Antes de declarar o J0, devolver completo o checklist de **`loja-1` RafaCell** e
  **`loja-2` Rafa Brinquedos**, com todos os terminais reais, navegadores/perfis/PWAs, URLs atuais e antigas,
  filas offline, pagamentos em andamento e responsável/hora. A consulta autorizada deve identificar **todas**
  as sessões `ABERTA` por `storeId`/sessão, inclusive lojas de teste; **ABERTA = 0 antes do J0** é obrigatório.
  Pendências devem estar zeradas; exceções preservadas com pedido, itens, pagamentos e `clientSaleId` exigem
  decisão expressa e plano de tratamento antes do J0, sem aprovação automática por este texto.
  Nenhum terminal offline ou de paradeiro desconhecido pode ficar sem conferência. Nenhum pagamento pode
  permanecer em andamento ou sem decisão documentada sobre confirmação. Congelamento do §3 em vigor;
  inventário integral de deployments atualizado **no início da janela** (§2); reconciliação com a main atual
  e nova CI/revisão do head final aprovadas. **Gate falho = a janela não começa.** A fila vive no navegador,
  por origem: uma aba numa URL antiga só reenvia para ela e, após o corte, a venda fica presa ali.
- **J1. Ponto de recuperação:** branch no projeto Neon de produção, nome com data/hora. **Gate:** id do branch e
  LSN anotados.
- **J2. Trava:** `STOCK_WRITES_FROZEN=true` em Production do `omni-gestao-pro` (env é retrato do build: precisa
  existir **antes** do build do J4). **Gate:** env listada. Se falhar: F0.
- **J3. Envs de Production** `DATABASE_URL`/`DIRECT_URL` → `omni_runtime_v2` (via stdin/API, nunca valor em argv).
  **Gate:** envs atualizadas; nenhum deployment criado desde o J0. A partir daqui vale F1.
- **J4. Merge da #315 → build de Production**, na mesma sequência do J3. **Gate:** build READY; log com
  `MIGRATION_SKIPPED` e `PROXY_PRISMA_ARTIFACT_VERIFIED`; **todo** deployment criado depois do J3 é do commit do
  merge (ou posterior) — qualquer outro é removido antes do J6. Build falhou: não seguir; corrigir para frente
  num commit novo sobre o merge (única exceção ao congelamento da `main`, com o mesmo gate do J4) ou F1.
  A reconciliação com `aaab275`/main então atual e a CI do head final são pré-condições, não trabalho a
  improvisar depois da troca de credenciais no J3.
- **J5. Trava no ar:** entrada manual de teste no alias responde "manutenção programada" sem gravar. Vendas de
  abas abertas no domínio canônico recebem 5xx e ficam na fila local. **Gate:** resposta registrada.
- **J6. Corte do papel antigo**, lendo a saída de cada script — exit code não basta (REVOKE de quem não é dono sai
  com WARNING e exit 0):
  - `rollout/03-corte-posse.sql` (papel antigo, `-1`) → `KG_CORTE_POSSE_OK`. Espera vendas em voo, que ainda
    gravam no regime `integer`; `lock_timeout` estourado não altera nada, repetir;
  - `rollout/04-corte-conexao.sql` (`omni_migrator`, `-1`) → `KG_CORTE_CONEXAO_OK`;
  - `rollout/05-encerrar-sessoes.sql` (papel antigo, database `neondb`) → `KG_SESSOES_ANTIGAS_ZERO`, **logo depois
    do 04**: entre os dois, um cold start pelo pooler ainda entra, porque reaproveita uma conexão de servidor já
    aberta (ensaio Neon 002);
  - `rollout/06-verificacao.sql` → papel antigo `connect=false`, nenhuma sessão dele, CONNECT só para
    `omni_runtime_v2` e `omni_migrator`.

  **Gate:** os três marcadores e o `06` como descrito. A partir daqui vale F2 (`99` reabre).
- **J7. Conferir de novo após ≥ 5 min** (maior `maxDuration` explícito do app = 180 s): `06` idêntico; nenhuma
  transação aberta tocando as 3 tabelas; sonda numa URL de deployment antigo responde `permission denied`;
  **lista de deployments refeita** — ainda só o commit do merge (ou posterior) desde o J3. O tempo não substitui a
  conferência:
  ```sql
  SELECT pid, usename, application_name, state, now() - xact_start AS idade, left(query, 80)
    FROM pg_stat_activity WHERE datname = current_database() AND xact_start IS NOT NULL;
  ```
  **Gate:** as quatro conferências. Deployment estranho: removê-lo, repetir o J7.
- **J8. Migration verificada** com a credencial do `omni_migrator`, pela conexão direta (5432):
  `psql -X -v ON_ERROR_STOP=1 -1 -f docs/padaria/pesagem/estoque-kg-migration-apply.sql`.
  O script trava as 3 tabelas, tira um **retrato por linha** (md5 de `id:valores`), roda o DDL exato da migration
  e compara o retrato depois; qualquer diferença levanta `KG_MIGRATION_RETRATO_DIVERGENTE` e desfaz tudo. Como o
  retrato e o DDL acontecem sob o mesmo lock, criação de produto, exclusão ou reenvio não se intercalam (provado em
  PG 17: `migration-apply-verificada.txt`, `migration-apply-prova-negativa.txt`; e no ensaio 002).
  Depois: `prisma migrate resolve --applied 20261025120000_estoque_quantidade_fracionada`, com
  `DATABASE_URL`/`DIRECT_URL` do migrator **exportadas no shell** (o `.env` da raiz aponta para o candidate).
  **Gate:** `KG_MIGRATION_OK` com contagens e md5; `_prisma_migrations.checksum` = sha256 acima.
  **O COMMIT deste script é o ponto de não-retorno (§5).** Falha por `lock_timeout` ou retrato divergente não
  altera nada: segue F2, repetir J7–J8.
- **J9. (Opcional, somente com decisão/revisão própria no A6 e autorização de aplicação na janela)**
  `rollout/07-guard-check-opcional.sql`. `SCRIPT_07_DECISION=PENDING` nesta revisão.
- **J10. Conferir com a trava ainda ligada:**
  - frações = 0 nas 5 colunas (`count(*) WHERE <col> <> trunc(<col>)`);
  - NaN/denormais = 0 nas 5 colunas (`count(*) WHERE <col> = 'NaN' OR (<col> <> 0 AND abs(<col>) < 2.2250738585072014e-308)`);
  - `06` mostra as 5 colunas `double precision`;
  - `prisma migrate status` = "Database schema is up to date!";
  - `prisma migrate diff` = **só** o drift conhecido da 0019 (§6.1).

  **Gate:** os cinco itens. Qualquer falha: trava segue ligada, **não reabrir**, F3.
- **J11. Trava desligada:** remover `STOCK_WRITES_FROZEN` e fazer Redeploy **do deployment do commit do merge**
  (conferir o SHA antes; env só vale em build novo). As filas locais do PDV reenviam sozinhas. **Gate:**
  deployment novo READY do mesmo commit; pendências zerando.
- **J12. Smoke** com conta STORE da padaria de homologação (produto KG sintético, nunca o real "PAO FRANCES"):
  Entrada 0,001 kg, histórico, ficha reaberta; PDV recusa venda por peso. **Gate:** os quatro itens.
- **J13. Reabrir a operação** e encerrar o congelamento de produção do §3 (o de push em branches segue até P2).

### Pós-janela — referência futura, sem autorização neste A5

- **P1.** `omni_migrator` → `NOLOGIN` fora de janelas.
- **P2.** Migration KG no branch `main` do Neon Preview (procedimento no §6.2).
- **P3.** Trocar a senha do `neondb_owner` quando Preview e máquinas locais não dependerem mais dele (fecha os
  previews legados que conservam essa credencial no candidate e o caminho humano do `ADMIN OPTION`);
  atualizar `.env` local e `neon-*.env`. Os 56 previews são a contagem histórica de 2026-10-28, não um gate atual.
- **P4.** #318 (e qualquer PR aberta): merge da `main` nova, CI, revisão — só depois do J13 e do P2.
- **P5.** Limpezas, cada uma com autorização: branch de ensaio `br-wispy-mountain-accw2a7p` (cópia dos dados de
  produção), branch de recuperação do J1 (depois do prazo combinado), `pr315-kg` e o override de Preview da branch
  da #315, `vercel-production-pull.env`, `.worktrees/p4-baseline-5e1feb9`. Decisão à parte: remover os deployments
  de Production anteriores à #315, que deixam de servir (sem banco) e são o alvo do "Redeploy" proibido no §5.

## 5. Ponto de não-retorno

O **COMMIT de `estoque-kg-migration-apply.sql` no J8** muda as 5 colunas para `double precision`. Desse instante
em diante, qualquer cliente Prisma `Int` que alcance o banco corrompe em silêncio (§1), e nenhum mecanismo deste
runbook devolve o estado anterior sem perda. Ficam **proibidos**, sem prazo, até um plano novo revisado:

1. **Redeploy de código Prisma `Int`**: "Redeploy", "Promote" ou "Instant Rollback" para qualquer deployment
   anterior ao merge da #315; `vercel --prod`/`vercel deploy` de checkout anterior; build de qualquer commit sem a
   #315. "Redeploy" e "Promote" **reconstroem com as envs atuais** (`omni_runtime_v2`), então o build `Int`
   ganha CONNECT e corrompe; "Instant Rollback" usa o retrato antigo e só derruba a operação (`permission
   denied`) — também proibido. O `07`, se vier a ser aprovado e aplicado, é barreira adicional para os casos
   ensaiados; jamais autoriza cliente Prisma Int a gravar nas colunas Float.
2. **Revert da PR #315**: `git revert` do merge na `main`, ou revert parcial que devolva `Int` às 5 colunas no
   `prisma/schema.prisma` ou remova a migration `20261025120000`. Problema no código novo se corrige para frente,
   mantendo schema `Float` e a migration (§7, F3).
3. **Restauração de CONNECT ao papel antigo**: `99-desfazer-corte.sql` (recusa por construção depois da migration),
   `GRANT CONNECT` manual a `neondb_owner` ou PUBLIC, troca de dono do database ou de papéis pelo Console Neon.
   Privilégio faltando no app novo se resolve com GRANT pelo `omni_migrator` ao `omni_runtime_v2`, nunca voltando
   Production para `neondb_owner`.
4. Rodar contra produção script ou cliente gerado de checkout anterior à #315 (backfills, `db:*`).

Voltar as colunas a `integer` **não é rollback deste runbook**: exige que nenhuma das 5 colunas tenha fração, um
plano novo (migration reversa revisada, nova janela, trava, novo corte) e o app em `Int` na mesma janela. Depois da
primeira entrada fracionária, é proibido (perde gramas); a única volta é o branch do J1, descartando as
movimentações posteriores.

## 6. Drift conhecido e banco Preview

### 6.1 Índice da migration 0019 — drift conhecido, não corrigir na janela

A `0019_movimentacao_estoque_idempotency` cria a constraint com o nome `storeId_idempotencyKey`; o
`schema.prisma` declara `@@unique([storeId, idempotencyKey], name: "storeId_idempotencyKey")` — `name` é o nome
do campo no client, não `map` —, então o Prisma espera o nome padrão. Por isso o `migrate diff` de produção
contra o schema acusa, desde antes da #315 e igual na `main`:

```
[*] Changed the `movimentacoes_estoque` table
  [*] Renamed index `storeId_idempotencyKey` to `movimentacoes_estoque_storeId_idempotencyKey_key`
```

Observado no ensaio 002 (clone de produção de 2026-10-26, `neon-rehearsal-002/06-fase-d-99-recorte-migration.txt`),
a confirmar em produção no A1. Regras:

- **A1:** diff esperado = as 5 alterações de tipo + essa renomeação. **J10:** só essa renomeação.
- Qualquer outra linha é **drift novo**: parar com a trava ligada, registrar a saída e investigar; não reabrir.
- **Não corrigir automaticamente**: nada de `prisma db push`, `migrate dev`, `migrate diff --script` aplicado nem
  `ALTER INDEX … RENAME` na janela. A renomeação é assunto de uma migration própria, revisada, fora da #315.
- O banco Preview foi criado a partir do schema (`migrate diff --from-empty`), então lá o diff esperado é **vazio**.

### 6.2 Branch `main` do Neon Preview (P2)

Projeto `nameless-frost-19035275`, branch `main` = `br-lively-feather-b6esh64a`, database `omnigestao_preview`:
no último retrato do isolamento, `integer`, servindo o `DATABASE_URL`/`DIRECT_URL` genérico de Preview. O `pr315-kg`
(`br-wandering-band-b6ov7vmt`) era `double` e atendia a branch da #315 por override. Não houve nova consulta neste A5;
reconfirmar o destino na futura preparação P2 autorizada. Depois do merge, todo
preview novo nasce com cliente `Float`; contra o `main` ainda `integer`, escritas de estoque falham com `22P03`.
O inverso também vale: depois do P2, um preview com cliente `Int` corrompe os dados sintéticos do Preview.

Procedimento (autorização própria; nunca antes do merge da #315):

1. **Pré-condição:** J13 cumprido; congelamento de push em branches (§3) ainda em vigor, para não nascer preview
   `Float` sobre o `main` `integer` entre o merge e o P2.
2. **Inventário:** deployments de Preview READY criados depois da P3 que usam o banco genérico e cujo commit não
   contém a #315 (clientes `Int`). Decidir e registrar: removê-los, ou aceitar o risco sobre dados sintéticos (sem
   alcance a produção) e rodar a conferência de NaN/denormais do J10 depois.
3. **Ponto de recuperação:** branch do `main` do Preview com data/hora.
4. **Migration:** `prisma migrate deploy` pelo `omnigestao_preview_owner` (direto), com o prisma da `main` já com a
   #315, conferindo antes identidade no servidor (`neon.project_id`/`branch_id`/`endpoint_id`), checksum do arquivo
   = sha256 do topo e pendente única `20261025120000_estoque_quantidade_fracionada`. O roteiro da P2.3
   (`preview-isolation-003/harness/p2-preparo-preview.cjs`, fase `kg`) **recusa o `main` por construção**: usar uma
   fase nova revisada com as mesmas travas, ou os mesmos passos à mão.
5. **Gate:** 5 colunas `double precision`; `migrate status` em dia; `migrate diff` vazio; contagem e md5 dos saldos
   iguais antes e depois.
6. **Encerrar o isolamento da #315:** remover o override de Preview da branch `claude/estoque-manual-kg-001` →
   `pr315-kg` e, com autorização, excluir o `pr315-kg` (P5).
7. **Prova:** um preview novo de branch cortada da `main` grava 3,96 kg no banco genérico. Só então liberar push em
   branches.

## 7. Recuperação por fase

| Fase | Estado | Recuperação |
| --- | --- | --- |
| **F0** — até J2 | só a env da trava foi criada; o deployment no ar nem a lê | remover `STOCK_WRITES_FROZEN`; reabrir |
| **F1** — J3 a J5 | envs de Production em `omni_runtime_v2`, #315 em Production, colunas `integer`, sem corte | abortar nesta ordem: (1) envs de Production de volta a `neondb_owner` (cópia do operador; valor atual é sensitive); (2) `git revert` do merge da #315 na `main` → build `Int` com o papel antigo (permitido **só antes do J8**); (3) listar deployments criados desde o J3: qualquer build `Int` com `omni_runtime_v2` é removido; (4) remover a trava; `06`; reabrir. Reabrir com a #315 sem a migration não serve: escrita de estoque falha `22P03` e as vendas ficam na fila |
| **F2** — J6 até antes do COMMIT do J8 | corte feito, colunas `integer` | `rollout/99-desfazer-corte.sql` (recusa se a migration já tiver sido aplicada) + `06`; depois F1. Migration que falhou (`lock_timeout`, retrato divergente) não alterou nada: pode-se repetir J7–J8 em vez de abortar. Divergência de retrato = escritor vivo: `06` para achá-lo antes de repetir |
| **F3** — depois do COMMIT do J8 | ponto de não-retorno (§5) | só para frente, trava ligada até resolver. Código novo com problema: build com schema `Float` revertendo só comportamento. Privilégio faltando: GRANT pelo `omni_migrator`. Drift novo ou frações/NaN no J10: investigar sem reabrir. Corrupção (`6e-323`, `NaN`, denormais): achar o escritor pelo `06` (CONNECT, sessões, `application_name`), cortá-lo (04+05), restaurar as linhas pelo livro encadeado (`movimentacoes_estoque`) ou pelo branch do J1, rodar `db:backfill-deposito --exec` **desta** versão (confere a invariante por produto em milésimos), desligar a trava |
| **F4** — depois da 1ª entrada fracionária | dados novos só existem em `double` | igual a F3; descer a `integer` é proibido; só o branch do J1, descartando as movimentações posteriores, com autorização própria e o congelamento do §3 refeito |

Evidência a coletar em todas as fases: saída integral de cada script (marcadores `KG_*`), `06` antes e depois de
cada passo, lista de deployments com `created` posterior ao J3, logs de build do J4/J11, respostas das sondas do
J5/J7, id/LSN do branch do J1, `KG_MIGRATION_OK` com contagens e md5, `migrate status`/`migrate diff`, consultas do
J10, smoke do J12, horário de cada passo.

## Fora deste rollout

Venda por peso (continua bloqueada), Ajuste/contagem de inventário em KG e balança física
seguem fechados. Ver `ESTOQUE_MANUAL_KG.md`. Renomeação do índice da 0019 (§6.1) e dedupe de `clientSaleId` no
writer v1 ficam para entregas próprias.
