# Estoque manual KG — remediação dos bloqueadores de rollout (PR #315)

**Status: NO-GO operacional.** Nada aqui foi executado fora de PostgreSQL descartável. Nenhum merge,
deploy, migration, segredo, papel, sessão ou deployment real foi tocado. `MIGRATION_AUTHORITY_ENABLED=false`
permanece. O head funcional da PR (`cdb1d19`, R4 APPROVE) não mudou: esta entrega só acrescenta
documentos, scripts SQL de operação (`rollout/`) e evidências.

Evidências: `docs/ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/rollout-remediation/` (índice no `README.md`).

## 1. O que mudou no diagnóstico

| # | Achado | Fonte | Consequência |
| --- | --- | --- | --- |
| 1 | **Production, Preview/candidate e o admin de migração usam o mesmo papel `neondb_owner` com a mesma senha**; só o nome do database muda. | `42-credenciais-locais-topologia.txt` (arquivos locais, só booleanos) + datas das envs na Vercel | Todo preview e toda máquina com `.env` de candidate tem credencial de escrita em produção. Trocar a senha derruba os três juntos. |
| 2 | **`neondb_owner` ∈ `neon_superuser` (herança) ⊃ `pg_write_all_data`**, `pg_read_all_data`, `pg_signal_backend`; `BYPASSRLS`, `CREATEROLE`. | `40-neon-papeis-readonly.txt` (catálogo do cluster real, transação read-only, papel RO do candidate) | Tirar posse ou GRANT de tabela **não** tira a escrita do papel antigo. O único corte efetivo no Neon é `CONNECT` no database + encerrar sessões. |
| 3 | `omnigestao_prod` tem `datacl = NULL` (PUBLIC com CONNECT); schema `public` pertence a `pg_database_owner`; candidate: 96 tabelas, **0 com RLS**, 0 policies, 0 sequences/views/funções, 36 enums. | `40-…`, `41-…` | Papel de runtime sem BYPASSRLS funciona (não há RLS). A troca de posse precisa começar pelo `ALTER DATABASE … OWNER`. |
| 4 | Trocar só a senha não encerra nada: a sessão já autenticada continua gravando; só o cold start falha. | `10-…`, seção 1 | Confirma a premissa da missão. |
| 5 | `REVOKE CONNECT` sozinho não derruba a sessão aberta (ela segue gravando); `pg_terminate_backend` sozinho é desfeito pela reconexão automática do Prisma na tentativa seguinte. Os dois juntos cortam: reconexão, cold start e psql recebem `FATAL: permission denied for database`. | `12-cortes-parciais.txt`, `11-…` | Ordem obrigatória: posse → CONNECT → sessões (3 rodadas) → conferir zero. |
| 6 | `REVOKE` executado por quem não é dono termina com **WARNING e exit 0** sem revogar nada. | `12-cortes-parciais.txt`, seção 1 | Os scripts conferem o catálogo e levantam erro; nunca confiar em exit code. |
| 7 | Só **14** deployments alcançam `omnigestao_prod` (Production do `omni-gestao-pro`, 2026-10-23 → hoje, URLs públicas). Os outros 119 não têm caminho de código até lá. | `50-vercel-inventario.md` | O "109" do pré-flight não é reproduzível (lista muda a cada push e expiração); o que importa é a credencial, não a contagem. |
| 8 | A fila do PDV manda venda com `clientSaleId` ao writer **v2**; o v1 não deduplica por `clientSaleId`. Trocar o writer com venda confirmada sem resposta **duplica**. | `30-fila-pdv.txt` (teste "PRÉ-CONDIÇÃO") | `SALE_SERVER_NUMBERING_ENABLED` e o projeto canônico não podem mudar na janela. Problema da main, fora do escopo da #315 (relatado, não corrigido). |
| 9 | Um cliente Int que ainda alcance o banco depois da migration corrompe com valor absoluto e com o livro; `increment/decrement` vira no-op silencioso. Um CHECK "finito em milésimos" faz o absoluto, o negativo, o depósito, o livro e a transação de venda **falharem** (23514) e deixa o cliente novo passar. | `20-barreira-check.txt` | Barreira de banco opcional (`rollout/07`), sem drift no `prisma migrate diff`; exige revisão própria. |

