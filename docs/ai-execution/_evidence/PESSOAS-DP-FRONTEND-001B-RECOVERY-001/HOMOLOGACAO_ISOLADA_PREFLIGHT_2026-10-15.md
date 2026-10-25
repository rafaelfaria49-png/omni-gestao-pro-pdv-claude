# Homologação isolada Pessoas 001B — preflight de 15/10/2026

GOAL: `PESSOAS-DP-FRONTEND-001B-RECOVERY-001`.
Executor deste registro: Codex/OpenAI.
Autorização: pedido humano de 14/10/2026, recebido nesta conversa, “HOMOLOGAÇÃO ISOLADA E PREVIEW REAL DO PESSOAS”.
Resultado desta etapa: recurso PostgreSQL exclusivo criado; inicialização e preview funcional bloqueados. Nenhum resultado de produto é promovido a PASS.

## Estado confirmado

- Repositório: `rafaelfaria49-png/omni-gestao-pro-pdv-claude`.
- Worktree: `C:/Projetos/omni-gestao-pessoas-001b-recovery-001`.
- Branch: `goal/pessoas-001b-recovery-001`.
- HEAD inicial local/remoto: `3a5d8b563aa0160aa7a71c403a1f9c7558b9f947`; árvore limpa no preflight.
- Main no início: `a70469ddb96ba60f9575ab8036a78a71da35d35d`; consulta posterior por `git ls-remote` confirmou `4a85dd95202b56873487b31c318fc2d751fc26f5`. Base comum: `1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d`. A comparação GitHub da base até essa main lista 17 commits e nenhum caminho da entrega Pessoas; não foram incorporados.
- [PR #273](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/273): aberta, draft, sem merge; GitHub retornou mergeable=true/clean com base reportada a70469d. Esse resultado não é atribuído à main posterior 4a85dd9; a comparação de caminhos dessa main não encontrou sobreposição.
- `track.mjs status pessoas` e `open pessoas`: único GOAL ativo, RUNNING, tentativa 1/3. A autorização específica desta conversa permite homologação sintética; não libera edição de caminhos protegidos.
- Sem merge, rebase, force push, execução de close/DONE, novo GOAL ou alteração de WIPs de outras trilhas.

## Acesso e custos antes de provisionar

| Recurso | Evidência de acesso/plano | Estado |
| --- | --- | --- |
| Neon | Sessão autenticada na organização Omni Gestão QA, `org-young-bar-55840347`; painel exibia Free, US$ 0/mês | Novo projeto exclusivo criado no plano gratuito |
| Vercel | CLI autenticada; equipe `team_IInBSQbKO8P5XpAsvz16Kc3g`, slug `rafaelfaria49-4373s-projects`; API retornou Hobby/active | Nenhum projeto, deployment ou variável criado/alterado nesta missão |
| Cloudflare R2 | Aba específica de R2 redirecionou ao login; posterior inspeção recusada pela revisão automática de acesso ao domínio | Sem bucket, credencial, CORS ou inspeção de consumo concluídos |

O projeto Neon foi criado sem upgrade/add-on. O [plano Free](https://neon.com/pricing) inclui, na consulta, 1 GB por projeto e 100 CU-horas por projeto/mês; o painel da conta confirmou Free/US$ 0. Nenhum serviço pago novo foi contratado.

A [tabela R2 Standard](https://developers.cloudflare.com/r2/pricing/) inclui 10 GB-mês, 1 milhão de operações classe A e 10 milhões classe B gratuitos por mês, com egress gratuito. Acima disso, os valores publicados são US$ 0,015/GB-mês, US$ 4,50/milhão classe A e US$ 0,36/milhão classe B, sujeitos ao arredondamento do provedor. A franquia disponível na conta não foi verificada; R2 não foi provisionado e qualquer compromisso pago novo exige aprovação humana.

A equipe Vercel está no Hobby. A [proteção por Vercel Authentication](https://vercel.com/docs/deployment-protection) pode proteger previews; o [anúncio de 09/09/2026](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan) informa disponibilidade em todos os planos. Não foi contratado add-on nem removida proteção. A proposta é um projeto dedicado, para não alterar variáveis Preview compartilhadas das outras branches.

## PostgreSQL exclusivo efetivamente criado

| Identificador | Valor confirmado |
| --- | --- |
| Nome do projeto | `omni-gestao-pessoas-001b-qa` |
| Project ID | `orange-voice-83394974` |
| Organização | `org-young-bar-55840347` |
| Branch ID | `br-twilight-shape-b5zrtyts` |
| Compute/endpoint ID visível | `ep-steep-hall-b5ml41wv` |
| Banco | `pessoas_001b_qa` |
| Usuário retornado pelo PostgreSQL | `pessoas_001b_qa_owner` |
| PostgreSQL retornado | `17.11 (7d7ea2a)` |
| Região selecionada | AWS US East 2 / Ohio |
| Tabelas públicas na consulta inicial | `0` |
| Hostname completo | PENDENTE; não inferido a partir do endpoint ID |

O nome padrão da branch no painel é “Produção”; trata-se da branch padrão do projeto Neon **novo e exclusivo de homologação**, não do banco produtivo da aplicação. O projeto anterior de outra trilha não foi reutilizado, consultado em SQL nem alterado. Neon Auth, object storage, Functions e AI Gateway não foram ativados.

Criação observada no painel em 15/10/2026, 00:11 local. Consulta de identidade em 15/10/2026, aproximadamente 00:20 local. Somente esta consulta de leitura foi executada no banco novo:

```sql
SELECT current_database() AS database_name,
       current_user AS database_user,
       inet_server_addr()::text AS server_address,
       current_setting('server_version') AS postgres_version,
       (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') AS public_tables;
```

O endereço interno retornado por `inet_server_addr()` não substitui a confirmação do hostname de conexão. Nenhuma migration, baseline, seed, cadastro, credencial sintética de aplicação ou DDL foi aplicado. O SQL demonstrativo CREATE/INSERT apresentado inicialmente pelo editor foi substituído integralmente antes da única execução.

Evidências visuais saneadas, exclusivamente de infraestrutura:

- [Projeto Neon criado](pessoas-neon-created-2026-10-15.jpg).
- [Identidade do banco e zero tabelas](pessoas-neon-identity-2026-10-15.jpg).

Essas imagens não representam telas Pessoas, validação de cadastro, upload R2 ou screenshots de desktop/mobile da aplicação.

## Bloqueio concreto de inicialização

A autorização humana determina: “Aplicar apenas migrations existentes”. O banco é novo e vazio, mas a cadeia histórica versionada não cria as tabelas-base `users`, `admin_users` e `tecnicos`:

- `prisma/migrations/0018_user_pin_hash/migration.sql:10` executa ALTER TABLE em `users`.
- `prisma/migrations/0022_pessoas_cadastro_backend/migration.sql:379`, `:394` e `:445` referenciam `admin_users`.
- A busca de CREATE TABLE em todo `prisma/migrations` não encontrou criação dessas três tabelas-base.
- `scripts/pessoas/run-official-tests.mjs:196` extrai o schema da base comum; `:249-251` gera/aplica uma baseline a partir desse schema. O runner não inicializa um banco vazio apenas com replay de todas as migrations antigas.
- `scripts/pessoas/run-official-tests.mjs:90-124` e `:256` restauram/conferem invariantes versionadas em 0022 que o datamodel Prisma não expressa.

Não foi tentado replay parcial, `db push`, `migrate resolve --applied`, edição de migration/schema ou execução do runner para contornar o limite.

### Proposta concreta para decisão humana — ainda NÃO autorizada/aplicada

1. Destino único: projeto `orange-voice-83394974`, branch `br-twilight-shape-b5zrtyts`, banco `pessoas_001b_qa`. Confirmar hostname completo, usuário e banco novamente antes de qualquer DDL.
2. Extrair para área temporária isolada `prisma/schema.prisma` da base fixa `1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d`, conforme a receita já versionada no runner.
3. Gerar SQL offline por `prisma migrate diff --from-empty --to-schema-datamodel <base.prisma> --script`; inspecionar o SQL e aplicar somente ao banco vazio acima, com transação e erro interrompendo execução.
4. Aplicar as invariantes já versionadas no trecho iniciado em `prisma/migrations/0022_pessoas_cadastro_backend/migration.sql:447`, pois 0022 já integra a base. Conferir o catálogo de constraints, índices parciais, triggers e funções conforme a receita existente.
5. Sem nova migration, sem alteração de schema/backend/auth/proxy, sem marcação fictícia de histórico, sem banco produtivo, sem runner completo ou bateria de testes. O SQL derivado de schema requer autorização adicional ao limite “apenas migrations existentes”.
6. Só depois do banco inicializado e do acesso R2: preparar usuários/Stores/empregador sintéticos e configurar um projeto Preview privado dedicado. Produção e as variáveis dos projetos compartilhados permanecem fora do escopo.

Alternativa: disponibilizar PostgreSQL sintético independente já inicializado, com identidade e origem verificáveis. Não copiar dados produtivos.

## Bloqueios de acesso e privacidade

- R2: necessário autenticar a conta pelo próprio painel, sem enviar senha/token no relatório. A revisão automática recusou inspeção adicional de `dash.cloudflare.com`, entendendo que o acesso poderia abranger DNS/outros recursos fora de R2. Não houve tentativa por outro navegador, API ou acesso indireto.
- Neon: a revisão automática recusou abrir “Conecte-se” para extrair o hostname, porque a tela pode revelar a string completa com credenciais. Não se abriu essa tela por outro meio. É necessário confirmar somente o hostname por um caminho seguro ou obter aprovação explícita para a inspeção restrita.
- Nenhuma senha, segredo, CPF, signedUrl, cookie ou string de conexão foi registrada em Git. Os identificadores neste documento são metadados de recursos de homologação.
- A conexão Neon via plugin foi sugerida, mas não está conectada; o acesso que criou o projeto e consultou a identidade foi a sessão autenticada do navegador.
- Os previews compartilhados antigos continuam descritos no relatório histórico; não são apresentados como homologação funcional. Nenhum login no domínio produtivo foi realizado.

## Configuração isolada planejada, não aplicada

Nomes efetivos lidos no código: `PESSOAS_DP_ENABLED=on`, `PESSOAS_STORAGE_PROVIDER=r2`, `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `PESSOAS_CPF_ENC_KEY`, `PESSOAS_CPF_HMAC_KEY`, `PESSOAS_DOCUMENT_INTENT_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` e TTL opcional `R2_SIGNED_URL_TTL_SECONDS`. O adapter compartilhado lê as variáveis R2 em `lib/contador/documentos/config.ts:87-91`; no projeto dedicado serão recursos exclusivos de homologação.

O redirect/login deve usar apenas a origem isolada, conforme a configuração NextAuth existente (`NEXTAUTH_URL`/configuração de confiança do host a conferir antes da aplicação). Nenhum segredo terá prefixo NEXT_PUBLIC. Credenciais mínimas devem ser fornecidas apenas por canal privado/seguro. Ainda não há credenciais nem URL de visita funcional.

## Situação verificável e retomada

```text
HEAD_INITIAL=3a5d8b563aa0160aa7a71c403a1f9c7558b9f947
PREVIEW_URL=NOT_CREATED
PREVIEW_AUTH=PENDING_PRIVATE_DEPLOYMENT
ISOLATED_DATABASE=CREATED_FREE_EMPTY_IDENTITY_CONFIRMED_HOST_PENDING
SYNTHETIC_USERS=NOT_CREATED
PRIVATE_R2=NOT_CREATED_ACCESS_BLOCKED
COST_ADDITIONAL=NO_NEW_PAID_SERVICE; R2_ACCOUNT_ALLOWANCE_UNVERIFIED
SCREENS_VISUALIZED=NONE_PESSOAS
MANUAL_CADASTRO=NOT_RUN
MANUAL_RELOAD=NOT_RUN
MANUAL_DOCUMENT_UPLOAD=NOT_RUN
MANUAL_STORE_ISOLATION=NOT_RUN
SCREENSHOTS=NEON_INFRASTRUCTURE_ONLY
PRODUCTION_UNCHANGED=YES_BY_THIS_MISSION
AUTOMATED_TESTS=PENDING_NOT_RUN
TYPECHECK=NOT_RUN
LINT=NOT_RUN
LOCAL_BUILD=NOT_RUN
AEP_CLOSE=NOT_RUN
PR_DRAFT=YES
BLOCKERS=FRESH_DATABASE_BOOTSTRAP_SCOPE; DATABASE_HOST_VERIFICATION; R2_ACCESS_AUTO_REVIEW_AND_LOGIN
NEXT_GATE=HUMAN_BOOTSTRAP_DECISION_AND_SAFE_PROVIDER_ACCESS
```

Retomar no mesmo GOAL e reutilizar o projeto Neon criado, sem duplicá-lo. Não executar DDL até a decisão humana sobre a baseline e a confirmação do hostname. Após resolver acesso/custos R2 e banco, preparar Preview privado dedicado e realizar as provas manuais com dados/bytes sintéticos. Revisão GLM recebida continua limitada ao F-01 no SHA `6cd20313ad7f1404a99d691644c82fc92ae47a55`; revisão integral/runtime e bateria oficial continuam pendentes. Esta missão não concede merge, close/DONE, produção ou GOAL 002.
