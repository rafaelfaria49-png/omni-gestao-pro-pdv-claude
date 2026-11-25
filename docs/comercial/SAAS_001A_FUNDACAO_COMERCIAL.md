# SAAS-001A — Fundação comercial (implementação)

GOAL `OMNI-SAAS-001A-FUNDACAO-COMERCIAL` · 2026-11-24 · base `origin/main` `c2e9319`
(inclui a arquitetura da PR #396 — merge `85e6986`). Roadmap: [`SAAS_AUTOMATICO_ROADMAP_MASTER.md`](SAAS_AUTOMATICO_ROADMAP_MASTER.md) §3.

**Efeito sobre clientes atuais: nenhum.** Nada recusa acesso, nada envia email real, nada cobra.
Cadastro público continua inexistente. A migration **não** foi aplicada em Production.

---

## 1. O que foi entregue

| Peça | Arquivo | Estado |
|---|---|---|
| Modelos de dados | `prisma/schema.prisma` (bloco "SAAS COMERCIAL") | aditivo |
| Migration | `prisma/migrations/20261124120000_saas_fundacao_comercial/migration.sql` | provada só em PG descartável |
| Catálogo de planos | `lib/saas/planos.ts` | "Vendas e Estoque" lido da oferta da landing |
| Resolvedor de entitlement | `lib/saas/entitlement.ts` | puro, relógio injetado |
| Entitlement em sombra no JWT | `lib/saas/entitlement-sombra.ts` + `auth.ts` | só observa |
| Flags | `lib/saas/flags.ts` | ausente = desligado |
| Email | `lib/saas/email/*` (contrato, Resend, registro, teste, modelos) | modo registro por padrão |
| Outbox | `lib/saas/outbox.ts` | PG real: concorrência, dedupe, retry, recuperação |
| Cron | `app/api/cron/saas/route.ts`, `lib/saas/cron.ts`, `lib/saas/cron-auth.ts`, `vercel.json` | protegido por `CRON_SECRET` |
| Auditoria da plataforma | `lib/saas/platform-audit.ts` | só inserção (gatilho) |
| PG descartável | `scripts/saas/prepare-pg.mjs`, `lib/saas/saas.pg.test.ts`, manifesto em `scripts/ci/run-root-pg-suites.mjs` | roda na CI "Suítes PostgreSQL da raiz" |

## 2. Estrutura de dados

| Tabela | Chaves e regras |
|---|---|
| `organizations` | `documento` UNIQUE opcional; CHECK `origem ∈ {self_service, assistido, legado_migrado}`, nome não vazio |
| `organization_members` | UNIQUE `(organizationId, adminUserId)`; CHECK `papel ∈ {OWNER, BILLING, MEMBER}`; apagar o `AdminUser` remove só o vínculo |
| `stores."organizationId"` | **NULL** = loja legada (todas as atuais); FK `ON DELETE RESTRICT`; índice |
| `subscriptions` | `organizationId` UNIQUE (1:1); CHECKs de status, `suspendedMode`, suspensão exige motivo e data, `trialing` exige `trialEndsAt`, janela do teste, valores ≥ 0; `version` para compare-and-set; preço e limite **copiados** do plano |
| `subscription_history` | só inserção (gatilho recusa UPDATE/DELETE/TRUNCATE) |
| `trial_grants` | `organizationId`, `emailNormalizado`, `documento` UNIQUE; índice em `whatsappNormalizado` |
| `notification_outbox` | `dedupeKey` UNIQUE; CHECKs de status/canal/tipo de erro/tentativas; `enviando` exige lease |
| `platform_audit_logs` | sem FK (sobrevive à entidade); motivo ≥ 5 caracteres; só inserção (gatilho) |

A assinatura pertence à **organização**: trocar o administrador (ou apagar o usuário) não toca a
`Subscription` — provado em PG (`saas.pg.test.ts`). Nenhuma tabela nova referencia
`ContaReceberTitulo`, `MovimentacaoFinanceira`, `SessaoCaixa` ou `Venda`.

Diferenças em relação à arquitetura §3 (justificadas):
- `trialStartedAt`/`trialEndsAt` são anuláveis (contrato assistido ou cortesia pode não ter teste); o CHECK exige `trialEndsAt` quando `status = trialing`.
- `suspendedMode` (`limitado`/`bloqueado`) foi acrescentado: a arquitetura §6.1 prevê os dois modos para `suspended`, mas não tinha onde gravá-los.
- `SubscriptionHistory.versao` grava a `version` resultante (rastro do compare-and-set).
- Outbox: `maxTentativas`, `proximaTentativaEm`, `lockedBy`/`lockedUntil`, `primeiraTentativaEm`, `ultimoErroTipo`, `historico` e o status `registrado` (registro ≠ entrega).
- `origemCadastroId` fica para o SAAS-001B, como o roadmap prevê.

## 3. Máquina de estados e tabela-verdade

Estados (`Subscription.status`) e transições: arquitetura §6.1 (inalterados). O resolvedor
decide o **modo** na leitura; o cron só materializará estados (SAAS-002).

| # | Condição (primeira que casa) | Modo | Motivo |
|---|---|---|---|
| 1 | `Store.organizationId = NULL` | pleno | legado (sem limite) |
| 2 | organização sem assinatura | **bloqueado** | sem_assinatura |
| 3 | assinatura de outra organização | **bloqueado** | inconsistente |
| 4 | relógio inválido | bloqueado | inconsistente |
| 5 | `suspended` | limitado (ou bloqueado se `suspendedMode = bloqueado`) | suspenso |
| 6 | `cortesiaAte > agora` | pleno | cortesia |
| 7 | `trialing` e `agora < trialEndsAt` | pleno | teste |
| 8 | `trialing` e `agora ≥ trialEndsAt` · `trial_expired` | limitado | teste_vencido |
| 9 | `pending_payment` | limitado | pagamento_pendente |
| 10 | `active` | pleno | ok |
| 11 | `past_due` e `agora < graceEndsAt` | pleno | carencia |
| 12 | `past_due` sem carência ou vencida | limitado | inadimplente |
| 13 | `canceled` e `agora < currentPeriodEnd` | pleno | cancelado |
| 14 | `canceled` depois do período (ou sem data) | limitado | cancelado |
| 15 | status desconhecido · `trialing` sem `trialEndsAt` | limitado | inconsistente |

- Fronteiras semiabertas: no **instante exato** de `trialEndsAt`, `graceEndsAt`, `currentPeriodEnd` ou `cortesiaAte` o benefício já acabou (`agora ≥ fim`).
- `limitedSince` = valor gravado na assinatura, senão o instante derivado (fim do teste, da carência, do período).
- **Regra APROVADA pelo proprietário (2026-11-24, GOAL `OMNI-SAAS-001A-MERGE-MIGRATION-READINESS-002`):** suspensão administrativa prevalece sobre cortesia **e** sobre extensão do teste. Ajusta a arquitetura §6.1 ("cortesia sobrepõe qualquer estado" passa a valer só fora de `suspended`). Cobertura: `entitlement.test.ts` › "precedência da suspensão (regra aprovada)".
- Tabela-verdade em Vitest: `lib/saas/entitlement.test.ts` (7 estados × cortesia × carência × instante exato × inconsistências × transições).

## 4. Lojas legadas

- Nenhuma loja é vinculada a organização; não há backfill; a migration não tem `INSERT`/`UPDATE`.
- No JWT, toda loja legada vira `{ modo: "pleno", motivo: "legado" }`.
- Provado em PG: dados das tabelas `stores`, `store_settings`, `admin_users`, `admin_user_stores`, `estoque_produtos` com md5 idêntico antes e depois da migration; todas as lojas com `organizationId` NULL; tabelas novas vazias; drift zero.

## 5. Auth — modo sombra

- `auth.ts`, callback `jwt`: depois de toda a lógica existente (sem mudar uma linha dela), chama `calcularEntitlementsSombra(prisma, ids das lojas)` e grava `token.storeEntitlements`. Plataforma não calcula (não há loja).
- **Nunca derruba o login:** qualquer erro **ou demora acima de 1,5 s** (`TEMPO_LIMITE_SOMBRA_MS`) devolve `undefined`, registra o evento `saas_entitlement_shadow_failed` sem detalhes e o claim é removido. **Atenção:** isto protege só o callback `jwt`. Com o código publicado num banco SEM a migration, outras rotas quebram (ver §11) — a ordem migration → merge é obrigatória.
- Não é exposto na `Session` (o callback `session` de `auth.config.ts` não foi tocado). `moduleAccess`, `storeModules`, `allowedStoreIdsJson`, revogação, troca de senha e logout ficam idênticos (`lib/saas/auth-jwt-sombra.test.ts` + suítes de auth existentes).
- `lib/auth/session-entitlement.ts`: contrato idêntico (só comentário). Delegar ao resolvedor mudaria o acesso — fica para o SAAS-002.
- Observabilidade — eventos JSON de uma linha (`v: 1`, sem email, nome ou IP):
  - `{"event":"saas_entitlement_shadow","v":1,"storeId":…,"modo":…,"motivo":…,"applied":false,"suppressed":n}` — decisão não plena; no máximo 1 linha por loja/decisão a cada 15 min **por instância**; `suppressed` = decisões iguais caladas desde a linha anterior (somar `1 + suppressed` aproxima o total);
  - `{"event":"saas_entitlement_shadow_failed","v":1,"suppressed":n}` — falha ou tempo limite; no máximo 1 linha/min por instância;
  - `{"event":"saas_entitlement_enforce_ignored","v":1}` — `SAAS_ENTITLEMENT_ENFORCE=on` configurada (sem efeito).
- **Limite serverless:** cada instância da Vercel tem memória própria e efêmera; `contadoresEntitlementSombra()` zera no cold start e não soma instâncias. Ele serve para teste/depuração, **não** como métrica de ativação. A métrica de ativação do SAAS-002 é a agregação dos logs: (a) lojas distintas com `saas_entitlement_shadow` por `modo:motivo` em ≥ 7 dias, conferidas contra a lista de organizações esperadas; (b) soma de `saas_entitlement_shadow_failed` = 0. Em modo sombra o 001A não sabe por qual rota a recusa aconteceria — contagem por rota só existe quando os gates do SAAS-002 consultarem o claim.
- `proxy.ts` e `auth.config.ts` **não** foram alterados nem precisaram ser (`/api/**` já é rota pública no proxy; a rota do cron se autoprotege).

### Custo e tamanho

| Medida | Valor |
|---|---|
| Consultas a mais por resolução do `jwt` | **1** (`stores WHERE id IN (...) AND organizationId IS NOT NULL`, índice novo). Com lojas vinculadas: até 3 em lote (stores, organizations, subscriptions), constante — sem N+1 (medido em PG) |
| Usuário de plataforma | 0 |
| Claim por loja legada | **0 bytes** — legado fica fora do mapa (mapa presente + loja ausente = legado; mapa ausente = não calculado) |
| Claim limitado com data | < 100 bytes |
| Usuário típico atual (só lojas legadas) | + `"storeEntitlements":{}` ≈ 23 bytes antes da cifragem |
| Tempo limite da consulta | 1,5 s; depois disso o claim fica ausente e o login segue |

Trade-off escolhido: consulta separada, em vez de acrescentar `organizationId` ao `findMany`
existente, para que um banco ainda sem a migration (Preview apontando para um banco antigo) não
quebre o login. Depois da migration em Production, o SAAS-002 pode fundir as duas consultas.

## 6. Flags

| Flag | Ausente / ≠ `on` | `on` no SAAS-001A |
|---|---|---|
| `SAAS_ENTITLEMENT_ENFORCE` | desligado | **ignorada** (só um aviso no log); `entitlementEnforceEfetivo` é sempre `false` |
| `SAAS_EMAIL_ENVIO` | modo registro | Resend, **só** para `SAAS_EMAIL_DESTINOS_TESTE`; demais destinos ficam em registro |
| `SAAS_CADASTRO_PUBLICO` | — | ignorada (cadastro não existe) |

Variáveis documentadas em `.env.example` sem valores.

## 7. Email

- Provedor escolhido: **Resend** (D-11). **Domínio remetente, DNS (SPF/DKIM/DMARC) e credenciais NÃO estão configurados** — por isso o padrão é o modo registro.
- Adaptador REST (`POST https://api.resend.com/emails`) sem SDK novo (nenhuma dependência adicionada), com `Idempotency-Key: outbox:<id>`.
- Classificação: 429/5xx/401/403/409 → transitório; outros 4xx → permanente; timeout/conexão → **desconhecido** (pode ter chegado).
- Modo registro: não envia; a notificação termina `registrado` (nunca `enviado`). Logs sem destino nem conteúdo.
- Modelos: só `saas.teste_infra` (técnico). A régua é do SAAS-005.
- Asaas (pagamentos) e Cloudflare Turnstile (captcha) seguem como **escolhas arquiteturais**, sem integração neste GOAL.

## 8. Outbox e concorrência

- `enfileirarNotificacao`: `createMany(skipDuplicates)` sobre `dedupeKey` UNIQUE + releitura. 20 chamadas simultâneas em 2 pools → 1 linha.
- `reivindicarLote`: `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED)` marca `enviando`, grava lease e conta a tentativa.
- `concluirTentativa`: fencing por `lockedBy` — quem perdeu o lease não sobrescreve.
- Retentativa: 1, 2, 4, 8 min (teto 1 h) até 5 tentativas; permanente → `falhou` na hora.
- Recuperação: linha presa em `enviando` com lease vencido volta a ser reivindicada (com a mesma chave de idempotência) enquanto estiver a menos de 23 h da 1ª tentativa; depois disso vira `falhou` / `resultado_desconhecido` para conferência manual — **nunca reenvio às cegas**.
- O resultado desconhecido tem DOIS caminhos e ambos respeitam a janela: lease vencido em `enviando` **e** retentativa reagendada (`pendente` com `ultimoErroTipo = desconhecido`). Sem isso, com o cron diário a retentativa sairia ~24 h depois, fora da janela do Resend, e poderia duplicar o email (achado P1 da revisão independente, corrigido e coberto em PG).
- Item reivindicado e não tentado porque o prazo do ciclo acabou volta a `pendente` na hora, sem gastar tentativa (`liberarNaoTentados`), quando nunca foi enviado.
- `dedupeKey` é UNIQUE **global**: toda chave precisa conter o id da entidade dona (ex.: `trial-d5:<organizationId>`); uma chave genérica suprimiria a notificação de outra organização.
- **Não há exactly-once de entrega externa.** Garantido: um worker por linha de cada vez; repetições usam a mesma chave do provedor. Risco residual: uma duplicata se o provedor ignorar a chave ou fora da janela de 24 h.
- Provas em PG real (`lib/saas/saas.pg.test.ts`): 2 workers × 30 rodadas sem colisão (60 linhas); 2 ciclos paralelos → 40 envios, cada um exatamente 1 vez; backoff 60/120/240/480 s; 5ª falha → `falhou`; lease vencido + fencing; resultado desconhecido fora da janela; limites de lote/total/prazo; dados sensíveis recusados.

## 9. Cron

- `GET /api/cron/saas` (Vercel Cron, `Authorization: Bearer $CRON_SECRET`).
- Sem segredo (ou < 16 caracteres) → **503**; segredo errado → **401**; em ambos nenhuma consulta ao banco. Comparação em tempo constante (sha256 + `timingSafeEqual`). `Cache-Control: no-store`.
- Executa só a outbox: lote 10, no máximo 50 por execução, prazo 40 s (`maxDuration` 60 s). Execuções simultâneas dividem o trabalho (SKIP LOCKED), não duplicam.
- `vercel.json`: `{"path":"/api/cron/saas","schedule":"0 9 * * *"}` — 1×/dia (06:00 BRT), compatível com o plano Hobby (D-14 pendente). A lista de crons estava vazia; nada foi sobrescrito.
- Nada no cron altera acesso, cobra ou envia email real no SAAS-001A.

## 10. Auditoria administrativa

`registrarAuditoriaPlataforma(tx, { atorId, acao, motivo, organizationId?, storeId?, antes?, depois?, ipHash? })`
— ações previstas: `assinatura.criar|alterar_status|alterar_preco|suspender|reativar`, `teste.estender`,
`cortesia.conceder|revogar`, `organizacao.criar|vincular_loja|alterar_membro`. Motivo obrigatório,
campos sensíveis removidos de antes/depois, tabela só-inserção. Os logs de PDV, Caixa e Financeiro
não foram tocados. A UI e as ações são do SAAS-004.

## 11. Migration em Production (procedimento futuro — NÃO executado)

Requer autorização específica do proprietário. Seguir `GESTAO_LOJAS_PROCEDIMENTO_MIGRATION.md`:

1. Backup/branch de restauração no Neon antes.
2. Conferir que o banco de destino é o de Production (role e host) e que `stores` não tem coluna `organizationId`.
3. Aplicar **só** `20261124120000_saas_fundacao_comercial/migration.sql` (transação única; `CREATE INDEX` em `stores` é rápido — tabela pequena).
4. Conferir: 7 tabelas novas vazias, `SELECT count(*) FROM stores WHERE "organizationId" IS NOT NULL` = 0, 16 CHECKs e 4 gatilhos, `prisma migrate diff --from-url … --to-schema-datamodel` vazio.
5. Só então fazer merge e deploy.

**Código sem migration QUEBRA rotas (revisão independente, P1).** Com `Store.organizationId` no
schema, toda consulta de loja sem `select` passa a ler a coluna (ex.: `app/api/stores/route.ts`,
`app/api/stores/[id]/route.ts`, `app/api/settings/perfil-loja/route.ts`) e responde 500 num banco que
não a tem. O login sobrevive (consulta sombra isolada), o resto não. Portanto: **migration aplicada
antes do merge**, e qualquer banco de **Preview** usado por esta branch também precisa dela (ou o
Preview fica parcialmente quebrado — sem efeito em Production). Se `MIGRATION_AUTHORITY_ENABLED`
estiver ligado em Production, o próprio merge roda `prisma migrate deploy` e aplica **todas** as
pendentes: merge equivale a autorização de migration. Procedimento exato:
[`SAAS_001A_PROCEDIMENTO_MIGRATION_PRODUCTION.md`](SAAS_001A_PROCEDIMENTO_MIGRATION_PRODUCTION.md).

## 12. Rollout e rollback

- **Rollout:** ver [`SAAS_001A_PROCEDIMENTO_MIGRATION_PRODUCTION.md`](SAAS_001A_PROCEDIMENTO_MIGRATION_PRODUCTION.md). Depois do deploy, nos logs: `saas_entitlement_shadow` não deve aparecer (nenhuma loja tem organização) e `saas_entitlement_shadow_failed` deve ser zero.
- **Rollback de código:** reverter o merge. As tabelas ficam vazias e sem uso; `stores.organizationId` NULL não é lido por nenhum código anterior.
- **Rollback de schema** (só se exigido, com autorização): remover gatilhos, função, tabelas novas e a coluna — nenhuma linha de cliente depende delas.
- Desligar o cron: remover a entrada de `vercel.json` ou retirar `CRON_SECRET` (a rota passa a responder 503).

## 13. Pendências e decisões não aprovadas

| Item | Situação |
|---|---|
| Suspensão > cortesia/extensão | **APROVADA** (2026-11-24) — coberta por teste |
| D-03 preço por loja · D-04 ADMIN conta no limite | PROPOSTA; nada aplicado |
| D-11 domínio remetente/DNS/conta Resend | pendente do proprietário; sem isso só modo registro |
| D-14 plano Vercel | cron diário até a decisão |
| Contadores do modo sombra | em memória por instância; agregação (painel) no SAAS-002/004 |
| `dados` da outbox | não pode conter token bruto: o link de verificação do 001B precisa ser montado no envio ou guardado cifrado |

## 14. Handoff para SAAS-001B

- Usar `Organization` + `Subscription(trialing, trialEndsAt = now()+7d do banco)` + `TrialGrant` + `OrganizationMember(OWNER)` na mesma transação de `provisionarOrganizacao`; acrescentar `Organization.origemCadastroId @unique` na migration do 001B.
- Gravar `SubscriptionHistory` (`de: null → trialing`, `ator: sistema`) e, para ações da plataforma, `registrarAuditoriaPlataforma` na mesma transação.
- Enfileirar emails com `enfileirarNotificacao` (`dedupeKey` como `verify:<signupId>:<n>`) e chamar `processarOutbox` logo após o commit para os transacionais; o adaptador vem de `resolverConfiguracaoEmail()`.
- Modelos novos entram em `lib/saas/email/modelos.ts`.
- `SAAS_CADASTRO_PUBLICO` deve continuar exigindo `SAAS_ENTITLEMENT_ENFORCE` efetivo (R-P0-02) — que no 001A é sempre falso.
- Suíte PG: estender `lib/saas/saas.pg.test.ts` ou criar outra no mesmo grupo `saas_pg_ci`.