## 2. Inventário de caminhos de escrita nas 5 colunas

**Código da PR (`cdb1d19`)** — passam pela trava `STOCK_WRITES_FROZEN`:
`applyStockMutation`/`applyStockMutationTx` (venda v1/v2, correção, OS, entrada, ajuste, REST, cadastro
com estoque inicial).

**Código da PR que NÃO passa pela trava** (nenhum grava valor fracionário):

| Caminho | Escrita | Risco na janela |
| --- | --- | --- |
| criação de produto (`product-write-service`) | `stock: 0` no INSERT | nulo: 0 é 0 em qualquer tipo; a migration trava a tabela |
| exclusão de produto (`DELETE /api/produtos/[id]`, `bulk-delete`, `bulk-action`, `cadastros.ts`) | cascata em `produto_depositos`; `SET NULL` no livro | nulo para valores (não grava número) |
| `lib/estoque/deposito-core.ts` `setEstoqueDeposito`/`backfillLojaDepositoPrincipal` | upsert de quantidade | sem chamador no app |
| `lib/os-itens-stock.ts` | `increment`/`decrement` | código morto (sem chamador) |
| `scripts/backfill-deposito*.mjs`, `scripts/merge-produtos-duplicados.mjs`, `scripts/caixa-test.mjs` | upsert de depósito / exclusão | só com `.env` de produção — bloqueados pelo corte de CONNECT |

**Código antigo (14 deployments vivos, scripts da `main`, qualquer clone com `.env` antigo)**: **nenhum
caminho tem a trava** — ela só existe a partir da PR. `STOCK_WRITES_FROZEN` não protege código antigo.
A barreira para ele tem de estar no banco: corte de CONNECT (B) e, opcionalmente, o CHECK (07).

## 3. Comparação das estratégias

| | **A. Remover/desabilitar escritores antigos** (runbook anterior) | **B. Isolar a credencial de runtime e cortar o papel antigo no banco** |
| --- | --- | --- |
| Mecanismo | `vercel remove` dos 14 Production (e previews), encerrar scripts locais | papel `omni_runtime_v2` só para Production; papel antigo perde `CONNECT` em `omnigestao_prod` e tem as sessões encerradas |
| Prova de que acabou | **nenhuma do lado do banco**: todos os escritores usam o mesmo papel, `pg_stat_activity` não distingue deployment antigo de novo | **catálogo e sessões**: `has_database_privilege(antigo,'CONNECT') = false`, 0 sessões do papel antigo, matriz de papéis com CONNECT = {runtime, migrator} (`06-verificacao.sql`) |
| Cobre scripts locais, `.env` de candidate, `neon-production.env`, previews com a mesma senha | não | **sim** (mesma credencial, mesmo corte) |
| Cobre sessão já aberta / pooler / transação em voo | não diretamente (função removida para de receber requisição; conexão do pooler fica) | sim: `05` encerra e exige zero; transação em voo é desfeita ou termina antes (provado) |
| Reversível | **não** (deployment removido não volta; perde evidência e alvo de rollback) | **sim antes da migration** (`99`, provado); depois, proibido por construção (o script recusa) |
| Custo | ~66 remoções manuais + conferência 404 de cada URL; repetir para cada push durante a janela | 3 papéis + 2 envs + 1 redeploy **antes** da janela; na janela, 3 scripts (~10 s) + conferência |
| Dependências | CLI Vercel; ninguém fazer push na janela | Neon PG ≥ 16 (é 17.11); comportamento do Neon ao reiniciar compute (ver §5) |
| Efeito colateral | nenhum no banco | papel antigo segue dono de Preview/candidate; deployments antigos ficam no ar mas sem banco (toda tela que lê dá erro) |
| Riscos | escritor esquecido (máquina local, preview, script) corrompe em silêncio; sem como provar ausência | papel novo sem algum privilégio que o app use (mitigado: app só usa DML, sem RLS, sem DDL/TEMP/TRUNCATE em runtime — inventariado; `02` confere DML em todas as tabelas); reconciliação do Neon (§5) |
| Recuperação | restaurar snapshot; não há como trazer o deployment de volta | antes da migration: `99` (devolve CONNECT); depois: corrigir para frente com GRANT pelo `omni_migrator` |
| Demonstrável em ambiente isolado | só parcialmente (não há como simular a Vercel) | **sim, ponta a ponta** (`10-…`, `11-…`) |

