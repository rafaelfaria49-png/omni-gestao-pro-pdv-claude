# Estoque manual KG — remediação dos bloqueadores de rollout (PR #315)

**Status: NO-GO operacional. A1, A1.1, A2, A3 e A4: PASS registrados.** O A3 já criou os papéis
`omni_owner`, `omni_migrator`, `omni_runtime_v2` e concedeu os GRANTs em produção (110/110 tabelas).
Isso alterou papéis/ACLs; não alterou estoque, vendas ou schema de tabelas. O A4 autenticou runtime direto e
pooled e migrator direto, em sete transações READ ONLY terminadas em ROLLBACK. As cinco colunas seguem
`integer`, a migration KG segue ausente e a posse dos objetos ainda não foi transferida.

**Este A5 é preparação documental e validação local exclusivamente.** Nenhuma conexão ou operação no Neon
ou na Vercel é autorizada. A6–A8, J0–J13 e pós-janela continuam sem autorização neste GOAL.
O [runbook canônico](ESTOQUE_MANUAL_KG_RUNBOOK.md#0-estado-reconciliado-e-limites-das-evidências) reúne as
fontes A1–A4 e distingue estado histórico, evidência direta e inferência. Os registros anteriores permanecem intactos.

Head de referência da #315: `104d768`, CI verde informado, sem merge. A main avançou para **`aaab275` pela #321**
(também presente no `origin/main` local, sem fetch neste A5). Reconciliação com a main então atual, nova revisão
e CI verde do **head final** são pendências antes de J3/J4. O inventário de código em `cdb1d19` e as revisões
antigas são históricos; não aprovam automaticamente esse head final. `MAIN_RECONCILIATION=PENDING`.

`MIGRATION_AUTHORITY_ENABLED=false` é requisito operacional para impedir migrations pela Vercel; as evidências
históricas de build mostram `MIGRATION_SKIPPED`. O valor `sensitive` Production não foi relido. A continuidade
de Production com `neondb_owner` no A4 é **inferência** a partir do baseline, datas das envs e deployment
preservados; os logins e privilégios do papel antigo foram comprovados diretamente. O A5 não atualiza esse retrato.

Evidências: `docs/ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/rollout-remediation/` (índice no `README.md`).

## 1. O que mudou no diagnóstico

| # | Achado | Fonte | Consequência |
| --- | --- | --- | --- |
| 1 | **Na topologia legada inventariada, Production, previews antigos/candidate e o admin compartilhavam `neondb_owner` e a mesma senha**; só o database mudava. Previews novos já foram isolados em outro projeto/papel. | `42-credenciais-locais-topologia.txt` + isolamento P1–P3 + A3/A4 | Os retratos legados e as máquinas com credencial antiga mantêm o risco. A criação dos papéis novos não remove esse acesso; a troca de senha segue etapa posterior autorizada. |
| 2 | **`neondb_owner` ∈ `neon_superuser` (herança) ⊃ `pg_write_all_data`**, `pg_read_all_data`, `pg_signal_backend`; `BYPASSRLS`, `CREATEROLE`. | `40-neon-papeis-readonly.txt` (catálogo do cluster real, transação read-only, papel RO do candidate) | Tirar posse ou GRANT de tabela **não** tira a escrita do papel antigo. O único corte efetivo no Neon é `CONNECT` no database + encerrar sessões. |
| 3 | Antes do A3, `omnigestao_prod` tinha `datacl = NULL`. O GRANT do A3 materializou a ACL padrão e acrescentou CONNECT para runtime/migrator; PUBLIC e papel antigo ainda mantêm acesso. A4: 110 tabelas com DML, 0 RLS e 0 sequências em `public`. As 96 tabelas do candidate pertencem a inventário histórico. | `40-…`, `41-…`, A3/A4 | A concessão não é corte. A futura troca de posse começa pelo `ALTER DATABASE … OWNER`; os scripts 03–05 continuam pendentes. |
| 4 | Trocar só a senha não encerra nada: a sessão já autenticada continua gravando; só o cold start falha. | `10-…`, seção 1 | Confirma a premissa da missão. |
| 5 | `REVOKE CONNECT` sozinho não derruba a sessão aberta (ela segue gravando); `pg_terminate_backend` sozinho é desfeito pela reconexão automática do Prisma na tentativa seguinte. Os dois juntos cortam: reconexão, cold start e psql recebem `FATAL: permission denied for database`. | `12-cortes-parciais.txt`, `11-…` | Ordem obrigatória: posse → CONNECT → sessões (3 rodadas) → conferir zero. |
| 6 | `REVOKE` executado por quem não é dono termina com **WARNING e exit 0** sem revogar nada. | `12-cortes-parciais.txt`, seção 1 | Os scripts conferem o catálogo e levantam erro; nunca confiar em exit code. |
| 7 | Retratos datados: **14** Production em 2026-10-25; **15** Production e **56** previews legados com credencial que abre produção em 2026-10-28 09:37Z. Não são contagens atuais. | `50-vercel-inventario.md`, `rollout-readiness-004` §2 | Refazer o inventário integral no início da janela. Contagem, espera e suposta expiração não são proteção: havia READY de 73 dias apesar de `expirationDays=30`. O corte efetivo é CONNECT (04) seguido imediatamente do encerramento de sessões (05). |
| 8 | A fila do PDV manda venda com `clientSaleId` ao writer **v2**; o v1 não deduplica por `clientSaleId`. Trocar o writer com venda confirmada sem resposta **duplica**. | `30-fila-pdv.txt` (teste "PRÉ-CONDIÇÃO") | `SALE_SERVER_NUMBERING_ENABLED` e o projeto canônico não podem mudar na janela. Problema da main, fora do escopo da #315 (relatado, não corrigido). |
| 9 | Cliente Int sobre Float corrompe ou falha silenciosamente nos caminhos ensaiados. O CHECK "finito em milésimos" rejeitou os casos de absoluto, negativo, depósito, livro e venda testados no ambiente isolado (23514). | `20-barreira-check.txt` | `rollout/07` é candidato a barreira adicional. `SCRIPT_07_DECISION=PENDING`: decisão e revisão própria no A6 e autorização para aplicar na janela; o A5 não o aprova e jamais libera escrita de cliente Int sobre Float. |

## 2. Inventário de caminhos de escrita nas 5 colunas

**Inventário histórico do código em `cdb1d19`** — passam pela trava `STOCK_WRITES_FROZEN`:
`applyStockMutation`/`applyStockMutationTx` (venda v1/v2, correção, OS, entrada, ajuste, REST, cadastro
com estoque inicial).

**Código da PR que NÃO passa pela trava** (nenhum grava valor fracionário):

| Caminho | Escrita | Risco na janela |
| --- | --- | --- |
| criação de produto (`product-write-service`) | `stock: 0` no INSERT | cliente Float sobre `integer` falha fechado (`22P03`) também com zero; cadastros ficam congelados durante a janela |
| exclusão de produto (`DELETE /api/produtos/[id]`, `bulk-delete`, `bulk-action`, `cadastros.ts`) | cascata em `produto_depositos`; `SET NULL` no livro | altera linhas mesmo sem gravar novo número; não executar na janela; os locks protegem o retrato da migration |
| `lib/estoque/deposito-core.ts` `setEstoqueDeposito`/`backfillLojaDepositoPrincipal` | upsert de quantidade | sem chamador no app |
| `lib/os-itens-stock.ts` | `increment`/`decrement` | código morto (sem chamador) |
| `scripts/backfill-deposito*.mjs`, `scripts/merge-produtos-duplicados.mjs`, `scripts/caixa-test.mjs` | upsert de depósito / exclusão | só com `.env` de produção — bloqueados pelo corte de CONNECT |

**Código antigo (deployments anteriores à #315, scripts e clones com Prisma Int; 15 Production no retrato de 2026-10-28)**: **nenhum
caminho tem a trava** — ela só existe a partir da PR. `STOCK_WRITES_FROZEN` não protege código antigo.
A barreira para ele tem de estar no banco: corte de CONNECT (B) e, opcionalmente, o CHECK (07).

## 3. Comparação das estratégias

| | **A. Remover/desabilitar escritores antigos** (runbook anterior) | **B. Isolar a credencial de runtime e cortar o papel antigo no banco** |
| --- | --- | --- |
| Mecanismo | remover os deployments antigos encontrados no inventário, encerrar scripts locais | papel `omni_runtime_v2` só para Production; papel antigo perde `CONNECT` em `omnigestao_prod` e tem as sessões encerradas |
| Prova de que acabou | **nenhuma do lado do banco**: todos os escritores usam o mesmo papel, `pg_stat_activity` não distingue deployment antigo de novo | **catálogo e sessões**: `has_database_privilege(antigo,'CONNECT') = false`, 0 sessões do papel antigo, matriz de papéis com CONNECT = {runtime, migrator} (`06-verificacao.sql`) |
| Cobre scripts locais, `.env` de candidate, `neon-production.env`, previews com a mesma senha | não | **sim** (mesma credencial, mesmo corte) |
| Cobre sessão já aberta / pooler / transação em voo | não diretamente (função removida para de receber requisição; conexão do pooler fica) | sim: `05` encerra e exige zero; transação em voo é desfeita ou termina antes (provado) |
| Reversível | **não** (deployment removido não volta; perde evidência e alvo de rollback) | **sim antes da migration** (`99`, provado); depois, proibido por construção (o script recusa) |
| Custo | depende do inventário atualizado; remoções + conferência de cada URL, repetidas se houver novo deployment | papéis e grants já preparados no A3; na janela, 2 envs junto com o deploy Float, controle dos novos deployments, 3 scripts e conferência; duração do ensaio não é previsão de lock em produção |
| Dependências | CLI Vercel; ninguém fazer push na janela | Neon PG ≥ 16 (é 17.11); comportamento do Neon ao reiniciar compute (ver §5) |
| Efeito colateral | nenhum no banco | papel antigo segue dono de Preview/candidate; deployments antigos ficam no ar mas sem banco (toda tela que lê dá erro) |
| Riscos | escritor esquecido (máquina local, preview, script) corrompe em silêncio; sem como provar ausência | papel novo sem algum privilégio que o app use (mitigado: app só usa DML, sem RLS, sem DDL/TEMP/TRUNCATE em runtime — inventariado; `02` confere DML em todas as tabelas); reconciliação do Neon (§5) |
| Recuperação | restaurar snapshot; não há como trazer o deployment de volta | antes da migration: `99` (devolve CONNECT); depois: corrigir para frente com GRANT pelo `omni_migrator` |
| Demonstrável em ambiente isolado | só parcialmente (não há como simular a Vercel) | **sim, ponta a ponta** (`10-…`, `11-…`) |

**Recomendação: B.** É a única que dá prova positiva no próprio banco, cobre credenciais fora da Vercel e é
reversível até a migration. Os deployments antigos não são excluídos na janela e **não se conta com a
retenção da Vercel**: no inventário de 2026-10-28 havia READY de 73 dias apesar de `expirationDays=30`
(`rollout-readiness-004` §2; a promessa de expiração em `50-vercel-inventario.md` não serve como gate). Eles saem do
banco só pelo corte 04+05. Ligar Deployment Protection no `omni-gestao-pro` é complemento opcional
(fecha as URLs de hash por HTTP; o domínio `.vercel.app` de produção segue público — conferido no projeto
`omni-gestao`), não barreira de banco.

## 4. Procedimento B (scripts em `docs/padaria/pesagem/rollout/`)

O ensaio isolado executou os scripts nessa ordem contra PG 17 com a topologia do Neon e escritores Prisma
Int ativos (`11-arquivos-do-runbook.txt`). Na produção real, somente **01 e 02** foram aplicados no A3;
o 06 foi usado para leitura no A3/A4. Isso não significa execução produtiva do corte, da migration ou do 07.
Senhas existentes ficam fora do repositório e são passadas ao processo por ambiente, nunca argv ou log.

Esta seção explica o mecanismo. A sequência operacional canônica — passos A1–A8, J0–J13, P1–P5 com gates,
congelamento, ponto de não-retorno e recuperação por fase — é a do `ESTOQUE_MANUAL_KG_RUNBOOK.md`.

**Pré-janela — estado histórico A1–A4 cumprido, sem repetição autorizada neste A5**

1. Preview já isolado por P1–P3, com projeto/papel próprios. Os deployments antigos conservam o retrato
   de credenciais anterior; é o corte do futuro passo 7 que tira deles o alcance a Production.
2. `01-papeis.sql` já executado no A3 (papel antigo, database `neondb`): criou `omni_owner` (NOLOGIN),
   `omni_migrator` e `omni_runtime_v2` por SQL, sem `neon_superuser`. **Não repetir o 01.** Antes da criação,
   o preflight equivalente ao 06 deve tolerar `omni_owner` ausente: usar a consulta por OID com LEFT JOIN/CASE
   do runbook §4, não resolver o papel inexistente por nome. O 06 oficial não foi alterado no A5.
3. `02-grants-runtime.sql` já executado no A3: DML em **110/110 tabelas**, recusa de RLS. Se surgir drift
   antes da janela, diagnosticar e pedir autorização específica para qualquer alteração de GRANT.
4. **A credencial de `omni_runtime_v2` nunca vai para um build `Int`** (revisão R1, P1): o 04 mantém o
   runtime com CONNECT e o 05 só encerra o papel antigo, então um deployment do código atual com essa
   credencial sobreviveria ao corte e corromperia as colunas double. Por isso **não** há redeploy do commit
   atual com o papel novo. **A4 comprovou em Production** o login e os privilégios declarados do runtime
   (direto e pooled) e o login/membership do migrator, somente por consultas READ ONLY e ROLLBACK.
   Não houve tentativa de DML/DDL nem prova de migration efetivamente executada. `omni_owner` ainda possui
   zero relações em `public`; migrator ainda não tem acesso de proprietário aos objetos, como esperado antes do 03.
5. Ensaio completo num **branch Neon** de produção (§5) já registrado, incluindo reiniciar o compute.
   A5 consolida documentação; A6–A8 seguem pendentes. Resolver antes da liberação da janela a leitura de
   `cron.job` no auxiliar `postgres` com autorização própria. O último relato de caixa aberto é **loja-1**
   no A3; os registros de loja-2 aberta no A1/A1.1 são anteriores. Reconfirmar todas as sessões somente em
   preflight da janela autorizada, sem consulta ou fechamento neste A5.

**Janela futura — NÃO AUTORIZADA: lojas fechadas e checklist cumprido**

Pré-condições: reconciliação da #315 com `aaab275`/main então atual, nova CI e revisão do head final;
checklist por `storeId` de **loja-1 RafaCell** e **loja-2 Rafa Brinquedos**, todos os terminais reais e URLs
antigas, pendências offline e pagamentos tratados, **todas as sessões ABERTA = 0 antes do J0** e inventário
atualizado dos deployments no início da janela. Nomes repetidos de lojas de teste não substituem `storeId`.

6. Ponto de recuperação (branch/PITR) → `STOCK_WRITES_FROZEN=true` → **na mesma sequência**, trocar
   `DATABASE_URL`/`DIRECT_URL` de Production para `omni_runtime_v2` e fazer o merge/deploy da PR #315.
   Conferir em `vercel ls`/API que **todo** deployment criado depois da troca da env é do commit da PR (ou
   posterior a ela); qualquer outro (push paralelo, redeploy manual) é removido antes do 03 — ele teria a
   credencial nova com código `Int`. Não alterar `SALE_SERVER_NUMBERING_ENABLED`.
7. Corte, nesta ordem, conferindo a saída de cada script:
   - `03-corte-posse.sql` (papel antigo, `-1`): posse de tudo → `omni_owner`; espera vendas em voo (ainda
     `integer`, gravam certo); `lock_timeout` estourado não muda nada.
   - `04-corte-conexao.sql` (`omni_migrator`, `-1`): `REVOKE CONNECT` de PUBLIC e do papel antigo; recusa se
     sobrar papel com CONNECT além de runtime/migrator.
   - `05-encerrar-sessoes.sql` (papel antigo, database `neondb`): 3 rodadas; exige zero.
   - `06-verificacao.sql`: papel antigo `connect=false`; 0 sessões dele; repetir após 5 min.
   - Até aqui, `99-desfazer-corte.sql` reabre (provado).
8. Migration: `estoque-kg-migration-apply.sql` pelo `omni_migrator` (inalterado; retrato por linha). **O COMMIT
   dela é o ponto de não-retorno** (runbook §5): ficam proibidos redeploy/promote de código Prisma `Int`, revert
   da #315 e devolver CONNECT ao papel antigo.
   O `07-guard-check-opcional.sql` é apenas candidato adicional: requer decisão/revisão própria no A6 e
   autorização de aplicação na janela. Decisão ainda PENDING; não há aprovação implícita neste A5.
9. Conferências do runbook (frações, `prisma migrate diff`), trava desligada, redeploy, smoke, reabrir.
10. Pós-janela: `omni_migrator` → `NOLOGIN` fora de janelas; trocar a senha do `neondb_owner` **depois**
    que Preview e máquinas locais tiverem saído dele (fecha o caminho humano do §6); apagar
    `C:\Projetos\secrets\vercel-production-pull.env` (Supabase, obsoleto) mediante autorização.

## 5. Provas do ensaio e limite da comprovação em produção

As conclusões abaixo pertencem ao branch de ensaio 002. A3/A4 provaram preparação dos papéis/GRANTs,
login e catálogo na produção real; **não** executaram transferência de posse, corte de CONNECT, encerramento
de sessões ou migration KG em Production. A capacidade do migrator após receber a posse permanece uma
verificação da futura janela autorizada, e não resultado do A4.

| Ponto | Por que importa | Como fechar |
| --- | --- | --- |
| Reconciliação do Neon ao reiniciar compute (`compute_ctl`): pode reaplicar dono/ACL de databases que ele gerencia | desfaria o corte em silêncio no próximo cold start do endpoint | **FECHADO no ensaio 002** (2026-10-26, branch `br-wispy-mountain-accw2a7p`): suspend/start **e** restart completo do compute; posse, ACL e pertencimentos idênticos (26 linhas), papel antigo recusado direto e pooler. O control plane **absorve** o corte feito por SQL: depois dele a API passa a listar `omnigestao_prod` com dono `omni_owner` |
| Pooler do Neon (PgBouncer) | servidor reabre conexão com as credenciais do cliente | **FECHADO no ensaio 002**: após 04+05, `permission denied` / `server login has been failing` (cacheado). **Entre 04 e 05 um cold start pelo pooler ainda entra** (reaproveita conexão de servidor aberta) — o 04 sozinho não corta; 05 logo em seguida é obrigatório |
| Papel criado por SQL aparece/é gerenciável no Console | operação humana futura | ensaio 002: os 3 papéis criados por SQL **aparecem** na API/Console do branch e ficam gerenciáveis por lá (reset de senha, exclusão, dono do database). Caminho humano, como o do §6: na janela e depois dela, não mexer em papéis nem databases de produção pelo Console. `neondb_owner` recebe `ADMIN OPTION` sobre eles com `grantor=cloud_admin` |

Evidências do ensaio: `docs/ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/neon-rehearsal-002/` (índice no `README.md`).

## 6. Riscos residuais aceitos em B

- **Caminho humano, não de código:** o papel antigo criou os papéis novos e, pelo PG 16+, tem
  `ADMIN OPTION` sobre eles; com `CREATEROLE` ele consegue se re-adicionar a `omni_owner` e reabrir CONNECT
  (provado em `10-…`, seção 7). Código antigo não faz `GRANT`; fecha de vez com a troca de senha do passo 10.
- `cloud_admin` (superusuário do Neon) e `neon_service` são do provedor e seguem com acesso.
- Deployments antigos continuam com outros segredos válidos (Stripe, WhatsApp, `AUTH_SECRET`). Sem banco
  eles não montam contexto, mas isso está fora do escopo de estoque.
- Erro do CHECK (07) sai no log com a linha recusada (`Failing row contains …`, nome e preço do produto).

## 7. GO/NO-GO e autorizações ainda necessárias

**Já registrados, sem repetir:** ensaio 002; isolamento Preview P1–P3/P5; A1/A1.1, A2, A3 e A4 (§0 do runbook).
As senhas A2 existem; 01/02 já foram executados em produção e seus marcadores confirmados. A5 é a preparação
documental desta revisão, com encerramento por validação local; não equivale a liberar execução.

**NO-GO operacional. Pendentes, sem autorização por este GOAL:**

1. **A6:** decisão e revisão independente sobre o 07; `SCRIPT_07_DECISION=PENDING`.
2. **A7:** alcance/congelamento dos conectores e outros caminhos humanos/agentes. A leitura pendente de
   `cron.job` em `postgres` exige autorização específica para esse database; não fazê-la neste A5.
3. **A8/J0:** autorização da janela e congelamento de merges, pushes, deploys, envs, sessões de IA,
   conectores, scripts locais e Console Neon (runbook §3); checklist real das duas lojas, caixas fechados e
   inventário atualizado dos deployments.
4. **Antes de J3/J4:** reconciliação com a main então atual e CI/revisão do head final, sem reutilizar como
   aprovação a CI de `104d768` ou de heads anteriores; `MAIN_RECONCILIATION=PENDING`.
5. **J0–J13:** toda a janela, inclusive troca de URLs Production junto ao deploy Float, corte 03–05,
   migration, eventual aplicação do 07 expressamente aprovada, smoke e reabertura.
6. **P1–P5:** NOLOGIN do migrator fora das janelas, troca posterior da senha antiga, migration do Preview main,
   trabalho futuro de integração e limpezas, cada qual com autorização. Excluir o branch de ensaio
   `br-wispy-mountain-accw2a7p` também depende de autorização separada.

Depois do COMMIT do J8, jamais liberar cliente Prisma Int para gravar nas colunas Float. A recuperação
continua seguindo F0–F4 do runbook; não restaurar CONNECT ao papel antigo nem executar o 99 após a migration.

Opcional e independente, sob autorização própria: Deployment Protection no `omni-gestao-pro`; atualizar o
inventário e decidir o destino dos overrides de Preview por branch (4 no retrato histórico, incluindo
`codex/release-ops-v4-vercel`), cujo valor sensível não foi relido. Nada disso é aprovado neste A5.
