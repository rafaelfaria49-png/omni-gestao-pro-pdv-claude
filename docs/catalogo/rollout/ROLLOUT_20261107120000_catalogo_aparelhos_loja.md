# Rollout — migration `20261107120000_catalogo_aparelhos_loja`

GOAL: CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001 · PR #339 (merge `ce9228c`, 2026-11-08).

**Estado: APLICADA EM PRODUCTION em 2026-11-08**, separadamente do merge, numa transação controlada
com trava de identidade (detalhes abaixo). Histórico Prisma de Production: **24 migrations**,
`prisma migrate status` = "Database schema is up to date!".

Checksum aprovado (sha256 do `migration.sql`, igual no blob do Git, no Candidate e no registro de
Production): `57b3914343f26652fd5269ae9cc4fa09f8faa922153575792850f830911a6e45`.

> **Pendência operacional — `PENDING_REAL_STORE_SMOKE_TEST=YES`.** A validação operacional só está
> completa depois do teste do proprietário numa loja real: cadastro manual do G47, associação de
> película, associação de capinha, salvamento do produto e seleção do modelo no PDV.

## O que a migration faz

Aditiva. Cria duas tabelas novas, sem tocar em tabelas existentes (só FK → `stores`):

| Tabela | Conteúdo | Unicidade |
|---|---|---|
| `catalogo_aparelhos_loja_modelos` | modelos cadastrados manualmente por loja | `modelKey` global; `(storeId, brandKey, nameKey)` |
| `catalogo_aparelhos_loja_compat` | decisões da loja sobre pares de película (`adicionar` / `suprimir`) | `(storeId, categoria, modelKeyA, modelKeyB)` |