**Recomendação: B.** É a única que dá prova positiva no próprio banco, cobre credenciais fora da Vercel e é
reversível até a migration. Os deployments antigos não precisam ser excluídos: a retenção do projeto
(30 dias) os apaga sozinha. Ligar Deployment Protection no `omni-gestao-pro` é complemento opcional
(fecha as URLs de hash por HTTP; o domínio `.vercel.app` de produção segue público — conferido no projeto
`omni-gestao`), não barreira de banco.

## 4. Procedimento B (scripts em `docs/padaria/pesagem/rollout/`)

Todos os scripts foram executados, nessa ordem, contra PG 17 com a topologia do Neon e escritores Prisma
Int ativos (`11-arquivos-do-runbook.txt`). Senhas só por variável de ambiente; nada de segredo em arquivo.

**Pré-janela (sem efeito nos escritores atuais)**

1. Preview fora do cluster de produção: branch Neon (ou projeto) próprio com papel próprio; trocar
   `DATABASE_URL`/`DIRECT_URL` do escopo Preview na Vercel colando o valor novo via stdin
   (`vercel env add … preview < arquivo` — nunca exibir o valor). Previews existentes mantêm o retrato
   antigo; o corte do passo 7 tira deles o acesso a produção.
2. `01-papeis.sql` (papel antigo, database `neondb`): cria `omni_owner` (NOLOGIN), `omni_migrator`,
   `omni_runtime_v2` por SQL — **nunca pelo Console/API do Neon**, que os tornaria membros de
   `neon_superuser`. O script recusa se algum herdar `pg_write_all_data`.
3. `02-grants-runtime.sql` (papel antigo, `omnigestao_prod`): DML em todas as tabelas; recusa se faltar
   alguma ou se houver RLS.
4. Production da Vercel (`omni-gestao-pro`): `DATABASE_URL` (pooler) e `DIRECT_URL` (direta) passam a
   `omni_runtime_v2`; redeploy do **mesmo commit** em produção; smoke de leitura e uma venda de teste em
   loja de homologação. O deployment novo convive com os antigos (provado: ambos gravam antes do corte).
5. Ensaio completo num **branch Neon** de produção (§5), incluindo reiniciar o compute.

**Janela (loja fechada, checklist de lojas cumprido — `ESTOQUE_MANUAL_KG_CHECKLIST_LOJAS.md`)**

6. Ponto de recuperação (branch/PITR) → `STOCK_WRITES_FROZEN=true` → deploy da PR #315 (já com
   `omni_runtime_v2`). Não alterar `SALE_SERVER_NUMBERING_ENABLED`.
7. Corte, nesta ordem, conferindo a saída de cada script:
   - `03-corte-posse.sql` (papel antigo, `-1`): posse de tudo → `omni_owner`; espera vendas em voo (ainda
     `integer`, gravam certo); `lock_timeout` estourado não muda nada.
   - `04-corte-conexao.sql` (`omni_migrator`, `-1`): `REVOKE CONNECT` de PUBLIC e do papel antigo; recusa se
     sobrar papel com CONNECT além de runtime/migrator.
   - `05-encerrar-sessoes.sql` (papel antigo, database `neondb`): 3 rodadas; exige zero.
   - `06-verificacao.sql`: papel antigo `connect=false`; 0 sessões dele; repetir após 5 min.
   - Ponto de não-retorno: até aqui, `99-desfazer-corte.sql` reabre (provado).
8. Migration: `estoque-kg-migration-apply.sql` pelo `omni_migrator` (inalterado; retrato por linha).
   Opcional, se aprovado em revisão: `07-guard-check-opcional.sql`.
9. Conferências do runbook (frações, `prisma migrate diff`), trava desligada, redeploy, smoke, reabrir.
10. Pós-janela: `omni_migrator` → `NOLOGIN` fora de janelas; trocar a senha do `neondb_owner` **depois**
    que Preview e máquinas locais tiverem saído dele (fecha o caminho humano do §6); apagar
    `C:\Projetos\secrets\vercel-production-pull.env` (Supabase, obsoleto) mediante autorização.

## 5. O que o ambiente isolado não prova (gate antes de produção)

| Ponto | Por que importa | Como fechar |
| --- | --- | --- |
| Reconciliação do Neon ao reiniciar compute (`compute_ctl`): pode reaplicar dono/ACL de databases que ele gerencia | desfaria o corte em silêncio no próximo cold start do endpoint | ensaio num branch Neon: rodar 01–05, suspender/retomar o compute, rodar `06` de novo. `neondb` tem `neon_superuser=CTc` no ACL e `omnigestao_prod` tem ACL `NULL` — indício (não prova) de que os databases do app não são gerenciados |
| Pooler do Neon (PgBouncer) | servidor reabre conexão com as credenciais do cliente | no ensaio: cliente antigo pela URL `-pooler` deve receber `FATAL: permission denied for database` após 04+05 |
| Papel criado por SQL aparece/é gerenciável no Console | operação humana futura | no ensaio |

## 6. Riscos residuais aceitos em B

- **Caminho humano, não de código:** o papel antigo criou os papéis novos e, pelo PG 16+, tem
  `ADMIN OPTION` sobre eles; com `CREATEROLE` ele consegue se re-adicionar a `omni_owner` e reabrir CONNECT
  (provado em `10-…`, seção 7). Código antigo não faz `GRANT`; fecha de vez com a troca de senha do passo 10.
- `cloud_admin` (superusuário do Neon) e `neon_service` são do provedor e seguem com acesso.
- Deployments antigos continuam com outros segredos válidos (Stripe, WhatsApp, `AUTH_SECRET`). Sem banco
  eles não montam contexto, mas isso está fora do escopo de estoque.
- Erro do CHECK (07) sai no log com a linha recusada (`Failing row contains …`, nome e preço do produto).

## 7. GO/NO-GO e autorizações ainda necessárias

**NO-GO.** Prova isolada concluída; faltam o ensaio no Neon e as autorizações abaixo, cada uma específica:

1. Criar um branch Neon de produção para o ensaio do §5 (inclui criar papéis **no branch** e
   suspender/retomar o compute dele).
2. Criar `omni_owner`, `omni_migrator`, `omni_runtime_v2` no cluster de produção (`01`) e conceder DML (`02`).
3. Banco isolado para Preview e troca das envs de Preview na Vercel.
4. Trocar `DATABASE_URL`/`DIRECT_URL` de Production para `omni_runtime_v2` e redeployar o commit atual.
5. Execução do checklist nas duas lojas (terminais reais).
6. Janela: trava, merge/deploy da #315, scripts 03–05, migration; e, à parte, decidir sobre o `07`
   (exige revisão independente por ser DDL fora da migration aprovada).
7. Pós-janela: `omni_migrator` NOLOGIN, troca de senha do `neondb_owner`, limpeza de arquivos locais.

Opcional e independente: Deployment Protection (Standard) no `omni-gestao-pro`; decidir o destino dos 4
overrides de Preview por branch (`codex/release-ops-v4-vercel` e outros), cujo valor não é legível.