CHECKs: `acao ∈ {adicionar, suprimir}`, `categoria ∈ {pelicula_tela, capinha}`, par ordenado
`modelKeyA < modelKeyB` **em `COLLATE "C"`** (mesma ordem do código; sem isso um banco ICU/pt_BR/en_US
recusa pares válidos como `motorola_moto_g04 × motorola_moto_g_power` — Production usa `en_US.UTF-8`),
`modelKey LIKE 'manual\_%'`. Independente das migrations KG (#315/#335/#337): timestamp posterior,
nenhum objeto em comum.

## Comportamento sem a migration (código publicado, tabelas ausentes)

- Busca de aparelhos/películas: **continua funcionando** só com o catálogo global
  (leituras degradam em silêncio — P2021 → lista vazia, um aviso no log).
- Cadastrar/editar modelo e decidir compatibilidade: **503** "Catálogo da loja indisponível".
- Nada derruba o PDV.

Foi o estado de Production entre o deploy do merge (`ce9228c`) e a aplicação da migration.

## O merge publica o código, mas NÃO garante a migration

`scripts/vercel-build.mjs` só roda `prisma migrate deploy` quando o guard
(`scripts/migration-authority-guard.mjs`) confirma, ao mesmo tempo, `VERCEL_ENV=production`,
`MIGRATION_AUTHORITY_ENABLED` exatamente `"true"` e o `VERCEL_PROJECT_ID` canônico. Fora disso o build
emite `MIGRATION_SKIPPED` e publica o código sem migrar.

Estado observado (logs de build, só leitura): **todos os deployments Production do `omni-gestao-pro`
disponíveis, de 2026-10-28 até o merge `ce9228c` (2026-11-08), emitiram `MIGRATION_SKIPPED`.** Pelo
contrato do guard, isso significa que a autoridade de migration não está habilitada em Production
(`MIGRATION_AUTHORITY_ENABLED` diferente de `"true"`; o valor é secreto e não foi lido). O deploy do
merge `ce9228c` (`dpl_GhyK8LebaGHAUjVBB5F4aT89gf8L`) também emitiu `MIGRATION_SKIPPED`.

Antes de presumir que um merge aplicará uma migration, conferir o evento `MIGRATION_*` do último build
de Production. Procedimentos futuros devem respeitar o mecanismo de autoridade de migration vigente
(`docs/ai/DEPLOY.md`), com autorização própria do proprietário.

## Como foi aplicada em Production (2026-11-08)

Autorização específica do proprietário no chat ("Authorize apply"), depois de preflight só leitura e de
ensaio. Sem alteração de envs, sem redeploy.

1. **Preflight só leitura** (sessões com `default_transaction_read_only=on`): identidade Neon conferida
   no servidor (projeto `dry-mouse-36002471`, branch `br-muddy-meadow-ac7ah2wl`, endpoint
   `ep-summer-tooth-acltc6wi`, banco `omnigestao_prod`); 23 migrations aplicadas com checksums iguais aos
   da `main`; só esta pendente; 0 objetos `catalogo_aparelhos_loja*`; drift apenas a renomeação de
   índice da `0019` (pré-existente, sem relação).
2. **Ensaio** em PostgreSQL descartável com collation ICU `en-US` e as 23 migrations da `main`: aplicação,
   reaplicação recusada, `prisma migrate deploy` posterior = "No pending migrations", lock bloqueado em
   `stores` → abort em ~4 s sem resíduo, rollback oficial, trava de identidade recusando outro banco.
3. **Aplicação** — uma única transação (`psql -1`, `ON_ERROR_STOP`), papel `neondb_owner`, conexão direta:
   - trava de identidade (qualquer divergência aborta antes de tudo);
   - pré-condições: exatamente 23 migrations aplicadas, nenhum registro desta, nenhum objeto com os nomes
     novos; `lock_timeout` 3 s, `statement_timeout` 60 s;
   - `migration.sql` lido do blob do merge `ce9228c`, com o checksum aprovado conferido antes;
   - registro em `_prisma_migrations` no mesmo formato do `prisma migrate deploy`
     (checksum aprovado, `applied_steps_count=1`);
   - `GRANT SELECT, INSERT, UPDATE, DELETE` nas duas tabelas ao papel **`omni_runtime_v2`** — os grants do
     rollout KG (`02-grants-runtime.sql`, 2026-10-29) cobriram só as tabelas existentes na época e não há
     privilégio padrão para tabelas novas de `neondb_owner`;
   - pós-condições: 2 tabelas, CHECK com `COLLATE "C"`, registro com o checksum, 24 migrations.
   Resultado: pré e pós no mesmo txid; `APPLY=OK`.
4. **Pós-checagem só leitura**: 24 migrations; `prisma migrate status` em dia; `migrate diff` contra o
   schema do merge = só a renomeação da `0019`; 10 objetos novos; DML de `omni_runtime_v2` nas 2 tabelas;
   rotas do catálogo em Production respondendo (401 sem sessão, nenhum 500).

**Sem redeploy:** o código já publicado consulta as tabelas a cada requisição e saiu sozinho do modo
degradado.

O runtime de Production conectava, nessa data, como `neondb_owner` (dono das tabelas). O GRANT a
`omni_runtime_v2` mantém as tabelas novas acessíveis quando o rollout KG trocar o papel do runtime.

## Reversão — manual e destrutiva

`docs/catalogo/rollout/rollback_20261107120000_catalogo_aparelhos_loja.sql`: DROP das duas tabelas +
remoção do registro em `_prisma_migrations`.

- **Destrutiva:** apaga todos os modelos manuais e decisões de película cadastrados pelas lojas, sem
  volta. `Produto.metadata.catalogoAparelhos` e os snapshots de venda (texto) permanecem.
- **Exige autorização própria do proprietário**, preflight só leitura e trava de identidade na mesma
  transação, como na aplicação. Nunca é aplicada pelo Prisma nem pelo build.
- Após o DROP, o código volta ao modo degradado descrito acima (sem quebrar o PDV).

## Evidências

- Preview isolado e Candidate: `docs/ai-execution/_evidence/CADASTROS-ACESSORIOS-COMPAT-MANUAL-FINALIZACAO-001/`.
- Nenhuma URL de banco, senha ou secret é registrada neste repositório.
